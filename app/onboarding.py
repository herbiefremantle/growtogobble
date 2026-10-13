"""First-run onboarding: a short quiz, a starter plan, a tour that suits the size of garden, and sample gardens.

Everything here works from the user's onboarding profile (stored as JSON on the user). Adding a new tour branch
later means adding to TOURS and path_for() - the quiz doesn't change.
"""
from datetime import timedelta

from . import planner
from . import plants as catalogue

EXPERIENCE = ("beginner", "some", "confident")
SPACE = ("pots", "small", "medium", "large")
GOALS = ("veg", "fruit", "herbs_flowers", "cooking", "kids")
TIME = ("minimal", "moderate", "plenty")
DEFAULTS = {"experience": "some", "space": "small", "goals": ["veg"], "time": "moderate"}


def blank():
    return {"completedAt": None, "skippedAt": None, "experience": None, "space": None, "goals": [], "time": None,
            "tourProgress": {"path": None, "stepIndex": 0, "completed": False}}


def merge(current, changes):
    """Apply the parts of the profile the app sends, checking each one. Unknown keys are ignored."""
    out = dict(blank(), **(current or {}))
    for key, allowed in (("experience", EXPERIENCE), ("space", SPACE), ("time", TIME)):
        if key in changes:
            out[key] = changes[key] if changes[key] in allowed else None
    if "goals" in changes:
        out["goals"] = [g for g in (changes["goals"] or []) if g in GOALS]
    for key in ("completedAt", "skippedAt", "checklistDismissed"):
        if key in changes:
            out[key] = str(changes[key])[:40] if changes[key] else None
    if isinstance(changes.get("tourProgress"), dict):
        tp = changes["tourProgress"]
        out["tourProgress"] = {"path": tp.get("path") if tp.get("path") in TOURS else None,
                               "stepIndex": max(0, min(int(tp.get("stepIndex") or 0), 20)), "completed": bool(tp.get("completed"))}
    if changes.get("skip"):  # skipped the whole quiz: sensible defaults, finish it later from Me
        for key, value in DEFAULTS.items():
            out[key] = out.get(key) or value
    return out


def answers(profile):
    """The profile with defaults filled in for anything not answered."""
    p = dict(blank(), **(profile or {}))
    for key, value in DEFAULTS.items():
        if not p.get(key):
            p[key] = value
    return p


# ---- the tour: which path, and its steps ------------------------------------------------------------------
def path_for(profile):
    return {"pots": "A", "small": "B"}.get(answers(profile)["space"], "C")


