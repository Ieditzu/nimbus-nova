#!/usr/bin/env python3
"""Nova hub panel. Messages wrap. Join and leave stay out of the log."""

import argparse
import curses
import locale
import queue
import sys
import textwrap
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nova_proto import CHANNEL, Parser, load_client, open_link

HELP = [
    "enter send    pgup/pgdn scroll    up/down recall",
    "/search text  /pin id  /unpin id  /status text",
    "/who  /help  /quit",
    "One nick sends and watches. Say does not open a second connection.",
]


def reader(host, nick, events, outgoing, stop):
    while not stop.is_set():
        try:
            sock, send = open_link(host, nick)
            send(f"JOIN {CHANNEL}")
            events.put(("status", "live"))
            parser = Parser()
            buffer = b""
            sock.setblocking(False)
            while not stop.is_set():
                try:
                    chunk = sock.recv(4096)
                except BlockingIOError:
                    chunk = None
                if chunk == b"":
                    raise ConnectionError("hub closed")
                if chunk:
                    buffer += chunk
                    while b"\n" in buffer:
                        raw, buffer = buffer.split(b"\n", 1)
                        event = parser.feed(raw.decode(errors="replace").strip())
                        if not event:
                            continue
                        if event[0] == "ping":
                            sock.sendall((f"PONG {event[1]}\r\n").encode())
                            continue
                        events.put(event)
                try:
                    command, text = outgoing.get_nowait()
                except queue.Empty:
                    time.sleep(0.04)
                    continue
                send(command if text is None else f"{command} :{text}" if command != "PRIVMSG" else f"PRIVMSG {CHANNEL} :{text}")
        except OSError as exc:
            events.put(("status", f"down: {exc}"))
            events.put(("names", []))
            if stop.is_set():
                return
            time.sleep(2)
            events.put(("status", "reconnecting"))


def color_for(name):
    folded = name.lower()
    if folded.startswith("haivas"):
        return 1
    if folded.startswith("ciprian"):
        return 2
    if folded.startswith("perjoc"):
        return 3
    if name == "system":
        return 4
    return 5


def paint(stdscr, state):
    height, width = stdscr.getmaxyx()
    stdscr.erase()
    if height < 10 or width < 48:
        stdscr.addnstr(0, 0, "Need a terminal at least 48x10.", width - 1)
        stdscr.refresh()
        return
    side = 24 if width >= 84 else 0
    chat_width = width - side
    title = f" Nova  {CHANNEL}  {state['status']}  {state['nick']}  {state['host']} "
    stdscr.attron(curses.A_REVERSE)
    stdscr.addnstr(0, 0, title.ljust(width)[:width], width)
    stdscr.attroff(curses.A_REVERSE)
    rows = []
    query = state["query"].lower()
    for item in state["lines"]:
        if query and query not in item["text"].lower() and query not in item["nick"].lower():
            continue
        stamp = item["at"][11:19] if len(item["at"]) >= 19 else item["at"]
        ident = f"{stamp} #{item['id'] or '-'} {item['nick']}"
        rows.append(("meta", item["nick"], ident))
        wrapped = textwrap.wrap(item["text"], max(20, chat_width - 3)) or [""]
        for piece in wrapped:
            rows.append(("text", item["nick"], "  " + piece))
        rows.append(("gap", "", ""))
    body = height - 3
    start = max(0, len(rows) - body - state["scroll"])
    visible = rows[start:start + body]
    for row, (kind, sender, text) in enumerate(visible, start=1):
        if kind == "gap":
            continue
        pair = color_for(sender)
        attr = curses.color_pair(pair) | (curses.A_BOLD if kind == "meta" else 0)
        if "contract-change" in text or f"@{state['nick']}" in text:
            attr |= curses.A_REVERSE
        stdscr.attron(attr)
        stdscr.addnstr(row, 0, text[: chat_width - 1], chat_width - 1)
        stdscr.attroff(attr)
    if side:
        stdscr.attron(curses.A_REVERSE)
        stdscr.addnstr(1, chat_width, " online".ljust(side)[:side], side)
        stdscr.attroff(curses.A_REVERSE)
        row = 2
        for name in state["online"]:
            if row >= height - 3:
                break
            stdscr.attron(curses.color_pair(color_for(name)))
            label = f" {name}"
            status = state["statuses"].get(name, "")
            stdscr.addnstr(row, chat_width, label.ljust(side)[:side], side)
            stdscr.attroff(curses.color_pair(color_for(name)))
            row += 1
            if status and row < height - 3:
                stdscr.attron(curses.A_DIM)
                stdscr.addnstr(row, chat_width, f"  {status}".ljust(side)[:side], side)
                stdscr.attroff(curses.A_DIM)
                row += 1
        if row < height - 4:
            stdscr.attron(curses.A_REVERSE)
            stdscr.addnstr(row, chat_width, " pins".ljust(side)[:side], side)
            stdscr.attroff(curses.A_REVERSE)
            row += 1
            for pin in state["pins"][:4]:
                if row >= height - 3:
                    break
                stdscr.addnstr(row, chat_width, f" #{pin['id']} {pin['text']}".ljust(side)[:side], side)
                row += 1
    hint = " /help  /search  /pin  /status  /quit    pgup scroll "
    if state["help"]:
        hint = " ".join(HELP)
    stdscr.attron(curses.A_DIM)
    stdscr.addnstr(height - 2, 0, hint.ljust(width)[:width], width)
    stdscr.attroff(curses.A_DIM)
    prompt = "> " + state["input"]
    stdscr.addnstr(height - 1, 0, prompt[: width - 1], width - 1)
    stdscr.move(height - 1, min(len(prompt), width - 1))
    stdscr.refresh()


