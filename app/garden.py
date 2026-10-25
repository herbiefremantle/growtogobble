"""One user's whole garden, worked out from the database: spaces, crops, every job, suggestions and badges.
Used by the API, the push alerts and the calendar feed, so they always agree with each other."""
import json
from datetime import date

from . import builds, clock, planner, regions, shops, winter
from . import plants as catalogue
from .db import rows


def shift_for(user):
    return regions.REGIONS.get(user["region"], regions.REGIONS["central"])["shift"]


def load(conn, user, today=None, real_only=False):
    """real_only: leave out sample gardens - for alerts, the calendar feed, badges and anything else that's about
    the user's own garden."""
    today = today or clock.today()
    shift = shift_for(user)
    real = " AND COALESCE(is_sample, 0) = 0" if real_only else ""
    spaces = rows(conn, "SELECT * FROM spaces WHERE user_id = ?%s ORDER BY id" % real, user["id"])
    for space in spaces:
        space["shape"] = planner.shape_of(space)
    crops = rows(conn, "SELECT * FROM crops WHERE user_id = ?%s ORDER BY id" % real, user["id"])
    # ticked jobs, and the day each was ticked (ongoing jobs like weeding come round again a set time after)
    done = {r["key"]: r["done_on"] for r in rows(conn, "SELECT key, done_on FROM done WHERE user_id = ?", user["id"])}
    has_push = conn.execute("SELECT 1 FROM push_subs WHERE user_id = ?", (user["id"],)).fetchone() is not None
    friends = conn.execute("SELECT COUNT(*) FROM users WHERE invited_by = ?", (user["id"],)).fetchone()[0]
    with_jobs = [(c, planner.crop_jobs(c, shift, done, today)) for c in crops]
    liked = {c["plant_id"] for c in crops}
    features = rows(conn, "SELECT id, kind, variety, cultivar FROM features WHERE user_id = ?%s" % real, user["id"])
    garden_jobs = winter.garden_jobs(spaces, features, crops, done, today, shift)
    return {
        "garden_jobs": garden_jobs,
        "today": today, "shift": shift, "spaces": spaces, "crops": crops, "done": done,
        "with_jobs": with_jobs, "liked": liked, "has_push": has_push, "friends_joined": friends,
    }


def active_jobs(state):
    """Jobs for crops still in the ground (or planned), and the winter jobs for the garden as a whole."""
    return [j for c, jobs in state["with_jobs"] if not c.get("finished_on") for j in jobs] + state.get("garden_jobs", [])


def update_badges(conn, user, state):
    """Record any newly earned badges and return them (so the app can celebrate)."""
    earned = planner.earned_badges(state["crops"], state["spaces"], state["done"], state["has_push"], state["friends_joined"])
    have = {r["badge"] for r in rows(conn, "SELECT badge FROM badges WHERE user_id = ?", user["id"])}
    new = sorted(earned - have)
    for badge in new:
        conn.execute("INSERT INTO badges (user_id, badge, earned_on) VALUES (?, ?, ?)",
                     (user["id"], badge, state["today"].isoformat()))
    by_id = {b["id"]: b for b in planner.BADGES}
    return [by_id[b] for b in new]


def mark_duplicates(suggestion, state, space_names):
    """Flag suggested plants that are already planned for around the same time, and move them to the end."""
    if not suggestion:
        return suggestion
    start = date.fromisoformat(suggestion["free_from"])
    for item in suggestion["plants"]:
        dup = planner.already_planned(item["plant_id"], start, state["with_jobs"])
        item["already"] = [dict(d, space_name=space_names.get(d["space_id"])) for d in dup]
    suggestion["plants"].sort(key=lambda item: bool(item["already"]))
    return suggestion


def bed_cost(space_id, with_jobs):
    """Roughly what it costs to plant everything planned in a bed. Several rows of the same thing share their seed
    packets, so they're added up first. 'to_buy': the part not ticked off as bought yet."""
    groups = {}
    for crop, jobs in with_jobs:
        if crop["space_id"] != space_id or crop.get("finished_on"):
            continue
        g = groups.setdefault((crop["plant_id"], crop["method"]), {"qty": 0, "bought": True})
        g["qty"] += planner.quantity(crop)
        g["bought"] = g["bought"] and any(j["kind"] == "buy" and j["status"] == "done" for j in jobs)
    items = []
    for (plant_id, method), g in groups.items():
        plant = catalogue.BY_ID[plant_id]
        est = planner.cost_estimate(plant, g["qty"], method)
        items.append(dict(plant_id=plant_id, method=method, qty=g["qty"], bought=g["bought"], total=est["total"], text=est["text"],
                          how=est["how"], per_plant=est["per_plant"], note=est["note"],
                          options={m: planner.cost_estimate(plant, g["qty"], m)["total"] for m in planner.methods_for(plant)}))
    total = sum(i["total"] for i in items)
    return {"total": round(total, 2), "to_buy": round(sum(i["total"] for i in items if not i["bought"]), 2), "items": items}