# Each step: where it is (route), what it points at (anchor - skipped if it isn't there), how to get the page ready
# (prep), and words. why: a plain-English "why this matters", shown to beginners. clip: a short moving demo of
# doing it (drawn by the app - see CLIPS in static/app.js).
TOURS = {
    "A": [
        {"route": "#/garden", "prep": "list", "anchor": "#add-space", "title": "My containers", "clip": "pot_fit",
         "body": "Add each pot, trough or grow bag. Tell us the size and we'll suggest what fits.",
         "why": "Pot size decides what you can grow - a tomato needs about 10 litres of compost, a lettuce much less."},
        {"route": "#/plants", "prep": "veg", "anchor": '[data-filter="pot"]', "title": "Crop picker", "clip": "add_veg",
         "body": "Tap 'Good in pots' for things that suit containers: herbs, salad leaves, tomatoes, chillies.",
         "why": "Picking plants that like pots means bigger crops and less fuss."},
        {"route": "#/calendar", "anchor": "#view h1", "title": "Your calendar",
         "body": "Your sowing and picking dates, worked out for where you live.",
         "why": "Sowing at the right time is the biggest single thing that makes plants grow well."},
        {"route": "#/", "anchor": "#push-card, .stats", "title": "Reminders",
         "body": "Pots dry out fast. Turn on alerts and we'll nudge you on hot, dry days - and when there's a frost coming.",
         "why": "A pot can dry out in a single hot day; a reminder saves the plant."},
        {"route": "#/garden", "prep": "plot", "anchor": "svg.plot", "title": "Got more space one day?", "clip": "add_bed",
         "body": "The plan lets you lay out beds to scale - even trace your garden from a satellite map. Take a peek.",
         "why": "Seeing it all on one page makes it easy to plan what goes where."},
    ],
    "B": [
        {"route": "#/garden", "prep": "plot", "anchor": "#edit", "title": "Your beds", "clip": "add_bed",
         "body": "Add your raised beds or borders - rough sizes are fine. Tap Edit plan, then Bed or pots.",
         "why": "Knowing the size of each bed lets us tell you exactly how much fits."},
        {"route": "#/plants", "prep": "veg", "anchor": "#view .grid", "title": "Planning crops", "clip": "add_veg",
         "body": "Pick a crop, choose a bed, and we'll show how many fit - and stop you overfilling it.",
         "why": "Plants squashed together grow small and catch diseases."},
        {"route": "#/plants", "prep": "groups", "anchor": '[data-pgroup="groups"]', "title": "Companions and spacing",
         "body": "We warn you if plants are poor neighbours or too close together - and suggest ones that grow well together.",
         "why": "Some plants help each other (marigolds keep greenfly off tomatoes); some hold each other back."},
        {"route": "#/calendar", "anchor": "#view h1", "title": "Calendar and reminders",
         "body": "Every sowing, planting and picking date for your beds, with reminders when it's time.",
         "why": "Little and often is the secret - the calendar breaks it into small jobs."},
        {"route": "#/garden", "prep": "plot", "anchor": "svg.plot", "title": "Your whole plot to scale", "clip": "trace_plot",
         "body": "Drag beds into place, add paths and trees, or trace your garden from a satellite map.",
         "why": "Seeing which beds are next to each other helps keep bad neighbours apart."},
    ],
    "C": [
        {"route": "#/garden", "prep": "plot", "anchor": "#edit", "title": "Draw your plot", "clip": "trace_plot",
         "body": "Tap Edit plan, then trace your boundary on a satellite map - or just type its size.",
         "why": "With the real shape and size, everything you add is to scale."},
        {"route": "#/garden", "prep": "plot", "anchor": "svg.plot", "title": "Beds and features", "clip": "add_bed",
         "body": "Drop in beds, paths, a greenhouse, compost bins. Drag to move; set sizes in the box that pops up.",
         "why": "A map of the plot makes planning and jobs much quicker on a big site."},
        {"route": "#/garden", "prep": "plot", "anchor": ".month-row", "title": "Plant and space", "clip": "add_veg",
         "body": "Slide through the year to see what's growing where. Each bed shows how full it is.",
         "why": "Beds fill and empty through the year - this shows the gaps you can fill."},
        {"route": "#/garden", "prep": "plot", "anchor": '.tabs a[data-tab="garden"]', "title": "Moving crops around",
         "body": "When a bed's picked, we suggest what to grow next so plant families move around. On the sample allotment, try Year 1 / Year 2.",
         "why": "Moving crops each year stops pests and diseases building up in the soil."},
        {"route": "#/", "anchor": ".stats", "title": "Jobs, calendar and shopping",
         "body": "This week's jobs, what's coming up, and your shopping list - all tied to your plan.",
         "why": "One list each week means nothing gets forgotten."},
        {"route": "#/plants", "prep": "groups", "anchor": '[data-pgroup="groups"]', "title": "Show everything",
         "body": "There's more: plants that grow well together, flower beds, seed saving and badges. Explore when you're ready.",
         "why": "", "optional": True},
    ],
}
CLOSER = {"route": "#/", "anchor": "#checklist, .today-head", "title": "You're set up",
          "body": "First job: add your first crop. The checklist ticks itself off as you go."}
CONFIDENT_EXTRA = {"route": "#/plants", "prep": "groups", "anchor": '[data-pgroup="groups"]', "title": "When you're ready",
                   "body": "Grow-together groups, rows sown a few weeks apart for a steady supply, and capacity checks for every bed."}


def tour(profile, path=None):
    """The steps for this person: their path, with 'why this matters' for beginners and a shorter tour for the
    confident. Always ends with the checklist."""
    a = answers(profile)
    path = path if path in TOURS else path_for(profile)
    steps = [dict(s) for s in TOURS[path]]
    if a["experience"] == "confident":
        steps = steps[:3] + [dict(CONFIDENT_EXTRA)]
    for s in steps:
        if a["experience"] != "beginner":
            s.pop("why", None)
    return {"path": path, "steps": steps + [dict(CLOSER)]}


