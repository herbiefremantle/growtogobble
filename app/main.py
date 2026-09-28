"""Grow to Gobble: the web server. A JSON API under /api, and the app itself (static/) at /.

Run locally:  .venv/bin/python -m app     then open http://localhost:8000
"""
import asyncio
import logging
import os
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import alerts, auth, clock, db, garden, planner, regions
from . import plants as catalogue

STATIC = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app):
    db.init()
    task = None
    if os.environ.get("ALERTS", "1") != "0":
        task = asyncio.create_task(alerts.loop())
    yield
    if task:
        task.cancel()


app = FastAPI(title="Grow to Gobble", lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"), headers={"Cache-Control": "no-cache"})


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


class Login(BaseModel):
    email: str
    password: str


class Profile(BaseModel):
    name: Optional[str] = None
    postcode: Optional[str] = None


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
        "push_key": alerts.public_key(),
    }


@app.post("/api/register")
def register(body: Register, request: Request):
    email = body.email.strip().lower()
    name = body.name.strip()[:40]
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
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
        cur = conn.execute(
            "INSERT INTO users (email, name, pw_hash, outcode, region, lat, lon, cal_token, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (email, name, auth.hash_password(body.password), oc, region, lat, lon,
             secrets.token_urlsafe(24), clock.now().isoformat()))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone())
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
    resp = JSONResponse(_me(dict(row)))
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
        if body.postcode is not None:
            oc, region, lat, lon = _place(body.postcode)
            conn.execute("UPDATE users SET outcode = ?, region = ?, lat = ?, lon = ? WHERE id = ?",
                         (oc, region, lat, lon, user["id"]))
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone())
    return _me(user)


class DeleteAccount(BaseModel):
    password: str


@app.post("/api/me/delete")
def delete_me(body: DeleteAccount, user=Depends(auth.current_user)):
    if not auth.check_password(body.password, user["pw_hash"]):
        raise HTTPException(400, "That password isn't right.")
    with db.connect() as conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(auth.COOKIE)
    return resp


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


def _size(v):
    return round(v, 2) if v and 0 < v <= 500 else None


@app.post("/api/spaces")
def add_space(body: SpaceIn, user=Depends(auth.current_user)):
    if body.kind not in ("bed", "pot", "allotment"):
        raise HTTPException(400, "Unknown kind of space")
    with db.connect() as conn:
        conn.execute("INSERT INTO spaces (user_id, name, kind, width_m, length_m, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                     (user["id"], body.name.strip()[:40] or "My bed", body.kind, _size(body.width_m), _size(body.length_m),
                      clock.now().isoformat()))
        return garden.payload(conn, user)


@app.patch("/api/spaces/{space_id}")
def rename_space(space_id: int, body: SpaceIn, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _own(conn, "spaces", space_id, user)
        conn.execute("UPDATE spaces SET name = ?, kind = ?, width_m = ?, length_m = ? WHERE id = ?",
                     (body.name.strip()[:40] or "My bed", body.kind, _size(body.width_m), _size(body.length_m), space_id))
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


def _new_crop(conn, user, plant_id, space_id, method, today=None, quantity=None, after=None):
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
        "INSERT INTO crops (user_id, plant_id, space_id, method, quantity, bed_free_on, anchor, anchor_end, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (user["id"], plant_id, space_id, method, _qty(quantity), after.isoformat() if after else None,
         start.isoformat(), end.isoformat(), clock.now().isoformat()))
    return cur.lastrowid


@app.post("/api/crops")
def add_crop(body: CropIn, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _new_crop(conn, user, body.plant_id, body.space_id, body.method, quantity=body.quantity, after=_after(body.after))
        return garden.payload(conn, user)


class CropsIn(BaseModel):
    crops: list


@app.post("/api/crops/bulk")
def add_crops(body: CropsIn, user=Depends(auth.current_user)):
    """Onboarding: add several at once, each into the first space it suits."""
    with db.connect() as conn:
        spaces = db.rows(conn, "SELECT * FROM spaces WHERE user_id = ? ORDER BY id", user["id"])
        for plant_id in body.crops[:40]:
            plant = catalogue.BY_ID.get(str(plant_id))
            if not plant:
                continue
            fits = [s for s in spaces if ("pot" if s["kind"] == "pot" else "bed") in plant["where"]]
            _new_crop(conn, user, plant["id"], fits[0]["id"] if fits else None, None)
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
        if body.space_id is not None:
            _own(conn, "spaces", body.space_id, user)
            conn.execute("UPDATE crops SET space_id = ? WHERE id = ?", (body.space_id, crop_id))
        if body.quantity is not None:
            conn.execute("UPDATE crops SET quantity = ? WHERE id = ?", (_qty(body.quantity), crop_id))
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
def delete_crop(crop_id: int, user=Depends(auth.current_user)):
    with db.connect() as conn:
        _own(conn, "crops", crop_id, user)
        conn.execute("DELETE FROM crops WHERE id = ?", (crop_id,))
        conn.execute("DELETE FROM done WHERE user_id = ? AND key LIKE ?", (user["id"], "c%d:%%" % crop_id))
        return garden.payload(conn, user)


class DoneIn(BaseModel):
    key: str
    undo: bool = False


_DATE_FOR = {"sow": "sown_on", "plant": "planted_on", "harvest": "harvested_on"}


@app.post("/api/done")
def mark_done(body: DoneIn, user=Depends(auth.current_user)):
    """Tick off (or un-tick) a job. Sowing, planting and picking also record the date on the crop."""
    today = clock.today().isoformat()
    crop_key = re.match(r"^c(\d+):(buy|sow|plant|harvest|eat|store|cure|batch|protect|uncover|care\d+|prep\d+)$", body.key)
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
