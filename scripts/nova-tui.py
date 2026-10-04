#!/usr/bin/env python3
"""Full-screen control panel for the Nova LAN IRC hub."""

import argparse
import curses
import locale
import queue
import socket
import threading
import time

CHANNEL = "#nova"
PASSWORD = "nova-lan"
PORT = 6667
COLORS = {
    "Haivas": 1,
    "Ciprian": 2,
    "Perjoc": 3,
    "system": 4,
    "me": 5,
}


def connect(host, nick):
    sock = socket.create_connection((host, PORT), timeout=10)
    sock.settimeout(None)
    def send(line):
        sock.sendall((line + "\r\n").encode())
    send(f"PASS {PASSWORD}")
    send(f"NICK {nick}")
    send(f"USER {nick} 0 * :{nick}")
    send(f"JOIN {CHANNEL}")
    return sock


def parse(line, nick, events):
    if line.startswith("PING"):
        return "PONG " + (line.split(" ", 1)[1] if " " in line else ":nova-hub")
    if " 353 " in line and f" = {CHANNEL} :" in line:
        names = [name for name in line.split(f" = {CHANNEL} :", 1)[1].split() if name]
        events.put(("online", names))
        return None
    if " 433 " in line:
        events.put(("status", "nick already in use"))
        return None
    if " NOTICE " in line and " :HISTORY_BEGIN " in line:
        return None
    if " NOTICE " in line and " :HISTORY " in line and "HISTORY_BEGIN" not in line and "HISTORY_END" not in line:
        payload = line.split(" :HISTORY ", 1)[1]
        stamp, rest = payload.split(" ", 1)
        sender = rest.split(">", 1)[0].lstrip("<")
        text = rest.split("> ", 1)[1] if "> " in rest else ""
        events.put(("history", stamp, sender, text))
        return None
    if " NOTICE " in line and " :HISTORY_END" in line:
        events.put(("history_end",))
        return None
    if " JOIN " in line and line.startswith(":"):
        sender = line[1:].split("!", 1)[0]
        if sender != nick:
            events.put(("presence", sender, "joined"))
        return None
    if " QUIT " in line and line.startswith(":"):
        sender = line[1:].split("!", 1)[0]
        if sender != nick:
            events.put(("presence", sender, "left"))
        return None
    marker = f" PRIVMSG {CHANNEL} :"
    prefix = line.split(" ", 1)[0]
    if marker in line and prefix.startswith(":") and "!" in prefix:
        sender = prefix[1:].split("!", 1)[0]
        text = line.split(marker, 1)[1]
        events.put(("message", time.strftime("%H:%M:%S"), sender, text))
    return None


def reader(host, nick, events, outgoing, stop):
    while not stop.is_set():
        try:
            sock = connect(host, nick)
            events.put(("status", f"connected {host}:{PORT}"))
            buffer = b""
            sock.setblocking(False)
            while not stop.is_set():
                try:
                    chunk = sock.recv(4096)
                except BlockingIOError:
                    chunk = None
                if chunk == b"":
                    raise ConnectionError("hub closed the connection")
                if chunk:
                    buffer += chunk
                    while b"\n" in buffer:
                        raw, buffer = buffer.split(b"\n", 1)
                        reply = parse(raw.decode(errors="replace").strip(), nick, events)
                        if reply:
                            sock.sendall((reply + "\r\n").encode())
                try:
                    text = outgoing.get_nowait()
                except queue.Empty:
                    time.sleep(0.05)
                    continue
                sock.sendall(f"PRIVMSG {CHANNEL} :{text}\r\n".encode())
                events.put(("message", time.strftime("%H:%M:%S"), nick, text))
        except OSError as exc:
            events.put(("status", f"disconnected: {exc}"))
            events.put(("online", []))
            if stop.is_set():
                return
            time.sleep(2)
            events.put(("status", "reconnecting"))


