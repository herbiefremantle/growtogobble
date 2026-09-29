"""One user's whole garden, worked out from the database: spaces, crops, every job, suggestions and badges.
Used by the API, the push alerts and the calendar feed, so they always agree with each other."""
from datetime import date

from . import clock, planner, regions, shops
from . import plants as catalogue
from .db import rows


def shift_for(user):
    return regions.REGIONS.get(user["region"], regions.REGIONS["central"])["shift"]


def load(conn, user, today=None):
    today = today or clock.today()
    shift = shift_for(user)
    spaces = rows(conn, "SELECT * FROM spaces WHERE user_id = ? ORDER BY id", user["id"])
    crops = rows(conn, "SELECT * FROM crops WHERE user_id = ? ORDER BY id", user["id"])
    done = {r["key"] for r in rows(conn, "SELECT key FROM done WHERE user_id = ?", user["id"])}
    has_push = conn.execute("SELECT 1 FROM push_subs WHERE user_id = ?", (user["id"],)).fetchone() is not None
    with_jobs = [(c, planner.crop_jobs(c, shift, done, today)) for c in crops]
    liked = {c["plant_id"] for c in crops}
    return {
        "today": today, "shift": shift, "spaces": spaces, "crops": crops, "done": done,
        "with_jobs": with_jobs, "liked": liked, "has_push": has_push,
    }


def active_jobs(state):
    """Jobs for crops still in the ground (or planned)."""
    return [j for c, jobs in state["with_jobs"] if not c.get("finished_on") for j in jobs]


def update_badges(conn, user, state):
    """Record any newly earned badges and return them (so the app can celebrate)."""
    earned = planner.earned_badges(state["crops"], state["spaces"], state["done"], state["has_push"])
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
    new_badges = update_badges(conn, user, state)
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
            then=None if crop.get("finished_on") else mark_duplicates(planner.next_in_space(
                crop, jobs, kinds.get(crop["space_id"], "bed"), state["liked"], state["shift"], today), state, space_names),
            second=None if crop.get("finished_on") else second_season(state, crop)))

    spaces_out = []
    for space in state["spaces"]:
        steps_done = [i for i in range(len(catalogue.NODIG_STEPS)) if "s%d:nodig%d" % (space["id"], i) in state["done"]]
        suggestion = mark_duplicates(planner.suggestions_for_space(
            space, state["with_jobs"], state["liked"], today, state["shift"]), state, space_names)
        spaces_out.append(dict(space, nodig_done=steps_done, suggestion=suggestion,
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
        "spaces": spaces_out,
        "crops": crops_out,
        "shopping": shopping,
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
        if harvest and not plant.get("perennial"):
            free = min(harvest[1], harvest[0] + (plant.get("pick_weeks") or 99) * planner.WEEK)
            then = {"free_from": free.isoformat(),
                    "plants": planner.follow_ons(free, "bed", set(), shift, not_families=(plant["family"],), today=today)}
        out.append(dict(plant, months=windows, methods=methods, next=next_by_method,
                        links={m: shops.links(plant, m) for m in methods},
                        area_each=round(planner.area_each(plant), 4), default_qty=planner.default_quantity(plant),
                        pot_advice=planner.pot_advice(plant), family_name=catalogue.GROUPS.get(plant["family"]), then=then))
    return {
        "plants": out, "levels": catalogue.LEVELS, "methods": planner.METHODS,
        "nodig_steps": catalogue.NODIG_STEPS, "pot_steps": catalogue.POT_STEPS,
        "nodig_planting": catalogue.NODIG_PLANTING, "soil_types": catalogue.SOIL_TYPES,
        "affiliate": shops.is_affiliate(),
    }
