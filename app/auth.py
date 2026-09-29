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
    """FastAPI dependency: the logged-in user's row, or a 401. Notes the day they were last active."""
    uid = parse_token(request.cookies.get(COOKIE))
    if uid is not None:
        with db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
            if row:
                today = time.strftime("%Y-%m-%d")
                if row["last_active"] != today:
                    conn.execute("UPDATE users SET last_active = ? WHERE id = ?", (today, uid))
                return promote_if_admin_email(conn, dict(row))
    raise HTTPException(401, "Please log in")


def current_admin(request: Request):
    user = current_user(request)
    if not user["is_admin"]:
        raise HTTPException(403, "Only an admin can do that.")
    return user


def admin_emails():
    """ADMIN_EMAIL (comma-separated) on Railway: those accounts become admins when they sign up or log in."""
    return {e.strip().lower() for e in os.environ.get("ADMIN_EMAIL", "").split(",") if e.strip()}


def promote_if_admin_email(conn, user):
    if user["email"] in admin_emails() and not user["is_admin"]:
        conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user["id"],))
        user["is_admin"] = 1
    return user


# ---- one-time password reset links (made by an admin, like the Training Tracker) ----------------------
RESET_HOURS = 48


def _hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def create_reset(conn, user_id, created_by):
    token = secrets.token_urlsafe(24)
    expires = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() + RESET_HOURS * 3600))
    conn.execute("DELETE FROM resets WHERE user_id = ?", (user_id,))  # only the newest link works
    conn.execute("INSERT INTO resets (token_hash, user_id, expires, created_by) VALUES (?, ?, ?, ?)",
                 (_hash_token(token), user_id, expires, created_by))
    return token


def redeem_reset(conn, token, password):
    """Set a new password with a reset link. Returns the user id, or raises."""
    row = conn.execute("SELECT * FROM resets WHERE token_hash = ?", (_hash_token(token or ""),)).fetchone()
    if not row or row["expires"] < time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()):
        raise HTTPException(400, "That reset link has expired or already been used. Ask for a new one.")
    if len(password) < MIN_PASSWORD:
        raise HTTPException(400, "Your password needs at least %d characters." % MIN_PASSWORD)
    conn.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (hash_password(password), row["user_id"]))
    conn.execute("DELETE FROM resets WHERE user_id = ?", (row["user_id"],))
    return row["user_id"]


def too_many_failures(ip):
    q = _failures[ip]
    while q and q[0] < time.time() - WINDOW:
        q.popleft()
    return len(q) >= MAX_FAILURES


def record_failure(ip):
    _failures[ip].append(time.time())
