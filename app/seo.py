"""Public, crawlable pages so Google and AI assistants (ChatGPT, Claude, Perplexity...) can find and quote the app.

The app itself (static/app.js) is a logged-in single-page app that search engines and most AI crawlers can't read, so
everything worth finding is also published here as plain server-rendered HTML, made from the same catalogue the app uses:

  /grow                 every plant, fruit tree and bush
  /grow/<plant>         when to sow, plant and harvest it in the UK, how to grow it, pests, storage, FAQs
  /fruit/<fruit>        fruit trees and bushes
  /build, /build/<id>   the Build It guides (step by step, materials, costs)
  /sow/<month>          what to sow, plant and harvest in each month
  /sitemap.xml, /robots.txt, /llms.txt

Set SITE_URL on Railway if the address ever changes (default https://www.growtogobble.co.uk): it's used for canonical
links, the sitemap and social previews, whichever address a page was reached on.
"""
import html
import json
import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from . import builds, shops
from . import plants as catalogue

router = APIRouter()

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
GROUPS = [("veg", "Vegetables"), ("herb", "Herbs"), ("flower", "Flowers"), ("companion", "Companion plants")]
CACHE = {"Cache-Control": "public, max-age=3600"}
NAME = "Grow to Gobble"
TAGLINE = "The grow-your-own planner for UK gardens, allotments and patios"

e = html.escape


def site():
    return os.environ.get("SITE_URL", "https://www.growtogobble.co.uk").strip().rstrip("/")


def slug(pid):
    return pid.replace("_", "-")


def _plant(s):
    p = catalogue.BY_ID.get(s.replace("-", "_"))
    if not p:
        raise HTTPException(404, "No such plant")
    return p


def _fruit(s):
    f = catalogue.FRUIT_BY_ID.get(s.replace("-", "_"))
    if not f:
        raise HTTPException(404, "No such fruit")
    return f


def _build(s):
    for b in builds.payload()["builds"]:
        if b["id"] == s.replace("-", "_"):
            return b
    raise HTTPException(404, "No such guide")


def _month(s):
    s = s.lower()
    for i, m in enumerate(MONTHS):
        if m.lower() == s:
            return i + 1
    raise HTTPException(404, "No such month")


# ---- dates in words ------------------------------------------------------------------------------------

def _when(md):
    month, day = int(md[:2]), int(md[3:])
    return "%s %s" % ("early" if day <= 10 else "mid" if day <= 20 else "late", MONTHS[month - 1])


def windows_text(windows):
    return " or ".join("%s to %s" % (_when(a), _when(b)) for a, b in windows)


def _in_month(window, month):
    """True if the window (two MM-DD dates, which may run over New Year) touches the given month."""
    start, end = int(window[0][:2]), int(window[1][:2])
    return start <= month <= end if start <= end else month >= start or month <= end


def _months_of(windows):
    return [m for m in range(1, 13) if any(_in_month(w, m) for w in windows)]


def _clean(text):
    """The app's text has emoji for children; keep them out of titles and descriptions."""
    return "".join(ch for ch in text if ord(ch) < 0x2190 or ch in "£").strip()


# ---- the page shell ------------------------------------------------------------------------------------

CSS = """
:root { color-scheme: light dark; --bg:#f6f8f4; --card:#fff; --fg:#1d2a1f; --muted:#5b6b5e; --green:#1f5c3b; --link:#1f6b43; --line:#dfe6dc; --soft:#e9f1e6; }
@media (prefers-color-scheme: dark) { :root { --bg:#121813; --card:#1a221b; --fg:#e8efe9; --muted:#9fb0a3; --green:#7fd38a; --link:#8fdc99; --line:#2b362d; --soft:#1f2b21; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:17px/1.65 system-ui,-apple-system,"Segoe UI",sans-serif; }
a { color:var(--link); }
header.top { background:var(--card); border-bottom:1px solid var(--line); }
header.top .in { max-width:900px; margin:0 auto; padding:12px 20px; display:flex; flex-wrap:wrap; gap:10px 18px; align-items:center; }
header.top .brand { font-weight:800; font-size:1.15rem; text-decoration:none; color:var(--green); margin-right:auto; }
header.top nav a { text-decoration:none; font-weight:600; margin-right:14px; }
.btn { display:inline-block; background:var(--green); color:#fff !important; padding:10px 18px; border-radius:12px; font-weight:700; text-decoration:none; }
@media (prefers-color-scheme: dark) { .btn { color:#0b140d !important; } }
main { max-width:900px; margin:0 auto; padding:24px 20px 56px; }
h1 { font-size:2rem; line-height:1.2; margin:.3em 0 .3em; }
h2 { font-size:1.35rem; margin:1.8em 0 .5em; }
h3 { font-size:1.05rem; margin:1.2em 0 .2em; }
.lead { font-size:1.15rem; color:var(--muted); }
.crumbs { font-size:.9rem; color:var(--muted); }
.card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px; margin:14px 0; }
.facts { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:16px 0; padding:0; list-style:none; }
.facts li { background:var(--soft); border-radius:12px; padding:10px 12px; font-size:.95rem; }
.facts b { display:block; font-size:.78rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; padding:0; list-style:none; }
.grid a { display:block; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:10px 12px; text-decoration:none; }
.muted { color:var(--muted); font-size:.9rem; }
img.photo { width:100%; max-height:380px; object-fit:cover; border-radius:16px; }
table { border-collapse:collapse; width:100%; font-size:.95rem; }
td, th { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
.cta { background:var(--soft); border-radius:16px; padding:20px; margin:32px 0; text-align:center; }
footer.foot { max-width:900px; margin:0 auto; padding:0 20px 40px; color:var(--muted); font-size:.9rem; }
footer.foot a { margin-right:14px; }
"""


