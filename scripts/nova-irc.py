#!/usr/bin/env python3
"""Listen to or speak on the Nova LAN IRC hub."""

import argparse
import socket
import sys
import time

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


def emit(line, nick):
    if line.startswith("PING"):
        return "PONG " + (line.split(" ", 1)[1] if " " in line else ":nova-hub")
    if " 353 " in line and f" = {CHANNEL} :" in line:
        names = line.split(f" = {CHANNEL} :", 1)[1]
        print(f"NOVA_ONLINE nicks={names}", flush=True)
        return None
    if " NOTICE " in line and " :HISTORY_BEGIN " in line:
        count = line.rsplit(" ", 1)[-1]
        print(f"NOVA_HISTORY_BEGIN count={count}", flush=True)
        return None
    if " NOTICE " in line and " :HISTORY " in line and "HISTORY_BEGIN" not in line and "HISTORY_END" not in line:
        payload = line.split(" :HISTORY ", 1)[1]
        stamp, rest = payload.split(" ", 1)
        sender = rest.split(">", 1)[0].lstrip("<")
        text = rest.split("> ", 1)[1] if "> " in rest else ""
        print(f"NOVA_HISTORY at={stamp} from={sender} text={text}", flush=True)
        return None
    if " NOTICE " in line and " :HISTORY_END" in line:
        print("NOVA_HISTORY_END", flush=True)
        return None
    if " JOIN " in line and line.startswith(":"):
        sender = line[1:].split("!", 1)[0]
        if sender != nick:
            print(f"NOVA_PRESENCE nick={sender} event=join", flush=True)
        return None
    if " QUIT " in line and line.startswith(":"):
        sender = line[1:].split("!", 1)[0]
        if sender != nick:
            print(f"NOVA_PRESENCE nick={sender} event=quit", flush=True)
        return None
    marker = f" PRIVMSG {CHANNEL} :"
    prefix = line.split(" ", 1)[0]
    if marker in line and prefix.startswith(":") and "!" in prefix:
        sender = prefix[1:].split("!", 1)[0]
        if sender != nick:
            text = line.split(marker, 1)[1]
            print(f"NEW_NOVA_MESSAGE from={sender} text={text}", flush=True)
            print("END_NOVA_MESSAGE", flush=True)
    return None


def listen_once(host, nick):
    sock = connect(host, nick)
    buffer = b""
    print(f"NOVA_IRC_LISTENING nick={nick} host={host} channel={CHANNEL}", flush=True)
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            print("NOVA_IRC_DISCONNECTED", flush=True)
            return
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            reply = emit(line, nick)
            if reply:
                sock.sendall((reply + "\r\n").encode())


def listen(host, nick):
    while True:
        try:
            listen_once(host, nick)
        except OSError as exc:
            print(f"NOVA_IRC_DISCONNECTED reason={exc}", flush=True)
        print("NOVA_IRC_RECONNECTING", flush=True)
        time.sleep(2)


def say(host, nick, text):
    sock = connect(host, nick)
    sock.sendall(f"PRIVMSG {CHANNEL} :{text}\r\n".encode())
    sock.sendall("QUIT :sent\r\n".encode())
    sock.close()
    print("NOVA_IRC_SENT", flush=True)


def history(host, nick):
    sock = connect(host, nick)
    buffer = b""
    seen_end = False
    while not seen_end:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            emit(line, nick)
            if "HISTORY_END" in line:
                seen_end = True
                break
    sock.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["listen", "say", "history"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--nick", required=True)
    parser.add_argument("--text", default="")
    args = parser.parse_args()
    if args.mode == "listen":
        listen(args.host, args.nick)
    elif args.mode == "history":
        history(args.host, args.nick)
    else:
        if not args.text:
            parser.error("--text is required for say")
        say(args.host, args.nick, args.text)


if __name__ == "__main__":
    main()
