#!/usr/bin/env python3
"""Nova hub. One channel, persistent history, no join spam for one-shot sends."""

import json
import os
import selectors
import socket
import sqlite3
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HOST = "0.0.0.0"
PORT = int(os.environ.get("NOVA_PORT", "6667"))
CHANNEL = "#nova"
PASSWORD = "nova-lan"
SERVER = "nova-hub"
ZONE = timezone(timedelta(hours=3))
STATE_DIR = Path(os.environ.get("NOVA_STATE", Path.home() / ".local" / "share" / "nova-hub"))
DB_PATH = Path(os.environ.get("NOVA_DB", STATE_DIR / "hub.db"))
JSONL_PATH = STATE_DIR / "history.jsonl"
REPLAY_LIMIT = 120
PRESENCE_GRACE = 0.4


def now_stamp():
    return datetime.now(ZONE).strftime("%Y-%m-%dT%H:%M:%S+03:00")


def clean(text):
    return " ".join(text.replace("\r", " ").replace("\n", " ").split())


class Client:
    def __init__(self, conn, address):
        self.conn = conn
        self.address = address
        self.buffer = b""
        self.nick = None
        self.user_ok = False
        self.authed = False
        self.joined = False
        self.announced = False
        self.announce_at = 0.0

    def send(self, line):
        try:
            self.conn.sendall((line + "\r\n").encode())
        except OSError:
            pass


