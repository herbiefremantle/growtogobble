"""Turns "I want to grow carrots in Bed 1" into a list of dated jobs, from buying the seeds to eating the harvest.

Everything here is pure (no database), so it's easy to test: give it a crop, a region shift, the set of jobs
already done and today's date, and it returns the jobs.

A crop is anchored on the sowing/planting window the user is aiming for (crops.anchor..anchor_end, chosen when
the crop is added). Later jobs are worked out from what has actually happened (sown_on, planted_on) where we
know it, and from the plan where we don't - so if the carrots go in late, the harvest date moves with them.
"""
from datetime import date, timedelta

from . import plants as catalogue

DAY = timedelta(days=1)
WEEK = timedelta(weeks=1)

METHODS = {
    "sow_in": {"label": "Start indoors (windowsill or greenhouse)", "emoji": "🏠"},
    "sow_out": {"label": "Sow straight outside", "emoji": "🌱"},
    "plants": {"label": "Buy baby plants", "emoji": "🪴"},
}


# ---- dates ----------------------------------------------------------------------------------------

def _shift_day(mmdd, year, shift):
    """A catalogue date moved for the user's region: later in spring/summer in colder places, earlier in autumn."""
    month, day = (int(x) for x in mmdd.split("-"))
    d = date(year, month, min(day, 28) if month == 2 else day)
    return d + timedelta(days=shift if month <= 7 else -shift)


def window_dates(window, year, shift):
    """(start, end) for a window that starts in `year`. Windows like 10-15..03-15 run into the next year."""
    start_s, end_s = window
    start = _shift_day(start_s, year, shift)
    end = _shift_day(end_s, year + (1 if end_s < start_s else 0), shift)
    if end < start + 7 * DAY:  # a big shift can squash a short window; keep at least a week
        end = start + 7 * DAY
    return start, end


def next_window(windows, after, shift):
    """The earliest occurrence of any of `windows` that hasn't finished by `after`."""
    best = None
    for window in windows or []:
        for year in (after.year - 1, after.year, after.year + 1):
            start, end = window_dates(window, year, shift)
            if end >= after and (best is None or start < best[0]):
                best = (start, end)
    return best


def methods_for(plant):
    """Which ways this plant can be started, best first: frost-tender plants get a head start indoors,
    hardy ones are simplest sown straight outside, unless the catalogue says otherwise."""
    options = [m for m, field in (("sow_in", "sow_in"), ("sow_out", "sow_out"), ("plants", "plant_out")) if plant.get(field)]
    preferred = plant.get("prefer") or ("sow_in" if plant.get("tender") else "sow_out")
    if preferred in options:
        options.remove(preferred)
        options.insert(0, preferred)
    return options


def first_window(plant, method):
    return plant.get({"sow_in": "sow_in", "sow_out": "sow_out", "plants": "plant_out"}[method])


def plan_anchor(plant, method, today, shift, not_before=None):
    """The window to aim for when a crop is added (or re-planned) today. `not_before` is for a follow-on crop:
    it can't go in until the space is free."""
    if method == "sow_in" and not_before:
        # a head start: sow indoors early enough to be ready to plant out the day the space is free
        target = max(today, not_before - plant.get("grow_on", 5) * WEEK)
        win = next_window(plant.get("sow_in"), target, shift)
        return (max(win[0], target), win[1]) if win else None
    after = max(today, not_before or today)
    win = next_window(first_window(plant, method), after, shift)
    if win and not_before and win[0] < not_before:
        win = (not_before, win[1])
    return win


# ---- jobs ------------------------------------------------------------------------------------------

def _fmt(template_steps, plant):
    return [s.format(depth=plant.get("depth", "1cm"), spacing=plant.get("spacing", "30cm")) for s in template_steps]


def _status(start, end, done, today):
    if done:
        return "done"
    if today < start:
        return "soon" if (start - today).days <= 14 else "later"
    if today <= end:
        return "now"
    return "missed"


