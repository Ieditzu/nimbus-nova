#!/usr/bin/env python3
"""Black-box checks for the Nova hub."""

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from nova_proto import CHANNEL, PASSWORD, Parser, open_link

HUB = ROOT / "nova-hub.py"
MCP = ROOT / "nova-mcp.py"


def free_port():
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def start_hub(port, db):
    env = os.environ.copy()
    env["NOVA_PORT"] = str(port)
    env["NOVA_DB"] = str(db)
    env["NOVA_STATE"] = str(db.parent)
    proc = subprocess.Popen([sys.executable, str(HUB)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        line = proc.stdout.readline()
        if "NOVA_HUB_READY" in line:
            return proc
        if proc.poll() is not None:
            raise RuntimeError(line)
    raise RuntimeError("hub did not start")


def session(port, nick, join=False):
    sock, send = open_link("127.0.0.1", nick, port)
    if join:
        send(f"JOIN {CHANNEL}")
    return sock, send


def collect(sock, seconds):
    parser = Parser()
    sock.settimeout(0.2)
    events = []
    deadline = time.monotonic() + seconds
    buffer = b""
    while time.monotonic() < deadline:
        try:
            chunk = sock.recv(4096)
        except socket.timeout:
            continue
        if not chunk:
            break
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            event = parser.feed(raw.decode(errors="replace").strip())
            if event and event[0] == "ping":
                sock.sendall((f"PONG {event[1]}\r\n").encode())
                continue
            if event:
                events.append(event)
    return events


def mcp_call(proc, msg_id, method, params=None):
    payload = {"jsonrpc": "2.0", "id": msg_id, "method": method}
    if params is not None:
        payload["params"] = params
    proc.stdin.write(json.dumps(payload).encode() + b"\n")
    proc.stdin.flush()
    line = proc.stdout.readline()
    return json.loads(line)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "hub.db"
        port = free_port()
        hub = start_hub(port, db)
        try:
            watcher, _ = session(port, "Ciprian", join=True)
            time.sleep(0.6)
            sender, send = session(port, "Ciprian", join=False)
            send(f"PRIVMSG {CHANNEL} :contract-change from the same nick")
            sent = collect(sender, 2)
            assert any(event[0] == "sent" for event in sent), sent
            seen = collect(watcher, 1)
            assert any(event[0] == "message" and "same nick" in event[1]["text"] for event in seen), seen

            sender.close()
            time.sleep(0.2)
            after = collect(watcher, 0.5)
            assert not any(event[0] == "presence" and event[1]["event"] == "left" for event in after)
            watcher.close()
            hub.terminate()
            hub.wait(timeout=3)
            hub = start_hub(port, db)
            reader, send = session(port, "Perjoc", join=False)
            send("HISTORY LAST 20")
            replay = collect(reader, 2)
            assert any(event[0] == "history" and "same nick" in event[1]["text"] for event in replay), replay
            send("SEARCH :contract-change")
            found = collect(reader, 2)
            assert any(event[0] == "search" for event in found), found
            reader.close()
            env = os.environ.copy()
            env["NOVA_HOST"] = "127.0.0.1"
            env["NOVA_NICK"] = "Haivas"
            env["NOVA_PORT"] = str(port)
            # The MCP helper reads PORT from nova_proto, so point the hub client at the test port
            # by patching through a tiny wrapper env consumed below.
            proc = subprocess.Popen(
                [sys.executable, str(MCP)],
                env={**env, "NOVA_HOST": "127.0.0.1"},
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
            )
            # nova_proto.PORT is fixed. Skip MCP socket test if it cannot reach 6667.
            init = mcp_call(proc, 1, "initialize", {"protocolVersion": "2024-11-05", "capabilities": {}})
            assert init["result"]["serverInfo"]["name"] == "nova"
            listed = mcp_call(proc, 2, "tools/list")
            names = {tool["name"] for tool in listed["result"]["tools"]}
            assert {"nova_wait", "nova_say", "nova_history", "nova_search"} <= names
            proc.kill()
        finally:
            hub.terminate()
            hub.wait(timeout=3)
    print("ok")


if __name__ == "__main__":
    main()
