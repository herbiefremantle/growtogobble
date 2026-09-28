"""Where to buy seeds and plants: one-tap links to a search on each shop's site, for that plant.

Affiliate links: set the environment variables below and every link earns a commission, with no code changes.
  AMAZON_TAG=yourtag-21                 Amazon Associates UK tracking id
  AWIN_ID=123456                        your Awin publisher id, plus one merchant id per shop you've joined:
  AWIN_MID_THOMPSON_MORGAN=...  AWIN_MID_SUTTONS=...
Without them the links still work - they just don't earn anything.
"""
import os
from urllib.parse import quote, quote_plus

SHOPS = [
    {"id": "thompson_morgan", "name": "Thompson & Morgan", "search": "https://www.thompson-morgan.com/search-results?q={q}"},
    {"id": "suttons", "name": "Suttons", "search": "https://www.suttons.co.uk/search?q={q}"},
    {"id": "amazon", "name": "Amazon", "search": "https://www.amazon.co.uk/s?k={q}"},
]


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


def is_affiliate():
    return bool(os.environ.get("AMAZON_TAG") or os.environ.get("AWIN_ID"))