def crop_jobs(crop, shift, done_keys, today):
    """Every job for one crop, in date order. `crop` is a dict row from the crops table."""
    plant = catalogue.BY_ID[crop["plant_id"]]
    cid = crop["id"]
    name = plant["name"]
    method = crop["method"]
    anchor = date.fromisoformat(crop["anchor"])
    anchor_end = date.fromisoformat(crop["anchor_end"])
    sown = date.fromisoformat(crop["sown_on"]) if crop.get("sown_on") else None
    planted = date.fromisoformat(crop["planted_on"]) if crop.get("planted_on") else None
    harvested = date.fromisoformat(crop["harvested_on"]) if crop.get("harvested_on") else None
    jobs = []

    def add(key, kind, emoji, title, start, end, steps=None, action="check", done=None, waiting=False):
        """waiting: this job can't happen until an earlier one is done (no picking before sowing)."""
        full_key = "c%d:%s" % (cid, key)
        is_done = (full_key in done_keys) if done is None else done
        status = _status(start, end, is_done, today)
        if waiting and status in ("now", "missed"):
            status = "waiting"
        jobs.append({
            "key": full_key, "crop_id": cid, "plant_id": plant["id"], "kind": kind, "emoji": emoji,
            "title": title, "start": start.isoformat(), "end": end.isoformat(), "action": action,
            "steps": steps or [], "status": status,
        })

    word = plant.get("buy_word", "plants" if method == "plants" else "seeds")
    # buying opens 4 weeks before the window and stays open until it closes - it's never "missed" while you can still plant
    add("buy", "buy", "🛒", "Get %s for your %s" % (word, name.lower()), anchor - 28 * DAY, anchor_end,
        steps=["Tap a shop below to buy them online, or pick some up at a garden centre 🛍️",
               "Keep seed packets somewhere cool and dry until you need them 📦"],
        done=("c%d:buy" % cid in done_keys) or bool(sown or planted))

    # 1. getting it started
    if method == "sow_in":
        add("sow", "sow_in", "🏠", "Sow %s indoors" % name.lower(), anchor, anchor_end,
            steps=_fmt(catalogue.STEPS_SOW_IN, plant), action="sow", done=bool(sown))
        ready = (sown or anchor) + plant.get("grow_on", 5) * WEEK
        if crop.get("bed_free_on"):  # following another crop: can't go out until that space is free
            ready = max(ready, date.fromisoformat(crop["bed_free_on"]))
        win = next_window(plant.get("plant_out"), ready, shift) or (ready, ready + 14 * DAY)
        start = max(ready, win[0])
        end = win[1] if win[1] >= start else start + 14 * DAY
        add("plant", "plant_out", "🌿", "Plant out your %s" % name.lower(), start, end,
            steps=_fmt(catalogue.STEPS_PLANT_OUT_FROM_INDOORS, plant), action="plant", done=bool(planted),
            waiting=not sown)
        growing_from = planted or start
        in_ground = bool(planted)
    elif method == "sow_out":
        title = plant.get("sow_verb") or "Sow %s outside" % name.lower()
        steps = plant.get("steps_sow") or catalogue.STEPS_SOW_OUT
        add("sow", "sow_out", "🌱", title, anchor, anchor_end, steps=_fmt(steps, plant), action="sow", done=bool(sown))
        growing_from = sown or anchor
        in_ground = bool(sown)
    else:
        add("plant", "plant_out", "🪴", "Plant your %s" % name.lower(), anchor, anchor_end,
            steps=_fmt(plant.get("steps_plant") or catalogue.STEPS_PLANT_BOUGHT, plant), action="plant", done=bool(planted))
        growing_from = planted or anchor
        in_ground = bool(planted)

    # getting ready: supports go in before the plants, so canes don't spear the roots
    for i, (weeks_before, title, steps) in enumerate(catalogue.PREP.get(plant["id"], [])):
        start = growing_from - max(weeks_before * WEEK, 5 * DAY)
        add("prep%d" % i, "prep", "🪜", title, start, growing_from + WEEK, steps=steps)

    # protecting young plants: cover them when they go in, and uncover when they're big enough
    pests = plant["pests"]
    if pests["cover"]:
        who = " and ".join(w["name"].split(" & ")[0].lower() for w in pests["who"][:2])
        keep = pests["cover"] == "all"
        add("protect", "protect", "🛡️", "Protect your %s from %s" % (name.lower(), who), growing_from - 2 * DAY,
            growing_from + WEEK, steps=pests["protect"] + ([pests["uncover"]] if keep else []))
        if not keep:
            start = growing_from + pests["cover"] * WEEK
            add("uncover", "protect", "🙌", "Take the cover off your %s?" % name.lower(), start, start + 2 * WEEK,
                steps=[pests["uncover"]], waiting=not in_ground)

    # 2. looking after it
    for i, (after_weeks, for_weeks, text) in enumerate(plant.get("care", [])):
        start = growing_from + after_weeks * WEEK
        add("care%d" % i, "care", "🧤", text, start, start + max(for_weeks, 1) * WEEK, waiting=not in_ground)

    # 3. picking and eating
    started = sown or planted or anchor
    base = started + plant["weeks"] * WEEK
    win = next_window(plant["harvest"], base, shift) or (base, base + 6 * WEEK)
    h_start = max(base, win[0])
    h_end = win[1] if win[1] >= h_start else h_start + 6 * WEEK
    add("harvest", "harvest", "🧺", "Pick your %s!" % name.lower(), h_start, h_end,
        steps=[plant["harvest_tip"]], action="harvest", done=bool(harvested), waiting=not in_ground)
    if harvested:
        add("eat", "eat", "😋", "Taste your %s" % name.lower(), harvested, max(h_end, harvested + WEEK),
            steps=[plant["eat"]])
        # keeping the harvest: drying first for the ones that need it, then storing or freezing the extras
        if plant["id"] in catalogue.CURE:
            weeks, title, steps = catalogue.CURE[plant["id"]]
            add("cure", "store", "🌬️", title, harvested, harvested + (weeks + 1) * WEEK, steps=steps)
        store = plant["store"]
        add("store", "store", "🫙", "Got extra %s? Keep or freeze them" % name.lower(), harvested, max(h_end, harvested + 2 * WEEK),
            steps=store["how"] + ["❄️ " + store["freeze"], "⏳ Keeps for " + store["keeps"]])

    # 4. another batch, for a steady supply
    if plant.get("succession") and method != "plants" and sown:
        start = sown + plant["succession"] * WEEK
        last = next_window(first_window(plant, method), start, shift)
        if last and last[0] <= start:
            add("batch", "batch", "🔁", "Sow another batch of %s" % name.lower(), start, last[1],
                steps=["Sowing a little every few weeks means you get a steady supply instead of loads at once 🔁",
                       "Tap 'Sow another batch' and we'll add it to your plan."],
                action="batch")

    jobs.sort(key=lambda j: j["start"])
    return jobs


