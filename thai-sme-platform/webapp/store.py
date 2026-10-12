"""SQLite store for the pilot VPS: sites, owners, bookings, AI change requests.

One process, one connection, guarded by a lock. Move to Postgres/Supabase
(db/migrations) when the platform outgrows a single VPS.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from datetime import date, timedelta

SCHEMA = """
create table if not exists bookings (
  id integer primary key autoincrement,
  ref text unique not null,
  site text not null,
  kind text not null,          -- table | pickup | room | slot | seats
  res_key text,                -- room code or tour@departure, for availability
  start_date text not null,
  end_date text not null,      -- exclusive for rooms; same as start otherwise
  units integer not null default 1,
  data text not null,
  status text not null default 'pending',   -- pending | confirmed | cancelled
  deposit_paid integer not null default 0,
  created_at text not null default (datetime('now'))
);
create index if not exists bookings_site on bookings(site, start_date);

create table if not exists sites (
  slug text primary key,
  data text not null,
  updated_at text not null default (datetime('now'))
);
create table if not exists site_versions (
  id integer primary key autoincrement,
  slug text not null,
  data text not null,
  author text not null,        -- 'seed' | 'owner:<username>' | 'ai:<request id>' | 'admin'
  note text,
  created_at text not null default (datetime('now'))
);

create table if not exists owners (
  id integer primary key autoincrement,
  username text unique not null,
  name text not null,
  password_hash text not null,
  line_user_id text,
  created_at text not null default (datetime('now'))
);
create table if not exists owner_sites (
  owner_id integer not null references owners(id),
  slug text not null,
  primary key (owner_id, slug)
);