def _ld(data):
    """JSON-LD for a page. '<' is escaped so nothing in the text can close the script tag."""
    return '<script type="application/ld+json">%s</script>' % json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")


def layout(title, description, path, body, ld=None, image=None, robots="index,follow"):
    url = site() + path
    image = image or site() + "/static/icons/icon-512.png"
    description = e(description[:300])
    head = """<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<meta name="robots" content="%(robots)s">
<link rel="canonical" href="%(url)s">
<meta property="og:site_name" content="%(name)s">
<meta property="og:type" content="website">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="%(image)s">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(title)s">
<meta name="twitter:description" content="%(desc)s">
<meta name="twitter:image" content="%(image)s">
<meta name="theme-color" content="#1f5c3b">
<link rel="icon" href="/static/icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/icons/icon-192.png">
<style>%(css)s</style>
%(ld)s
</head>
<body>
<header class="top"><div class="in">
<a class="brand" href="/">%(name)s</a>
<nav><a href="/grow">Plants</a><a href="/build">Build it</a><a href="/sow/%(month)s">What to sow now</a></nav>
<a class="btn" href="/#/join">Start free</a>
</div></header>
<main>
""" % {"title": e(title), "desc": description, "robots": robots, "url": e(url), "name": NAME, "image": e(image),
       "css": CSS, "ld": "\n".join(_ld(x) for x in (ld or [])), "month": _this_month().lower()}
    foot = """
</main>
<footer class="foot">
<p><a href="/grow">All plants</a><a href="/build">Build it guides</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate disclosure</a></p>
<p>%(name)s - %(tag)s.</p>
</footer>
</body></html>
""" % {"name": NAME, "tag": TAGLINE}
    return head + body + foot


def _this_month():
    from . import clock
    return MONTHS[clock.now().month - 1]


def _crumbs(*items):
    """items: (label, path) pairs, the last one without a path."""
    bits = ['<a href="/">Home</a>'] + ['<a href="%s">%s</a>' % (e(p), e(l)) if p else e(l) for l, p in items]
    return '<p class="crumbs">%s</p>' % " &rsaquo; ".join(bits)


def _crumb_ld(*items):
    out = [{"@type": "ListItem", "position": 1, "name": "Home", "item": site() + "/"}]
    for i, (label, path) in enumerate(items, 2):
        out.append({"@type": "ListItem", "position": i, "name": label} | ({"item": site() + path} if path else {}))
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": out}


def _cta(text="Plan your own garden: it tells you what to do and when, for your postcode."):
    return ('<div class="cta"><p style="margin-top:0"><b>%s</b></p>'
            '<a class="btn" href="/#/join">Start growing - it\'s free</a></div>') % e(text)


def _links(items, sponsored=True):
    rel = ' rel="sponsored nofollow noopener" target="_blank"' if sponsored else ""
    return " &middot; ".join('<a href="%s"%s>%s</a>' % (e(i["url"]), rel, e(i["shop"])) for i in items)


def _ul(items):
    return "<ul>%s</ul>" % "".join("<li>%s</li>" % e(i) for i in items) if items else ""


def _ol(items):
    return "<ol>%s</ol>" % "".join("<li>%s</li>" % e(i) for i in items) if items else ""


# ---- plant pages --------------------------------------------------------------------------------------

