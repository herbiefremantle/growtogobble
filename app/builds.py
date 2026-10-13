"""Build It: step-by-step guides for the things veg need - supports, covers and a cold frame.

Each guide: what it's for and which plants need it, how hard and how long, what to buy (with rough UK prices and
shop links), the tools, and the steps. Every step has a picture, drawn by the app (see BUILD_ART in static/app.js) -
`pic` is how far through the build that picture is.

Prices are rough, for budgeting - shops change them. Shop links search the shop for that item, so they don't break
when a product sells out, and they go through shops.py, so affiliate codes are added in one place.
"""
from . import shops

# which shops sell each kind of thing (ids from shops.BUILD_SHOPS)
GARDEN = ["thompson_morgan", "suttons", "bq", "wickes", "amazon"]
DIY = ["bq", "wickes", "amazon"]

BUILDS = [
    {"id": "raised_bed", "name": "Raised bed", "emoji": "🟫", "section": "beds", "level": "Medium", "time": "2-3 hours", "size": "1.2 x 2.4m, 30cm deep",
     "why": "A raised bed warms up quicker in spring, drains well, and keeps paths and beds apart, so you never tread on the "
            "soil you grow in. 1.2m wide means you can reach the middle from either side.",
     "for": ["carrots", "salad", "onions", "garlic", "beetroot", "radish", "strawberries", "chard", "spring_onions", "potatoes", "courgette", "kale",
             "leeks", "parsnips", "peas", "french_beans", "broad_beans"], "lead_weeks": 3, "needs_no_bed": True,
     "materials": [
         {"name": "Treated timber boards, 150 x 38mm x 2.4m", "qty": 6, "pack": "each", "packs": 6, "price": 10.0, "search": "treated timber board 150 x 38mm 2.4m", "shops": DIY,
          "note": "4 for the long sides, 2 cut in half for the ends"},
         {"name": "Treated timber post, 47 x 50mm x 1.8m", "qty": 1, "pack": "each", "packs": 1, "price": 6.0, "search": "treated timber post 47 x 50mm", "shops": DIY,
          "note": "cut into 4 corner posts"},
         {"name": "Exterior wood screws, 5 x 70mm", "qty": 1, "pack": "box", "packs": 1, "price": 7.0, "search": "exterior wood screws 5 x 70mm", "shops": DIY},
         {"name": "Plain brown cardboard", "qty": 1, "pack": "enough to cover the bottom", "packs": 0, "price": 0.0, "free": True},
         {"name": "To fill it - pick one:", "choose": [
             {"name": "Peat-free compost, 15 bags of 50 litres", "for": "a small bed, carried in by hand", "price": 82.5, "search": "peat free compost 50 litre"},
             {"name": "Bulk bag of topsoil and compost mix", "for": "a bed or two, delivered", "price": 90.0, "search": "bulk bag topsoil compost mix"},
         ], "shops": GARDEN},
     ],
     "tools": ["Saw", "Drill or screwdriver", "Tape measure and pencil", "Spirit level", "Spade"],
     "steps": [
         {"pic": 1, "text": "Pick a flat, sunny spot and mark out a rectangle 1.2m x 2.4m. No need to dig or lift the grass."},
         {"pic": 2, "text": "Cut two boards in half to make four 1.2m end pieces. Cut the post into four 40cm corner posts."},
         {"pic": 3, "text": "Make each end: lay two 1.2m boards on top of each other and screw them to a post at each end, with the posts on the inside. Two screws per board into each post."},
         {"pic": 4, "text": "Stand the two ends up and screw the long 2.4m boards onto the posts to make a box. Measure corner to corner both ways - if the two match, it's square."},
         {"pic": 5, "text": "Move it into place. Push the corner posts into the ground (they stick out 10cm below the boards) and check it's level."},
         {"pic": 6, "text": "Lay cardboard over the bottom, overlapping so there are no gaps, and soak it. Fill to the top with compost - it'll sink a bit, so top it up after a few weeks."},
     ],
     "tips": ["Never use old railway sleepers for food - many were treated with creosote.",
              "Treated timber lasts about 10 years; untreated about 3-5.",
              "Leave 45-60cm between beds for paths - enough for a wheelbarrow."],
     "ready_made": {"text": "Rather buy one? Raised bed kits of this size cost about £50-120.", "search": "raised bed kit"}},
    {"id": "bean_wigwam", "name": "Bean wigwam", "emoji": "⛺", "section": "supports", "level": "Easy", "time": "20 minutes",
     "why": "Climbing beans grow 2m tall and need something to wind round. A wigwam of canes is quick, strong, "
            "takes up little room and looks great.",
     "for": ["runner_beans", "french_beans", "sweet_pea"], "lead_weeks": 1,
     "materials": [
         {"name": "Bamboo canes, 2.4m", "qty": 8, "pack": "pack of 10", "packs": 1, "price": 8.0, "search": "bamboo canes 2.4m", "shops": GARDEN},
         {"name": "Garden twine", "qty": 1, "pack": "100m roll", "packs": 1, "price": 3.0, "search": "garden twine", "shops": GARDEN},
     ],
     "tools": ["Scissors", "A stick to mark the circle"],
     "steps": [
         {"pic": 1, "text": "Pick a sunny spot and mark a circle about 1m across on the soil."},
         {"pic": 2, "text": "Push 8 canes in evenly round the circle, 20-30cm deep, each leaning in towards the middle."},
         {"pic": 3, "text": "Pull the tops together and tie them tightly where they cross, about 20cm from the top. Wrap the string round several times, then knot it."},
         {"pic": 4, "text": "For extra strength, wind string round all the canes at about knee height."},
         {"pic": 5, "text": "Plant one bean at the foot of each cane, just outside the circle. They'll wind up on their own - nudge any strays back onto their cane."},
     ],
     "tips": ["Build it before planting, so you don't spear the roots.", "In windy spots, push the canes in deeper - a full wigwam of beans catches a lot of wind."]},

    {"id": "bean_aframe", "name": "A-frame bean row", "emoji": "🔺", "section": "supports", "level": "Medium", "time": "1 hour",
     "why": "For a longer row of climbing beans. Two lines of canes lean in and cross at the top, with a cane along the ridge "
            "holding it all together. Picking is easy from both sides.",
     "for": ["runner_beans", "french_beans", "sweet_pea"], "lead_weeks": 1,
     "materials": [
         {"name": "Bamboo canes, 2.4m", "qty": 18, "pack": "pack of 10", "packs": 2, "price": 8.0, "search": "bamboo canes 2.4m", "shops": GARDEN,
          "note": "16 for a 3m row, plus 2 along the top"},
         {"name": "Garden twine", "qty": 1, "pack": "100m roll", "packs": 1, "price": 3.0, "search": "garden twine", "shops": GARDEN},
     ],
     "tools": ["Scissors", "Tape measure"],
     "steps": [
         {"pic": 1, "text": "Mark two straight lines along the bed, 45-60cm apart."},
         {"pic": 2, "text": "Push canes in along both lines every 30-40cm, 20-30cm deep, each one opposite a cane on the other line."},
         {"pic": 3, "text": "Lean each pair in so they cross about 20cm below the top, and tie them together."},
         {"pic": 4, "text": "Lay a cane along the top, in the V where the pairs cross, and tie it at every crossing. This stops the row leaning over."},
         {"pic": 5, "text": "Plant a bean at the foot of each cane. Beans will cover the whole frame by midsummer."},
     ],
     "tips": ["Run the row north to south so both sides get sun.", "For extra strength, tie a cane diagonally across each end."]},

    {"id": "pea_frame", "name": "Pea netting frame", "emoji": "🫛", "section": "supports", "level": "Easy", "time": "30 minutes",
     "why": "Peas hold on with little curly tendrils. They need a net or twiggy sticks about 1-1.5m tall to grab, or they flop "
            "on the ground and rot.",
     "for": ["peas", "sweet_pea"], "lead_weeks": 1,
     "materials": [
         {"name": "Bamboo canes, 1.8m", "qty": 6, "pack": "pack of 10", "packs": 1, "price": 6.0, "search": "bamboo canes 1.8m", "shops": GARDEN},
         {"name": "Pea and bean netting, 2m x 5m", "qty": 1, "pack": "one net", "packs": 1, "price": 5.0, "search": "pea and bean netting", "shops": GARDEN},
         {"name": "Garden twine (or cable ties)", "qty": 1, "pack": "100m roll", "packs": 1, "price": 3.0, "search": "garden twine", "shops": GARDEN},
     ],
     "tools": ["Scissors"],
     "steps": [
         {"pic": 1, "text": "Push a cane in at each end of the row and one every metre between, about 20cm deep."},
         {"pic": 2, "text": "Tie a cane along the top to join them up - it keeps the net straight."},
         {"pic": 3, "text": "Hang the netting along the canes and tie it on at the top, middle and bottom of each cane."},
         {"pic": 4, "text": "Sow or plant peas along both sides of the net. Guide the first tendrils onto it - after that they climb by themselves."},
     ],
     "tips": ["Free alternative: twiggy sticks (hazel or birch prunings) pushed in along the row - the old way, and it works brilliantly.",
              "Keep the net pulled taut so birds don't get tangled in it."]},

    {"id": "tomato_stakes", "name": "Tomato stakes and ties", "emoji": "🍅", "section": "supports", "level": "Easy", "time": "15 minutes",
     "why": "Tall (cordon) tomatoes, peppers, chillies and aubergines get heavy with fruit. A cane and a few soft ties stop "
            "them snapping or flopping over.",
     "for": ["tomatoes", "tomatoes_big", "peppers", "chillies", "aubergine"], "lead_weeks": 1,
     "materials": [
         {"name": "Bamboo canes, 1.8m", "qty": 10, "pack": "pack of 10", "packs": 1, "price": 6.0, "search": "bamboo canes 1.8m", "shops": GARDEN,
          "note": "1 per plant (1m canes for peppers and chillies)"},
         {"name": "Soft garden twine or plant ties", "qty": 1, "pack": "roll", "packs": 1, "price": 3.0, "search": "soft garden twine plant ties", "shops": GARDEN},
     ],
     "tools": ["Scissors"],
     "steps": [
         {"pic": 1, "text": "Push a cane in 5cm from where each plant will go, about 30cm deep. Do this before planting so you don't spear the roots."},
         {"pic": 2, "text": "Plant the tomato next to its cane."},
         {"pic": 3, "text": "Tie the stem to the cane in a loose figure-of-eight: round the cane, cross over, round the stem. Leave room for the stem to fatten."},
         {"pic": 4, "text": "Add another tie every 20-30cm as it grows. Pinch out the side shoots that grow in the 'armpits' between leaf and stem."},
     ],
     "tips": ["Bush and tumbling tomatoes don't need a cane - just tall ones.", "Never tie tightly - the stem gets much thicker over summer."]},

    {"id": "tomato_strings", "name": "Tomato string supports", "emoji": "🧵", "section": "supports", "level": "Easy", "time": "30 minutes",
     "why": "Instead of canes, each plant climbs a string hung from above. It's cheap, quick and perfect in a greenhouse "
            "or over growbags, where canes won't go in deep.",
     "for": ["tomatoes", "tomatoes_big", "cucumber"], "lead_weeks": 1,
     "materials": [
         {"name": "Tomato twine (polypropylene string)", "qty": 1, "pack": "roll", "packs": 1, "price": 4.0, "search": "tomato twine", "shops": GARDEN},
         {"name": "Treated wooden stakes, 1.8m x 50mm", "qty": 2, "pack": "each", "packs": 2, "price": 5.0, "search": "treated wooden stake 1.8m", "shops": DIY,
          "note": "outdoors only - in a greenhouse, use the roof bars"},
         {"name": "Treated timber batten, 2.4m", "qty": 1, "pack": "each", "packs": 1, "price": 4.0, "search": "treated timber batten 2.4m", "shops": DIY,
          "note": "outdoors only"},
         {"name": "Exterior wood screws, 4 x 50mm", "qty": 1, "pack": "box", "packs": 1, "price": 5.0, "search": "exterior wood screws 4 x 50mm", "shops": DIY,
          "note": "outdoors only"},
     ],
     "tools": ["Scissors", "Mallet or hammer (outdoors)", "Drill or screwdriver (outdoors)"],
     "steps": [
         {"pic": 1, "text": "In a greenhouse, skip to step 2. Outdoors, hammer in two stakes 2.4m apart behind your plants, then screw the batten across the top."},
         {"pic": 2, "text": "Tie a string to the bar above where each plant will go, long enough to reach the ground."},
         {"pic": 3, "text": "Plant the tomato. Tie a loose loop of the string round the bottom of the stem, under the lowest leaves - or bury the end under the rootball."},
         {"pic": 4, "text": "Once a week, gently twist the top of the plant round the string - once round every few leaves - so it climbs it."},
     ],
     "tips": ["In a greenhouse this costs about £4 - just the string.", "Cucumbers can climb strings the same way."]},

    {"id": "hoop_tunnel", "name": "Hoop tunnel cover", "emoji": "🌈", "section": "covers", "level": "Easy", "time": "30 minutes",
     "why": "Hoops over a bed hold a cover off your plants. Use netting to stop pigeons and cabbage white butterflies, fine "
            "insect mesh to keep out carrot fly and leaf miners, or fleece to keep off frost.",
     "for": ["kale", "broccoli", "cauliflower", "sprouts", "carrots", "parsnips", "leeks", "onions", "garlic", "peas", "french_beans",
             "salad", "radish", "beetroot", "chard", "spring_onions", "broad_beans"], "lead_weeks": 0,
     "materials": [
         {"name": "MDPE water pipe, 20mm x 10m", "qty": 1, "pack": "coil", "packs": 1, "price": 14.0, "search": "MDPE water pipe 20mm 10m", "shops": DIY,
          "note": "makes 6 hoops for a 1.2m-wide bed"},
         {"name": "Bamboo canes, 60cm", "qty": 12, "pack": "pack of 20", "packs": 1, "price": 4.0, "search": "bamboo canes 60cm", "shops": GARDEN},
         {"name": "Ground pegs", "qty": 20, "pack": "pack of 20", "packs": 1, "price": 4.0, "search": "garden ground pegs", "shops": GARDEN},
         {"name": "Cover - pick one:", "choose": [
             {"name": "Bird and butterfly netting, 2m x 5m", "for": "pigeons and caterpillars", "price": 6.0, "search": "butterfly netting 2m x 5m"},
             {"name": "Insect mesh (enviromesh), 2m x 5m", "for": "carrot fly and leaf miner", "price": 15.0, "search": "enviromesh insect mesh"},
             {"name": "Garden fleece, 2m x 10m", "for": "frost", "price": 6.0, "search": "garden fleece 2m x 10m"},
         ], "shops": GARDEN},
     ],
     "tools": ["Saw or sharp knife (to cut the pipe)", "Tape measure"],
     "steps": [
         {"pic": 1, "text": "Cut the pipe into lengths of about 1.6m - one for every metre of bed, plus one."},
         {"pic": 2, "text": "Push a short cane halfway into the ground on each side of the bed, every metre along."},
         {"pic": 3, "text": "Slide each end of a pipe over a cane, so it makes a hoop over the bed."},
         {"pic": 4, "text": "Throw the cover over the hoops and pull it taut, with no gaps."},
         {"pic": 5, "text": "Peg or weigh down the edges all round - pigeons and carrot fly will find any gap. Lift one side to weed and water."},
     ],
     "tips": ["Netting: pigeons, butterflies (cabbages, kale, broccoli). Mesh: carrot fly, leaf miner (carrots, leeks, onions). Fleece: frost.",
              "Take fleece off on warm days so plants don't overheat."]},

    {"id": "bottle_cloche", "name": "Bottle cloches", "emoji": "🧴", "section": "covers", "level": "Easy", "time": "5 minutes",
     "why": "A plastic bottle over a seedling is a mini greenhouse: it keeps it warm on cold nights and stops slugs getting "
            "at it while it's small. Free, and a good job for kids (with a grown-up for the cutting).",
     "for": ["courgette", "squash", "summer_squash", "pumpkin", "cucumber", "melon", "sweetcorn", "salad", "sweet_potatoes"], "lead_weeks": 0,
     "materials": [
         {"name": "Clear plastic bottles, 2 litres", "qty": 1, "pack": "one per plant", "packs": 0, "price": 0.0, "free": True},
     ],
     "tools": ["Scissors or a craft knife (grown-ups start the cut)"],
     "steps": [
         {"pic": 1, "text": "Wash the bottle and peel off the label so the light gets in."},
         {"pic": 2, "text": "Cut the bottom off. A grown-up starts the cut with a knife, then scissors are fine."},
         {"pic": 3, "text": "Push it over the seedling, twisting so the edge sinks about 2cm into the soil - slugs can't get under."},
         {"pic": 4, "text": "Lid on for cold nights, lid off on warm days to let air in. Lift it off when the plant touches the sides."},
     ],
     "tips": ["Push a thin cane through the neck to stop it blowing away.", "Big 5-litre water bottles work for courgettes and squash."]},

    {"id": "cold_frame", "name": "Cold frame", "emoji": "🪟", "section": "coldframe", "level": "Medium", "time": "2-3 hours",
     "why": "A low box with a clear lid - somewhere between indoors and out. Use it to harden off seedlings before they go "
            "in the ground, start sowings early in spring, and keep salad going into winter.",
     "for": ["tomatoes", "tomatoes_big", "chillies", "peppers", "courgette", "squash", "summer_squash", "pumpkin", "sweetcorn", "cucumber",
             "melon", "aubergine", "salad", "runner_beans", "french_beans"], "lead_weeks": 3, "size": "about 120 x 60cm",
     "materials": [
         {"name": "Treated fence boards, 1.8m x 150 x 22mm", "qty": 6, "pack": "each", "packs": 6, "price": 4.5, "search": "treated fence board 1.8m 150mm", "shops": DIY},
         {"name": "Treated timber batten, 38 x 38mm x 1.8m", "qty": 2, "pack": "each", "packs": 2, "price": 4.5, "search": "treated timber batten 38 x 38mm", "shops": DIY,
          "note": "for the corner posts and the lid"},
         {"name": "Twinwall polycarbonate sheet, 1220 x 610 x 4mm", "qty": 1, "pack": "sheet", "packs": 1, "price": 20.0, "search": "twinwall polycarbonate sheet 4mm", "shops": DIY,
          "note": "or use an old window - free"},
         {"name": "Butt hinges, 75mm", "qty": 2, "pack": "pair", "packs": 1, "price": 4.0, "search": "butt hinges 75mm", "shops": DIY},
         {"name": "Exterior wood screws, 4 x 40mm", "qty": 1, "pack": "box of 100", "packs": 1, "price": 6.0, "search": "exterior wood screws 4 x 40mm", "shops": DIY},
     ],
     "tools": ["Saw", "Drill or screwdriver", "Tape measure and pencil"],
     "steps": [
         {"pic": 1, "text": "Cut the boards: 3 lengths of 120cm (two for the back, one for the front) and 4 of 60cm for the sides. Cut the top side boards on a slant, so the box is 30cm high at the back and 15cm at the front."},
         {"pic": 2, "text": "Cut 4 corner posts from a batten: two 30cm (back) and two 15cm (front)."},
         {"pic": 3, "text": "Screw the boards to the posts to make a box - two boards high at the back, one at the front, the slanted ones at the sides."},
         {"pic": 4, "text": "Make the lid: screw battens into a 120 x 60cm frame, then screw the polycarbonate on top. Drill holes first, and don't over-tighten."},
         {"pic": 5, "text": "Hinge the lid to the back of the box. Put the frame somewhere sunny and sheltered, with the low side facing south."},
     ],
     "tips": ["Hardening off: lid open by day, closed at night, for 1-2 weeks before planting out.",
              "Prop the lid open with a stick on sunny days - it gets hot inside fast."],
     "ready_made": {"text": "Rather buy one? Ready-made cold frames cost about £35-80.", "search": "cold frame"}},
]
SECTIONS = [("beds", "Raised beds"), ("supports", "Supports for climbers"), ("covers", "Covers to protect your veg"), ("coldframe", "Cold frame")]


def _cost(m):
    if m.get("choose"):
        return m["choose"][0]["price"]
    return m["packs"] * m["price"]


def payload():
    """The guides, with shop links on every item and a rough total (taking the first choice where there's a choice)."""
    out = []
    for b in BUILDS:
        mats = []
        for m in b["materials"]:
            m = dict(m)
            if m.get("choose"):
                m["choose"] = [dict(c, links=shops.build_links(c["search"], m["shops"])) for c in m["choose"]]
            elif m.get("search"):
                m["links"] = shops.build_links(m["search"], m["shops"])
            m["cost"] = _cost(m)
            m.pop("shops", None)
            mats.append(m)
        b2 = dict(b, materials=mats, total=round(sum(m["cost"] for m in mats), 2))
        if b.get("ready_made"):
            b2["ready_made"] = dict(b["ready_made"], links=shops.build_links(b["ready_made"]["search"], GARDEN))
        out.append(b2)
    return {"builds": out, "sections": [{"id": k, "name": n} for k, n in SECTIONS]}
