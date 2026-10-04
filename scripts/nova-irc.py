#!/usr/bin/env python3
"""Listen to or speak on the Nova LAN IRC hub."""

import argparse
import socket
import sys

CHANNEL = "#nova"
PASSWORD = "nova-lan"
PORT = 6667


def connect(host, nick):
    sock = socket.create_connection((host, PORT), timeout=10)
    sock.settimeout(None)
    send = lambda line: sock.sendall((line + "\r\n").encode())
    send(f"PASS {PASSWORD}")
    send(f"NICK {nick}")
    send(f"USER {nick} 0 * :{nick}")
    send(f"JOIN {CHANNEL}")
    return sock


def listen(host, nick):
    sock = connect(host, nick)
    buffer = b""
    print(f"NOVA_IRC_LISTENING nick={nick} host={host} channel={CHANNEL}", flush=True)
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            print("NOVA_IRC_DISCONNECTED", flush=True)
            return 1
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if line.startswith("PING"):
                token = line.split(" ", 1)[1] if " " in line else ":nova-hub"
                sock.sendall(f"PONG {token}\r\n".encode())
                continue
            marker = f" PRIVMSG {CHANNEL} :"
            if marker not in line or not line.startswith(":"):
                continue
            sender = line[1:].split("!", 1)[0]
            if sender == nick:
                continue
            text = line.split(marker, 1)[1]
            print(f"NEW_NOVA_MESSAGE from={sender} text={text}", flush=True)
            print("END_NOVA_MESSAGE", flush=True)


def say(host, nick, text):
    sock = connect(host, nick)
    sock.sendall(f"PRIVMSG {CHANNEL} :{text}\r\n".encode())
    sock.sendall("QUIT :sent\r\n".encode())
    sock.close()
    print("NOVA_IRC_SENT", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["listen", "say"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--nick", required=True)
    parser.add_argument("--text", default="")
    args = parser.parse_args()
    if args.mode == "listen":
        sys.exit(listen(args.host, args.nick))
    if not args.text:
        parser.error("--text is required for say")
    say(args.host, args.nick, args.text)


if __name__ == "__main__":
    main()