def _windows(p):
    """(label, windows) for each stage this plant has."""
    rows = []
    if p.get("sow_in"):
        rows.append(("Sow indoors", p["sow_in"]))
    if p.get("sow_out"):
        rows.append(("Sow outdoors", p["sow_out"]))
    if p.get("plant_out"):
        rows.append(("Plant out" if p.get("sow_in") else "Plant", p["plant_out"]))
    if p.get("harvest"):
        rows.append(("Pick" if p.get("group") != "flower" else "In flower", p["harvest"]))
    return rows


def _how_steps(p):
    """The same how-to-plant steps as the app - with how deep and how far apart, in cm."""
    from . import planner
    clean = lambda steps: [_clean(s) for s in steps]
    blocks = []
    if p.get("sow_in"):
        blocks.append(("Starting it indoors", clean(planner._fmt(catalogue.STEPS_SOW_IN, p, sowing=True))))
    if p.get("sow_out"):
        blocks.append(("Sowing it outdoors", clean(planner.planting_steps(p, "sow_out"))))
    if p.get("plant_out"):
        steps = planner._fmt(catalogue.STEPS_PLANT_OUT_FROM_INDOORS, p) if p.get("sow_in") else planner.bought_steps(p)
        blocks.append(("Planting it out" if p.get("sow_in") else "Planting it", clean(steps)))
    return blocks


def _faq(p):
    name, qa = p["name"], []
    rows = dict(_windows(p))
    if "Sow outdoors" in rows or "Sow indoors" in rows:
        parts = []
        if "Sow indoors" in rows:
            parts.append("indoors from %s" % windows_text(rows["Sow indoors"]))
        if "Sow outdoors" in rows:
            parts.append("outdoors from %s" % windows_text(rows["Sow outdoors"]))
        qa.append(("When should I sow %s in the UK?" % name.lower(),
                   "In the UK, sow %s %s. These dates suit central England; sow about two weeks later in the north "
                   "and Scotland and up to two weeks earlier in the mild south and south west." % (name.lower(), " or ".join(parts))))
    plant_row = rows.get("Plant out") or rows.get("Plant")
    if plant_row:
        qa.append(("When do I plant out %s?" % name.lower(), "Plant %s out from %s%s." % (
            name.lower(), windows_text(plant_row), ", once the last frost has passed" if p.get("tender") else "")))
    if p.get("harvest"):
        qa.append(("When can I %s %s?" % ("pick" if p["group"] != "flower" else "enjoy", name.lower()),
                   "%s is ready from %s." % (name, windows_text(p["harvest"])) +
                   (" " + _clean(p["harvest_tip"]) if p.get("harvest_tip") else "")))
    if p.get("weeks"):
        qa.append(("How long do %s take to grow?" % name.lower(),
                   "Roughly %d weeks from sowing or planting until the first harvest." % p["weeks"]))
    lvl = catalogue.LEVELS[p["level"]]["name"].lower()
    where = " or ".join({"bed": "in the ground or a raised bed", "pot": "in pots and containers"}[w] for w in p["where"])
    qa.append(("Are %s easy to grow?" % name.lower(), "%s are rated '%s' for beginners, and can be grown %s." % (name, lvl, where)))
    return qa


def _plant_description(p):
    blurb = _clean(p.get("blurb") or "")
    first = "When to sow, plant and harvest %s in the UK, with simple step-by-step growing tips." % p["name"].lower()
    return (first + " " + blurb)[:300]


def _related_builds(pid):
    return [b for b in builds.payload()["builds"] if pid in b["for"]]


