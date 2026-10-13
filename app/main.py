"""Grow to Gobble: the web server. A JSON API under /api, and the app itself (static/) at /.

Run locally:  .venv/bin/python -m app     then open http://localhost:8000
"""
import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import alerts, auth, clock, db, garden, planner, regions
from . import plants as catalogue

STATIC = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
logging.basicConfig(level=logging.INFO)


def admin_reset_links():
    """Locked-out admin? Set ADMIN_RESET_LINK=1 on Railway and restart: a one-time reset link for each
    ADMIN_EMAIL account is written to the deploy logs, which only the Railway project's owner can read.
    Remove the variable afterwards (each restart makes a new link and cancels the old one)."""
    if os.environ.get("ADMIN_RESET_LINK", "").strip().lower() not in ("1", "true", "yes"):
        return []
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    base = ("https://" + domain) if domain else ""
    out = []
    with db.connect() as conn:
        for email in sorted(auth.admin_emails()):
            row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if not row:
                msg = "No account for %s yet - just sign up with that email and it becomes the admin." % email
            else:
                msg = "Password reset link for %s (works once, for %d hours): %s/#/reset?token=%s" % (
                    email, auth.RESET_HOURS, base, auth.create_reset(conn, row["id"], None))
            logging.getLogger("admin").warning(msg)
            out.append(msg)
    return out


@asynccontextmanager
async def lifespan(app):
    db.init()
    admin_reset_links()
    task = None
    if os.environ.get("ALERTS", "1") != "0":
        task = asyncio.create_task(alerts.loop())
    yield
    if task:
        task.cancel()


app = FastAPI(title="Grow to Gobble", lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def _build_version():
    """A fingerprint of the app's own files: it changes whenever a new version is deployed (and only then)."""
    digest = hashlib.sha1()
    for name in ("index.html", "app.js", "style.css"):
        with open(os.path.join(STATIC, name), "rb") as fh:
            digest.update(fh.read())
    return digest.hexdigest()[:12]


BUILD = _build_version()


@app.middleware("http")
async def version_header(request: Request, call_next):
    """Every reply says which version is running, so an app left open on a phone knows when to refresh itself."""
    response = await call_next(request)
    response.headers["X-App-Version"] = BUILD
    return response


@app.get("/")
def index():
    """The app page, with ?v=<version> on its script and styles - so phones always fetch the newest version
    after a deploy instead of running an old copy from their cache."""
    with open(os.path.join(STATIC, "index.html"), encoding="utf-8") as f:
        page = f.read()
    for name in ("app.js", "style.css"):
        page = page.replace("/static/%s\"" % name, "/static/%s?v=%s\"" % (name, BUILD))
    page = page.replace("<head>", '<head>\n<meta name="app-version" content="%s">' % BUILD, 1)
    return HTMLResponse(page, headers={"Cache-Control": "no-cache"})


@app.get("/api/version")
def version():
    return JSONResponse({"version": BUILD}, headers={"Cache-Control": "no-store"})


@app.get("/sw.js")
def service_worker():
    # served from the root so it can handle notifications for the whole app
    return FileResponse(os.path.join(STATIC, "sw.js"), media_type="text/javascript",
                        headers={"Cache-Control": "no-cache"})


@app.get("/health")
def health():
    return {"ok": True}


# ---- accounts -------------------------------------------------------------------------------------

class Register(BaseModel):
    name: str
    email: str
    password: str
    postcode: Optional[str] = ""
    age_ok: bool = False
    invite: Optional[str] = None      # the invite link they came from, if any


class Login(BaseModel):
    email: str
    password: str


class Profile(BaseModel):
    name: Optional[str] = None
    postcode: Optional[str] = None
    email: Optional[str] = None

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _place(postcode):
    """(outcode, region, lat, lon) from what the user typed. Raises 400 if it isn't a UK postcode."""
    if not (postcode or "").strip():
        return None, "central", None, None
    oc = regions.outcode(postcode)
    if not oc:
        raise HTTPException(400, "That doesn't look like a UK postcode. Try something like SW1A 1AA, or just SW1A.")
    spot = alerts.locate(oc)
    return oc, regions.region_for(oc), spot[0] if spot else None, spot[1] if spot else None


def _me(user):
    region = regions.REGIONS.get(user["region"], regions.REGIONS["central"])
    return {
        "id": user["id"], "name": user["name"], "email": user["email"], "outcode": user["outcode"],
        "region": dict(region, id=user["region"]),
        "calendar_path": "/calendar/%s.ics" % user["cal_token"],
        "push_key": alerts.public_key(), "is_admin": bool(user["is_admin"]),
        "map_start": [user["lat"], user["lon"]] if user["lat"] is not None else [region["lat"], region["lon"]],
    }


@app.post("/api/register")
def register(body: Register, request: Request):
    email = body.email.strip().lower()
    name = body.name.strip()[:40]
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Please enter a proper email address.")
    if not name:
        raise HTTPException(400, "What should we call you?")
    if len(body.password) < auth.MIN_PASSWORD:
        raise HTTPException(400, "Your password needs at least %d characters." % auth.MIN_PASSWORD)
    if not body.age_ok:
        raise HTTPException(400, "Please ask a grown-up to set up your account with you.")
    oc, region, lat, lon = _place(body.postcode)
    with db.connect() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(400, "There's already an account with that email. Try logging in.")
        invite = conn.execute("SELECT * FROM invites WHERE token = ?", ((body.invite or "")[:64],)).fetchone()
        cur = conn.execute(
            "INSERT INTO users (email, name, pw_hash, outcode, region, lat, lon, cal_token, invited_by, invite_token, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (email, name, auth.hash_password(body.password), oc, region, lat, lon, secrets.token_urlsafe(24),
             invite["user_id"] if invite else None, invite["token"] if invite else None, clock.now().isoformat()))
        user = auth.promote_if_admin_email(conn, dict(conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()))
    resp = JSONResponse(_me(user))
    auth.set_cookie(resp, request, user["id"])
    return resp