def crop_finishes(crop, jobs):
    """The date this crop stops using its space. Crops lifted all at once (garlic, onions, potatoes...) free the
    space a few weeks into their picking window, not at the end of it."""
    if crop.get("finished_on"):
        return date.fromisoformat(crop["finished_on"])
    plant = catalogue.BY_ID[crop["plant_id"]]
    for job in jobs:
        if job["kind"] == "harvest":
            end = date.fromisoformat(job["end"])
            if plant.get("pick_weeks"):
                if crop.get("harvested_on"):  # picking started: done a few weeks after that
                    return date.fromisoformat(crop["harvested_on"]) + plant["pick_weeks"] * WEEK
                end = min(end, date.fromisoformat(job["start"]) + plant["pick_weeks"] * WEEK)
            return end
    return None


def crop_starts(crop, jobs):
    """The date this crop starts using its space: when it's sown outside or planted out (not sown on a windowsill)."""
    if crop["method"] == "sow_out" and crop.get("sown_on"):
        return date.fromisoformat(crop["sown_on"])
    if crop.get("planted_on"):
        return date.fromisoformat(crop["planted_on"])
    for job in jobs:
        if job["kind"] in ("sow_out", "plant_out"):
            return date.fromisoformat(job["start"])
    return None


def crop_stage(crop, jobs, today):
    """Where the crop is on its grow-to-gobble journey: 0 plan, 1 sown, 2 growing, 3 picking, 4 eaten, 5 finished."""
    if crop.get("finished_on"):
        return 5
    by_kind = {j["kind"]: j for j in jobs}
    if by_kind.get("eat", {}).get("status") == "done":
        return 4
    if crop.get("harvested_on"):
        return 3
    if crop.get("planted_on") or crop.get("sown_on"):
        return 2 if (crop.get("planted_on") or crop["method"] == "sow_out") else 1
    return 0