def plant_page(p):
    name, path = p["name"], "/grow/" + slug(p["id"])
    facts = [("Difficulty", catalogue.LEVELS[p["level"]]["name"]),
             ("Where", " or ".join({"bed": "Beds", "pot": "Pots"}[w] for w in p["where"]))]
    if p.get("sun"):
        facts.append(("Sun", " or ".join(p["sun"]).replace("sun", "full sun").replace("part", "part shade")))
    if p.get("height_cm"):
        facts.append(("Grows to", "%dcm" % p["height_cm"]))
    if p.get("spacing"):
        facts.append(("Spacing", p["spacing"]))
    if p.get("weeks"):
        facts.append(("Time to first pick", "about %d weeks" % p["weeks"]))
    if p.get("kind") or p.get("perennial"):
        facts.append(("Type", p.get("kind") or "perennial"))
    body = [_crumbs(("Plants", "/grow"), (name, None)), "<h1>How to grow %s in the UK</h1>" % e(name)]
    if p.get("blurb"):
        body.append('<p class="lead">%s</p>' % e(_clean(p["blurb"])))
    photo = p.get("photo")
    if photo:
        body.append('<figure style="margin:0"><img class="photo" src="%s" alt="%s" loading="lazy">'
                    '<figcaption class="muted">Photo: <a href="%s" rel="noopener" target="_blank">%s</a></figcaption></figure>'
                    % (e(photo["src"]), e(name), e(photo["page"]), e(photo["credit"])))
    body.append('<ul class="facts">%s</ul>' % "".join("<li><b>%s</b>%s</li>" % (e(k), e(v)) for k, v in facts))
    rows = _windows(p)
    if rows:
        body.append("<h2>When to sow, plant and harvest %s</h2>" % e(name.lower()))
        body.append("<table>%s</table>" % "".join("<tr><th>%s</th><td>%s</td></tr>" % (e(l), e(windows_text(w))) for l, w in rows))
        body.append('<p class="muted">Dates are for central England. Sow about two weeks later in the north and Scotland, '
                    'and up to two weeks earlier in the south and south west. '
                    '<a href="/#/join">Get the dates for your postcode</a>.</p>')
    for title, steps in _how_steps(p):
        body.append("<h2>%s</h2>%s" % (e(title), _ol(steps)))
    if p.get("tips"):
        body.append("<h2>Top tips for growing %s</h2>%s" % (e(name.lower()), _ul([_clean(t) for t in p["tips"]])))
    care = sorted(p.get("care") or [], key=lambda c: c[0])
    if care:
        body.append("<h2>Looking after %s</h2>%s" % (e(name.lower()), _ul(
            ["%s: %s" % ("At planting" if c[0] == 0 else "Week %d" % c[0], _clean(c[2])) for c in care])))
    soil = p.get("soil")
    if soil:
        body.append("<h2>Soil and feeding</h2><p><b>%s.</b> %s</p>" % (e(_clean(soil["likes"])), e(_clean(soil["how"]))))
    pests = p.get("pests")
    if pests and pests.get("who"):
        body.append("<h2>Pests and problems</h2>%s" % _ul(["%s: %s" % (w["name"], w["what"]) for w in pests["who"]]))
        body.append(_ul([_clean(t) for t in pests.get("protect") or []]))
    if p.get("harvest_tip") or p.get("eat"):
        body.append("<h2>Harvesting and eating %s</h2>" % e(name.lower()))
        if p.get("harvest_tip"):
            body.append("<p>%s</p>" % e(_clean(p["harvest_tip"])))
        if p.get("eat"):
            body.append("<p><b>How to eat them:</b> %s</p>" % e(_clean(p["eat"])))
    store = p.get("store")
    if store:
        body.append("<h2>Storing %s</h2><p>Keeps %s.</p>%s<p>%s</p>" % (
            e(name.lower()), e(store["keeps"]), _ul([_clean(s) for s in store.get("how") or []]), e(_clean(store.get("freeze") or ""))))
    if p.get("varieties"):
        body.append("<h2>Good varieties of %s</h2>%s" % (e(name.lower()), _ul(["%s: %s" % (v["name"], _clean(v["why"])) for v in p["varieties"]])))
    nbr = []
    for key, label in (("good_with", "Grows well with"), ("bad_with", "Keep away from")):
        items = [x for x in p.get(key) or [] if x["plant_id"] in catalogue.BY_ID]
        if items:
            nbr.append("<h3>%s</h3><ul>%s</ul>" % (label, "".join('<li><a href="/grow/%s">%s</a>: %s</li>' % (
                slug(x["plant_id"]), e(catalogue.BY_ID[x["plant_id"]]["name"]), e(_clean(x["why"]))) for x in items)))
    if nbr:
        body.append("<h2>Companion planting</h2>" + "".join(nbr))
    save = p.get("save")
    if save and save.get("steps"):
        body.append("<h2>Saving your own %s seed</h2><p>%s.</p>%s" % (e(name.lower()), e(save["when"]), _ol([_clean(s) for s in save["steps"]])))
    builds_for = _related_builds(p["id"])
    if builds_for:
        body.append("<h2>Things to build for %s</h2><ul>%s</ul>" % (e(name.lower()), "".join(
            '<li><a href="/build/%s">%s</a>: %s</li>' % (slug(b["id"]), e(b["name"]), e(b.get("good_for") or "")) for b in builds_for)))
    method = "plants" if not (p.get("sow_in") or p.get("sow_out")) else "sow_out"
    body.append('<h2>Where to buy %s %s</h2><p>%s</p><p class="muted">These are affiliate links: we may earn a small commission if you buy, at no extra cost to you. '
                '<a href="/affiliate-disclosure">Read more</a>.</p>' % (
                    e(name.lower()), "plants" if method == "plants" else "seeds", _links(shops.links(p, method))))
    faq = _faq(p)
    body.append("<h2>%s questions</h2>%s" % (e(name), "".join("<h3>%s</h3><p>%s</p>" % (e(q), e(a)) for q, a in faq)))
    body.append(_cta())
    ld = [_crumb_ld(("Plants", "/grow"), (name, None)),
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
              {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faq]},
          {"@context": "https://schema.org", "@type": "Article", "headline": "How to grow %s in the UK" % name,
           "description": _plant_description(p), "inLanguage": "en-GB", "mainEntityOfPage": site() + path,
           "author": {"@type": "Organization", "name": NAME}, "publisher": {"@type": "Organization", "name": NAME}}]
    img = (site() + photo["src"]) if photo else None
    return layout("How to grow %s in the UK: when to sow & harvest" % name,
                  _plant_description(p), path, "\n".join(body), ld, img)