def draw(stdscr, state):
    height, width = stdscr.getmaxyx()
    stdscr.erase()
    if height < 8 or width < 40:
        stdscr.addnstr(0, 0, "Terminal too small. Need 40x8.", width - 1)
        stdscr.refresh()
        return
    side = 18 if width > 70 else 0
    chat_width = width - side
    title = f" Nova  {state['host']}:{PORT}  {CHANNEL}  nick={state['nick']}  {state['status']} "
    stdscr.attron(curses.A_REVERSE)
    stdscr.addnstr(0, 0, title.ljust(width), width)
    stdscr.attroff(curses.A_REVERSE)
    body_height = height - 4
    visible = state["lines"][-(body_height + state["scroll"]):-state["scroll"] or None]
    for row, item in enumerate(visible, start=1):
        kind, stamp, sender, text = item
        color = COLORS.get(sender, 6)
        label = f"{stamp} {sender:<12} "
        stdscr.attron(curses.color_pair(color))
        stdscr.addnstr(row, 0, label, chat_width - 1)
        stdscr.attroff(curses.color_pair(color))
        stdscr.addnstr(row, min(len(label), chat_width - 1), text, max(0, chat_width - len(label) - 1))
    if side:
        stdscr.attron(curses.A_REVERSE)
        stdscr.addnstr(1, chat_width, " online ".ljust(side), side)
        stdscr.attroff(curses.A_REVERSE)
        for row, name in enumerate(sorted(state["online"]), start=2):
            if row >= height - 3:
                break
            color = COLORS.get(name, 6)
            stdscr.attron(curses.color_pair(color))
            stdscr.addnstr(row, chat_width, f" {name}".ljust(side), side)
            stdscr.attroff(curses.color_pair(color))
    help_line = " enter send   pgup/pgdn scroll   up/down recall   /quit   q quits if input is empty "
    stdscr.attron(curses.A_DIM)
    stdscr.addnstr(height - 2, 0, help_line.ljust(width), width)
    stdscr.attroff(curses.A_DIM)
    prompt = "> " + state["input"]
    stdscr.addnstr(height - 1, 0, prompt[: width - 1])
    stdscr.move(height - 1, min(len(prompt), width - 1))
    stdscr.refresh()


def run(stdscr, host, nick):
    curses.curs_set(1)
    curses.start_color()
    curses.use_default_colors()
    pairs = [(1, curses.COLOR_CYAN), (2, curses.COLOR_MAGENTA), (3, curses.COLOR_YELLOW), (4, curses.COLOR_BLUE), (5, curses.COLOR_GREEN), (6, curses.COLOR_WHITE)]
    for number, color in pairs:
        curses.init_pair(number, color, -1)
    stdscr.nodelay(True)
    stdscr.keypad(True)
    state = {"host": host, "nick": nick, "status": "connecting", "lines": [], "online": [], "input": "", "scroll": 0, "sent": [], "sent_at": 0}
    events = queue.Queue()
    outgoing = queue.Queue()
    stop = threading.Event()
    thread = threading.Thread(target=reader, args=(host, nick, events, outgoing, stop), daemon=True)
    thread.start()
    while True:
        while True:
            try:
                event = events.get_nowait()
            except queue.Empty:
                break
            kind = event[0]
            if kind == "status":
                state["status"] = event[1]
            elif kind == "online":
                state["online"] = event[1]
            elif kind == "history":
                state["lines"].append(("history", event[1][11:19], event[2], event[3]))
            elif kind == "history_end":
                state["status"] = "live"
                state["scroll"] = 0
            elif kind == "presence":
                state["lines"].append(("system", time.strftime("%H:%M:%S"), "system", f"{event[1]} {event[2]}"))
                if event[2] == "joined" and event[1] not in state["online"]:
                    state["online"].append(event[1])
                if event[2] == "left":
                    state["online"] = [name for name in state["online"] if name != event[1]]
            elif kind == "message":
                state["lines"].append(event)
                if state["scroll"] == 0:
                    pass
        draw(stdscr, state)
        try:
            key = stdscr.get_wch()
        except curses.error:
            time.sleep(0.05)
            continue
        if key == curses.KEY_RESIZE:
            continue
        if key in (curses.KEY_BACKSPACE, 127, "\x7f"):
            state["input"] = state["input"][:-1]
        elif key == curses.KEY_PPAGE:
            state["scroll"] = min(state["scroll"] + 10, max(0, len(state["lines"]) - 1))
        elif key == curses.KEY_NPAGE:
            state["scroll"] = max(0, state["scroll"] - 10)
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
            if text in {"/quit", "/q"}:
                break
            if text == "/history":
                outgoing.put("HISTORY")
                continue
            state["sent"].append(text)
            state["sent"] = state["sent"][-50:]
            state["sent_at"] = len(state["sent"])
            outgoing.put(text)
        elif key in ("q", "Q") and state["input"] == "":
            break
        elif isinstance(key, str) and key.isprintable():
            state["input"] += key
    stop.set()


def main():
    locale.setlocale(locale.LC_ALL, "")
    parser = argparse.ArgumentParser(description="Nova IRC control panel")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--nick", default="Haivas")
    args = parser.parse_args()
    curses.wrapper(run, args.host, args.nick)


if __name__ == "__main__":
    main()
