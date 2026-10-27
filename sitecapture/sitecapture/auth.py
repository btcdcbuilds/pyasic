"""Email + password accounts with cookie sessions.

Passwords are hashed with scrypt (Python standard library). The session cookie
holds a random token; only its SHA-256 is stored, and sessions expire after
``SESSION_DAYS``. Failed logins are throttled per email address.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sitecapture.db import User, UserSession, as_utc

COOKIE_NAME = "sc_session"
SESSION_DAYS = 14
MIN_PASSWORD_LENGTH = 10

# scrypt cost parameters (~16 MB memory per hash).
_N, _R, _P = 2**14, 8, 1

MAX_FAILURES = 10
FAILURE_WINDOW_S = 15 * 60


class AuthError(ValueError):
    pass


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        candidate = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(digest) // 2,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(candidate.hex(), digest)


def check_password_rules(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")


def normalise_email(email: str) -> str:
    email = email.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise AuthError("enter a valid email address")
    return email


def create_user(
    session: Session, email: str, password: str, name: str = "", is_admin: bool = False
) -> User:
    email = normalise_email(email)
    check_password_rules(password)
    if session.scalar(select(User).where(User.email == email)):
        raise AuthError("a user with that email already exists")
    user = User(
        email=email,
        name=name.strip(),
        password_hash=hash_password(password),
        is_admin=is_admin,
    )
    session.add(user)
    session.commit()
    return user


def user_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(User)) or 0


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(
        UserSession(
            token_hash=_token_hash(token),
            user_id=user.id,
            expires_at=dt.datetime.now(dt.timezone.utc)
            + dt.timedelta(days=SESSION_DAYS),
        )
    )
    session.commit()
    return token


def user_for_token(session: Session, token: str | None) -> User | None:
    if not token:
        return None
    row = session.scalar(
        select(UserSession).where(UserSession.token_hash == _token_hash(token))
    )
    if row is None:
        return None
    if (
        as_utc(row.expires_at) < dt.datetime.now(dt.timezone.utc)
        or not row.user.is_active
    ):
        session.delete(row)
        session.commit()
        return None
    return row.user


def end_session(session: Session, token: str | None) -> None:
    if not token:
        return
    row = session.scalar(
        select(UserSession).where(UserSession.token_hash == _token_hash(token))
    )
    if row:
        session.delete(row)
        session.commit()


def end_all_sessions(session: Session, user_id: int) -> None:
    for row in session.scalars(
        select(UserSession).where(UserSession.user_id == user_id)
    ):
        session.delete(row)
    session.commit()


_DUMMY: list[str] = []


def _dummy_hash() -> str:
    if not _DUMMY:
        _DUMMY.append(hash_password(secrets.token_hex(8)))
    return _DUMMY[0]


class LoginThrottle:
    """In-memory count of recent failed logins per email (single server process)."""

    def __init__(
        self, max_failures: int = MAX_FAILURES, window_s: float = FAILURE_WINDOW_S
    ):
        self.max_failures = max_failures
        self.window_s = window_s
        self._failures: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque:
        q = self._failures[key]
        while q and now - q[0] > self.window_s:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._prune(key, time.monotonic())) >= self.max_failures

    def fail(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._prune(key, now).append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


def authenticate(
    session: Session, throttle: LoginThrottle, email: str, password: str
) -> User:
    key = email.strip().lower()
    if throttle.blocked(key):
        raise AuthError("too many failed attempts; wait 15 minutes and try again")
    user = session.scalar(select(User).where(User.email == key))
    # Hash even when the user doesn't exist so response time doesn't reveal it.
    ok = verify_password(password, user.password_hash if user else _dummy_hash())
    if not user or not ok or not user.is_active:
        throttle.fail(key)
        raise AuthError("incorrect email or password")
    throttle.clear(key)
    return user
