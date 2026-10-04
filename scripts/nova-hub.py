#!/usr/bin/env python3
"""Tiny IRC hub for Nova agents on one LAN. Not a public IRC server."""

import argparse
import selectors
import socket
import sys

HOST = "0.0.0.0"
PORT = 6667
CHANNEL = "#nova"
PASSWORD = "nova-lan"
SERVER = "nova-hub"


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

    def serve(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((HOST, PORT))
        sock.listen()
        sock.setblocking(False)
        self.selector.register(sock, selectors.EVENT_READ, data=None)
        print(f"NOVA_HUB_READY {HOST}:{PORT} channel={CHANNEL}", flush=True)
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
            client.nick = parts[1]
        elif command == "USER":
            client.user_ok = True
        elif command == "JOIN":
            channel = parts[1] if len(parts) > 1 else ""
            if channel.lower() != CHANNEL:
                client.send(f":{SERVER} 403 {client.nick or '*'} {channel} :Only {CHANNEL} exists")
                return
            client.joined = True
            nick = client.nick or "guest"
            client.send(f":{nick}!{nick}@lan JOIN {CHANNEL}")
            client.send(f":{SERVER} 332 {nick} {CHANNEL} :Nova agent channel")
            names = " ".join(sorted(c.nick for c in self.clients.values() if c.joined and c.nick))
            client.send(f":{SERVER} 353 {nick} = {CHANNEL} :{names}")
            client.send(f":{SERVER} 366 {nick} {CHANNEL} :End of names")
            self.broadcast(client, f":{nick}!{nick}@lan JOIN {CHANNEL}", include_self=False)
        elif command == "PRIVMSG" and client.joined and client.nick:
            text = line.split(" :", 1)[1] if " :" in line else ""
            self.broadcast(client, f":{client.nick}!{client.nick}@lan PRIVMSG {CHANNEL} :{text}", include_self=False)
        elif command == "PING":
            token = parts[1] if len(parts) > 1 else SERVER
            client.send(f":{SERVER} PONG {SERVER} {token}")
        elif command in {"QUIT", "PART"}:
            self.drop(client)
        if client.nick and client.user_ok and not client.joined and command in {"NICK", "USER"}:
            client.send(f":{SERVER} 001 {client.nick} :Welcome to Nova hub")
            client.send(f":{SERVER} 376 {client.nick} :End of MOTD")

    def broadcast(self, sender, line, include_self):
        for client in list(self.clients.values()):
            if not client.joined:
                continue
            if client is sender and not include_self:
                continue
            client.send(line)

    def drop(self, client):
        if client.conn in self.clients:
            if client.joined and client.nick:
                self.broadcast(client, f":{client.nick}!{client.nick}@lan QUIT :bye", include_self=False)
            self.selector.unregister(client.conn)
            del self.clients[client.conn]
        try:
            client.conn.close()
        except OSError:
            pass


def main():
    parser = argparse.ArgumentParser()
    parser.parse_args()
    try:
        Hub().serve()
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