# ---- fruit pages --------------------------------------------------------------------------------------

def fruit_page(f):
    name, path = f["name"], "/fruit/" + slug(f["id"])
    months = ", ".join(MONTHS[m - 1] for m in f["pick"])
    desc = "How to grow, pick and look after %s in a UK garden: when it is ripe (%s), pruning, pests and good varieties." % (name.lower(), months)
    body = [_crumbs(("Plants", "/grow"), (name, None)), "<h1>How to grow %s in the UK</h1>" % e(name)]
    photo = f.get("photo")
    if photo:
        body.append('<figure style="margin:0"><img class="photo" src="%s" alt="%s" loading="lazy">'
                    '<figcaption class="muted">Photo: <a href="%s" rel="noopener" target="_blank">%s</a></figcaption></figure>'
                    % (e(photo["src"]), e(name), e(photo["page"]), e(photo["credit"])))
    body.append('<ul class="facts"><li><b>Type</b>%s</li><li><b>Ready to pick</b>%s</li><li><b>Space needed</b>about %sm x %sm</li></ul>'
                % (e("Tree" if f["kind"] == "tree" else "Bush or cane"), e(months), f["w"], f["h"]))
    body.append("<h2>When is %s ready to pick?</h2><p>%s</p><p>%s</p>" % (e(name.lower()), e(_clean(f["pick_text"])), e(_clean(f["ripe"]))))
    body.append("<h2>Looking after %s</h2>%s" % (e(name.lower()), _ul([_clean(c) for c in f["care"]])))
    body.append("<h2>Storing and keeping</h2><p>%s</p>" % e(_clean(f["keep"])))
    body.append("<h2>Pests and problems</h2><p>%s</p>" % e(_clean(f["pests"])))
    if f.get("kinds"):
        body.append("<h2>Good varieties</h2>%s" % _ul(["%s: %s" % (k["name"], _clean(k["why"])) for k in f["kinds"]]))
    body.append(_cta())
    ld = [_crumb_ld(("Plants", "/grow"), (name, None)),
          {"@context": "https://schema.org", "@type": "Article", "headline": "How to grow %s in the UK" % name, "description": desc,
           "inLanguage": "en-GB", "mainEntityOfPage": site() + path, "author": {"@type": "Organization", "name": NAME},
           "publisher": {"@type": "Organization", "name": NAME}}]
    return layout("How to grow %s in the UK" % name, desc, path, "\n".join(body), ld,
                  (site() + photo["src"]) if photo else None)


# ---- Build It guides ----------------------------------------------------------------------------------