@app.post("/api/login")
def login(body: Login, request: Request):
    ip = request.client.host if request.client else "?"
    if auth.too_many_failures(ip):
        raise HTTPException(429, "Too many tries. Have a break and try again in 10 minutes.")
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (body.email.strip().lower(),)).fetchone()
    if not row or not auth.check_password(body.password, row["pw_hash"]):
        auth.record_failure(ip)
        raise HTTPException(400, "That email and password don't match.")
    with db.connect() as conn:
        user = auth.promote_if_admin_email(conn, dict(row))
    resp = JSONResponse(_me(user))
    auth.set_cookie(resp, request, row["id"])
    return resp


@app.post("/api/logout")
def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.COOKIE)
    return resp


@app.get("/api/me")
def me(user=Depends(auth.current_user)):
    return _me(user)


@app.patch("/api/me")
def update_me(body: Profile, user=Depends(auth.current_user)):
    with db.connect() as conn:
        if body.name is not None and body.name.strip():
            conn.execute("UPDATE users SET name = ? WHERE id = ?", (body.name.strip()[:40], user["id"]))
        if body.email is not None and body.email.strip().lower() != user["email"]:
            email = body.email.strip().lower()
            if not EMAIL_RE.match(email):
                raise HTTPException(400, "Please enter a proper email address.")
            if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                raise HTTPException(400, "Another account already uses that email.")
            conn.execute("UPDATE users SET email = ? WHERE id = ?", (email, user["id"]))
        if body.postcode is not None:
            oc, region, lat, lon = _place(body.postcode)
            conn.execute("UPDATE users SET outcode = ?, region = ?, lat = ?, lon = ? WHERE id = ?",
                         (oc, region, lat, lon, user["id"]))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
    return _me(user)


class DeleteAccount(BaseModel):
    password: str


class NewPassword(BaseModel):
    current: str
    new: str


@app.post("/api/me/password")
def change_password(body: NewPassword, request: Request, user=Depends(auth.current_user)):
    ip = request.client.host if request.client else "?"
    if auth.too_many_failures(ip):
        raise HTTPException(429, "Too many tries. Have a break and try again in 10 minutes.")
    if not auth.check_password(body.current, user["pw_hash"]):
        auth.record_failure(ip)
        raise HTTPException(400, "Your current password isn't right.")
    if len(body.new) < auth.MIN_PASSWORD:
        raise HTTPException(400, "Your new password needs at least %d characters." % auth.MIN_PASSWORD)
    with db.connect() as conn:
        conn.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (auth.hash_password(body.new), user["id"]))
    return {"ok": True}


@app.post("/api/me/reset-garden")
def reset_garden(body: DeleteAccount, user=Depends(auth.current_user)):
    """Start the garden again from scratch: beds, plants, ticked jobs and garden badges go. The account, its
    password, reminders on this phone, and invites (both ways) are kept."""
    if not auth.check_password(body.password, user["pw_hash"]):
        raise HTTPException(400, "That password isn't right.")
    with db.connect() as conn:
        for table in ("crops", "spaces", "done", "badges", "sent", "features"):
            conn.execute("DELETE FROM %s WHERE user_id = ?" % table, (user["id"],))
        return garden.payload(conn, user)


class Reset(BaseModel):
    token: str
    password: str


@app.post("/api/reset")
def reset_password(body: Reset, request: Request):
    """Set a new password using a one-time link from an admin, and log straight in."""
    with db.connect() as conn:
        uid = auth.redeem_reset(conn, body.token, body.password)
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())
    resp = JSONResponse(_me(user))
    auth.set_cookie(resp, request, uid)
    return resp


def _only_admin(conn, user_id):
    others = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND id != ?", (user_id,)).fetchone()[0]
    row = conn.execute("SELECT is_admin FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row and row["is_admin"]) and others == 0


@app.post("/api/me/delete")
def delete_me(body: DeleteAccount, user=Depends(auth.current_user)):
    if not auth.check_password(body.password, user["pw_hash"]):
        raise HTTPException(400, "That password isn't right.")
    with db.connect() as conn:
        if _only_admin(conn, user["id"]):
            raise HTTPException(400, "You're the only admin, so this account can't be deleted. Make someone else an admin first.")
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.COOKIE)
    return resp


# ---- invites: share a sign-up link, and keep a tally of who joins ------------------------------------

def _invite_stats(conn, user_id):
    sent = conn.execute("SELECT COUNT(*) FROM invites WHERE user_id = ?", (user_id,)).fetchone()[0]
    joined = db.rows(conn, "SELECT name, created_at FROM users WHERE invited_by = ? ORDER BY created_at DESC", user_id)
    return {"sent": sent, "joined": len(joined), "people": [{"name": j["name"], "joined_on": j["created_at"][:10]} for j in joined]}


@app.post("/api/invites")
def new_invite(request: Request, user=Depends(auth.current_user)):
    """A fresh invite link each time "Invite a friend" is tapped, so every share is counted."""
    token = secrets.token_urlsafe(9)
    with db.connect() as conn:
        conn.execute("INSERT INTO invites (token, user_id, created_at) VALUES (?, ?, ?)", (token, user["id"], clock.now().isoformat()))
        stats = _invite_stats(conn, user["id"])
    return dict(stats, link=str(request.base_url).rstrip("/") + "/#/join?invite=" + token)


@app.get("/api/invites")
def my_invites(user=Depends(auth.current_user)):
    with db.connect() as conn:
        return _invite_stats(conn, user["id"])


@app.get("/api/invites/{token}")
def who_invited(token: str):
    """For the sign-up page: 'Pete invited you'. Only the first name, nothing else."""
    with db.connect() as conn:
        row = conn.execute("SELECT u.name FROM invites i JOIN users u ON u.id = i.user_id WHERE i.token = ?",
                           (token[:64],)).fetchone()
    if not row:
        raise HTTPException(404, "Unknown invite")
    return {"name": row["name"].split()[0]}


# ---- admin ---------------------------------------------------------------------------------------