# ---- the starter plan: 3 to 5 things to start now ---------------------------------------------------------
KID_FAVOURITES = {"radish", "sunflower", "peas", "nasturtium", "strawberries", "salad", "potatoes", "pumpkin", "cress", "sweet_pea"}
COOKING = {"onions", "garlic", "tomatoes", "chillies", "basil", "parsley", "coriander", "chives", "potatoes", "courgette"}
FRUIT_GROUPS = ("fruit",)


def starter_plan(profile, today, shift):
    """Things to start now (or within the next few weeks), chosen for the space, goals, time and experience.
    Returns [{plant_id, method, from, to}] - 3 to 5 of them (fewer and easier with little time)."""
    a = answers(profile)
    goals, pots = set(a["goals"] or ["veg"]), a["space"] == "pots"
    most = 3 if a["time"] == "minimal" else 5

    def wanted(p):
        if pots and "pot" not in p["where"]:
            return False
        if a["time"] == "minimal" and p["level"] > 1:
            return False
        if a["experience"] == "beginner" and p["level"] > 2:
            return False
        ok = False
        if "veg" in goals and p["group"] == "veg" and p["family"] not in FRUIT_GROUPS:
            ok = True
        if "fruit" in goals and p["family"] in FRUIT_GROUPS:
            ok = True
        if "herbs_flowers" in goals and p["group"] in ("herb", "flower", "companion"):
            ok = True
        if "cooking" in goals and p["id"] in COOKING:
            ok = True
        if "kids" in goals and p["id"] in KID_FAVOURITES:
            ok = True
        return ok

    def score(p, start):
        s = (start - today).days
        if "kids" in goals and p["id"] in KID_FAVOURITES:
            s -= 30
        if "fruit" in goals and p["family"] in FRUIT_GROUPS:
            s -= 20
        return s + p["level"] * 5

    for horizon in (35, 70, 120):
        picks = []
        for p in catalogue.PLANTS:
            if not wanted(p):
                continue
            for m in planner.methods_for(p):
                win = planner.plan_anchor(p, m, today, shift)
                if win and (win[0] - today).days <= horizon:
                    picks.append((score(p, win[0]), p["id"], m, win))
                    break
        if len(picks) >= 3:
            break
    picks.sort()
    return [{"plant_id": pid, "method": m, "from": w[0].isoformat(), "to": w[1].isoformat()} for _, pid, m, w in picks[:most]]