def build_page(b):
    name, path = b["name"], "/build/" + slug(b["id"])
    desc = "How to build a %s: materials list with UK prices, tools, and %d clear steps. %s" % (name.lower(), len(b["steps"]), _clean(b["why"]))
    body = [_crumbs(("Build it guides", "/build"), (name, None)), "<h1>How to build a %s</h1>" % e(name.lower()),
            '<p class="lead">%s</p>' % e(_clean(b["why"])),
            '<ul class="facts"><li><b>Difficulty</b>%s</li><li><b>Time</b>%s</li>%s<li><b>Rough cost</b>about &pound;%.0f</li></ul>'
            % (e(b["level"]), e(b["time"]), '<li><b>Size</b>%s</li>' % e(b["size"]) if b.get("size") else "", b["total"])]
    rows = []
    for m in b["materials"]:
        opts = m.get("choose") or [m]
        label = " or ".join(o["name"] for o in opts) if m.get("choose") else m["name"]
        links = _links(opts[0].get("links") or [])
        rows.append("<tr><td>%s%s</td><td>%s</td><td>&pound;%.2f</td><td>%s</td></tr>" % (
            e(label), ' <span class="muted">(optional)</span>' if m.get("optional") else "",
            e(str(m.get("qty", ""))), m["cost"], links))
    body.append('<h2>What you need</h2><table><tr><th>Item</th><th>Qty</th><th>Cost</th><th>Buy</th></tr>%s</table>'
                '<p class="muted">Prices are rough guides. Shop links are affiliate links: we may earn a small commission at no extra '
                'cost to you (<a href="/affiliate-disclosure">more</a>).</p>' % "".join(rows))
    body.append("<h2>Tools</h2>%s" % _ul(b["tools"]))
    body.append("<h2>Step by step</h2>%s" % _ol([_clean(s["text"]) for s in b["steps"]]))
    if b.get("tips"):
        body.append("<h2>Tips</h2>%s" % _ul([_clean(t) for t in b["tips"]]))
    if b.get("ready_made"):
        body.append("<h2>Or buy one ready made</h2><p>%s</p><p>%s</p>" % (e(_clean(b["ready_made"]["text"])), _links(b["ready_made"]["links"])))
    good = [catalogue.BY_ID[i] for i in b["for"] if i in catalogue.BY_ID][:12]
    if good:
        body.append("<h2>Good for growing</h2><ul>%s</ul>" % "".join('<li><a href="/grow/%s">%s</a></li>' % (slug(p["id"]), e(p["name"])) for p in good))
    body.append(_cta("Pick what you want to grow and we'll tell you when to build it."))
    ld = [_crumb_ld(("Build it guides", "/build"), (name, None)),
          {"@context": "https://schema.org", "@type": "HowTo", "name": "How to build a %s" % name.lower(), "description": desc,
           "inLanguage": "en-GB",
           "tool": [{"@type": "HowToTool", "name": t} for t in b["tools"]],
           "supply": [{"@type": "HowToSupply", "name": (m["choose"][0]["name"] if m.get("choose") else m["name"])} for m in b["materials"] if not m.get("optional")],
           "step": [{"@type": "HowToStep", "position": i, "text": _clean(s["text"])} for i, s in enumerate(b["steps"], 1)]}]
    return layout("How to build a %s: materials, cost & steps" % name.lower(), desc, path, "\n".join(body), ld)


# ---- index pages --------------------------------------------------------------------------------------

def grow_index():
    body = [_crumbs(("Plants", None)), "<h1>Grow your own: %d plants for UK gardens</h1>" % (len(catalogue.PLANTS) + len(catalogue.FRUIT)),
            '<p class="lead">Pick something you like to eat and see when to sow it, how to grow it, and when to pick it, '
            'written so a 10-year-old can follow it.</p>',
            '<p>Not sure what to do this month? See <a href="/sow/%s">what to sow in %s</a>.</p>' % (_this_month().lower(), _this_month())]
    for gid, label in GROUPS:
        items = [p for p in catalogue.PLANTS if p["group"] == gid]
        body.append("<h2>%s</h2><ul class=\"grid\">%s</ul>" % (label, "".join(
            '<li><a href="/grow/%s">%s %s</a></li>' % (slug(p["id"]), e(p["emoji"]), e(p["name"])) for p in items)))
    body.append("<h2>Fruit trees and bushes</h2><ul class=\"grid\">%s</ul>" % "".join(
        '<li><a href="/fruit/%s">%s %s</a></li>' % (slug(f["id"]), e(f["emoji"]), e(f["name"])) for f in catalogue.FRUIT))
    body.append("<h2>What to sow, month by month</h2><ul class=\"grid\">%s</ul>" % "".join(
        '<li><a href="/sow/%s">%s</a></li>' % (m.lower(), m) for m in MONTHS))
    body.append(_cta())
    desc = "Grow-your-own guides for UK gardens: when to sow, plant and harvest vegetables, herbs, flowers and fruit, step by step."
    return layout("Grow your own food in the UK: plant guides", desc, "/grow", "\n".join(body),
                  [_crumb_ld(("Plants", None))])


def build_index():
    data = builds.payload()
    body = [_crumbs(("Build it guides", None)), "<h1>Build it: simple garden projects, step by step</h1>",
            '<p class="lead">Raised beds, bean wigwams, cold frames, compost bins and more, with a materials list, UK prices '
            'and a clear picture for every step.</p>']
    for s in data["sections"]:
        items = [b for b in data["builds"] if b["section"] == s["id"]]
        if items:
            body.append("<h2>%s</h2><ul class=\"grid\">%s</ul>" % (e(s["name"]), "".join(
                '<li><a href="/build/%s">%s %s</a><span class="muted">%s &middot; about &pound;%.0f</span></li>' % (
                    slug(b["id"]), e(b["emoji"]), e(b["name"]), e(b["time"]), b["total"]) for b in items)))
    body.append(_cta())
    desc = "Step-by-step guides to build raised beds, bean wigwams, cold frames, compost bins and more, with materials, tools and UK costs."
    return layout("Garden building guides: raised beds, wigwams, cold frames", desc, "/build", "\n".join(body),
                  [_crumb_ld(("Build it guides", None))])


