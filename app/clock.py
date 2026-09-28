"""Today's date in the UK. GARDEN_TODAY=2027-06-15 pretends it's another day - handy for demos and testing."""
import os
from datetime import date, datetime

try:
    from zoneinfo import ZoneInfo
    UK = ZoneInfo("Europe/London")
except Exception:  # no timezone data installed: UTC is at most an hour out
    UK = None


def now():
    return datetime.now(UK)


def today():
    override = os.environ.get("GARDEN_TODAY")
    if override:
        return date.fromisoformat(override)
    return now().date()