# ---- space and yield --------------------------------------------------------------------------------

DEFAULT_AREA = {"bed": 1.2 * 2.4, "allotment": 125.0}  # a standard raised bed; half an allotment plot


def area_each(plant):
    """Square metres one plant needs (its spacing in the row x the gap between rows)."""
    return plant["sp_cm"] * plant["row_cm"] / 10000


def default_quantity(plant):
    """A sensible starting amount: about a square metre's worth, never more than 30."""
    return max(1, min(30, int(1.0 / area_each(plant))))


def quantity(crop):
    return crop.get("quantity") or default_quantity(catalogue.BY_ID[crop["plant_id"]])


def space_area(space):
    if space["kind"] == "pot":
        return None
    if space.get("width_m") and space.get("length_m"):
        return round(space["width_m"] * space["length_m"], 2)
    return DEFAULT_AREA[space["kind"]]


def harvest_estimate(plant, qty):
    """'about 22 bulbs' / '8-12 kg of potatoes' / the plant's own words for pick-and-come-again crops."""
    y = plant.get("yield_each")
    if not y:
        return plant.get("yield_text")
    low, high, unit = y
    fmt = (lambda n: ("%.1f" % n).rstrip("0").rstrip(".")) if isinstance(low, float) or isinstance(high, float) else (lambda n: "%d" % n)
    lo, hi = fmt(low * qty), fmt(high * qty)
    return "about %s %s" % (lo, unit) if lo == hi else "about %s-%s %s" % (lo, hi, unit)


def pot_advice(plant):
    """How many fit in an ordinary 30cm pot (about 0.07 m2), or how big a pot one plant needs."""
    per_pot = int(0.07 / area_each(plant))
    if per_pot >= 2:
        return "About %d fit in a 30cm pot" % per_pot
    if plant["sp_cm"] <= 45:
        return "1 per 30cm pot"
    return "1 per big pot or tub (45cm or wider)"


def usage(space, crops_with_jobs, extra=None):
    """How full a bed gets. Returns the busiest moment: {'peak': m2, 'on': date, 'area': m2, 'crops': [ids]}.
    `extra` is a (crop, jobs) pair being tried out, not yet saved."""
    spans = []
    for crop, jobs in list(crops_with_jobs) + ([extra] if extra else []):
        if crop.get("space_id") != space["id"] or crop.get("finished_on"):
            continue
        start, end = crop_starts(crop, jobs), crop_finishes(crop, jobs)
        if start and end:
            plant = catalogue.BY_ID[crop["plant_id"]]
            spans.append((start, end, quantity(crop) * area_each(plant), crop.get("id")))
    points = [sp[0] for sp in spans]  # the busiest moment is always when something goes in
    if extra:  # only moments while the new crop would be in the ground matter
        new = [sp for sp in spans if sp[3] == extra[0].get("id")]
        if new:
            points = [p for p in points if new[0][0] <= p < new[0][1]] + [new[0][0]]
    best = {"peak": 0.0, "on": None, "crops": []}
    for t in points:
        here = [sp for sp in spans if sp[0] <= t < sp[1]]  # a crop's last day is the next one's first
        used = sum(sp[2] for sp in here)
        if used > best["peak"]:
            best = {"peak": used, "on": t, "crops": [sp[3] for sp in here]}
    best["peak"] = round(best["peak"], 2)
    best["on"] = best["on"].isoformat() if best["on"] else None
    best["area"] = space_area(space)
    return best


def overlap(a0, a1, b0, b1):
    """Two crops are in the ground at the same time (one finishing the day the other starts doesn't count)."""
    return bool(a0 and a1 and b0 and b1) and a0 < b1 and b0 < a1


def already_planned(plant_id, start, crops_with_jobs, skip_id=None):
    """Crops of the same plant that will already be in the ground around `start` (in any space): planted before
    and still growing then, or going in up to 6 weeks after. Stops the same thing being planned twice by accident."""
    out = []
    for crop, jobs in crops_with_jobs:
        if crop["plant_id"] != plant_id or crop.get("finished_on") or crop.get("id") == skip_id:
            continue
        s0, s1 = crop_starts(crop, jobs), crop_finishes(crop, jobs)
        if s0 and s1 and s0 <= start + 6 * WEEK and s1 > start:
            out.append({"crop_id": crop["id"], "space_id": crop.get("space_id"), "starts": s0.isoformat()})
    return out