# ---- sample gardens ----------------------------------------------------------------------------------------
# Ordinary beds, crops and features marked is_sample - the same screens show and edit them. Dates are offsets
# from today (days ago), worked out when the sample is loaded, so it always looks mid-season.
SAMPLES = {
    "A": {"name": "Sunny Balcony", "spaces": [
        {"name": "Grow bag 1", "kind": "pot", "pot_size": "growbag", "crops": [
            {"plant_id": "tomatoes", "variety": "Gardener's Delight", "quantity": 3, "method": "plants", "planted": 70, "harvested": 6}]},
        {"name": "Grow bag 2", "kind": "pot", "pot_size": "growbag", "crops": [
            {"plant_id": "chillies", "quantity": 3, "method": "plants", "planted": 45}]},
        {"name": "Window box", "kind": "pot", "pot_size": "trough", "crops": [
            {"plant_id": "salad", "variety": "Salad Bowl", "quantity": 8, "method": "sow_out", "sown": 3}]},
        {"name": "Herb pot (basil)", "kind": "pot", "pot_size": "p20", "crops": [
            {"plant_id": "basil", "quantity": 1, "method": "plants", "planted": 30}]},
        {"name": "Herb pot (parsley)", "kind": "pot", "pot_size": "p20", "crops": [
            {"plant_id": "parsley", "quantity": 2, "method": "sow_in", "sown": 50, "planted": 20}]},
        {"name": "Big pot", "kind": "pot", "pot_size": "p40", "crops": [
            {"plant_id": "french_beans", "variety": "Purple Teepee", "quantity": 6, "method": "sow_out", "sown": 25}]},
    ]},
    "B": {"name": "Backyard Beds", "spaces": [
        {"name": "Bed 1", "kind": "bed", "w": 1.2, "l": 2.4, "x": 0.5, "y": 0.5, "crops": [
            {"plant_id": "carrots", "variety": "Nantes 2", "quantity": 30, "method": "sow_out", "sown": 50},
            {"plant_id": "onions", "variety": "Sturon", "quantity": 30, "method": "sow_out", "sown": 80},
            {"plant_id": "salad", "variety": "Little Gem", "quantity": 6, "method": "sow_out", "sown": 20}]},
        # deliberately a bit tight - the "slightly over capacity" warning shows (within the 10% allowed)
        {"name": "Bed 2", "kind": "bed", "w": 1.2, "l": 2.4, "x": 2.3, "y": 0.5, "crops": [
            {"plant_id": "courgette", "variety": "Defender", "quantity": 3, "method": "plants", "planted": 30},
            {"plant_id": "french_beans", "variety": "Cobra", "quantity": 13, "method": "sow_out", "sown": 30}]},
        {"name": "Bed 3", "kind": "bed", "w": 1.2, "l": 2.4, "x": 4.1, "y": 0.5, "crops": []},
        {"name": "Border", "kind": "bed", "w": 0.6, "l": 3.0, "x": 5.9, "y": 0.5, "crops": [
            {"plant_id": "calendula", "quantity": 4, "method": "sow_out", "sown": 40},
            {"plant_id": "french_marigold", "quantity": 6, "method": "plants", "planted": 35}]},
    ]},
    "C": {"name": "The Allotment", "garden": [10, 20], "spaces": [
        {"name": "Legumes", "kind": "bed", "w": 1.2, "l": 4, "x": 1.2, "y": 3.5, "rotation": 0, "crops": [
            {"plant_id": "broad_beans", "variety": "Aquadulce Claudia", "quantity": 30, "method": "sow_out", "sown": 40}]},
        {"name": "Brassicas", "kind": "bed", "w": 1.2, "l": 4, "x": 1.2, "y": 8.5, "rotation": 1, "crops": [
            {"plant_id": "kale", "variety": "Nero di Toscana", "quantity": 9, "method": "plants", "planted": 50}]},
        {"name": "Roots", "kind": "bed", "w": 1.2, "l": 4, "x": 1.2, "y": 13.5, "rotation": 2, "crops": [
            {"plant_id": "carrots", "variety": "Nantes 2", "quantity": 60, "method": "sow_out", "sown": 60}]},
        {"name": "Potatoes", "kind": "bed", "w": 1.2, "l": 4, "x": 6.6, "y": 3.5, "rotation": 3, "crops": [
            {"plant_id": "potatoes", "variety": "Charlotte", "quantity": 14, "method": "sow_out", "sown": 100, "harvested": 10}]},
        {"name": "Alliums", "kind": "bed", "w": 1.2, "l": 4, "x": 6.6, "y": 8.5, "rotation": 4, "crops": [
            {"plant_id": "onions", "variety": "Sturon", "quantity": 60, "method": "sow_out", "sown": 90}]},
        {"name": "Fruit", "kind": "bed", "w": 1.2, "l": 4, "x": 6.6, "y": 13.5, "crops": [
            {"plant_id": "raspberries", "variety": "Autumn Bliss", "quantity": 8, "method": "plants", "planted": 200}]},
    ], "features": [
        {"kind": "shed", "name": "Shed", "x": 0.5, "y": 0.4, "w": 2.0, "h": 2.5},
        {"kind": "greenhouse", "name": "Greenhouse", "x": 3.2, "y": 0.4, "w": 2.4, "h": 1.8},
        {"kind": "compost", "name": "Compost bins", "x": 8.0, "y": 0.4, "w": 1.6, "h": 1.0},
        {"kind": "path", "name": "Path", "x": 4.4, "y": 3.0, "w": 1.0, "h": 16.5},
    ]},
}
SAMPLE_FOR_SPACE = {"pots": "A", "small": "B", "medium": "C", "large": "C"}


def dated(days_ago, today):
    return (today - timedelta(days=days_ago)).isoformat() if days_ago is not None else None