def sow_page(month):
    name, path = MONTHS[month - 1], "/sow/%s" % MONTHS[month - 1].lower()
    cols = [("Sow indoors", "sow_in"), ("Sow outdoors", "sow_out"), ("Plant out", "plant_out"), ("Ready to pick", "harvest")]
    body = [_crumbs((name, None)),
            "<h1>What to sow, plant and harvest in %s (UK)</h1>" % name,
            '<p class="lead">Everything in the catalogue you can sow, plant out or pick in %s, for central England. '
            'Go a couple of weeks later in the north and earlier in the south.</p>' % name]
    for title, key in cols:
        items = [p for p in catalogue.PLANTS if any(_in_month(w, month) for w in (p.get(key) or []))]
        if items:
            body.append("<h2>%s in %s</h2><ul class=\"grid\">%s</ul>" % (title, name, "".join(
                '<li><a href="/grow/%s">%s %s</a></li>' % (slug(p["id"]), e(p["emoji"]), e(p["name"])) for p in items)))
    fruit = [f for f in catalogue.FRUIT if month in f["pick"]]
    if fruit:
        body.append("<h2>Fruit ready to pick in %s</h2><ul class=\"grid\">%s</ul>" % (name, "".join(
            '<li><a href="/fruit/%s">%s %s</a></li>' % (slug(f["id"]), e(f["emoji"]), e(f["name"])) for f in fruit)))
    prev_m, next_m = MONTHS[(month - 2) % 12], MONTHS[month % 12]
    body.append('<p><a href="/sow/%s">&larr; %s</a> &middot; <a href="/sow/%s">%s &rarr;</a></p>' % (prev_m.lower(), prev_m, next_m.lower(), next_m))
    body.append(_cta("Get these jobs as phone reminders, with dates for your postcode."))
    desc = "What to sow, plant out and harvest in %s in the UK: vegetables, herbs, flowers and fruit, with links to simple growing guides." % name
    return layout("What to sow in %s in the UK" % name, desc, path, "\n".join(body),
                  [_crumb_ld((name, None))])


# ---- the home page: search-engine text for the app's own front page ---------------------------------------

DESCRIPTION = ("Grow to Gobble plans every job for growing your own food in the UK: when to buy seeds, sow, plant out, "
               "look after, pick and eat, for your postcode, with phone reminders. Free, and simple enough for a 10-year-old.")


