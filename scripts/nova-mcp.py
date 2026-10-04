#!/usr/bin/env python3
"""Stdio MCP server for the Nova hub. One process sends and waits. No second nick."""

import json
import queue
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nova_proto import CHANNEL, Parser, load_client, open_link

INSTRUCTIONS = (
    "You are connected to the Nova hub as one nick. "
    "Do not start scripts/nova-irc.py listen. Do not open a second nick such as Perjoc-send. "
    "Call nova_wait to block until someone else speaks. If it times out, call it again. Do not go idle. "
    "Call nova_say to speak. Call nova_history or nova_search to read the persistent log. "
    "Answer a contract-change on the hub before editing JSON."
)

TOOLS = [
    {
        "name": "nova_wait",
        "description": "Block until another nick speaks, or until timeout_sec. Call again on timeout. This replaces a background listener.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "after": {"type": "integer", "description": "Return only messages with a higher id."},
                "timeout_sec": {"type": "integer", "description": "Seconds to wait. Default 25. Max 90."},
            },
        },
    },
    {
        "name": "nova_say",
        "description": "Send one message as your nick on the same connection that waits.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
    {
        "name": "nova_history",
        "description": "Read persistent hub history. Use after to continue from a message id.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "after": {"type": "integer"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "nova_search",
        "description": "Search persistent message text.",
        "inputSchema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "nova_who",
        "description": "List nicks, who is online, and status lines.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "nova_pin",
        "description": "Pin a message id so the panel keeps it visible.",
        "inputSchema": {
            "type": "object",
            "properties": {"id": {"type": "integer"}},
            "required": ["id"],
        },
    },
    {
        "name": "nova_status",
        "description": "Set the short status shown next to your nick.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
]


class Link:
    def __init__(self, host, nick):
        self.host = host
        self.nick = nick
        self.events = queue.Queue()
        self.send = None
        self.sock = None
        self.ready = threading.Event()
        self.error = ""
        self.thread = None

    def ensure(self):
        if self.thread and self.thread.is_alive() and self.ready.is_set():
            return
        self.ready.clear()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()
        if not self.ready.wait(8):
            raise ConnectionError(self.error or "hub did not answer")

    def run(self):
        try:
            self.sock, self.send = open_link(self.host, self.nick)
            self.send(f"JOIN {CHANNEL}")
            parser = Parser()
            buffer = b""
            self.sock.settimeout(1)
            while True:
                try:
                    chunk = self.sock.recv(4096)
                except TimeoutError:
                    continue
                except OSError:
                    break
                if not chunk:
                    break
                buffer += chunk
                while b"\n" in buffer:
                    raw, buffer = buffer.split(b"\n", 1)
                    event = parser.feed(raw.decode(errors="replace").strip())
                    if not event:
                        continue
                    if event[0] == "ping":
                        self.sock.sendall((f"PONG {event[1]}\r\n").encode())
                        continue
                    if event[0] == "history_end":
                        self.ready.set()
                    self.events.put(event)
        except OSError as exc:
            self.error = str(exc)
        self.ready.set()

    def command(self, line):
        self.ensure()
        self.send(line)

    def collect(self, accept, timeout):
        self.ensure()
        deadline = time.monotonic() + timeout
        found = []
        while time.monotonic() < deadline:
            try:
                event = self.events.get(timeout=max(0.05, deadline - time.monotonic()))
            except queue.Empty:
                break
            if accept(event):
                found.append(event)
                if event[0] in {"history_end", "search_end", "who_end", "sent"}:
                    break
        return found

    def drain_noise(self):
        kept = []
        while True:
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            if event[0] == "message":
                kept.append(event)
        for event in kept:
            self.events.put(event)

    def command(self, line):
        self.ensure()
        self.drain_noise()
        self.send(line)


def call_tool(link, name, args):
    if name == "nova_say":
        text = str(args.get("text", "")).strip()
        if not text:
            return result({"error": "text is required"}, error=True)
        link.command(f"PRIVMSG {CHANNEL} :{text}")
        found = link.collect(lambda event: event[0] == "sent", 5)
        if not found:
            return result({"error": "hub did not confirm the send"}, error=True)
        return result({"id": found[-1][1]["id"], "at": found[-1][1]["at"]})
    if name == "nova_wait":
        after = int(args.get("after") or 0)
        timeout = min(90, max(1, int(args.get("timeout_sec") or 25)))
        messages = []
        deadline = time.monotonic() + timeout
        link.ensure()
        while time.monotonic() < deadline and not messages:
            remaining = deadline - time.monotonic()
            try:
                event = link.events.get(timeout=max(0.05, remaining))
            except queue.Empty:
                break
            if event[0] == "message" and event[1]["nick"] != link.nick and (event[1]["id"] or 0) > after:
                messages.append(event[1])
        return result({"messages": messages, "timed_out": not messages, "nick": link.nick})
    if name == "nova_history":
        after = int(args.get("after") or 0)
        limit = min(200, max(1, int(args.get("limit") or 40)))
        link.command(f"HISTORY AFTER {after}" if after else f"HISTORY LAST {limit}")
        found = link.collect(lambda event: event[0] in {"history", "history_end"}, 8)
        return result({"messages": [event[1] for event in found if event[0] == "history"]})
    if name == "nova_search":
        query = str(args.get("query", "")).strip()
        link.command(f"SEARCH :{query}")
        found = link.collect(lambda event: event[0] in {"search", "search_end"}, 8)
        return result({"messages": [event[1] for event in found if event[0] == "search"]})
    if name == "nova_who":
        link.command("WHO")
        found = link.collect(lambda event: event[0] in {"who", "who_end"}, 5)
        return result({"nicks": [event[1] for event in found if event[0] == "who"]})
    if name == "nova_pin":
        link.command(f"PIN {int(args.get('id') or 0)}")
        return result({"ok": True})
    if name == "nova_status":
        link.command(f"STATUS :{args.get('text', '')}")
        return result({"ok": True})
    return result({"error": f"unknown tool {name}"}, error=True)


def read_message():
    headers = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\r\n", b"\n"):
            break
        key, value = line.decode().split(":", 1)
        headers[key.lower()] = value.strip()
    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    return json.loads(sys.stdin.buffer.read(length))


def write_message(payload):
    body = json.dumps(payload).encode()
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
    sys.stdout.buffer.flush()


def main():
    client = load_client()
    if not client["nick"]:
        print("NOVA_NICK missing. Run scripts/nova-setup.py --nick YourName", file=sys.stderr)
        sys.exit(1)
    link = Link(client["host"], client["nick"])
    while True:
        message = read_message()
        if message is None:
            return
        method = message.get("method")
        msg_id = message.get("id")
        if method == "initialize":
            write_message({
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "nova", "version": "1.0.0"},
                    "instructions": INSTRUCTIONS,
                },
            })
        elif method == "notifications/initialized":
            continue
        elif method == "tools/list":
            write_message({"jsonrpc": "2.0", "id": msg_id, "result": {"tools": TOOLS}})
        elif method == "tools/call":
            params = message.get("params") or {}
            try:
                payload = call_tool(link, params.get("name"), params.get("arguments") or {})
            except Exception as exc:
                payload = result({"error": str(exc)}, error=True)
            write_message({"jsonrpc": "2.0", "id": msg_id, "result": payload})
        elif method == "ping":
            write_message({"jsonrpc": "2.0", "id": msg_id, "result": {}})
        elif msg_id is not None:
            write_message({"jsonrpc": "2.0", "id": msg_id, "error": {"code": -32601, "message": "method not found"}})


if __name__ == "__main__":
    main()
