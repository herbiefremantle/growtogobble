"""UK postcode -> growing region -> how many days to shift the catalogue's planting dates.

The catalogue (app/plants.py) is written for central England. Warmer places (Cornwall, the south coast) can
start earlier in spring; colder places (northern England, Scotland) start later - and in autumn it's the other
way round, as the cold arrives sooner up north. This is a rule of thumb based on typical last-frost dates, not
a forecast; the weather alerts (app/alerts.py) cover the real thing.

We only ever keep the "outward" half of a postcode (e.g. "SW1A" from "SW1A 1AA") - it's enough to place
someone and doesn't pinpoint their house.
"""
import re

REGIONS = {
    "sw":      {"name": "South West coast & Channel Islands", "short": "the South West", "shift": -14, "last_frost": "early April", "lat": 50.4, "lon": -4.6},
    "south":   {"name": "Southern England & South Wales", "short": "the South", "shift": -7, "last_frost": "late April", "lat": 51.3, "lon": -0.8},
    "central": {"name": "Central & Eastern England", "short": "central England", "shift": 0, "last_frost": "early May", "lat": 52.5, "lon": -1.5},
    "north":   {"name": "Northern England, North & Mid Wales, NI & Isle of Man", "short": "the North", "shift": 7, "last_frost": "mid May", "lat": 54.0, "lon": -2.3},
    "scot":    {"name": "Southern & Central Scotland", "short": "Scotland", "shift": 14, "last_frost": "late May", "lat": 55.9, "lon": -3.8},
    "high":    {"name": "Scottish Highlands & Islands", "short": "the Highlands", "shift": 21, "last_frost": "early June", "lat": 57.5, "lon": -4.2},
}

# Postcode areas (the leading letters) by region. Anything not listed counts as central.
_AREAS = {
    "sw": "TR PL TQ EX JE GY",
    "south": ("BN BH BR CM CR CT DA DT E EC EN GU HA IG KT ME N NW PO RH RM SE SL SM SO SP SS SW TN TW UB W WC WD "
              "BA BS TA SN RG OX HP LU SG AL CF SA NP"),
    "north": ("YO HU LS BD HX HD HG WF M OL BL WN WA L PR BB FY LA CA NE SR DH DL TS BT LL SY LD IM CH SK "
              "S DN"),
    "scot": "EH G KA ML PA FK KY DD AB TD DG PH",
    "high": "IV KW HS ZE",
}
AREA_TO_REGION = {area: region for region, areas in _AREAS.items() for area in areas.split()}

_OUTCODE = re.compile(r"^([A-Z]{1,2})([0-9][A-Z0-9]?)$")
_FULL = re.compile(r"^([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})$")


def outcode(postcode):
    """'sw1a 1aa' -> 'SW1A'; 'M1' -> 'M1'. None if it doesn't look like a UK postcode."""
    pc = re.sub(r"\s+", " ", (postcode or "").strip().upper())
    m = _FULL.match(pc)
    if m:
        return m.group(1)
    pc = pc.replace(" ", "")
    if _OUTCODE.match(pc):
        return pc
    return None


def region_for(outcode_):
    m = _OUTCODE.match(outcode_ or "")
    if not m:
        return "central"
    return AREA_TO_REGION.get(m.group(1), "central")
