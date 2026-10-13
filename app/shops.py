"""Where to buy seeds, plants and things to build with: one-tap links to a search on each shop's site, for that plant.

Affiliate links: set the environment variables below and every link earns a commission, with no code changes.
  AMAZON_TAG=yourtag-21                 Amazon Associates UK tracking id
  AWIN_ID=123456                        your Awin publisher id, plus one merchant id per shop you've joined:
  AWIN_MID_THOMPSON_MORGAN=...  AWIN_MID_SUTTONS=...  AWIN_MID_BQ=...  AWIN_MID_WICKES=...
Without them the links still work - they just don't earn anything.
"""
import os
from urllib.parse import quote, quote_plus

SHOPS = [
    {"id": "thompson_morgan", "name": "Thompson & Morgan", "search": "https://www.thompson-morgan.com/search-results?q={q}"},
    {"id": "suttons", "name": "Suttons", "search": "https://www.suttons.co.uk/search?q={q}"},
    {"id": "amazon", "name": "Amazon", "search": "https://www.amazon.co.uk/s?k={q}"},
]

# for Build It: the seed shops plus DIY shops for timber, screws and sheeting
BUILD_SHOPS = {s["id"]: s for s in SHOPS + [
    {"id": "bq", "name": "B&Q", "search": "https://www.diy.com/search?term={q}"},
    {"id": "wickes", "name": "Wickes", "search": "https://www.wickes.co.uk/search?text={q}"},
]}


def _wrap(shop, url):
    if shop["id"] == "amazon":
        tag = os.environ.get("AMAZON_TAG")
        return url + "&tag=" + quote_plus(tag) if tag else url
    affiliate = os.environ.get("AWIN_ID")
    merchant = os.environ.get("AWIN_MID_" + shop["id"].upper())
    if affiliate and merchant:
        return "https://www.awin1.com/cread.php?awinmid=%s&awinaffid=%s&ued=%s" % (
            quote_plus(merchant), quote_plus(affiliate), quote(url, safe=""))
    return url


def links(plant, method):
    """Buy links for a plant. Perennials and 'buy baby plants' search for plants rather than seeds."""
    word = plant.get("buy_word") or ("plants" if method == "plants" else "seeds")
    query = quote_plus("%s %s" % (plant["name"], word))
    return [{"shop": s["name"], "url": _wrap(s, s["search"].format(q=query))} for s in SHOPS]


def search_links(text):
    """Buy links searching for any text, e.g. a variety: 'Nantes 2 Carrots seeds'."""
    query = quote_plus(text)
    return [{"shop": s["name"], "url": _wrap(s, s["search"].format(q=query))} for s in SHOPS]


def build_links(text, shop_ids):
    """Links searching the given shops for a building material, e.g. 'bamboo canes 2.4m'."""
    query = quote_plus(text)
    return [{"shop": BUILD_SHOPS[i]["name"], "url": _wrap(BUILD_SHOPS[i], BUILD_SHOPS[i]["search"].format(q=query))} for i in shop_ids]


def is_affiliate():
    return bool(os.environ.get("AMAZON_TAG") or os.environ.get("AWIN_ID"))