def clashes(space, crops_with_jobs):
    """Bad neighbours sharing this space at the same time."""
    here = [(c, crop_starts(c, j), crop_finishes(c, j)) for c, j in crops_with_jobs
            if c.get("space_id") == space["id"] and not c.get("finished_on")]
    out, seen = [], set()
    for a, a0, a1 in here:
        for b, b0, b1 in here:
            pair = tuple(sorted((a["plant_id"], b["plant_id"])))
            if a["id"] >= b["id"] or pair in seen or not overlap(a0, a1, b0, b1):
                continue
            why = next((x["why"] for x in catalogue.BAD_WITH[a["plant_id"]] if x["plant_id"] == b["plant_id"]), None)
            if why:
                seen.add(pair)
                out.append({"a": a["plant_id"], "b": b["plant_id"], "why": why})
    return out


# ---- what to plant next -----------------------------------------------------------------------------

def head_start_ok(plant, free_from, today):
    """Can this be sown indoors in time to be planted out when the space frees up?"""
    if "sow_in" not in methods_for(plant) or not plant.get("plant_out"):
        return False
    target = free_from - plant.get("grow_on", 5) * WEEK
    if target < (today or target) - WEEK:  # too late to start it indoors now
        return False
    return True


def follow_ons(free_from, kind, liked, shift, not_families=(), limit=6, today=None):
    """What could go into a space that's free from `free_from`. Where it can be started indoors a few weeks before,
    we suggest that - so it's ready to plant the day the space is free. Otherwise, things you can sow outside or
    plant within 3 weeks. Skips perennials (they'd move in for good) and the families that were just there."""
    picks = []
    for plant in catalogue.PLANTS:
        if kind not in plant["where"] or plant.get("perennial") or plant["family"] in not_families:
            continue
        if head_start_ok(plant, free_from, today):
            sow = next_window(plant["sow_in"], free_from - plant.get("grow_on", 5) * WEEK - 14 * DAY, shift)
            out = next_window(plant["plant_out"], free_from, shift)
            target = free_from - plant.get("grow_on", 5) * WEEK
            if sow and out and sow[0] <= target + 7 * DAY and out[0] <= free_from + 21 * DAY:
                score = (0 if plant["id"] in liked else 1, 0 if plant.get("filler") else 1, plant["level"])
                picks.append((score, plant["id"], "sow_in"))
                continue
        for method in ("sow_out", "plants"):
            if method not in methods_for(plant):
                continue
            win = next_window(first_window(plant, method), free_from, shift)
            if win and win[0] <= free_from + 21 * DAY:
                score = (0 if plant["id"] in liked else 1, 0 if plant.get("filler") else 1, plant["level"])
                picks.append((score, plant["id"], method))
                break
    picks.sort()
    return [{"plant_id": pid, "method": m, "liked": pid in liked} for _, pid, m in picks[:limit]]


def next_in_space(crop, jobs, space_kind, liked, shift, today):
    """For one crop: when its space frees up, and what could follow it there."""
    free = crop_finishes(crop, jobs)
    if not free:
        return None
    free = max(free, today)
    family = catalogue.BY_ID[crop["plant_id"]]["family"]
    return {"free_from": free.isoformat(),
            "plants": follow_ons(free, space_kind, liked, shift, not_families=(family,), limit=6, today=today)}


def suggestions_for_space(space, crops_with_jobs, liked, today, shift, limit=4):
    """Crops that could go into `space` when it's next free (within the next 6 weeks), easy and liked first."""
    active = [(c, j) for c, j in crops_with_jobs if c["space_id"] == space["id"] and not c.get("finished_on")]
    ends = [crop_finishes(c, j) for c, j in active]
    free_from = max([e for e in ends if e] or [today])
    free_from = max(free_from, today)
    if (free_from - today).days > 42:
        return None
    kind = "pot" if space["kind"] == "pot" else "bed"
    families = {catalogue.BY_ID[c["plant_id"]]["family"] for c, _ in active}
    plants = follow_ons(free_from, kind, liked, shift, not_families=families, limit=limit, today=today)
    if not active:  # an empty bed can take anything, perennials included
        plants = follow_ons(free_from, kind, liked, shift, limit=limit, today=today)
    return {"space_id": space["id"], "free_from": free_from.isoformat(), "empty_now": not active, "plants": plants}


