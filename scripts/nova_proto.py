#!/usr/bin/env python3
"""Shared Nova hub constants and line parser."""

import json
import os
import socket
from pathlib import Path

CHANNEL = "#nova"
PASSWORD = "nova-lan"
PORT = int(os.environ.get("NOVA_PORT", "6667"))
SERVER = "nova-hub"
CLIENT_PATH = Path.home() / ".config" / "nova" / "client.json"


def load_client(host=None, nick=None):
    data = {}
    if CLIENT_PATH.exists():
        try:
            data = json.loads(CLIENT_PATH.read_text())
        except json.JSONDecodeError:
            data = {}
    return {
        "host": host or os.environ.get("NOVA_HOST") or data.get("host") or "192.168.0.118",
        "nick": nick or os.environ.get("NOVA_NICK") or data.get("nick") or "",
    }


def save_client(host, nick):
    CLIENT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLIENT_PATH.write_text(json.dumps({"host": host, "nick": nick}, indent=2) + "\n")


def open_link(host, nick, port=PORT):
    sock = socket.create_connection((host, port), timeout=10)
    sock.settimeout(None)

    def send(line):
        sock.sendall((line + "\r\n").encode())

    send(f"PASS {PASSWORD}")
    send(f"NICK {nick}")
    send(f"USER {nick} 0 * :{nick}")
    return sock, send


class Parser:
    """Turn hub lines into events. One message event per chat line."""

    def __init__(self):
        self.pending_id = None

    def feed(self, line):
        if line.startswith("PING"):
            token = line.split(" ", 1)[1] if " " in line else f":{SERVER}"
            return ("ping", token)
        if " 353 " in line and f" = {CHANNEL} :" in line:
            names = [name for name in line.split(f" = {CHANNEL} :", 1)[1].split() if name]
            return ("names", names)
        if " 433 " in line:
            return ("nick_in_use", line)
        if " NOTICE " not in line and f" PRIVMSG {CHANNEL} :" in line and line.startswith(":"):
            sender = line[1:].split("!", 1)[0]
            text = line.split(f" PRIVMSG {CHANNEL} :", 1)[1]
            event = {"id": self.pending_id, "at": "", "nick": sender, "text": text}
            self.pending_id = None
            return ("message", event)
        if " JOIN " in line and line.startswith(":"):
            return ("presence", {"nick": line[1:].split("!", 1)[0], "event": "joined"})
        if " QUIT " in line and line.startswith(":"):
            return ("presence", {"nick": line[1:].split("!", 1)[0], "event": "left"})
        if " NOTICE " not in line:
            return None
        payload = line.split(" NOTICE ", 1)[1]
        body = payload.split(" :", 1)[1] if " :" in payload else ""
        if body.startswith("HISTORY_BEGIN"):
            return ("history_begin", body.split(" ", 1)[-1])
        if body == "HISTORY_END":
            return ("history_end", None)
        if body.startswith("HISTORY_ITEM "):
            return ("history", parse_item(body[len("HISTORY_ITEM "):], with_id=True))
        if body.startswith("HISTORY "):
            return None
        if body.startswith("MSGID "):
            try:
                self.pending_id = int(body.split(" ", 1)[1])
            except ValueError:
                self.pending_id = None
            return None
        if body.startswith("SENT "):
            parts = body.split(" ")
            return ("sent", {"id": int(parts[1]), "at": parts[2] if len(parts) > 2 else ""})
        if body.startswith("SEARCH_ITEM "):
            return ("search", parse_item(body[len("SEARCH_ITEM "):], with_id=True))
        if body.startswith("SEARCH_END"):
            return ("search_end", None)
        if body.startswith("WHO "):
            parts = body.split(" ", 3)
            return ("who", {"nick": parts[1], "online": parts[2] == "1", "status": parts[3] if len(parts) > 3 else ""})
        if body == "WHO_END":
            return ("who_end", None)
        if body.startswith("PIN_ITEM "):
            return ("pin", parse_item(body[len("PIN_ITEM "):], with_id=True))
        if body.startswith("TOPIC "):
            return ("topic", body[len("TOPIC "):])
        return None


def parse_item(payload, with_id):
    item_id = None
    rest = payload
    if with_id:
        item_id_text, rest = payload.split(" ", 1)
        item_id = int(item_id_text)
    at, rest = rest.split(" ", 1)
    sender = rest.split(">", 1)[0].lstrip("<")
    text = rest.split("> ", 1)[1] if "> " in rest else ""
    return {"id": item_id, "at": at, "nick": sender, "text": text}


def read_lines(sock, parser):
    buffer = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            return
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            event = parser.feed(line)
            if event and event[0] == "ping":
                sock.sendall((f"PONG {event[1]}\r\n").encode())
                continue
            if event:
                yield event
