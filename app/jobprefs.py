"""Which kinds of job a person wants to see. Not everyone buys seeds, saves seed or tidies tools, so each kind can be
switched off. Hidden jobs leave Today, the calendar, the phone reminders and the calendar feed; nothing is deleted, and
switching a kind back on brings its jobs back. The choice is stored as a list of hidden group ids on the user."""
import json

# id, emoji, name, what it covers, the job kinds (planner and winter) that belong to it
GROUPS = [
    ("buy", "🛒", "Buying seeds and plants", "Reminders to order or pick up what you need", ["buy"]),
    ("sow", "🌱", "Sowing and planting out", "When to sow, plant and set things out", ["sow_in", "sow_out", "plant_out", "batch"]),
    ("care", "💧", "Looking after plants", "Thinning, feeding, watering, tying in and weeding", ["care"]),
    ("protect", "🛡️", "Protecting from pests and weather", "Nets, fleece, mesh, slugs and frost cover", ["protect"]),
    ("prep", "🪵", "Getting ready", "Building supports, chitting potatoes and similar", ["prep"]),
    ("harvest", "🧺", "Picking", "When it's ready to pick", ["harvest"]),
    ("eat", "😋", "Eating and storing", "Ideas for eating, freezing and keeping what you grow", ["eat", "store"]),
    ("seeds", "🌾", "Saving your own seeds", "For people who like to grow from their own seed", ["seeds"]),
    ("winter", "❄️", "Winter jobs", "Tidying beds, tools, pruning, frost-proofing and keeping plants over winter", ["overwinter"]),
]
BY_ID = {g[0]: g for g in GROUPS}
GROUP_OF = {kind: g[0] for g in GROUPS for kind in g[4]}


def describe():
    return [{"id": g[0], "emoji": g[1], "name": g[2], "about": g[3]} for g in GROUPS]


def hidden_of(user):
    try:
        ids = json.loads(user.get("job_hidden") or "[]")
    except ValueError:
        return set()
    return {i for i in ids if i in BY_ID}


def clean(ids):
    return sorted({i for i in ids if i in BY_ID}, key=[g[0] for g in GROUPS].index)


def visible(jobs, hidden):
    """The jobs left once hidden groups are taken out. Kinds that aren't in any group are always shown."""
    if not hidden:
        return list(jobs)
    return [j for j in jobs if GROUP_OF.get(j["kind"]) not in hidden]
