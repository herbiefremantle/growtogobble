"""Nudges that bring people back to the garden: phone notifications, weather warnings, and a calendar feed.

Phone notifications use Web Push, so they work from the installed app on Android and on iPhone (iOS 16.4+,
once it's been added to the Home Screen). The push keys are generated on first start and kept in the database.

Every half hour, between 8am and 8pm UK time, each user with notifications on gets anything new:
  - a job that's due to start (sow, plant out, pick...), and a "last chance" nudge 3 days before it closes
  - frost warnings when frost-tender crops are in the ground, hot-day and dry-spell watering reminders
  - a Sunday "your week in the garden" round-up
Each alert has a key in the `sent` table, so nobody is told the same thing twice.
"""
import asyncio
import base64
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone

import httpx

from . import clock, db, garden, regions
from . import plants as catalogue

log = logging.getLogger("alerts")
CHECK_EVERY = 30 * 60
QUIET_BEFORE, QUIET_AFTER = 8, 20


# ---- web push -------------------------------------------------------------------------------------

def _vapid_pem():
    def make():
        from py_vapid import Vapid02
        v = Vapid02()
        v.generate_keys()
        return v.private_pem().decode()
    return os.environ.get("VAPID_PRIVATE_PEM") or db.setting("vapid_private_pem", make)