# ---- badges ---------------------------------------------------------------------------------------

BADGES = [
    {"id": "planner", "emoji": "📋", "name": "Planner", "text": "Chose 3 things to grow"},
    {"id": "builder", "emoji": "📦", "name": "Bed Builder", "text": "Built a no-dig bed"},
    {"id": "potter", "emoji": "🪴", "name": "Pot Pro", "text": "Set up a pot or container"},
    {"id": "sprout", "emoji": "🌱", "name": "First Seed", "text": "Sowed your first seeds"},
    {"id": "planter", "emoji": "🌿", "name": "Planter", "text": "Planted something out"},
    {"id": "picker", "emoji": "🧺", "name": "First Pick", "text": "Picked your first harvest"},
    {"id": "chef", "emoji": "😋", "name": "Gobbled It!", "text": "Ate something you grew"},
    {"id": "rainbow", "emoji": "🌈", "name": "Rainbow Grower", "text": "Picked 5 different crops"},
    {"id": "again", "emoji": "🔁", "name": "Keep It Coming", "text": "Sowed a second batch"},
    {"id": "helper", "emoji": "🧤", "name": "Garden Helper", "text": "Did 10 garden jobs"},
    {"id": "green", "emoji": "💚", "name": "Green Fingers", "text": "Did 50 garden jobs"},
    {"id": "brave", "emoji": "🏆", "name": "Brave Grower", "text": "Picked a 'more care' crop"},
    {"id": "alerts", "emoji": "🔔", "name": "Ready for Action", "text": "Turned on garden alerts"},
]


def earned_badges(crops, spaces, done_keys, has_push):
    plants_picked = {c["plant_id"] for c in crops if c.get("harvested_on")}
    earned = set()
    if len(crops) >= 3:
        earned.add("planner")
    if any(s["kind"] != "pot" and (s.get("built") or nodig_done(s["id"], done_keys)) for s in spaces):
        earned.add("builder")
    if any(s["kind"] == "pot" for s in spaces):
        earned.add("potter")
    if any(c.get("sown_on") for c in crops):
        earned.add("sprout")
    if any(c.get("planted_on") for c in crops):
        earned.add("planter")
    if plants_picked:
        earned.add("picker")
    if any(k.endswith(":eat") for k in done_keys):
        earned.add("chef")
    if len(plants_picked) >= 5:
        earned.add("rainbow")
    if any(k.endswith(":batch") for k in done_keys):
        earned.add("again")
    if len(done_keys) >= 10:
        earned.add("helper")
    if len(done_keys) >= 50:
        earned.add("green")
    if any(catalogue.BY_ID[p]["level"] == 3 for p in plants_picked):
        earned.add("brave")
    if has_push:
        earned.add("alerts")
    return earned


def nodig_done(space_id, done_keys):
    return all("s%d:nodig%d" % (space_id, i) in done_keys for i in range(len(catalogue.NODIG_STEPS)))


# ---- a second planting season ---------------------------------------------------------------------------

def other_season(crop, shift):
    """For crops with an autumn and a spring window (onions, garlic, broad beans): the *other* window after this
    crop's, with the advice on whether it's worth it. None for everything else."""
    advice = catalogue.SEASONS.get(crop["plant_id"])
    plant = catalogue.BY_ID[crop["plant_id"]]
    windows = first_window(plant, crop["method"]) or []
    if not advice or len(windows) < 2:
        return None
    anchor = date.fromisoformat(crop["anchor"])
    this = next_window(windows, anchor, shift)
    later = [w for w in (next_window([win], this[1] + DAY, shift) for win in windows) if w]
    later = [w for w in later if w[0] > this[1]]
    if not later:
        return None
    start, end = min(later)
    recommend, title, why = advice
    return {"recommend": recommend, "title": title, "why": why, "window": [start.isoformat(), end.isoformat()]}


# ---- suggested layout across all the beds -------------------------------------------------------------