def second_season(state, crop):
    """Autumn/spring crops: the other season's window, and which spaces have room for a batch then."""
    season = planner.other_season(crop, state["shift"])
    if not season:
        return None
    plant = catalogue.BY_ID[crop["plant_id"]]
    already = any(c["plant_id"] == crop["plant_id"] and c["id"] != crop["id"] and not c.get("finished_on")
                  and c["anchor"] >= season["window"][0] for c in state["crops"])
    spaces = []
    for space in state["spaces"]:
        if ("pot" if space["kind"] == "pot" else "bed") not in plant["where"]:
            continue
        trial = {"id": 0, "plant_id": plant["id"], "space_id": space["id"], "method": crop["method"],
                 "quantity": planner.quantity(crop), "anchor": season["window"][0], "anchor_end": season["window"][1]}
        jobs = planner.crop_jobs(trial, state["shift"], set(), state["today"])
        use = planner.usage(space, state["with_jobs"], extra=(trial, jobs))
        spaces.append({"id": space["id"], "name": space["name"], "kind": space["kind"],
                       "fits": use["area"] is None or use["peak"] <= use["area"]})
    spaces.sort(key=lambda sp: (not sp["fits"], sp["id"] == crop["space_id"]))
    return dict(season, spaces=spaces, already=already)


def payload(conn, user):
    """Everything the app screen needs, in one go."""
    state = load(conn, user)
    today = state["today"]
    real = dict(state, spaces=[s for s in state["spaces"] if not s.get("is_sample")],
                crops=[c for c in state["crops"] if not c.get("is_sample")])
    new_badges = update_badges(conn, user, real)  # sample gardens never earn badges
    earned = {r["badge"]: r["earned_on"] for r in rows(conn, "SELECT * FROM badges WHERE user_id = ?", user["id"])}
    space_names = {s["id"]: s["name"] for s in state["spaces"]}

    kinds = {s["id"]: ("pot" if s["kind"] == "pot" else "bed") for s in state["spaces"]}
    crops_out = []
    for crop, jobs in state["with_jobs"]:
        plant = catalogue.BY_ID[crop["plant_id"]]
        finishes, starts = planner.crop_finishes(crop, jobs), planner.crop_starts(crop, jobs)
        qty = planner.quantity(crop)
        crops_out.append(dict(
            crop, jobs=jobs, stage=planner.crop_stage(crop, jobs, today), space_name=space_names.get(crop["space_id"]),
            starts=starts.isoformat() if starts else None, finishes=finishes.isoformat() if finishes else None,
            qty=qty, area=round(qty * planner.area_each(plant), 2), harvest=planner.harvest_estimate(plant, qty),
            buy=planner.buy_estimate(plant, qty, crop["method"]),
            cost=planner.cost_estimate(plant, qty, crop["method"]),
            cost_options={m: planner.cost_estimate(plant, qty, m)["total"] for m in planner.methods_for(plant)},
            bought=any(j["kind"] == "buy" and j["status"] == "done" for j in jobs),
            then=None if crop.get("finished_on") or plant["group"] not in ("veg", "herb") else mark_duplicates(planner.next_in_space(
                crop, jobs, kinds.get(crop["space_id"], "bed"), state["liked"], state["shift"], today), state, space_names),
            second=None if crop.get("finished_on") else second_season(state, crop)))

    spaces_out = []
    for space in state["spaces"]:
        steps_done = [i for i in range(len(catalogue.NODIG_STEPS)) if "s%d:nodig%d" % (space["id"], i) in state["done"]]
        suggestion = mark_duplicates(planner.suggestions_for_space(
            space, state["with_jobs"], state["liked"], today, state["shift"]), state, space_names)
        spaces_out.append(dict(space, nodig_done=steps_done, suggestion=suggestion, cost=bed_cost(space["id"], state["with_jobs"]),
                               usage=planner.usage(space, state["with_jobs"]),
                               clashes=planner.clashes(space, state["with_jobs"])))

    shopping = []
    for crop, jobs in state["with_jobs"]:
        if crop.get("finished_on"):
            continue
        for job in jobs:
            if job["kind"] == "buy" and job["status"] != "done":
                plant = catalogue.BY_ID[crop["plant_id"]]
                shopping.append({"job": job, "crop_id": crop["id"], "plant_id": plant["id"],
                                 "links": shops.links(plant, crop["method"])})
    shopping.sort(key=lambda s: s["job"]["end"])

    return {
        "today": today.isoformat(),
        "garden": {"w": user.get("garden_w"), "h": user.get("garden_h"),
                   "shape": json.loads(user["garden_shape"]) if user.get("garden_shape") else None,
                   "path_w": user.get("path_w") if user.get("path_w") is not None else 0.5,
                   "features": rows(conn, "SELECT id, kind, name, x, y, w, h, angle, grp, variety, cultivar FROM features WHERE user_id = ? ORDER BY id", user["id"])},
        "spaces": spaces_out,
        # the getting-started checklist ticks itself off from real things done (never from a sample garden)
        "checklist": {"firstCrop": bool(real["crops"]), "firstBed": bool(real["spaces"]), "reminders": state["has_push"]},
        "has_sample": any(s.get("is_sample") for s in state["spaces"]),
        "crops": crops_out,
        "shopping": shopping,
        "garden_jobs": state["garden_jobs"],
        "badges": [dict(b, earned_on=earned.get(b["id"])) for b in planner.BADGES],
        "new_badges": new_badges,
        "has_push": state["has_push"],
    }