@app.get("/api/admin")
def admin_overview(admin=Depends(auth.current_admin)):
    """Everyone's accounts (no garden details), and whether the database is safe on a volume."""
    with db.connect() as conn:
        users = db.rows(conn, """
            SELECT u.id, u.name, u.email, u.outcode, u.region, u.is_admin, u.last_active, u.created_at,
                   (SELECT COUNT(*) FROM crops c WHERE c.user_id = u.id) AS crops,
                   (SELECT COUNT(*) FROM push_subs p WHERE p.user_id = u.id) AS devices,
                   (SELECT COUNT(*) FROM invites i WHERE i.user_id = u.id) AS invites_sent,
                   (SELECT COUNT(*) FROM users j WHERE j.invited_by = u.id) AS invites_joined,
                   (SELECT name FROM users b WHERE b.id = u.invited_by) AS invited_by_name
            FROM users u ORDER BY u.created_at DESC""")
        totals = {"sent": conn.execute("SELECT COUNT(*) FROM invites").fetchone()[0],
                  "joined": conn.execute("SELECT COUNT(*) FROM users WHERE invited_by IS NOT NULL").fetchone()[0]}
    return {"users": users, "on_volume": db.on_volume(), "db_path": db.path(), "me": admin["id"], "invites": totals}


@app.post("/api/admin/users/{user_id}/reset")
def admin_reset_link(user_id: int, request: Request, admin=Depends(auth.current_admin)):
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
            raise HTTPException(404, "No such account")
        token = auth.create_reset(conn, user_id, admin["id"])
    return {"link": str(request.base_url).rstrip("/") + "/#/reset?token=" + token, "hours": auth.RESET_HOURS}


class AdminFlag(BaseModel):
    is_admin: bool


@app.post("/api/admin/users/{user_id}/admin")
def admin_set_admin(user_id: int, body: AdminFlag, admin=Depends(auth.current_admin)):
    with db.connect() as conn:
        if not body.is_admin and _only_admin(conn, user_id):
            raise HTTPException(400, "That's the only admin - make someone else an admin first.")
        conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1 if body.is_admin else 0, user_id))
    return admin_overview(admin)


class InvitedBy(BaseModel):
    inviter_id: Optional[int] = None


@app.post("/api/admin/users/{user_id}/invited_by")
def admin_set_inviter(user_id: int, body: InvitedBy, admin=Depends(auth.current_admin)):
    """Correct who invited someone (e.g. they signed up without using the link)."""
    if body.inviter_id == user_id:
        raise HTTPException(400, "Nobody can invite themselves.")
    with db.connect() as conn:
        for uid in (user_id, body.inviter_id):
            if uid is not None and not conn.execute("SELECT 1 FROM users WHERE id = ?", (uid,)).fetchone():
                raise HTTPException(404, "No such account")
        conn.execute("UPDATE users SET invited_by = ? WHERE id = ?", (body.inviter_id, user_id))
    return admin_overview(admin)


@app.delete("/api/admin/users/{user_id}")
def admin_delete(user_id: int, admin=Depends(auth.current_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "To delete your own account, use Settings.")
    with db.connect() as conn:
        if _only_admin(conn, user_id):
            raise HTTPException(400, "That's the only admin.")
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return admin_overview(admin)


# ---- plants & garden ------------------------------------------------------------------------------

@app.get("/api/plants")
def plant_list(request: Request):
    user = None
    try:
        user = auth.current_user(request)
    except HTTPException:
        pass  # the catalogue is public; it's just not adjusted for a region until you log in
    return garden.catalogue_payload(user)


@app.get("/api/garden")
def get_garden(user=Depends(auth.current_user)):
    with db.connect() as conn:
        return garden.payload(conn, user)


class SpaceIn(BaseModel):
    name: str
    kind: str
    width_m: Optional[float] = None
    length_m: Optional[float] = None
    soil: Optional[str] = None
    built: Optional[bool] = None
    pos_x: Optional[float] = None     # where it goes on the plan (e.g. a copy placed next door)
    pos_y: Optional[float] = None
    angle: Optional[float] = None
    pot_size: Optional[str] = None    # pots: a common size (app/extras.py POT_SIZES)
    pot_count: Optional[int] = None   # ...and how many of them
    shape: Optional[dict] = None      # {"type": "rect"|"circle"|"triangle"|"corner"|"free", "pts": [[x, y], ...]}
    sun: Optional[str] = None


def _shape(v):
    """A bed's shape, checked, as JSON text - or None for a rectangle."""
    if not v or v.get("type") in (None, "rect"):
        return None
    kind = v["type"]
    if kind in ("circle", "triangle", "corner"):
        return json.dumps({"type": kind})
    if kind == "free":
        pts = v.get("pts") or []
        if not 3 <= len(pts) <= 40:
            raise HTTPException(400, "A freeform bed needs 3 to 40 corners")
        try:
            clean = [[round(min(max(float(x), 0.0), 500.0), 2), round(min(max(float(y), 0.0), 500.0), 2)] for x, y in pts]
        except (TypeError, ValueError):
            raise HTTPException(400, "Bad corner")
        return json.dumps({"type": "free", "pts": clean})
    raise HTTPException(400, "Unknown shape")


def _pot_size(v):
    return v if v in catalogue.POT_BY_KEY else None


def _pot_count(n):
    return max(1, min(int(n or 1), 200))


def _sun(v):
    return v if v in catalogue.SUN_SPOTS else None


def _soil(v):
    return v if v in catalogue.SOIL_TYPES else None


def _size(v):
    return round(v, 2) if v and 0 < v <= 500 else None


@app.post("/api/spaces")
def add_space(body: SpaceIn, user=Depends(auth.current_user)):
    if body.kind not in ("bed", "pot", "allotment"):
        raise HTTPException(400, "Unknown kind of space")
    with db.connect() as conn:
        placed = body.pos_x is not None and body.pos_y is not None
        conn.execute("INSERT INTO spaces (user_id, name, kind, width_m, length_m, soil, built, pos_x, pos_y, angle, shape, sun, created_at) "
                     "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user["id"], body.name.strip()[:40] or "My bed", body.kind, _size(body.width_m), _size(body.length_m),
                      _soil(body.soil), None if body.built is None else int(body.built),
                      _metres(body.pos_x) if placed else None, _metres(body.pos_y) if placed else None,
                      _angle(body.angle) if body.angle is not None else None,
                      _shape(body.shape) if body.kind != "pot" else None, _sun(body.sun), clock.now().isoformat()))
        if body.kind == "pot" and body.pot_size:
            new_id = conn.execute("SELECT MAX(id) FROM spaces WHERE user_id = ?", (user["id"],)).fetchone()[0]
            conn.execute("UPDATE spaces SET pot_size = ?, pot_count = ? WHERE id = ?", (_pot_size(body.pot_size), _pot_count(body.pot_count), new_id))
        return garden.payload(conn, user)


