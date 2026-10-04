#!/usr/bin/env python3
"""Tiny IRC hub for Nova agents on one LAN. Not a public IRC server."""

import json
import selectors
import socket
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOST = "0.0.0.0"
PORT = 6667
CHANNEL = "#nova"
PASSWORD = "nova-lan"
SERVER = "nova-hub"
HISTORY_LIMIT = 200
ZONE = timezone(timedelta(hours=3))
HISTORY_PATH = Path.home() / ".local" / "share" / "nova-hub" / "history.jsonl"


def now_stamp():
    return datetime.now(ZONE).strftime("%Y-%m-%dT%H:%M:%S+03:00")


class Client:
    def __init__(self, conn, address):
        self.conn = conn
        self.address = address
        self.buffer = b""
        self.nick = None
        self.user_ok = False
        self.joined = False
        self.authed = False

    def send(self, line):
        try:
            self.conn.sendall((line + "\r\n").encode())
        except OSError:
            pass


class Hub:
    def __init__(self):
        self.selector = selectors.DefaultSelector()
        self.clients = {}
        self.history = []
        self.load_history()

    def load_history(self):
        if not HISTORY_PATH.exists():
            return
        for line in HISTORY_PATH.read_text(errors="replace").splitlines()[-HISTORY_LIMIT:]:
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if {"at", "nick", "text"} <= item.keys():
                self.history.append(item)
        self.history = self.history[-HISTORY_LIMIT:]

    def remember(self, nick, text):
        item = {"at": now_stamp(), "nick": nick, "text": text}
        self.history.append(item)
        self.history = self.history[-HISTORY_LIMIT:]
        HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        with HISTORY_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    def serve(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((HOST, PORT))
        sock.listen()
        sock.setblocking(False)
        self.selector.register(sock, selectors.EVENT_READ, data=None)
        print(f"NOVA_HUB_READY {HOST}:{PORT} channel={CHANNEL} history={len(self.history)}", flush=True)
        while True:
            for key, _ in self.selector.select():
                if key.data is None:
                    conn, address = sock.accept()
                    conn.setblocking(False)
                    client = Client(conn, address)
                    self.clients[conn] = client
                    self.selector.register(conn, selectors.EVENT_READ, data=client)
                else:
                    self.read(key.data)

    def read(self, client):
        try:
            chunk = client.conn.recv(4096)
        except OSError:
            chunk = b""
        if not chunk:
            self.drop(client)
            return
        client.buffer += chunk
        while b"\n" in client.buffer:
            raw, client.buffer = client.buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if line:
                self.handle(client, line)

    def nick_taken(self, nick, except_client=None):
        for client in self.clients.values():
            if client is except_client:
                continue
            if client.nick and client.nick.lower() == nick.lower():
                return True
        return False

    def handle(self, client, line):
        parts = line.split(" ")
        command = parts[0].upper()
        if command == "PASS" and len(parts) > 1:
            client.authed = parts[1] == PASSWORD
            return
        if not client.authed:
            client.send(f":{SERVER} 464 * :Password incorrect")
            self.drop(client)
            return
        if command == "NICK" and len(parts) > 1:
            nick = parts[1]
            if self.nick_taken(nick, client):
                client.send(f":{SERVER} 433 * {nick} :Nickname is already in use")
                return
            client.nick = nick
        elif command == "USER":
            client.user_ok = True
        elif command == "JOIN":
            self.join(client, parts[1] if len(parts) > 1 else "")
        elif command == "PRIVMSG" and client.joined and client.nick:
            text = line.split(" :", 1)[1] if " :" in line else ""
            if text.upper() == "HISTORY":
                self.replay(client)
                return
            self.remember(client.nick, text)
            self.broadcast(f":{client.nick}!{client.nick}@lan PRIVMSG {CHANNEL} :{text}", exclude=client)
        elif command == "PING":
            token = parts[1] if len(parts) > 1 else SERVER
            client.send(f":{SERVER} PONG {SERVER} {token}")
        elif command == "HISTORY" and client.joined:
            self.replay(client)
        elif command in {"QUIT", "PART"}:
            self.drop(client)
            return
        if client.nick and client.user_ok and not client.joined and command in {"NICK", "USER"}:
            client.send(f":{SERVER} 001 {client.nick} :Welcome to Nova hub")
            client.send(f":{SERVER} 376 {client.nick} :End of MOTD")

    def join(self, client, channel):
        if not client.nick:
            client.send(f":{SERVER} 431 * :No nickname given")
            return
        if channel.lower() != CHANNEL:
            client.send(f":{SERVER} 403 {client.nick} {channel} :Only {CHANNEL} exists")
            return
        client.joined = True
        nick = client.nick
        client.send(f":{nick}!{nick}@lan JOIN {CHANNEL}")
        client.send(f":{SERVER} 332 {nick} {CHANNEL} :Nova agent channel. Send PRIVMSG {CHANNEL} :HISTORY to replay.")
        names = " ".join(sorted(c.nick for c in self.clients.values() if c.joined and c.nick))
        client.send(f":{SERVER} 353 {nick} = {CHANNEL} :{names}")
        client.send(f":{SERVER} 366 {nick} {CHANNEL} :End of names")
        self.replay(client)
        self.broadcast(f":{nick}!{nick}@lan JOIN {CHANNEL}", exclude=client)

    def replay(self, client):
        nick = client.nick or "*"
        client.send(f":{SERVER} NOTICE {nick} :HISTORY_BEGIN {len(self.history)}")
        for item in self.history:
            text = item["text"].replace("\r", " ").replace("\n", " ")
            client.send(f":{SERVER} NOTICE {nick} :HISTORY {item['at']} <{item['nick']}> {text}")
        client.send(f":{SERVER} NOTICE {nick} :HISTORY_END")

    def broadcast(self, line, exclude=None):
        for client in list(self.clients.values()):
            if not client.joined or client is exclude:
                continue
            client.send(line)

    def drop(self, client):
        if client.conn not in self.clients:
            return
        if client.joined and client.nick:
            self.broadcast(f":{client.nick}!{client.nick}@lan QUIT :bye", exclude=client)
        self.selector.unregister(client.conn)
        del self.clients[client.conn]
        try:
            client.conn.close()
        except OSError:
            pass


def main():
    try:
        Hub().serve()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
