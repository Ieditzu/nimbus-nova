#!/usr/bin/env python3
"""One-nick Nova hub client. say does not join. wait blocks for the next message."""

import argparse
import select
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nova_proto import CHANNEL, Parser, load_client, open_link

sys.path.insert(0, "")


def connect(host, nick, join):
    sock, send = open_link(host, nick)
    if join:
        send(f"JOIN {CHANNEL}")
    return sock, send


def emit(event, nick, mine=False):
    kind = event[0]
    if kind == "names":
        print("NOVA_ONLINE nicks=" + " ".join(event[1]), flush=True)
    elif kind == "history_begin":
        print(f"NOVA_HISTORY_BEGIN count={event[1]}", flush=True)
    elif kind == "history":
        item = event[1]
        print(f"NOVA_HISTORY id={item['id']} at={item['at']} from={item['nick']} text={item['text']}", flush=True)
    elif kind == "history_end":
        print("NOVA_HISTORY_END", flush=True)
    elif kind == "message" and event[1]["nick"] != nick:
        item = event[1]
        print(f"NEW_NOVA_MESSAGE id={item['id']} from={item['nick']} text={item['text']}", flush=True)
        print("END_NOVA_MESSAGE", flush=True)
        return item
    elif kind == "presence" and event[1]["nick"] != nick:
        print(f"NOVA_PRESENCE nick={event[1]['nick']} event={event[1]['event']}", flush=True)
    elif kind == "sent":
        print(f"NOVA_IRC_SENT id={event[1]['id']}", flush=True)
        return event[1]
    elif kind == "search":
        item = event[1]
        print(f"NOVA_SEARCH id={item['id']} at={item['at']} from={item['nick']} text={item['text']}", flush=True)
    elif kind == "who":
        item = event[1]
        print(f"NOVA_WHO nick={item['nick']} online={int(item['online'])} status={item['status']}", flush=True)
    elif kind == "nick_in_use":
        print("NOVA_NICK_IN_USE", flush=True)
    return None


def pump(sock, parser, nick, until, timeout):
    deadline = time.monotonic() + timeout
    buffer = b""
    found = None
    while time.monotonic() < deadline and found is None:
        remaining = max(0.05, deadline - time.monotonic())
        ready, _, _ = select.select([sock], [], [], remaining)
        if not ready:
            continue
        chunk = sock.recv(4096)
        if not chunk:
            print("NOVA_IRC_DISCONNECTED", flush=True)
            return found
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            event = parser.feed(line)
            if not event:
                continue
            if event[0] == "ping":
                sock.sendall((f"PONG {event[1]}\r\n").encode())
                continue
            hit = emit(event, nick)
            if until(event, hit):
                found = hit if hit is not None else event
                break
    return found


def say(host, nick, text):
    sock, send = connect(host, nick, join=False)
    send(f"PRIVMSG {CHANNEL} :{text}")
    parser = Parser()
    found = pump(sock, parser, nick, lambda event, hit: event[0] == "sent", 5)
    sock.sendall(b"QUIT :sent\r\n")
    sock.close()
    if not found:
        print("NOVA_IRC_SENT", flush=True)


def history(host, nick, after, limit):
    sock, send = connect(host, nick, join=False)
    send(f"HISTORY AFTER {after}") if after else send(f"HISTORY LAST {limit}")
    parser = Parser()
    pump(sock, parser, nick, lambda event, hit: event[0] == "history_end", 8)
    sock.close()


def wait_for(host, nick, timeout, after):
    sock, send = connect(host, nick, join=True)
    parser = Parser()
    print(f"NOVA_IRC_WAITING nick={nick} host={host} after={after} timeout={timeout}", flush=True)
    seen = after
    buffer = b""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready, _, _ = select.select([sock], [], [], max(0.05, deadline - time.monotonic()))
        if not ready:
            continue
        chunk = sock.recv(4096)
        if not chunk:
            print("NOVA_IRC_DISCONNECTED", flush=True)
            return 1
        buffer += chunk
        while b"\n" in buffer:
            raw, buffer = buffer.split(b"\n", 1)
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            event = parser.feed(line)
            if not event:
                continue
            if event[0] == "ping":
                sock.sendall((f"PONG {event[1]}\r\n").encode())
                continue
            hit = emit(event, nick)
            if event[0] == "message" and event[1]["nick"] != nick:
                message_id = event[1]["id"] or 0
                if message_id > seen:
                    sock.close()
                    return 0
    print("NOVA_WAIT_TIMEOUT", flush=True)
    sock.close()
    return 0


def listen(host, nick):
    while True:
        try:
            sock, _send = connect(host, nick, join=True)
            print(f"NOVA_IRC_LISTENING nick={nick} host={host} channel={CHANNEL}", flush=True)
            parser = Parser()
            buffer = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    raise ConnectionError("closed")
                buffer += chunk
                while b"\n" in buffer:
                    raw, buffer = buffer.split(b"\n", 1)
                    line = raw.decode(errors="replace").strip()
                    if not line:
                        continue
                    event = parser.feed(line)
                    if not event:
                        continue
                    if event[0] == "ping":
                        sock.sendall((f"PONG {event[1]}\r\n").encode())
                        continue
                    emit(event, nick)
        except OSError as exc:
            print(f"NOVA_IRC_DISCONNECTED reason={exc}", flush=True)
        print("NOVA_IRC_RECONNECTING", flush=True)
        time.sleep(2)


def who(host, nick):
    sock, send = connect(host, nick, join=False)
    send("WHO")
    parser = Parser()
    pump(sock, parser, nick, lambda event, hit: event[0] == "who_end", 5)
    sock.close()


def search(host, nick, query):
    sock, send = connect(host, nick, join=False)
    send(f"SEARCH :{query}")
    parser = Parser()
    pump(sock, parser, nick, lambda event, hit: event[0] == "search_end", 5)
    sock.close()


def main():
    parser = argparse.ArgumentParser(description="Nova hub client")
    parser.add_argument("mode", choices=["listen", "say", "history", "wait", "who", "search"])
    parser.add_argument("--host", default="")
    parser.add_argument("--nick", default="")
    parser.add_argument("--text", default="")
    parser.add_argument("--after", type=int, default=0)
    parser.add_argument("--limit", type=int, default=80)
    parser.add_argument("--timeout", type=int, default=25)
    args = parser.parse_args()
    client = load_client(args.host or None, args.nick or None)
    if not client["nick"]:
        parser.error("set --nick or ~/.config/nova/client.json")
    host, nick = client["host"], client["nick"]
    if args.mode == "listen":
        listen(host, nick)
    elif args.mode == "say":
        if not args.text:
            parser.error("--text is required")
        say(host, nick, args.text)
    elif args.mode == "history":
        history(host, nick, args.after, args.limit)
    elif args.mode == "wait":
        sys.exit(wait_for(host, nick, args.timeout, args.after))
    elif args.mode == "who":
        who(host, nick)
    else:
        if not args.text:
            parser.error("--text is required")
        search(host, nick, args.text)


if __name__ == "__main__":
    sys.path.insert(0, __import__("pathlib").Path(__file__).resolve().parent.as_posix())
    main()