@app.patch("/api/spaces/{space_id}")
def rename_space(space_id: int, body: SpaceIn, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _own(conn, "spaces", space_id, user)
        conn.execute("UPDATE spaces SET name = ?, kind = ?, width_m = ?, length_m = ?, soil = ? WHERE id = ?",
                     (body.name.strip()[:40] or "My bed", body.kind, _size(body.width_m), _size(body.length_m),
                      _soil(body.soil), space_id))
        if body.built is not None:
            conn.execute("UPDATE spaces SET built = ? WHERE id = ?", (int(body.built), space_id))
        if body.shape is not None:  # left out = keep the shape it has
            conn.execute("UPDATE spaces SET shape = ? WHERE id = ?", (_shape(body.shape) if body.kind != "pot" else None, space_id))
        if body.sun is not None:
            conn.execute("UPDATE spaces SET sun = ? WHERE id = ?", (_sun(body.sun), space_id))
        if body.pot_size is not None:
            conn.execute("UPDATE spaces SET pot_size = ?, pot_count = ? WHERE id = ?", (_pot_size(body.pot_size), _pot_count(body.pot_count), space_id))
        if body.pos_x is not None and body.pos_y is not None:  # reshaping a bed can move its box
            conn.execute("UPDATE spaces SET pos_x = ?, pos_y = ? WHERE id = ?", (_metres(body.pos_x), _metres(body.pos_y), space_id))
        return garden.payload(conn, user)


@app.get("/api/spaces/{space_id}/flowers")
def flower_ideas(space_id: int, sun: Optional[str] = None, fill: float = 1.0, user=Depends(auth.current_user)):
    """Flowers that go together for this bed, laid out to suit its shape and how sunny it is - enough to fill
    the whole bed, or a part of it (fill=0.5 for half)."""
    with db.connect() as conn:
        space = _own(conn, "spaces", space_id, user)
    return planner.flower_plan(space, sun or space.get("sun"), fill)


class Position(BaseModel):
    x: float
    y: float


@app.post("/api/spaces/{space_id}/position")
def move_space(space_id: int, body: Position, user=Depends(auth.current_user)):
    """Where a bed sits on the bird's-eye plot, in metres (dragged into place to match the real garden)."""
    with db.connect() as conn:
        _own(conn, "spaces", space_id, user)
        conn.execute("UPDATE spaces SET pos_x = ?, pos_y = ? WHERE id = ?",
                     (round(max(0.0, min(body.x, 500.0)), 2), round(max(0.0, min(body.y, 500.0)), 2), space_id))
        return garden.payload(conn, user)


class Positions(BaseModel):
    positions: list


def _angle(v):
    """Degrees, kept between -180 and 180."""
    a = float(v) % 360
    return round(a - 360 if a > 180 else a, 1)


def _metres(v, lo=0.0, hi=500.0):
    return round(max(lo, min(float(v), hi)), 2)


@app.post("/api/spaces/positions")
def move_spaces(body: Positions, user=Depends(auth.current_user)):
    """Save where things sit on the plan at once (beds, pots and features), so moving one doesn't shuffle the rest.
    Each entry: {id, x, y} for a bed/pot, or {feature: id, x, y} for a tree, shed..."""
    with db.connect() as conn:
        for raw in body.positions[:200]:
            x, y = _metres(raw["x"]), _metres(raw["y"])
            angle = _angle(raw["angle"]) if raw.get("angle") is not None else None
            if raw.get("feature"):
                fid = int(raw["feature"])
                _own(conn, "features", fid, user)
                conn.execute("UPDATE features SET x = ?, y = ?, angle = COALESCE(?, angle) WHERE id = ?", (x, y, angle, fid))
            else:
                sid = int(raw["id"])
                _own(conn, "spaces", sid, user)
                conn.execute("UPDATE spaces SET pos_x = ?, pos_y = ?, angle = COALESCE(?, angle) WHERE id = ?", (x, y, angle, sid))
        return garden.payload(conn, user)


@app.post("/api/spaces/{space_id}/turn")
def turn_space(space_id: int, user=Depends(auth.current_user)):
    """Turn a bed round 90 degrees on the plan (swap its width and length)."""
    with db.connect() as conn:
        s = _own(conn, "spaces", space_id, user)
        default = (5.0, 25.0) if s["kind"] == "allotment" else (1.2, 2.4)
        w, l = s["width_m"] or default[0], s["length_m"] or default[1]
        conn.execute("UPDATE spaces SET width_m = ?, length_m = ? WHERE id = ?", (l, w, space_id))
        return garden.payload(conn, user)


class Group(BaseModel):
    spaces: list = []
    features: list = []


@app.post("/api/plan/group")
def group_items(body: Group, user=Depends(auth.current_user)):
    """Group beds and features so they move together on the plan."""
    if len(body.spaces) + len(body.features) < 2:
        raise HTTPException(400, "Pick at least two things to group.")
    with db.connect() as conn:
        top = conn.execute("SELECT MAX(g) FROM (SELECT grp AS g FROM spaces WHERE user_id = ? UNION ALL "
                           "SELECT grp FROM features WHERE user_id = ?)", (user["id"], user["id"])).fetchone()[0]
        g = (top or 0) + 1
        for sid in body.spaces[:100]:
            _own(conn, "spaces", int(sid), user)
            conn.execute("UPDATE spaces SET grp = ? WHERE id = ?", (g, int(sid)))
        for fid in body.features[:100]:
            _own(conn, "features", int(fid), user)
            conn.execute("UPDATE features SET grp = ? WHERE id = ?", (g, int(fid)))
        return garden.payload(conn, user)


class Ungroup(BaseModel):
    grp: int


@app.post("/api/plan/ungroup")
def ungroup_items(body: Ungroup, user=Depends(auth.current_user)):
    with db.connect() as conn:
        conn.execute("UPDATE spaces SET grp = NULL WHERE user_id = ? AND grp = ?", (user["id"], body.grp))
        conn.execute("UPDATE features SET grp = NULL WHERE user_id = ? AND grp = ?", (user["id"], body.grp))
        return garden.payload(conn, user)


class GardenSize(BaseModel):
    w: Optional[float] = None
    h: Optional[float] = None


@app.post("/api/garden/size")
def garden_size(body: GardenSize, user=Depends(auth.current_user)):
    """The whole garden or field, in metres - or blank to fit the plan to what's in it. Typing a size replaces any
    outline traced from a map."""
    with db.connect() as conn:
        conn.execute("UPDATE users SET garden_w = ?, garden_h = ?, garden_shape = NULL WHERE id = ?",
                     (_metres(body.w, 1) if body.w else None, _metres(body.h, 1) if body.h else None, user["id"]))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
        return garden.payload(conn, user)


class PathWidth(BaseModel):
    w: float


@app.post("/api/garden/paths")
def path_width(body: PathWidth, user=Depends(auth.current_user)):
    """How wide a path to leave when beds snap side by side (0 = right up against each other)."""
    with db.connect() as conn:
        conn.execute("UPDATE users SET path_w = ? WHERE id = ?", (round(max(0.0, min(body.w, 3.0)), 2), user["id"]))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
        return garden.payload(conn, user)


class GardenShape(BaseModel):
    points: list   # [[x, y], ...] in metres - the browser converts the map taps, the location never reaches us
    keep_beds: bool = False   # editing the existing outline: keep beds and features where they are relative to it


@app.post("/api/garden/shape")
def garden_shape(body: GardenShape, user=Depends(auth.current_user)):
    """Save an outline traced on a satellite map, as a shape in metres (north at the top)."""
    try:
        pts = [(float(x), float(y)) for x, y in body.points]
    except (TypeError, ValueError):
        raise HTTPException(400, "That outline doesn't look right.")
    if not 3 <= len(pts) <= 80:
        raise HTTPException(400, "Tap at least 3 corners round the edge.")
    x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
    pts = [(round(x - x0, 2), round(y - y0, 2)) for x, y in pts]   # top-left corner at 0, 0
    w, h = max(p[0] for p in pts), max(p[1] for p in pts)
    if w < 1 or h < 1 or w > 2000 or h > 2000:
        raise HTTPException(400, "That outline is too small or too big - between 1m and 2km across.")
    with db.connect() as conn:
        if body.keep_beds and (x0 or y0):
            # the outline's corner moved (a corner was dragged up or left): move everything with it
            conn.execute("UPDATE spaces SET pos_x = MAX(0, pos_x - ?), pos_y = MAX(0, pos_y - ?) WHERE user_id = ? AND pos_x IS NOT NULL",
                         (x0, y0, user["id"]))
            conn.execute("UPDATE features SET x = MAX(0, x - ?), y = MAX(0, y - ?) WHERE user_id = ?", (x0, y0, user["id"]))
        conn.execute("UPDATE users SET garden_w = ?, garden_h = ?, garden_shape = ? WHERE id = ?",
                     (round(w, 2), round(h, 2), json.dumps(pts), user["id"]))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
        return garden.payload(conn, user)


def _variety(v, kind):
    """A fruit for a tree or bush - must exist and match (no apple bushes)."""
    if not v:
        return None
    f = catalogue.FRUIT_BY_ID.get(v)
    if not f or f["kind"] != kind:
        raise HTTPException(400, "That kind doesn't fit a %s" % kind)
    return v


FEATURE_KINDS = {"tree", "bush", "hedge", "shed", "greenhouse", "compost", "water", "path", "patio", "pond", "house"}


class FeatureIn(BaseModel):
    kind: Optional[str] = None
    name: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None
    angle: Optional[float] = None
    variety: Optional[str] = None     # trees & bushes: which fruit (or "tree_plain"/"bush_plain")
    cultivar: Optional[str] = None    # ...and which variety of it, e.g. 'Bramley' ("" clears it)


@app.post("/api/features")
def add_feature(body: FeatureIn, user=Depends(auth.current_user)):
    if body.kind not in FEATURE_KINDS:
        raise HTTPException(400, "Unknown kind of feature")
    with db.connect() as conn:
        conn.execute("INSERT INTO features (user_id, kind, name, x, y, w, h, variety, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (user["id"], body.kind, (body.name or body.kind.title()).strip()[:40], _metres(body.x or 0.5),
                      _metres(body.y or 0.5), _metres(body.w or 1, 0.2, 100), _metres(body.h or 1, 0.2, 100),
                      _variety(body.variety, body.kind), clock.now().isoformat()))
        return garden.payload(conn, user)