create table if not exists ai_requests (
  id integer primary key autoincrement,
  slug text not null,
  owner_id integer,
  text text not null,
  status text not null default 'queued',  -- queued | proposed | applied | rejected | needs_human | failed
  summary text,
  proposal text,                          -- proposed full site JSON
  error text,
  created_at text not null default (datetime('now')),
  updated_at text not null default (datetime('now'))
);
"""


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    expected = hash_password(password, bytes.fromhex(salt_hex)).split("$")[2]
    return hmac.compare_digest(expected, digest_hex)


class Store:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)
            cols = {r[1] for r in self._db.execute("pragma table_info(bookings)")}
            if "deposit_paid" not in cols:  # databases created before owner app
                self._db.execute("alter table bookings add column deposit_paid integer not null default 0")
            self._db.commit()

    def _q(self, sql: str, args=(), commit: bool = False):
        with self._lock:
            cur = self._db.execute(sql, args)
            rows = cur.fetchall()
            if commit:
                self._db.commit()
            return rows, cur.lastrowid

    # ---------------- Sites ----------------
    def site_slugs(self) -> list[str]:
        return [r[0] for r in self._q("select slug from sites order by slug")[0]]

    def get_site(self, slug: str) -> dict | None:
        rows, _ = self._q("select data from sites where slug=?", (slug,))
        return json.loads(rows[0][0]) if rows else None

    def save_site(self, slug: str, data: dict, author: str, note: str = "") -> None:
        blob = json.dumps(data, ensure_ascii=False)
        with self._lock:
            self._db.execute(
                "insert into sites (slug, data) values (?, ?) on conflict(slug) do update "
                "set data=excluded.data, updated_at=datetime('now')", (slug, blob))
            self._db.execute("insert into site_versions (slug, data, author, note) values (?,?,?,?)",
                             (slug, blob, author, note))
            self._db.commit()

    def site_history(self, slug: str, limit: int = 20) -> list[dict]:
        rows, _ = self._q("select id, author, note, created_at from site_versions where slug=? "
                          "order by id desc limit ?", (slug, limit))
        return [dict(r) for r in rows]

    def site_version(self, slug: str, version_id: int) -> dict | None:
        rows, _ = self._q("select data from site_versions where slug=? and id=?", (slug, version_id))
        return json.loads(rows[0][0]) if rows else None

    # ---------------- Owners ----------------
    def create_owner(self, username: str, name: str, password: str, slugs: list[str],
                     line_user_id: str | None = None) -> int:
        _, oid = self._q("insert into owners (username, name, password_hash, line_user_id) values (?,?,?,?)",
                         (username.lower(), name, hash_password(password), line_user_id), commit=True)
        for slug in slugs:
            self._q("insert or ignore into owner_sites (owner_id, slug) values (?,?)", (oid, slug), commit=True)
        return oid

    def authenticate(self, username: str, password: str) -> dict | None:
        rows, _ = self._q("select * from owners where username=?", ((username or "").lower(),))
        if rows and check_password(password or "", rows[0]["password_hash"]):
            return {k: rows[0][k] for k in ("id", "username", "name", "line_user_id")}
        return None

    def owner(self, owner_id: int) -> dict | None:
        rows, _ = self._q("select id, username, name, line_user_id from owners where id=?", (owner_id,))
        return dict(rows[0]) if rows else None

    def owner_slugs(self, owner_id: int) -> list[str]:
        rows, _ = self._q("select slug from owner_sites where owner_id=? order by slug", (owner_id,))
        return [r[0] for r in rows]

    def owners_for_site(self, slug: str) -> list[dict]:
        rows, _ = self._q("select o.id, o.name, o.line_user_id from owners o join owner_sites s "
                          "on s.owner_id=o.id where s.slug=?", (slug,))
        return [dict(r) for r in rows]

    # ---------------- Bookings ----------------
    def booked(self, site: str, kind: str, key: str, start: date, end: date) -> int:
        """Units (rooms) or seats already taken for `key` overlapping [start, end)."""
        if kind == "room":
            # Count bookings overlapping any night of the range. Conservative:
            # a per-night peak would allow slightly more bookings.
            rows, _ = self._q(
                "select coalesce(sum(units),0) from bookings where site=? and kind='room' "
                "and res_key=? and status!='cancelled' and start_date<? and end_date>?",
                (site, key, end.isoformat(), start.isoformat()))
        else:
            rows, _ = self._q(
                "select coalesce(sum(units),0) from bookings where site=? and kind=? "
                "and res_key=? and status!='cancelled' and start_date=?",
                (site, kind, key, start.isoformat()))
        return int(rows[0][0])

    def add(self, site: str, booking: dict) -> str:
        kind = booking["type"]
        if kind == "room":
            key, start, end, units = booking["room"], booking["check_in"], booking["check_out"], 1
        elif kind == "seats":
            key = f"{booking['tour']}@{booking['departure']}"
            start = end = booking["date"]
            units = booking["adults"] + booking["children"]
        else:
            key, start, end, units = None, booking["date"], booking["date"], 1
        ref = secrets.token_hex(3).upper()
        self._q("insert into bookings (ref, site, kind, res_key, start_date, end_date, units, data) "
                "values (?,?,?,?,?,?,?,?)",
                (ref, site, kind, key, start, end, units, json.dumps(booking, ensure_ascii=False)),
                commit=True)
        return ref

    def get_booking(self, site: str, ref: str) -> dict | None:
        rows, _ = self._q("select ref, status, deposit_paid, created_at, data from bookings "
                          "where site=? and ref=?", (site, ref))
        return self._booking(rows[0]) if rows else None

    def list(self, site: str, days_back: int = 30, status: str | None = None) -> list[dict]:
        since = (date.today() - timedelta(days=days_back)).isoformat()
        sql = ("select ref, status, deposit_paid, created_at, data from bookings "
               "where site=? and start_date>=?")
        args: list = [site, since]
        if status:
            sql += " and status=?"
            args.append(status)
        rows, _ = self._q(sql + " order by start_date, id", args)
        return [self._booking(r) for r in rows]

    @staticmethod
    def _booking(r) -> dict:
        return {"ref": r["ref"], "status": r["status"], "deposit_paid": bool(r["deposit_paid"]),
                "created_at": r["created_at"], **json.loads(r["data"])}

    def update_booking(self, site: str, ref: str, status: str | None = None,
                       deposit_paid: bool | None = None) -> bool:
        if status is not None:
            if status not in ("pending", "confirmed", "cancelled"):
                raise ValueError("bad status")
            self._q("update bookings set status=? where site=? and ref=?", (status, site, ref), commit=True)
        if deposit_paid is not None:
            self._q("update bookings set deposit_paid=? where site=? and ref=?",
                    (1 if deposit_paid else 0, site, ref), commit=True)
        return self.get_booking(site, ref) is not None

    # ---------------- AI change requests ----------------
    def add_ai_request(self, slug: str, owner_id: int | None, text: str) -> int:
        _, rid = self._q("insert into ai_requests (slug, owner_id, text) values (?,?,?)",
                         (slug, owner_id, text[:2000]), commit=True)
        return rid

    def update_ai_request(self, rid: int, **fields) -> None:
        allowed = {"status", "summary", "proposal", "error"}
        sets = [f"{k}=?" for k in fields if k in allowed]
        vals = [json.dumps(v, ensure_ascii=False) if k == "proposal" and v is not None else v
                for k, v in fields.items() if k in allowed]
        self._q(f"update ai_requests set {', '.join(sets)}, updated_at=datetime('now') where id=?",
                (*vals, rid), commit=True)

    def ai_requests(self, slug: str, limit: int = 30) -> list[dict]:
        rows, _ = self._q("select * from ai_requests where slug=? order by id desc limit ?", (slug, limit))
        return [self._ai(r) for r in rows]

    def ai_request(self, rid: int) -> dict | None:
        rows, _ = self._q("select * from ai_requests where id=?", (rid,))
        return self._ai(rows[0]) if rows else None

    @staticmethod
    def _ai(r) -> dict:
        d = dict(r)
        d["proposal"] = json.loads(d["proposal"]) if d["proposal"] else None
        return d
