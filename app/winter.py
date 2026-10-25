"""Winter jobs that belong to the whole garden or to a fruit tree or bush, rather than to one crop.

(Winter jobs for particular crops - firming in leeks, forcing rhubarb, checking stored onions - are in extras.SEASONAL
and planner.crop_jobs.) These come round every year, each year's tick separate: the key ends in the year the window
starts, e.g. g:beds:2026.
"""
from datetime import date

from . import planner
from . import plants as catalogue

DAY = planner.DAY

# key, emoji, window (mm-dd start, end), title, steps, when it applies
GARDEN = [
    {"key": "beds", "emoji": "🛏️", "window": ["11-01", "11-30"], "needs": "bed",
     "title": "Put your empty beds to bed for winter",
     "steps": ["Pull up any finished plants and put them on the compost heap (not diseased ones - bin those) 🧺",
               "Pull out weeds, roots and all 🌿",
               "Spread about 5cm of compost over the top - the worms will pull it down for you, no digging needed 🪱",
               "Cover with plain cardboard or a thick mulch to stop weeds and heavy rain damaging the soil",
               "Leave a few plants standing for the birds and insects if you like - it's good for wildlife 🐞"]},
    {"key": "water", "emoji": "💧", "window": ["11-01", "11-25"], "needs": "bed",
     "title": "Frost-proof your water",
     "steps": ["Drain the hosepipe, coil it and put it in the shed - frozen water splits it 🧯",
               "Turn off any outside tap at the inside valve and let the tap drain",
               "If you've a water butt, leave it a bit below full - ice needs room to expand, and a full butt can crack",
               "Take the watering can in so it doesn't crack either"]},
    {"key": "tools", "emoji": "🧰", "window": ["12-15", "01-31"], "needs": "bed",
     "title": "Clean, sharpen and oil your tools",
     "steps": ["Scrub the mud off spades, forks and trowels with a wire brush 🪥",
               "Sharpen the edges of spades and secateurs with a file or sharpening stone",
               "Wipe all the metal with an oily rag (a drop of cooking oil works) so it doesn't rust",
               "Wipe the handles with linseed oil or sand off any splinters"]},
    {"key": "plan", "emoji": "📋", "window": ["12-01", "12-31"], "needs": "grower",
     "title": "Plan next year's garden",
     "steps": ["Have a look at what worked and what didn't - make a few notes while you remember 📝",
               "Plan where each family of crops goes next year - move them round so pests and diseases don't build up. Try the Year 2 view in My garden",
               "Make a list of seeds to order - the best varieties sell out in January 🛒",
               "Check old seed packets - most keep 2-3 years, but parsnips and onions only one"]},
    {"key": "clean", "emoji": "🧽", "window": ["01-15", "02-28"], "needs": "kit",
     "title": "Clean your pots, trays and greenhouse",
     "steps": ["Empty old compost from pots and trays onto the compost heap 🪴",
               "Scrub everything in warm soapy water (or a garden disinfectant) - old compost carries disease and slug eggs",
               "Wash the greenhouse glass inside and out - you get a lot more light in early spring ☀️",
               "Pick up and bin any dead leaves or plants lying about inside"]},
    {"key": "snow", "emoji": "❄️", "window": ["12-15", "02-15"], "needs": "cover",
     "title": "After snow or a hard frost: check your covers",
     "steps": ["Knock heavy snow off nets, fleece, cloches and cold-frame lids - the weight can snap hoops and glass 🧊",
               "Open cold-frame lids a little on mild days so plants don't rot in the damp",
               "Check any fleece is still tucked in and hasn't blown loose",
               "Do this again after each heavy snow - we'll also nudge you when it's forecast"]},
]
FRUIT_BARE = {"key": "bare", "emoji": "🌳", "window": ["11-15", "03-15"],
              "title": "Planting a fruit tree or bush? Winter's the cheap time",
              "steps": ["Bare-root trees and bushes (sold without a pot, November to March) cost about half the price of potted ones 💷",
                        "Order by early winter - the best varieties sell out",
                        "Plant as soon as they arrive, when the soil isn't frozen or soggy. Soak the roots for an hour first",
                        "Plant at the same depth as the soil mark on the stem, firm it in and water well. Stake trees against the wind"]}


def _window(window, today, shift):
    """The occurrence of a window that hasn't finished yet (this winter's, or next winter's)."""
    return planner.next_window([window], today, shift)


def _prune_text(fruit):
    """The winter-pruning advice for a fruit, or None if it should only be pruned in summer (or not at all)."""
    for line in fruit.get("care", []):
        if line.startswith("Prune in winter"):
            return line
    return None


def garden_jobs(spaces, features, crops, done, today, shift):
    """Winter jobs for the whole garden and for fruit trees and bushes, as job dicts (crop_id None)."""
    beds = [s for s in spaces if s["kind"] != "pot"]
    has = {
        "bed": bool(beds or spaces),
        "grower": bool(spaces or crops),
        "kit": any(s["kind"] == "pot" for s in spaces) or any(f["kind"] == "greenhouse" for f in features),
        "cover": any(f["kind"] == "greenhouse" for f in features) or bool(crops),
    }
    out = []

    def add(key, emoji, title, window, steps):
        win = _window(window, today, shift)
        if not win:
            return
        full = "g:%s:%d" % (key, win[0].year)
        is_done = full in done
        out.append({"key": full, "crop_id": None, "plant_id": None, "kind": "overwinter", "emoji": emoji, "title": title,
                    "start": win[0].isoformat(), "end": win[1].isoformat(), "action": "check", "steps": steps,
                    "status": planner._status(win[0], win[1], is_done, today)})

    for j in GARDEN:
        if has[j["needs"]]:
            add(j["key"], j["emoji"], j["title"], j["window"], j["steps"])
    fruit_by_id = {f["id"]: f for f in catalogue.FRUIT}
    fruit_features = [f for f in features if f["kind"] in ("tree", "bush") and f.get("variety") in fruit_by_id and not fruit_by_id[f["variety"]].get("plain")]
    for f in fruit_features:
        fruit = fruit_by_id[f["variety"]]
        text = _prune_text(fruit)
        if text:
            name = f.get("cultivar") or fruit["name"]
            add("prune%d" % f["id"], "✂️", "Prune your %s (while it's bare)" % name.lower(), ["11-15", "02-28"],
                [text, "Do it on a dry day when no hard frost is forecast ☀️",
                 "Take out dead, damaged and diseased wood first, then crossing branches, then anything crowding the middle",
                 "Never take off more than a quarter of the tree in one winter"])
    if fruit_features:
        add(FRUIT_BARE["key"], FRUIT_BARE["emoji"], FRUIT_BARE["title"], FRUIT_BARE["window"], FRUIT_BARE["steps"])
    out.sort(key=lambda j: j["start"])
    return out