def movable(crop, jobs, today):
    """A crop can still be moved to another bed if it isn't in the ground yet."""
    if crop.get("finished_on") or crop.get("planted_on") or (crop["method"] == "sow_out" and crop.get("sown_on")):
        return False
    return True


def suggest_layout(spaces, crops_with_jobs, today, only_unplaced=False):
    """Share the crops out between the beds and pots - nothing is saved, it's a suggestion to agree to.
    Biggest crops are placed first. For each, every space it suits is scored:
      - room at its busiest moment (a bed that would overflow scores badly; pots have no size limit)
      - bad neighbours in the ground at the same time (big penalty), good neighbours (small bonus)
      - the same plant family already there (bonus - keeps families together, which makes rotation easy)
      - plants that like pots best (herbs, blueberries, chillies...) go in pots when there are some
    Returns [{crop_id, space_id, from_space_id, note}]."""
    work = [(dict(c), j) for c, j in crops_with_jobs]
    moving = [(c, j) for c, j in work if not c.get("finished_on") and movable(c, j, today)
              and (not only_unplaced or not c.get("space_id"))]
    ids = {c["id"] for c, _ in moving}
    for c, _ in moving:  # start from a clean slate for everything that's being placed
        c["_from"] = c.get("space_id")
        c["space_id"] = None
    moving.sort(key=lambda cj: -(quantity(cj[0]) * area_each(catalogue.BY_ID[cj[0]["plant_id"]])))
    out = []
    for crop, jobs in moving:
        plant = catalogue.BY_ID[crop["plant_id"]]
        c0, c1 = crop_starts(crop, jobs), crop_finishes(crop, jobs)
        best = None
        for space in spaces:
            kind = "pot" if space["kind"] == "pot" else "bed"
            if kind not in plant["where"]:
                continue
            here = [(c, j) for c, j in work if c.get("space_id") == space["id"] and not c.get("finished_on")
                    and overlap(c0, c1, crop_starts(c, j), crop_finishes(c, j))]
            trial = dict(crop, space_id=space["id"])
            use = usage(space, [(c, j) for c, j in work if c["id"] != crop["id"]], extra=(trial, jobs))
            score, note = 0.0, ""
            if use["area"]:
                fill = use["peak"] / use["area"]
                score -= fill * 10
                if fill > 1:
                    score -= 100 + 20 * (fill - 1)
                    note = "a bit full"
            if kind == "pot":
                if plant["where"] == ["pot"]:
                    score += 20  # herbs, blueberries, chillies... belong in pots
                else:
                    # pots have no size to fill, so don't let them swallow everything: beds come first,
                    # and each thing already in the pots makes them a little less attractive
                    in_pots = sum(1 for c, _ in work if c.get("space_id") == space["id"] and not c.get("finished_on"))
                    score -= 8 + in_pots
                    if plant.get("tender") and plant["level"] >= 2:
                        score += 3  # tender plants do well in a sheltered pot
            names = {c["plant_id"] for c, _ in here}
            if plant["id"] in {c["plant_id"] for c, _ in work if c.get("space_id") == space["id"] and not c.get("finished_on")}:
                score += 6  # keep rows of the same crop together
            bad = [x for x in catalogue.BAD_WITH[plant["id"]] if x["plant_id"] in names]
            good = [x for x in catalogue.GOOD_WITH[plant["id"]] if x["plant_id"] in names]
            family = any(catalogue.BY_ID[c["plant_id"]]["family"] == plant["family"] for c, _ in here if c["plant_id"] != plant["id"])
            score -= 50 * len(bad)
            score += 3 * len(good) + (4 if family else 0)
            if bad:
                note = "keep an eye: next to %s" % catalogue.BY_ID[bad[0]["plant_id"]]["name"].lower()
            elif good:
                note = "good next to %s" % catalogue.BY_ID[good[0]["plant_id"]]["name"].lower()
            elif family:
                note = "with its family"
            if best is None or score > best[0]:
                best = (score, space["id"], note)
        if best:
            crop["space_id"] = best[1]
        out.append({"crop_id": crop["id"], "space_id": best[1] if best else None,
                    "from_space_id": crop["_from"], "note": best[2] if best else "no bed or pot suits it"})
    return out