def catalogue_payload(user=None):
    """The plant list, with windows already shifted for the user's region and turned into months for the chart."""
    today = clock.today()
    shift = shift_for(user) if user else 0
    out = []
    for plant in catalogue.PLANTS:
        windows = {}
        for field in ("sow_in", "sow_out", "plant_out", "harvest"):
            months = set()
            for window in plant.get(field) or []:
                start, end = planner.window_dates(window, today.year, shift)
                d = start.replace(day=1)
                while d <= end:
                    months.add(d.month)
                    d = d.replace(year=d.year + (d.month == 12), month=d.month % 12 + 1)
            windows[field] = sorted(months)
        methods = planner.methods_for(plant)
        next_by_method = {}
        for m in methods:
            win = planner.plan_anchor(plant, m, today, shift)
            next_by_method[m] = [win[0].isoformat(), win[1].isoformat()] if win else None
        # what could follow it in the same bed, after this year's picking
        then = None
        harvest = planner.next_window(plant["harvest"], today, shift)
        if harvest and not plant.get("perennial") and plant["group"] in ("veg", "herb"):
            free = min(harvest[1], harvest[0] + (plant.get("pick_weeks") or 99) * planner.WEEK)
            then = {"free_from": free.isoformat(),
                    "plants": planner.follow_ons(free, "bed", set(), shift, not_families=(plant["family"],), today=today)}
        pot_fits = {p["key"]: planner.pot_fits(plant, p["key"]) for p in catalogue.POT_SIZES} if "pot" in plant["where"] else {}
        varieties = [dict(v, links=shops.search_links("%s %s %s" % (v["name"], plant["name"], plant.get("buy_word") or "seeds")))
                     for v in plant["varieties"]]
        out.append(dict(plant, pot_fits=pot_fits, varieties=varieties, months=windows, methods=methods, next=next_by_method,
                        links={m: shops.links(plant, m) for m in methods},
                        area_each=round(planner.area_each(plant), 4), default_qty=planner.default_quantity(plant),
                        pot_advice=planner.pot_advice(plant), family_name=catalogue.GROUPS.get(plant["family"]), then=then))
    return {
        "plants": out, "levels": catalogue.LEVELS, "methods": planner.METHODS,
        "nodig_steps": catalogue.NODIG_STEPS, "pot_steps": catalogue.POT_STEPS,
        "all_rounders": catalogue.ALL_ROUNDERS, "pot_sizes": catalogue.POT_SIZES, "seed_store": catalogue._extras.SEED_STORE,
        "nodig_planting": catalogue.NODIG_PLANTING, "soil_types": catalogue.SOIL_TYPES, "fruit": catalogue.FRUIT, "mixes": catalogue.MIXES, "weed_tips": catalogue.WEED_TIPS,
        "combos": catalogue.COMBOS, "sun_spots": catalogue.SUN_SPOTS, "build": builds.payload(),
        "affiliate": shops.is_affiliate(),
    }