def home_head():
    ld = [{"@context": "https://schema.org", "@type": "WebApplication", "name": NAME, "url": site() + "/",
           "description": DESCRIPTION, "applicationCategory": "LifestyleApplication", "operatingSystem": "Any (web, installs to the home screen)",
           "inLanguage": "en-GB", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"}},
          {"@context": "https://schema.org", "@type": "WebSite", "name": NAME, "url": site() + "/"},
          {"@context": "https://schema.org", "@type": "Organization", "name": NAME, "url": site() + "/",
           "logo": site() + "/static/icons/icon-512.png"}]
    url, image = site() + "/", site() + "/static/icons/icon-512.png"
    title = "%s: plan and grow your own food (UK)" % NAME
    return "\n".join([
        '<link rel="canonical" href="%s">' % e(url),
        '<meta property="og:site_name" content="%s">' % NAME, '<meta property="og:type" content="website">',
        '<meta property="og:title" content="%s">' % e(title), '<meta property="og:description" content="%s">' % e(DESCRIPTION),
        '<meta property="og:url" content="%s">' % e(url), '<meta property="og:image" content="%s">' % e(image),
        '<meta property="og:locale" content="en_GB">', '<meta name="twitter:card" content="summary">',
        '<meta name="twitter:title" content="%s">' % e(title), '<meta name="twitter:description" content="%s">' % e(DESCRIPTION),
        '<meta name="twitter:image" content="%s">' % e(image)] + [_ld(x) for x in ld])


def home_noscript():
    """Plain text and links inside the app's page, for crawlers (and people) that don't run JavaScript."""
    veg = [p for p in catalogue.PLANTS if p["group"] == "veg"][:18]
    return """<noscript><div style="max-width:720px;margin:0 auto;padding:24px 20px;font-family:system-ui,sans-serif;line-height:1.6">
<h1>Grow to Gobble: plan and grow your own food in the UK</h1>
<p>%(desc)s</p>
<ul>
<li>Pick what you like to eat from %(n)d vegetables, herbs, flowers and fruit.</li>
<li>Get every job as a dated, step-by-step list for your part of the UK: buy seeds, sow, plant out, look after, pick and eat.</li>
<li>Phone reminders, plus frost, heat and dry-spell warnings.</li>
<li>Plan your garden, beds and pots on a satellite map, and follow Build It guides for raised beds, wigwams and cold frames.</li>
</ul>
<p>This app needs JavaScript. You can read the guides without it:</p>
<p><a href="/grow">All plant guides</a> | <a href="/build">Build it guides</a> | <a href="/sow/%(month)s">What to sow in %(Month)s</a> | <a href="/privacy">Privacy</a> | <a href="/terms">Terms</a></p>
<p>%(veg)s</p>
</div></noscript>""" % {"desc": e(DESCRIPTION), "n": len(catalogue.PLANTS) + len(catalogue.FRUIT), "month": _this_month().lower(),
                         "Month": _this_month(),
                         "veg": " | ".join('<a href="/grow/%s">How to grow %s</a>' % (slug(p["id"]), e(p["name"].lower())) for p in veg)}


# ---- routes ------------------------------------------------------------------------------------------

def _html(page):
    return HTMLResponse(page, headers=CACHE)


@router.get("/grow")
def r_grow():
    return _html(grow_index())


@router.get("/grow/{pid}")
def r_plant(pid: str):
    return _html(plant_page(_plant(pid)))


@router.get("/fruit/{fid}")
def r_fruit(fid: str):
    return _html(fruit_page(_fruit(fid)))


@router.get("/build")
def r_build_index():
    return _html(build_index())


@router.get("/build/{bid}")
def r_build(bid: str):
    return _html(build_page(_build(bid)))


@router.get("/sow/{month}")
def r_sow(month: str):
    return _html(sow_page(_month(month)))


def paths():
    out = ["/", "/grow", "/build", "/privacy", "/terms", "/affiliate-disclosure"]
    out += ["/grow/" + slug(p["id"]) for p in catalogue.PLANTS]
    out += ["/fruit/" + slug(f["id"]) for f in catalogue.FRUIT]
    out += ["/build/" + slug(b["id"]) for b in builds.BUILDS]
    out += ["/sow/" + m.lower() for m in MONTHS]
    return out


@router.get("/sitemap.xml")
def sitemap():
    urls = "".join("<url><loc>%s</loc></url>\n" % e(site() + p) for p in paths())
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n%s</urlset>\n' % urls
    return Response(xml, media_type="application/xml", headers=CACHE)


# Named so it's clear on purpose: search engines and AI assistants may read the public guides and quote or link to them.
AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot",
           "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot", "DuckDuckBot", "CCBot"]


@router.get("/robots.txt")
def robots():
    private = "Disallow: /api/\nDisallow: /calendar/\n"
    text = "User-agent: *\n%s\n" % private
    text += "".join("User-agent: %s\nAllow: /\n%s\n" % (b, private) for b in AI_BOTS)
    text += "Sitemap: %s/sitemap.xml\n" % site()
    return PlainTextResponse(text, headers=CACHE)


@router.get("/llms.txt")
def llms():
    lines = ["# %s" % NAME, "", "> %s" % DESCRIPTION, "",
             "Grow to Gobble is a free web app (installable on phones) that turns a list of foods you like into dated, "
             "step-by-step jobs for growing them in the UK. These public pages hold the same guidance, as plain text.", "",
             "## Main pages", "- [All plant guides](%s/grow): %d plants, herbs, flowers and fruit" % (site(), len(catalogue.PLANTS) + len(catalogue.FRUIT)),
             "- [Build it guides](%s/build): raised beds, wigwams, cold frames, compost bins" % site(),
             "- [What to sow this month](%s/sow/%s)" % (site(), _this_month().lower()),
             "- [Privacy](%s/privacy), [Terms](%s/terms), [Affiliate disclosure](%s/affiliate-disclosure)" % (site(), site(), site()), "",
             "## Vegetables"]
    lines += ["- [How to grow %s](%s/grow/%s): %s" % (p["name"].lower(), site(), slug(p["id"]), _clean(p["blurb"]))
              for p in catalogue.PLANTS if p["group"] == "veg"]
    lines += ["", "## Notes", "- Dates are for central England; the app shifts them for the user's postcode.",
              "- Content is written for beginners, including children."]
    return PlainTextResponse("\n".join(lines) + "\n", headers=CACHE)
