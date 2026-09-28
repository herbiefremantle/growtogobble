"""Accounts: email + password, and a signed session cookie that works the same on phone and desktop.

Passwords are hashed with PBKDF2-SHA256 (built into every Python, unlike scrypt). The cookie holds a user id, an expiry and an HMAC of both, keyed by a secret
that's generated on first start and kept in the database (or SESSION_SECRET, if set).
"""
import hashlib
import hmac
import os
import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from . import db

COOKIE = "sts_session"
SESSION_SECONDS = 180 * 24 * 3600  # stay logged in for 6 months - it's a garden app, not a bank
MIN_PASSWORD = 8

# brute-force brake: 10 wrong passwords from one address in 10 minutes and it has to wait
_failures = defaultdict(deque)
MAX_FAILURES, WINDOW = 10, 600


def _secret():
    return os.environ.get("SESSION_SECRET") or db.setting("session_secret", lambda: secrets.token_urlsafe(32))


PBKDF2_ROUNDS = 600_000


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return "pbkdf2$%d$%s$%s" % (PBKDF2_ROUNDS, salt.hex(), digest.hex())


def check_password(password, stored):
    try:
        _, rounds, salt, digest = stored.split("$")
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
    except ValueError:
        return False
    return hmac.compare_digest(test.hex(), digest)


def make_token(user_id):
    payload = "%d.%d" % (user_id, int(time.time()) + SESSION_SECONDS)
    return payload + "." + hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()


def parse_token(token):
    try:
        uid, expires, sig = (token or "").split(".")
        payload = "%s.%s" % (uid, expires)
        good = hmac.new(_secret().encode(), payload.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, good) and int(expires) > time.time():
            return int(uid)
    except ValueError:
        pass
    return None


def set_cookie(response, request, user_id):
    response.set_cookie(COOKIE, make_token(user_id), max_age=SESSION_SECONDS, httponly=True, samesite="lax",
                        secure=request.url.scheme == "https")


def current_user(request: Request):
    """FastAPI dependency: the logged-in user's row, or a 401."""
    uid = parse_token(request.cookies.get(COOKIE))
    if uid is not None:
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if row:
            return dict(row)
    raise HTTPException(401, "Please log in")


def too_many_failures(ip):
    q = _failures[ip]
    while q and q[0] < time.time() - WINDOW:
        q.popleft()
    return len(q) >= MAX_FAILURES


def record_failure(ip):
    _failures[ip].append(time.time())