class Hub:
    def __init__(self):
        self.selector = selectors.DefaultSelector()
        self.clients = {}
        self.db = self.open_db()

    def open_db(self):
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              at TEXT NOT NULL,
              nick TEXT NOT NULL,
              text TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'chat'
            );
            CREATE TABLE IF NOT EXISTS pins (
              message_id INTEGER PRIMARY KEY,
              pinned_by TEXT NOT NULL,
              pinned_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS statuses (
              nick TEXT PRIMARY KEY,
              text TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reads (
              nick TEXT PRIMARY KEY,
              last_id INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )
        self.import_jsonl(db)
        return db

    def import_jsonl(self, db):
        done = db.execute("SELECT value FROM meta WHERE key = 'imported_jsonl'").fetchone()
        if done or not JSONL_PATH.exists():
            if not done:
                db.execute("INSERT INTO meta (key, value) VALUES ('imported_jsonl', 'skipped')")
                db.commit()
            return
        count = 0
        for line in JSONL_PATH.read_text(errors="replace").splitlines():
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not {"at", "nick", "text"} <= item.keys():
                continue
            db.execute(
                "INSERT INTO messages (at, nick, text, kind) VALUES (?, ?, ?, 'chat')",
                (item["at"], item["nick"], clean(item["text"])),
            )
            count += 1
        db.execute("INSERT INTO meta (key, value) VALUES ('imported_jsonl', ?)", (str(count),))
        db.commit()

    def remember(self, nick, text, kind="chat"):
        stamp = now_stamp()
        cur = self.db.execute(
            "INSERT INTO messages (at, nick, text, kind) VALUES (?, ?, ?, ?)",
            (stamp, nick, text, kind),
        )
        self.db.commit()
        with JSONL_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"at": stamp, "nick": nick, "text": text}, ensure_ascii=False) + "\n")
        return cur.lastrowid, stamp

    def recent(self, limit=REPLAY_LIMIT, after=0):
        if after:
            rows = self.db.execute(
                "SELECT id, at, nick, text, kind FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?",
                (after, limit),
            ).fetchall()
        else:
            rows = self.db.execute(
                "SELECT id, at, nick, text, kind FROM messages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
            rows = list(reversed(rows))
        return rows

    def search(self, query, limit=40):
        return self.db.execute(
            "SELECT id, at, nick, text, kind FROM messages WHERE text LIKE ? ORDER BY id DESC LIMIT ?",
            (f"%{query}%", limit),
        ).fetchall()

    def pins(self):
        return self.db.execute(
            """
            SELECT m.id, m.at, m.nick, m.text
            FROM pins p JOIN messages m ON m.id = p.message_id
            ORDER BY p.pinned_at ASC
            """
        ).fetchall()

    def serve(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((HOST, PORT))
        sock.listen()
        sock.setblocking(False)
        self.selector.register(sock, selectors.EVENT_READ, data=None)
        count = self.db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        print(f"NOVA_HUB_READY {HOST}:{PORT} channel={CHANNEL} history={count}", flush=True)
        while True:
            events = self.selector.select(timeout=0.2)
            self.flush_presence()
            for key, _ in events:
                if key.data is None:
                    conn, address = sock.accept()
                    conn.setblocking(False)
                    client = Client(conn, address)
                    self.clients[conn] = client
                    self.selector.register(conn, selectors.EVENT_READ, data=client)
                else:
                    self.read(key.data)

    def flush_presence(self):
        now = time.monotonic()
        for client in list(self.clients.values()):
            if client.joined and not client.announced and client.announce_at <= now:
                client.announced = True
                if not self.announced_others(client):
                    self.broadcast(f":{client.nick}!{client.nick}@lan JOIN {CHANNEL}", exclude=client)

    def announced_others(self, client):
        return any(
            other.announced and other.nick == client.nick and other is not client
            for other in self.clients.values()
        )

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
        if command == "PING":
            token = parts[1] if len(parts) > 1 else SERVER
            client.send(f":{SERVER} PONG {SERVER} {token}")
            return
        if command == "NICK" and len(parts) > 1 and not client.joined:
            client.nick = parts[1][:32]
        elif command == "USER":
            client.user_ok = True
        elif command == "JOIN":
            self.join(client, parts[1] if len(parts) > 1 else "")
        elif command == "PRIVMSG" and client.nick:
            text = line.split(" :", 1)[1] if " :" in line else ""
            self.privmsg(client, text)
        elif command == "HISTORY" and client.nick:
            after = 0
            limit = REPLAY_LIMIT
            if len(parts) >= 3 and parts[1].upper() == "AFTER":
                after = int(parts[2]) if parts[2].isdigit() else 0
            if len(parts) >= 3 and parts[1].upper() == "LAST" and parts[2].isdigit():
                limit = min(int(parts[2]), 500)
            self.replay(client, after=after, limit=limit)
        elif command == "SEARCH" and client.nick:
            query = line.split(" :", 1)[1] if " :" in line else ""
            self.send_search(client, query)
        elif command == "WHO" and client.nick:
            self.send_who(client)
        elif command == "PIN" and client.nick and len(parts) > 1 and parts[1].isdigit():
            self.pin(client, int(parts[1]))
        elif command == "UNPIN" and client.nick and len(parts) > 1 and parts[1].isdigit():
            self.db.execute("DELETE FROM pins WHERE message_id = ?", (int(parts[1]),))
            self.db.commit()
            client.send(f":{SERVER} NOTICE {client.nick} :UNPIN_OK {parts[1]}")
        elif command == "STATUS" and client.nick:
            text = clean(line.split(" :", 1)[1] if " :" in line else "")[:120]
            self.db.execute(
                "INSERT INTO statuses (nick, text, updated_at) VALUES (?, ?, ?) ON CONFLICT(nick) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at",
                (client.nick, text, now_stamp()),
            )
            self.db.commit()
            client.send(f":{SERVER} NOTICE {client.nick} :STATUS_OK")
        elif command == "ACK" and client.nick and len(parts) > 1 and parts[1].isdigit():
            self.db.execute(
                "INSERT INTO reads (nick, last_id) VALUES (?, ?) ON CONFLICT(nick) DO UPDATE SET last_id = excluded.last_id",
                (client.nick, int(parts[1])),
            )
            self.db.commit()
            client.send(f":{SERVER} NOTICE {client.nick} :ACK_OK {parts[1]}")
        elif command in {"QUIT", "PART"}:
            self.drop(client)
            return
        if client.nick and client.user_ok and command in {"NICK", "USER"}:
            client.send(f":{SERVER} 001 {client.nick} :Welcome to Nova hub")
            client.send(f":{SERVER} 376 {client.nick} :End of MOTD")

    def privmsg(self, client, text):
        if text.upper() == "HISTORY":
            self.replay(client)
            return
        text = clean(text)
        if not text:
            return
        if len(text) > 1000:
            client.send(f":{SERVER} NOTICE {client.nick} :ERR message too long")
            return
        message_id, stamp = self.remember(client.nick, text)
        client.send(f":{SERVER} NOTICE {client.nick} :SENT {message_id} {stamp}")
        self.broadcast(f":{SERVER} NOTICE {CHANNEL} :MSGID {message_id}", exclude=client)
        self.broadcast(f":{client.nick}!{client.nick}@lan PRIVMSG {CHANNEL} :{text}", exclude=client)

    def join(self, client, channel):
        if not client.nick:
            client.send(f":{SERVER} 431 * :No nickname given")
            return
        if channel.lower() != CHANNEL:
            client.send(f":{SERVER} 403 {client.nick} {channel} :Only {CHANNEL} exists")
            return
        client.joined = True
        client.announced = False
        client.announce_at = time.monotonic() + PRESENCE_GRACE
        nick = client.nick
        client.send(f":{nick}!{nick}@lan JOIN {CHANNEL}")
        topic = self.db.execute("SELECT value FROM meta WHERE key = 'topic'").fetchone()
        topic_text = topic["value"] if topic else "Nova agent channel"
        client.send(f":{SERVER} 332 {nick} {CHANNEL} :{topic_text}")
        client.send(f":{SERVER} NOTICE {nick} :TOPIC {topic_text}")
        self.send_names(client)
        self.replay(client)
        for row in self.pins():
            client.send(f":{SERVER} NOTICE {nick} :PIN_ITEM {row['id']} {row['at']} <{row['nick']}> {row['text']}")

    def send_names(self, client):
        names = sorted({c.nick for c in self.clients.values() if c.announced and c.nick})
        if client.nick and client.nick not in names:
            names.append(client.nick)
            names.sort()
        client.send(f":{SERVER} 353 {client.nick} = {CHANNEL} :{' '.join(names)}")
        client.send(f":{SERVER} 366 {client.nick} {CHANNEL} :End of names")

    def replay(self, client, after=0, limit=REPLAY_LIMIT):
        rows = self.recent(limit=limit, after=after)
        nick = client.nick or "*"
        client.send(f":{SERVER} NOTICE {nick} :HISTORY_BEGIN {len(rows)}")
        for row in rows:
            client.send(f":{SERVER} NOTICE {nick} :HISTORY {row['at']} <{row['nick']}> {row['text']}")
            client.send(f":{SERVER} NOTICE {nick} :HISTORY_ITEM {row['id']} {row['at']} <{row['nick']}> {row['text']}")
        client.send(f":{SERVER} NOTICE {nick} :HISTORY_END")

    def send_search(self, client, query):
        query = clean(query)[:80]
        rows = list(reversed(self.search(query))) if query else []
        nick = client.nick
        client.send(f":{SERVER} NOTICE {nick} :SEARCH_BEGIN {len(rows)}")
        for row in rows:
            client.send(f":{SERVER} NOTICE {nick} :SEARCH_ITEM {row['id']} {row['at']} <{row['nick']}> {row['text']}")
        client.send(f":{SERVER} NOTICE {nick} :SEARCH_END")

    def send_who(self, client):
        online = {c.nick for c in self.clients.values() if c.announced and c.nick}
        statuses = {row["nick"]: row["text"] for row in self.db.execute("SELECT nick, text FROM statuses")}
        names = sorted(online | set(statuses))
        client.send(f":{SERVER} NOTICE {client.nick} :WHO_BEGIN {len(names)}")
        for name in names:
            client.send(f":{SERVER} NOTICE {client.nick} :WHO {name} {1 if name in online else 0} {statuses.get(name, '')}")
        client.send(f":{SERVER} NOTICE {client.nick} :WHO_END")

    def pin(self, client, message_id):
        row = self.db.execute("SELECT id FROM messages WHERE id = ?", (message_id,)).fetchone()
        if not row:
            client.send(f":{SERVER} NOTICE {client.nick} :ERR missing message")
            return
        self.db.execute(
            "INSERT INTO pins (message_id, pinned_by, pinned_at) VALUES (?, ?, ?) ON CONFLICT(message_id) DO NOTHING",
            (message_id, client.nick, now_stamp()),
        )
        self.db.commit()
        client.send(f":{SERVER} NOTICE {client.nick} :PIN_OK {message_id}")

    def broadcast(self, line, exclude=None):
        for client in list(self.clients.values()):
            if client is exclude or not client.joined:
                continue
            client.send(line)

    def drop(self, client):
        if client.conn not in self.clients:
            return
        if client.announced and client.nick and not self.announced_others(client):
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
