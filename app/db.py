"""SQLite storage. One file (GARDEN_DB, default ./garden.db) - on Railway it lives on the volume at /data."""
import os
import sqlite3
from contextlib import contextmanager

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pw_hash TEXT NOT NULL,
    outcode TEXT,
    region TEXT NOT NULL DEFAULT 'central',
    lat REAL,
    lon REAL,
    cal_token TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    last_active TEXT,
    invited_by INTEGER,               -- who invited them (users.id), if they came from an invite link
    invite_token TEXT,                -- which invite link they used
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS spaces (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,               -- bed | pot | allotment
    width_m REAL,
    length_m REAL,
    soil TEXT,
    built INTEGER,                    -- a bed: 1 already built, 0 still to build, NULL not asked yet
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS crops (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plant_id TEXT NOT NULL,
    space_id INTEGER REFERENCES spaces(id) ON DELETE SET NULL,
    method TEXT NOT NULL,             -- sow_in | sow_out | plants
    quantity INTEGER,                 -- how many plants/seeds/cloves; NULL = a sensible default
    bed_free_on TEXT,                 -- following another crop: its space is free from this date
    anchor TEXT NOT NULL,             -- the sowing/planting window we're aiming for
    anchor_end TEXT NOT NULL,
    sown_on TEXT,
    planted_on TEXT,
    harvested_on TEXT,
    finished_on TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS done (           -- ticked-off jobs, keyed like 'c12:sow' or 's3:nodig2'
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    done_on TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS badges (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge TEXT NOT NULL,
    earned_on TEXT NOT NULL,
    PRIMARY KEY (user_id, badge)
);
CREATE TABLE IF NOT EXISTS push_subs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sent (           -- alerts already sent, so nobody gets the same nudge twice
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    sent_on TEXT NOT NULL,
    PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invites (        -- each time someone taps "Invite a friend"
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resets (         -- one-time "set a new password" links an admin makes
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TEXT NOT NULL,
    created_by INTEGER
);
"""


def on_volume():
    """True when the database lives on a mounted disk (a Railway volume) - so it survives redeploys."""
    return os.path.ismount(os.path.dirname(os.path.abspath(path())))


def path():
    return os.environ.get("GARDEN_DB", os.path.join(os.path.dirname(os.path.dirname(__file__)), "garden.db"))


@contextmanager
def connect():
    conn = sqlite3.connect(path())
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


# columns added after the first version: (table, column, type)
MIGRATIONS = [("spaces", "width_m", "REAL"), ("spaces", "length_m", "REAL"), ("crops", "quantity", "INTEGER"),
              ("crops", "bed_free_on", "TEXT"), ("users", "is_admin", "INTEGER NOT NULL DEFAULT 0"),
              ("users", "last_active", "TEXT"), ("spaces", "soil", "TEXT"),
              ("spaces", "built", "INTEGER"), ("users", "invited_by", "INTEGER"), ("users", "invite_token", "TEXT")]


def init():
    with connect() as conn:
        conn.executescript(SCHEMA)
        for table, column, kind in MIGRATIONS:
            have = {r["name"] for r in conn.execute("PRAGMA table_info(%s)" % table)}
            if column not in have:
                conn.execute("ALTER TABLE %s ADD COLUMN %s %s" % (table, column, kind))


def rows(conn, sql, *args):
    return [dict(r) for r in conn.execute(sql, args).fetchall()]


def setting(key, make):
    """A value generated once and kept (session secret, push keys), so nothing needs configuring by hand."""
    with connect() as conn:
        row = conn.execute("SELECT v FROM settings WHERE k = ?", (key,)).fetchone()
        if row:
            return row["v"]
        value = make()
        conn.execute("INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)", (key, value))
        return conn.execute("SELECT v FROM settings WHERE k = ?", (key,)).fetchone()["v"]