def public_key():
    """The key the browser needs to subscribe (URL-safe base64 of the raw public point)."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid02
    v = Vapid02.from_pem(_vapid_pem().encode())
    raw = v.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def send(conn, user_id, title, body, url="/"):
    """Send to every device this user has turned notifications on for. Returns how many got it."""
    from py_vapid import Vapid02
    from pywebpush import WebPushException, webpush
    vapid = Vapid02.from_pem(_vapid_pem().encode())
    contact = os.environ.get("VAPID_CONTACT", "mailto:hello@example.com")
    delivered = 0
    for sub in db.rows(conn, "SELECT * FROM push_subs WHERE user_id = ?", user_id):
        try:
            webpush({"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                    json.dumps({"title": title, "body": body, "url": url}),
                    vapid_private_key=vapid, vapid_claims={"sub": contact}, ttl=12 * 3600, timeout=10)
            delivered += 1
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # the phone has unsubscribed or the app was removed
                conn.execute("DELETE FROM push_subs WHERE id = ?", (sub["id"],))
            else:
                log.warning("push to user %s failed: %s", user_id, e)
        except Exception as e:  # network trouble: try again next round
            log.warning("push to user %s failed: %s", user_id, e)
    return delivered


# ---- places & weather ------------------------------------------------------------------------------

def locate(outcode):
    """Rough latitude/longitude for a postcode district, for the weather. None if the lookup fails."""
    try:
        r = httpx.get("https://api.postcodes.io/outcodes/%s" % outcode, timeout=5)
        if r.status_code == 200:
            res = r.json()["result"]
            return res["latitude"], res["longitude"]
    except Exception as e:
        log.info("postcode lookup failed for %s: %s", outcode, e)
    return None


def forecast(lat, lon):
    """Next 4 days of min/max temperature and rain from Open-Meteo (free, no key needed)."""
    try:
        r = httpx.get("https://api.open-meteo.com/v1/forecast", timeout=8, params={
            "latitude": lat, "longitude": lon, "timezone": "Europe/London", "forecast_days": 4,
            "daily": "temperature_2m_min,temperature_2m_max,precipitation_sum"})
        r.raise_for_status()
        d = r.json()["daily"]
        return [{"date": d["time"][i], "min": d["temperature_2m_min"][i], "max": d["temperature_2m_max"][i],
                 "rain": d["precipitation_sum"][i]} for i in range(len(d["time"]))]
    except Exception as e:
        log.info("forecast failed: %s", e)
        return None


# ---- what to say ----------------------------------------------------------------------------------

def due_alerts(state, days, sent):
    """[(key, title, body)] for this user right now. `days` is the forecast (or None), `sent` the keys already sent."""
    today = state["today"]
    out = []

    starting, closing = [], []
    for job in garden.active_jobs(state):
        if job["status"] != "now" or job["kind"] == "eat":
            continue
        if "start:" + job["key"] not in sent:
            starting.append(job)
        elif job["end"] <= (today + timedelta(days=3)).isoformat() and "last:" + job["key"] not in sent:
            closing.append(job)
    if starting:
        if len(starting) == 1:
            j = starting[0]
            title, body = "%s %s" % (j["emoji"], j["title"]), "It's time! Tap to see how, step by step."
        else:
            title = "🌱 %d new garden jobs" % len(starting)
            body = ", ".join(j["title"] for j in starting[:3]) + ("..." if len(starting) > 3 else "")
        out.append((["start:" + j["key"] for j in starting], title, body))
    for j in closing:
        out.append((["last:" + j["key"]], "⏰ Last few days: %s" % j["title"].lower(),
                    "Don't miss it - tap to see how."))

    growing = [c for c in state["crops"] if not c.get("finished_on") and (c.get("planted_on") or c.get("sown_on"))]
    if days and len(days) > 1:
        tender = sorted({catalogue.BY_ID[c["plant_id"]]["name"].lower() for c in growing
                         if catalogue.BY_ID[c["plant_id"]].get("tender")
                         and (c.get("planted_on") or c["method"] == "sow_out")})
        tonight = days[1]
        if tender and tonight["min"] is not None and tonight["min"] <= 2:
            out.append((["frost:" + tonight["date"]], "❄️ Frost warning tonight!",
                        "Cover your %s with fleece or an old sheet, and move pots somewhere sheltered." % _list(tender)))
        if growing and days[0]["max"] is not None and days[0]["max"] >= 26:
            out.append((["heat:" + days[0]["date"]], "☀️ Hot day today!",
                        "Water your plants this evening - pots most of all. Water the soil, not the leaves."))
        week = "%d-%02d" % today.isocalendar()[:2]
        dry = all((d["rain"] or 0) < 1 for d in days) and max(d["max"] or 0 for d in days) >= 20
        if growing and dry and 5 <= today.month <= 9:
            out.append((["dry:" + week], "💧 No rain on the way",
                        "Give everything a really good soak. Once a week deeply is better than a sprinkle every day."))

    if today.weekday() == 6:
        week = "%d-%02d" % today.isocalendar()[:2]
        coming = [j for j in garden.active_jobs(state) if j["status"] in ("now", "soon")]
        if coming:
            out.append((["week:" + week], "🗓️ Your week in the garden",
                        "%d job%s to do this week. Tap to plan it." % (len(coming), "" if len(coming) == 1 else "s")))

    return [(keys, t, b) for keys, t, b in out if not all(k in sent for k in keys)]


def _list(names):
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def run_once(get_forecast=forecast):
    """One pass over everyone with notifications on. Returns how many alerts went out."""
    total = 0
    with db.connect() as conn:
        users = db.rows(conn, "SELECT DISTINCT u.* FROM users u JOIN push_subs p ON p.user_id = u.id")
        cache = {}
        for user in users:
            state = garden.load(conn, user)
            sent = {r["key"] for r in db.rows(conn, "SELECT key FROM sent WHERE user_id = ?", user["id"])}
            lat, lon = user["lat"], user["lon"]
            if lat is None:
                r = regions.REGIONS.get(user["region"], regions.REGIONS["central"])
                lat, lon = r["lat"], r["lon"]
            spot = (round(lat, 1), round(lon, 1))
            if spot not in cache:
                cache[spot] = get_forecast(*spot)
            for keys, title, body in due_alerts(state, cache[spot], sent):
                if send(conn, user["id"], title, body):
                    total += 1
                    for k in keys:
                        conn.execute("INSERT OR IGNORE INTO sent (user_id, key, sent_on) VALUES (?, ?, ?)",
                                     (user["id"], k, state["today"].isoformat()))
    return total


async def loop():
    while True:
        hour = clock.now().hour
        if QUIET_BEFORE <= hour < QUIET_AFTER:
            try:
                sent = await asyncio.get_running_loop().run_in_executor(None, run_once)
                if sent:
                    log.info("sent %d alerts", sent)
            except Exception:
                log.exception("alert run failed")
        await asyncio.sleep(CHECK_EVERY)


# ---- calendar feed ---------------------------------------------------------------------------------

def _ics_escape(text):
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics(conn, user):
    """Every upcoming job as an all-day event, for Google/Apple Calendar to subscribe to."""
    state = garden.load(conn, user)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Grow to Gobble//Garden jobs//EN",
             "X-WR-CALNAME:Grow to Gobble garden jobs", "CALSCALE:GREGORIAN"]
    for job in garden.active_jobs(state):
        if job["status"] in ("done", "missed") or job["kind"] == "eat":
            continue
        start = job["start"].replace("-", "")
        end = (date.fromisoformat(job["start"]) + timedelta(days=1)).strftime("%Y%m%d")
        desc = "Do this by %s.\n\n%s" % (job["end"], "\n".join("- " + s for s in job["steps"]))
        lines += ["BEGIN:VEVENT", "UID:%s-%d@growtogobble" % (job["key"].replace(":", "-"), user["id"]),
                  "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + start, "DTEND;VALUE=DATE:" + end,
                  "SUMMARY:" + _ics_escape("%s %s" % (job["emoji"], job["title"])),
                  "DESCRIPTION:" + _ics_escape(desc), "END:VEVENT"]
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def _fold(line):
    """iCalendar lines longer than 75 bytes are wrapped onto continuation lines starting with a space."""
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode()) > 74:
            out.append(current)
            current = " "
        current += ch
    out.append(current)
    return "\r\n".join(out)
