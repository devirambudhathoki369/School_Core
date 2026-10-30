"""How long a school's licence has left, counted in the BS calendar.

`renew_date` is a BS date ("2084-01-15"). The browser used to hand it to
JavaScript's `new Date()`, which reads it as an AD date some 57 years away, so
the expiry warning and the expired-licence page never came. The server knows
the calendar; it says the number of days and the browser only compares it.
"""
import re

from nepali_datetime import date as ndate

from .nepaliDatetime import ndt_today

_BS_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")


def renew_days_left(renew_date, today=None):
    """Days from today (Nepal's day) to `renew_date`: 0 on the day itself,
    negative once it has passed. None for a missing or unreadable date -- a
    licence is never treated as lapsed on a guess."""
    match = _BS_DATE.match(str(renew_date or "").strip())
    if not match:
        return None
    try:
        renew = ndate(*(int(part) for part in match.groups()))
        now = today if today is not None else ndt_today(as_string=False)
        return (renew - now).days
    except (ValueError, OverflowError):
        return None


def with_licence(profile):
    """Add `renew_days_left` to a sign-in profile that carries a `renew_date`."""
    if isinstance(profile, dict) and "renew_date" in profile:
        profile["renew_days_left"] = renew_days_left(profile.get("renew_date"))
    return profile
