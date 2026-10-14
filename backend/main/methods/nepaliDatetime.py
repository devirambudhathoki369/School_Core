from datetime import date
from zoneinfo import ZoneInfo

from django.utils import timezone
from nepali_datetime import _CALENDAR, datetime
from nepali_datetime import date as ndate


def stringToDate(dateStr: str):
    """
    date (string format yyyy-mm-dd) to english date object.
    """
    year, month, day = map(int, dateStr.split("-"))
    return date(year, month, day)


def toNepaliDate(englishDate: date) -> str:
    """
    english date object to nepali date (string format yyyy-mm-dd).
    """
    if englishDate:
        date = ndate.from_datetime_date(englishDate)
        return str(date)
    return ""


def nepaliToEnglishDate(nepaliDate: str) -> date:
    """
    nepali date (string format yyyy-mm-dd) to english date object.
    """
    if not nepaliDate:
        return ""
    year, month, day = map(int, nepaliDate.split("-"))
    return ndate(year, month, day).to_datetime_date()


def isCurrentYear(nepaliDate: str) -> bool:
    """
    checks if nepaliDate (string format yyyy-mm-dd) has same year as running.
    """
    year, month, day = map(int, nepaliDate.split("-"))
    d1 = ndate(year, month, day)
    d2 = ndt_today_npt(as_string=False)
    return d1.year == d2.year


def getCurrentNepaliYear():
    return ndt_today_npt(as_string=False).year


# _CALENDAR[nepali_year] => [-1, 31, 63, 94, 126, 157, 187, 217, 247, 276, 305, 335, 365]
def getEnglishDateRangeFromCurrentNepaliYear():
    cny = getCurrentNepaliYear()
    lastDayOfMonth = _CALENDAR[cny][-1] - _CALENDAR[cny][-2]
    firstday = ndate(cny, 1, 1).to_datetime_date()
    lastday = ndate(cny, 12, lastDayOfMonth).to_datetime_date()
    # print([firstday, lastday])
    return [firstday, lastday]


# The server runs in UTC, Nepal is UTC+05:45. For anything a school reads as
# "when did this happen", that gap is not academic: between midnight and 05:45
# Nepal time the UTC date is still YESTERDAY, so a job that runs at 04:00 NPT
# (the birthday SMS) would be filed under the previous Nepali day, and a clock
# time rendered from UTC is simply the wrong time of day.
NEPAL_TZ = ZoneInfo("Asia/Kathmandu")


def npt(value):
    """An aware datetime moved to Nepal time (None passes through)."""
    if not value:
        return None
    if timezone.is_naive(value):
        value = timezone.make_aware(value, NEPAL_TZ)
    return value.astimezone(NEPAL_TZ)


def npt_now():
    """Right now, in Nepal time."""
    return timezone.now().astimezone(NEPAL_TZ)


def ndt_today_npt(as_string=True):
    """Today's Nepali (BS) date by NEPAL's clock, not the server's."""
    x = ndate.from_datetime_date(npt_now().date())
    return str(x) if as_string else x


def ndt_today(as_string=True):
    """Today's Nepali (BS) date — by Nepal's clock.

    This used `ndate.today()`, i.e. the UTC server's day, which is still
    YESTERDAY between 00:00 and 05:45 Nepal time. It is the `today` sent to
    the browser and the default date for bills, attendance, RFID and hostel
    writes, so all of those were a day behind before dawn.
    """
    return ndt_today_npt(as_string)


def ndt_now():
    import nepali_datetime

    return nepali_datetime.datetime.now()


def formatNepaliDate(nepali_date: str):
    """
    pass nepali date and get nepali date properly formatted!
    """
    try:
        return datetime.strptime(nepali_date, "%Y-%m-%d").date()
    except:
        return nepali_date


def find_due_days(bs_from: str, bs_to: str) -> int:
    y1, m1, d1 = map(int, bs_from.split("-"))
    y2, m2, d2 = map(int, bs_to.split("-"))

    from_date = ndate(y1, m1, d1)
    to_date = ndate(y2, m2, d2)

    return (to_date - from_date).days


# THE LAST DAY OF A FISCAL YEAR IS A CALENDAR FACT, NOT A TYPED ONE.
#
# Ashad is 31 days in some BS years and 32 in others (2082, 2083 and 2084 all
# have 32; 2085 and 2086 have 31). Nothing used to check that, so years were
# stored ending 2083-03-31 when Ashad really ran to 32 -- and every accounting
# report takes its range from the year, so entries on the real last day fell
# outside their own year and vanished. Worse, the year-CLOSE summed movements
# over that short range and wrote the result to disk as the next year's opening
# balances: Ashad 32 is exactly where an accountant posts year-end settlements,
# so cash carried a credit balance and retained earnings came out on the wrong
# side. Repairing that afterwards is a DB-level job (see
# `repair_aey_opening_balances`), so the date is derived here instead.


def days_in_bs_month(year: int, month: int) -> int:
    """Number of days in a BS month.

    `_CALENDAR[year]` holds cumulative day counts with a -1 sentinel at index
    0, so month 1 is measured from zero rather than from that sentinel.
    """
    cumulative = _CALENDAR[year]
    return cumulative[month] - (cumulative[month - 1] if month > 1 else 0)


def derive_fiscal_year_end(start_date: str) -> str:
    """The last day covered by a 12-month fiscal year starting `start_date`.

    One BS year on, minus a day: `2083-04-01` gives `2084-03-32`, while
    `2084-04-01` gives `2085-03-31`, because Ashad changes length.
    """
    from datetime import timedelta

    year, month, day = map(int, str(start_date).split("-"))
    day_after = ndate(year + 1, month, day).to_datetime_date()
    return str(ndate.from_datetime_date(day_after - timedelta(days=1)))


def resolve_fiscal_year_end(start_date, end_date):
    """Correct an end date that stops short of its own month's last day.

    Only the classic off-by-a-day is touched: an end date already in the right
    month, short of where a 12-month year actually ends. A deliberately short
    or non-standard year -- a stub period, a year ending in a different month
    entirely -- is left exactly as submitted, because shortness there is the
    point. Anything unparseable passes through untouched: this must never be
    the reason a year-close fails.
    """
    if not (start_date and end_date):
        return end_date
    try:
        derived = derive_fiscal_year_end(start_date)
        d_year, d_month, d_day = map(int, derived.split("-"))
        e_year, e_month, e_day = map(int, str(end_date).split("-"))
    except (ValueError, KeyError, IndexError):
        return end_date
    same_month = (e_year, e_month) == (d_year, d_month)
    return derived if same_month and e_day < d_day else end_date
