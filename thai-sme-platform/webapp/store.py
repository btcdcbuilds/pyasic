"""SQLite booking store for the pilot VPS. Move to Supabase (db/migrations) later."""

from __future__ import annotations

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
  status text not null default 'pending',
  created_at text not null default (datetime('now'))
);
create index if not exists bookings_site on bookings(site, start_date);
"""


class Store:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        with self._lock:
            self._db.executescript(SCHEMA)

    def booked(self, site: str, kind: str, key: str, start: date, end: date) -> int:
        """Units (rooms) or seats already taken for `key` overlapping [start, end)."""
        with self._lock:
            if kind == "room":
                # Count bookings overlapping any night of the stay. Conservative:
                # a per-night peak would allow slightly more bookings.
                row = self._db.execute(
                    "select coalesce(sum(units),0) from bookings where site=? and kind='room' "
                    "and res_key=? and status!='cancelled' and start_date<? and end_date>?",
                    (site, key, end.isoformat(), start.isoformat())).fetchone()
            else:
                row = self._db.execute(
                    "select coalesce(sum(units),0) from bookings where site=? and kind=? "
                    "and res_key=? and status!='cancelled' and start_date=?",
                    (site, kind, key, start.isoformat())).fetchone()
        return int(row[0])

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
        with self._lock:
            self._db.execute(
                "insert into bookings (ref, site, kind, res_key, start_date, end_date, units, data) "
                "values (?,?,?,?,?,?,?,?)",
                (ref, site, kind, key, start, end, units, json.dumps(booking, ensure_ascii=False)))
            self._db.commit()
        return ref

    def list(self, site: str, days_back: int = 30) -> list[dict]:
        since = (date.today() - timedelta(days=days_back)).isoformat()
        with self._lock:
            rows = self._db.execute(
                "select ref, status, created_at, data from bookings where site=? and start_date>=? "
                "order by start_date, id", (site, since)).fetchall()
        return [{"ref": r["ref"], "status": r["status"], "created_at": r["created_at"],
                 **json.loads(r["data"])} for r in rows]