def handle_slash(text, state, outgoing):
    parts = text.split(" ", 1)
    command = parts[0].lower()
    arg = parts[1] if len(parts) > 1 else ""
    if command in {"/quit", "/q"}:
        return "quit"
    if command == "/help":
        state["help"] = not state["help"]
    elif command == "/search":
        state["query"] = arg
        if arg:
            outgoing.put(("SEARCH", arg))
    elif command == "/pin" and arg.isdigit():
        outgoing.put((f"PIN {arg}", None))
    elif command == "/unpin" and arg.isdigit():
        outgoing.put((f"UNPIN {arg}", None))
    elif command == "/status":
        outgoing.put(("STATUS", arg))
    elif command == "/who":
        outgoing.put(("WHO", None))
    else:
        state["lines"].append({"id": None, "at": time.strftime("%H:%M:%S"), "nick": "system", "text": "Unknown command. /help"})
    return None


def run(stdscr, host, nick):
    curses.curs_set(1)
    curses.start_color()
    curses.use_default_colors()
    for number, color in ((1, curses.COLOR_CYAN), (2, curses.COLOR_MAGENTA), (3, curses.COLOR_YELLOW), (4, curses.COLOR_BLUE), (5, curses.COLOR_WHITE)):
        curses.init_pair(number, color, -1)
    stdscr.nodelay(True)
    stdscr.keypad(True)
    state = {
        "host": host, "nick": nick, "status": "connecting", "lines": [], "online": [],
        "pins": [], "statuses": {}, "input": "", "scroll": 0, "sent": [], "sent_at": 0,
        "query": "", "help": False,
    }
    events = queue.Queue()
    outgoing = queue.Queue()
    stop = threading.Event()
    threading.Thread(target=reader, args=(host, nick, events, outgoing, stop), daemon=True).start()
    while True:
        while True:
            try:
                event = events.get_nowait()
            except queue.Empty:
                break
            kind = event[0]
            if kind == "status":
                state["status"] = event[1]
            elif kind == "names":
                state["online"] = event[1]
            elif kind == "history":
                state["lines"].append(event[1])
            elif kind == "search":
                if event[1] not in state["lines"]:
                    state["lines"].append(event[1])
                state["lines"].sort(key=lambda item: item["id"] or 0)
            elif kind == "pin":
                state["pins"].append(event[1])
            elif kind == "who":
                if event[1]["status"]:
                    state["statuses"][event[1]["nick"]] = event[1]["status"]
            elif kind == "presence":
                name = event[1]["nick"]
                if event[1]["event"] == "joined" and name not in state["online"]:
                    state["online"].append(name)
                if event[1]["event"] == "left":
                    state["online"] = [item for item in state["online"] if item != name]
            elif kind == "message":
                state["lines"].append(event[1])
                state["scroll"] = 0
            elif kind == "sent":
                state["lines"].append({"id": event[1]["id"], "at": event[1]["at"], "nick": nick, "text": state.get("pending", "")})
        paint(stdscr, state)
        try:
            key = stdscr.get_wch()
        except curses.error:
            time.sleep(0.04)
            continue
        if key == curses.KEY_RESIZE:
            continue
        if key in (curses.KEY_BACKSPACE, 127, "\x7f", "\b"):
            state["input"] = state["input"][:-1]
        elif key == curses.KEY_PPAGE:
            state["scroll"] = min(state["scroll"] + 8, max(0, len(state["lines"])))
        elif key == curses.KEY_NPAGE:
            state["scroll"] = max(0, state["scroll"] - 8)
        elif key == curses.KEY_UP and state["sent"]:
            state["sent_at"] = max(0, state["sent_at"] - 1)
            state["input"] = state["sent"][state["sent_at"]]
        elif key == curses.KEY_DOWN and state["sent"]:
            state["sent_at"] = min(len(state["sent"]), state["sent_at"] + 1)
            state["input"] = "" if state["sent_at"] == len(state["sent"]) else state["sent"][state["sent_at"]]
        elif key == "\x15":
            state["input"] = ""
        elif isinstance(key, str) and key in ("\n", "\r"):
            text = state["input"].strip()
            state["input"] = ""
            state["scroll"] = 0
            if not text:
                continue
            if text.startswith("/"):
                if handle_slash(text, state, outgoing) == "quit":
                    break
                continue
            state["sent"].append(text)
            state["sent"] = state["sent"][-50:]
            state["sent_at"] = len(state["sent"])
            state["pending"] = text
            outgoing.put(("PRIVMSG", text))
        elif key in ("q", "Q") and state["input"] == "":
            break
        elif isinstance(key, str) and key.isprintable():
            state["input"] += key
    stop.set()


def main():
    locale.setlocale(locale.LC_ALL, "")
    parser = argparse.ArgumentParser(description="Nova hub panel")
    parser.add_argument("--host", default="")
    parser.add_argument("--nick", default="Haivas")
    args = parser.parse_args()
    client = load_client(args.host or None, args.nick)
    curses.wrapper(run, client["host"], client["nick"])


if __name__ == "__main__":
    main()
