"""Owner notifications via the LINE Messaging API (push message).

Needs LINE_CHANNEL_ACCESS_TOKEN (our LINE Official Account's Messaging API
channel) and each owner's LINE user ID (owners.line_user_id), which we get when
the owner adds our LINE OA as a friend. Without them, notifications are logged
and skipped - bookings still work. Push messages count toward the LINE OA plan's
monthly message quota (see docs/COSTS.md).
"""

from __future__ import annotations

import logging
import os

import requests

log = logging.getLogger(__name__)
PUSH_URL = "https://api.line.me/v2/bot/message/push"


def push_line(user_id: str | None, text: str, session=requests) -> bool:
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not token or not user_id:
        log.info("LINE push skipped (no token or user id): %s", text[:80])
        return False
    try:
        r = session.post(PUSH_URL, timeout=10,
                         headers={"Authorization": f"Bearer {token}"},
                         json={"to": user_id, "messages": [{"type": "text", "text": text[:5000]}]})
        r.raise_for_status()
        return True
    except requests.RequestException as e:
        log.warning("LINE push failed: %s", e)
        return False


def booking_message(site: dict, ref: str, booking: dict) -> str:
    lines = [f"📅 การจองใหม่ / New booking — {site['name']['th']}",
             f"Ref {ref}: {booking['summary']}",
             f"{booking['name']} · {booking['contact']}"]
    if booking.get("total"):
        lines.append(f"Total ฿{booking['total']:,}" + (f" · deposit ฿{booking['deposit']:,}" if booking.get("deposit") else ""))
    if booking.get("note"):
        lines.append(f"Note: {booking['note']}")
    return "\n".join(lines)