@app.patch("/api/features/{feature_id}")
def edit_feature(feature_id: int, body: FeatureIn, user=Depends(auth.current_user)):
    with db.connect() as conn:
        f = _own(conn, "features", feature_id, user)
        if body.variety is not None:
            conn.execute("UPDATE features SET variety = ? WHERE id = ?", (_variety(body.variety, f["kind"]), feature_id))
        if body.cultivar is not None:
            conn.execute("UPDATE features SET cultivar = ? WHERE id = ?", (_variety_name(body.cultivar), feature_id))
        conn.execute("UPDATE features SET name = ?, x = ?, y = ?, w = ?, h = ?, angle = ? WHERE id = ?", (
            (body.name or f["name"]).strip()[:40] or f["name"],
            _metres(body.x) if body.x is not None else f["x"], _metres(body.y) if body.y is not None else f["y"],
            _metres(body.w, 0.2, 100) if body.w else f["w"], _metres(body.h, 0.2, 100) if body.h else f["h"],
            _angle(body.angle) if body.angle is not None else f["angle"], feature_id))
        return garden.payload(conn, user)


@app.delete("/api/features/{feature_id}")
def delete_feature(feature_id: int, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _own(conn, "features", feature_id, user)
        conn.execute("DELETE FROM features WHERE id = ?", (feature_id,))
        return garden.payload(conn, user)


@app.delete("/api/spaces/{space_id}")
def delete_space(space_id: int, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _own(conn, "spaces", space_id, user)
        conn.execute("DELETE FROM spaces WHERE id = ?", (space_id,))
        conn.execute("DELETE FROM done WHERE user_id = ? AND key LIKE ?", (user["id"], "s%d:%%" % space_id))
        return garden.payload(conn, user)


class CropIn(BaseModel):
    plant_id: str
    space_id: Optional[int] = None
    method: Optional[str] = None
    quantity: Optional[int] = None
    after: Optional[str] = None       # a follow-on crop: not before this date (when the space is free)
    batches: Optional[int] = None     # sow several rows a few weeks apart, each tracked on its own
    every_weeks: Optional[int] = None
    clear_space: bool = False         # take it out of its bed ("not placed yet")
    sown_on: Optional[str] = None     # correcting when it really happened
    planted_on: Optional[str] = None
    harvested_on: Optional[str] = None
    variety: Optional[str] = None     # e.g. 'Nantes 2' - "" clears it
    ungroup: bool = False             # split a sow-together planting back into separate crops


def _variety_name(v):
    return (v or "").strip()[:40] or None


def _qty(n):
    return max(1, min(int(n), 5000)) if n else None


def _own(conn, table, row_id, user):
    row = conn.execute("SELECT * FROM %s WHERE id = ? AND user_id = ?" % table, (row_id, user["id"])).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    return dict(row)


def _after(value):
    try:
        return date.fromisoformat(value) if value else None
    except ValueError:
        raise HTTPException(400, "Bad date")


def _new_crop(conn, user, plant_id, space_id, method, today=None, quantity=None, after=None, variety=None):
    plant = catalogue.BY_ID.get(plant_id)
    if not plant:
        raise HTTPException(400, "Unknown plant")
    options = planner.methods_for(plant)
    method = method or options[0]
    if method not in options:
        raise HTTPException(400, "%s can't be started that way" % plant["name"])
    if space_id is not None:
        _own(conn, "spaces", space_id, user)
    today = today or clock.today()
    start, end = planner.plan_anchor(plant, method, today, garden.shift_for(user), not_before=after)
    cur = conn.execute(
        "INSERT INTO crops (user_id, plant_id, space_id, method, quantity, bed_free_on, anchor, anchor_end, variety, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user["id"], plant_id, space_id, method, _qty(quantity), after.isoformat() if after else None,
         start.isoformat(), end.isoformat(), _variety_name(variety), clock.now().isoformat()))
    return cur.lastrowid


@app.post("/api/crops")
def add_crop(body: CropIn, user=Depends(auth.current_user)):
    """Add a crop - or several batches of it, a few weeks apart (e.g. a row of carrots every 2 weeks)."""
    batches = max(1, min(body.batches or 1, 8))
    every = max(1, min(body.every_weeks or 2, 8))
    with db.connect() as conn:
        first = _new_crop(conn, user, body.plant_id, body.space_id, body.method, quantity=body.quantity, after=_after(body.after),
                          variety=body.variety)
        start = date.fromisoformat(conn.execute("SELECT anchor FROM crops WHERE id = ?", (first,)).fetchone()["anchor"])
        plant = catalogue.BY_ID[body.plant_id]
        method = conn.execute("SELECT method FROM crops WHERE id = ?", (first,)).fetchone()["method"]
        for i in range(1, batches):
            when = start + i * every * planner.WEEK
            win = planner.next_window(planner.first_window(plant, method), when, garden.shift_for(user))
            if not win or win[0] > when + planner.WEEK:  # past the end of this sowing season
                break
            _new_crop(conn, user, body.plant_id, body.space_id, method, quantity=body.quantity, after=when, variety=body.variety)
        return garden.payload(conn, user)


class CropsIn(BaseModel):
    crops: list                       # plant ids, or {"plant_id", "quantity"}
    space_id: Optional[int] = None    # a whole group of flowers going into one bed, when the user taps "add these"
    mix: Optional[str] = None         # sown together (app/extras.py MIXES): kept as one planting from then on


@app.post("/api/crops/bulk")
def add_crops(body: CropsIn, user=Depends(auth.current_user)):
    """Onboarding: add several at once. They start "not placed yet" - the user places them, or agrees to a
    suggested layout (/api/layout) - nothing goes into a bed without them saying so."""
    with db.connect() as conn:
        if body.space_id is not None:
            _own(conn, "spaces", body.space_id, user)
        # a veg grow-together (MIXES), or a group of flowers that go together ("flower:<combo id>")
        known = {m["id"] for m in catalogue.MIXES} | {"flower:" + c["id"] for c in catalogue.COMBOS}
        mix = body.mix if body.mix in known else None
        made = []
        for item in body.crops[:40]:
            plant_id, qty = (item.get("plant_id"), item.get("quantity")) if isinstance(item, dict) else (item, None)
            plant = catalogue.BY_ID.get(str(plant_id))
            if plant:
                made.append(_new_crop(conn, user, plant["id"], body.space_id, None, quantity=qty))
        if mix and len(made) > 1:  # one planting: the group is known by its first crop's id
            conn.execute("UPDATE crops SET mix = ?, mixgrp = ? WHERE id IN (%s)" % ",".join("?" * len(made)), [mix, made[0]] + made)
        return garden.payload(conn, user)


@app.get("/api/layout")
def layout_suggestion(only_unplaced: bool = False, user=Depends(auth.current_user)):
    """A suggested spread of crops over all the beds and pots. Nothing is saved until POST /api/layout."""
    with db.connect() as conn:
        state = garden.load(conn, user)
    return {"moves": planner.suggest_layout(state["spaces"], state["with_jobs"], state["today"], only_unplaced)}


class Move(BaseModel):
    crop_id: int
    space_id: Optional[int] = None


class Layout(BaseModel):
    moves: list


@app.post("/api/layout")
def layout_apply(body: Layout, user=Depends(auth.current_user)):
    with db.connect() as conn:
        for raw in body.moves[:200]:
            move = Move(**raw)
            _own(conn, "crops", move.crop_id, user)
            if move.space_id is not None:
                _own(conn, "spaces", move.space_id, user)
            conn.execute("UPDATE crops SET space_id = ? WHERE id = ?", (move.space_id, move.crop_id))
        return garden.payload(conn, user)


@app.get("/api/check")
def space_check(plant_id: str, space_id: Optional[int] = None, method: Optional[str] = None,
                quantity: Optional[int] = None, after: Optional[str] = None, user=Depends(auth.current_user)):
    """Before adding a crop: how much space it needs, what it'll give, and whether the bed has room at that time."""
    plant = catalogue.BY_ID.get(plant_id)
    if not plant:
        raise HTTPException(400, "Unknown plant")
    method = method if method in planner.methods_for(plant) else planner.methods_for(plant)[0]
    qty = _qty(quantity) or planner.default_quantity(plant)
    shift, today = garden.shift_for(user), clock.today()
    start, end = planner.plan_anchor(plant, method, today, shift, not_before=_after(after))
    free = _after(after)
    trial = {"id": 0, "plant_id": plant_id, "space_id": space_id, "method": method, "quantity": qty,
             "bed_free_on": free.isoformat() if free else None, "anchor": start.isoformat(), "anchor_end": end.isoformat()}
    jobs = planner.crop_jobs(trial, shift, set(), today)
    out = {"quantity": qty, "area": round(qty * planner.area_each(plant), 2), "harvest": planner.harvest_estimate(plant, qty),
           "buy": planner.buy_estimate(plant, qty, method),
           "cost": planner.cost_estimate(plant, qty, method), "qty": qty,
           "plan": [{"kind": j["kind"], "title": j["title"], "start": j["start"], "end": j["end"]}
                    for j in jobs if j["kind"] in ("sow_in", "sow_out", "plant_out", "harvest")],
           "in_ground": [d.isoformat() if d else None for d in (planner.crop_starts(trial, jobs), planner.crop_finishes(trial, jobs))]}
    if space_id is not None:
        with db.connect() as conn:
            space = _own(conn, "spaces", space_id, user)
            state = garden.load(conn, user)
        use = planner.usage(space, state["with_jobs"], extra=(trial, jobs))
        out["space"] = dict(use, name=space["name"], kind=space["kind"],
                            fits=use["area"] is None or use["peak"] <= use["area"])
        t0, t1 = planner.crop_starts(trial, jobs), planner.crop_finishes(trial, jobs)
        neighbours = {c["plant_id"] for c, j in state["with_jobs"] if c["space_id"] == space_id and not c.get("finished_on")
                      and planner.overlap(t0, t1, planner.crop_starts(c, j), planner.crop_finishes(c, j))}
        out["good"] = [x for x in catalogue.GOOD_WITH[plant_id] if x["plant_id"] in neighbours]
        out["bad"] = [x for x in catalogue.BAD_WITH[plant_id] if x["plant_id"] in neighbours]
    # the same crop already planned for around then, in any space?
    if space_id is None:
        with db.connect() as conn:
            state = garden.load(conn, user)
    names = {s["id"]: s["name"] for s in state["spaces"]}
    t0 = planner.crop_starts(trial, jobs)
    out["already"] = [dict(d, space_name=names.get(d["space_id"]))
                      for d in (planner.already_planned(plant_id, t0, state["with_jobs"]) if t0 else [])]
    return out


@app.patch("/api/crops/{crop_id}")
def edit_crop(crop_id: int, body: CropIn, user=Depends(auth.current_user)):
    with db.connect() as conn:
        crop = _own(conn, "crops", crop_id, user)
        # plants sown together move together: a bed change applies to the whole planting
        members = _group_ids(conn, crop, user)
        where = "id IN (%s)" % ",".join("?" * len(members))
        if body.ungroup:
            conn.execute("UPDATE crops SET mix = NULL, mixgrp = NULL WHERE " + where, members)
        if body.space_id is not None:
            _own(conn, "spaces", body.space_id, user)
            conn.execute("UPDATE crops SET space_id = ? WHERE " + where, [body.space_id] + members)
        elif body.clear_space:
            conn.execute("UPDATE crops SET space_id = NULL WHERE " + where, members)
        if body.quantity is not None:
            conn.execute("UPDATE crops SET quantity = ? WHERE id = ?", (_qty(body.quantity), crop_id))
        if body.variety is not None:
            conn.execute("UPDATE crops SET variety = ? WHERE id = ?", (_variety_name(body.variety), crop_id))
        for field in ("sown_on", "planted_on", "harvested_on"):
            value = getattr(body, field)
            if value is not None:
                when = _after(value) if value else None
                if when and when > clock.today():
                    raise HTTPException(400, "That date is in the future.")
                conn.execute("UPDATE crops SET %s = ? WHERE id = ?" % field, (when.isoformat() if when else None, crop_id))
        if body.method and body.method != crop["method"] and not (crop["sown_on"] or crop["planted_on"]):
            plant = catalogue.BY_ID[crop["plant_id"]]
            if body.method not in planner.methods_for(plant):
                raise HTTPException(400, "%s can't be started that way" % plant["name"])
            start, end = planner.plan_anchor(plant, body.method, clock.today(), garden.shift_for(user))
            conn.execute("UPDATE crops SET method = ?, anchor = ?, anchor_end = ? WHERE id = ?",
                         (body.method, start.isoformat(), end.isoformat(), crop_id))
        return garden.payload(conn, user)


@app.post("/api/crops/{crop_id}/replan")
def replan_crop(crop_id: int, user=Depends(auth.current_user)):
    """Missed the window? Aim for the next one."""
    with db.connect() as conn:
        crop = _own(conn, "crops", crop_id, user)
        plant = catalogue.BY_ID[crop["plant_id"]]
        start, end = planner.plan_anchor(plant, crop["method"], clock.today() + planner.DAY, garden.shift_for(user))
        conn.execute("UPDATE crops SET anchor = ?, anchor_end = ?, sown_on = NULL, planted_on = NULL WHERE id = ?",
                     (start.isoformat(), end.isoformat(), crop_id))
        return garden.payload(conn, user)


@app.post("/api/crops/{crop_id}/finish")
def finish_crop(crop_id: int, user=Depends(auth.current_user)):
    """All picked and cleared - the space is free again."""
    with db.connect() as conn:
        _own(conn, "crops", crop_id, user)
        conn.execute("UPDATE crops SET finished_on = ? WHERE id = ?", (clock.today().isoformat(), crop_id))
        return garden.payload(conn, user)


@app.delete("/api/crops/{crop_id}")
def delete_crop(crop_id: int, whole_group: bool = False, user=Depends(auth.current_user)):
    """Remove a crop - or, for plants sown together, the whole planting."""
    with db.connect() as conn:
        crop = _own(conn, "crops", crop_id, user)
        for cid in (_group_ids(conn, crop, user) if whole_group else [crop_id]):
            conn.execute("DELETE FROM crops WHERE id = ?", (cid,))
            conn.execute("DELETE FROM done WHERE user_id = ? AND key LIKE ?", (user["id"], "c%d:%%" % cid))
        if not whole_group and crop.get("mixgrp"):  # one taken out of a group: a group of one isn't a group
            left = conn.execute("SELECT id FROM crops WHERE user_id = ? AND mixgrp = ?", (user["id"], crop["mixgrp"])).fetchall()
            if len(left) < 2:
                conn.execute("UPDATE crops SET mix = NULL, mixgrp = NULL WHERE user_id = ? AND mixgrp = ?", (user["id"], crop["mixgrp"]))
        return garden.payload(conn, user)


def _group_ids(conn, crop, user):
    """This crop and the others it was sown together with (just itself if it isn't in a group)."""
    if not crop.get("mixgrp"):
        return [crop["id"]]
    return [r["id"] for r in conn.execute("SELECT id FROM crops WHERE user_id = ? AND mixgrp = ?", (user["id"], crop["mixgrp"]))]


class DoneIn(BaseModel):
    key: str
    undo: bool = False


_DATE_FOR = {"sow": "sown_on", "plant": "planted_on", "harvest": "harvested_on"}


@app.post("/api/done")
def mark_done(body: DoneIn, user=Depends(auth.current_user)):
    """Tick off (or un-tick) a job. Sowing, planting and picking also record the date on the crop."""
    today = clock.today().isoformat()
    crop_key = re.match(r"^c(\d+):(buy|sow|plant|harvest|eat|store|cure|batch|protect|uncover|seeds|winter|wake|care\d+(?:_\d+)?|prep\d+)$", body.key)
    space_key = re.match(r"^s(\d+):nodig(\d+)$", body.key)
    if not (crop_key or space_key):
        raise HTTPException(400, "Unknown job")
    with db.connect() as conn:
        if crop_key:
            crop = _own(conn, "crops", int(crop_key.group(1)), user)
            what = crop_key.group(2)
            if what in _DATE_FOR:
                conn.execute("UPDATE crops SET %s = ? WHERE id = ?" % _DATE_FOR[what],
                             (None if body.undo else today, crop["id"]))
            if what == "batch" and not body.undo:
                if conn.execute("SELECT 1 FROM done WHERE user_id = ? AND key = ?", (user["id"], body.key)).fetchone():
                    return garden.payload(conn, user)
                _new_crop(conn, user, crop["plant_id"], crop["space_id"], crop["method"])
        else:
            _own(conn, "spaces", int(space_key.group(1)), user)
        if body.undo:
            conn.execute("DELETE FROM done WHERE user_id = ? AND key = ?", (user["id"], body.key))
        else:
            conn.execute("INSERT OR IGNORE INTO done (user_id, key, done_on) VALUES (?, ?, ?)",
                         (user["id"], body.key, today))
        return garden.payload(conn, user)


# ---- notifications & calendar -------------------------------------------------------------------

class PushSub(BaseModel):
    endpoint: str
    keys: dict


@app.post("/api/push/subscribe")
def push_subscribe(body: PushSub, user=Depends(auth.current_user)):
    if not body.endpoint.startswith("https://") or not body.keys.get("p256dh") or not body.keys.get("auth"):
        raise HTTPException(400, "That notification subscription doesn't look right")
    with db.connect() as conn:
        conn.execute("DELETE FROM push_subs WHERE endpoint = ?", (body.endpoint,))
        conn.execute("INSERT INTO push_subs (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)",
                     (user["id"], body.endpoint, body.keys["p256dh"], body.keys["auth"], clock.now().isoformat()))
        return garden.payload(conn, user)


class PushUnsub(BaseModel):
    endpoint: str


@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: PushUnsub, user=Depends(auth.current_user)):
    with db.connect() as conn:
        conn.execute("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?", (body.endpoint, user["id"]))
        return garden.payload(conn, user)


@app.post("/api/push/test")
def push_test(user=Depends(auth.current_user)):
    with db.connect() as conn:
        n = alerts.send(conn, user["id"], "🌱 Hello from your garden!", "Notifications are working. We'll tell you when it's time to sow, plant and pick.")
    if not n:
        raise HTTPException(400, "Couldn't reach your phone. Try turning notifications off and on again.")
    return {"sent": n}


@app.get("/calendar/{token}.ics")
def calendar(token: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE cal_token = ?", (token,)).fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        body = alerts.ics(conn, dict(row))
    return Response(body, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": 'inline; filename="garden.ics"'})
