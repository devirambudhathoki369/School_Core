"""A school's canteen settings, with defaults for a school that saved none."""

from ..models import CanteenSettings


def settings_for(school_id, create=False):
    """The school's settings row.

    `create=False` (reads) hands back an UNSAVED row carrying the defaults when
    the school never saved any, so a school switched on today can sell at once
    and nothing is written by merely looking. `create=True` makes the row —
    the minting of numbers needs a real row to lock.
    """
    row = CanteenSettings.objects.filter(school_id=school_id).first()
    if row:
        return row
    if create:
        row, _ = CanteenSettings.objects.get_or_create(school_id=school_id)
        return row
    return CanteenSettings(school_id=school_id)
