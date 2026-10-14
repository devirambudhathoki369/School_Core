import nepali_datetime
from rest_framework.exceptions import ValidationError


date_format = "%Y-%m-%d"


def normalizeNepaliDate(value):
    """
    One BS date in the canonical zero-padded YYYY-MM-DD form the database holds.

    Nepali dates are stored as TEXT, so a filter only matches when it is written
    exactly the way the rows are: a hand-typed "2083-5-8" would silently match
    nothing. Parsing and re-formatting also rejects a date that does not exist in
    the BS calendar (2083-05-32) instead of quietly reporting an empty day.
    """
    try:
        parsed = nepali_datetime.datetime.strptime(str(value), date_format)
    except (ValueError, TypeError):
        raise ValidationError("Invalid date format")
    return parsed.strftime(date_format)


def getDateRange(start_date, end_date, as_string=False):
    try:
        start = nepali_datetime.datetime.strptime(start_date, date_format)
        end = nepali_datetime.datetime.strptime(end_date, date_format)
    except (ValueError, TypeError):
        raise ValidationError("Invalid date format")
    # A range whose end falls before its start can never match a row, and the
    # empty result it produces reads exactly like a genuinely quiet day — the
    # report would say "nothing was sent" about a range nobody meant to ask for.
    # The date-object branch has always refused it; the string branch used to
    # skip the check and hand back a backwards BETWEEN.
    if start.date() > end.date():
        raise ValidationError("Invalid date")
    if as_string:
        return [start.strftime(date_format), end.strftime(date_format)]
    return [start.date(), end.date()]
