"""Sale numbers and office receipt numbers.

Both run serially within a school's FISCAL year and restart at 1 when it rolls
over. Both are minted under a lock on the school's CanteenSettings row, and the
database refuses a duplicate anyway (unique constraints on the models), so the
caller retries on IntegrityError for the rare case two counters still collide.

Voided rows keep their numbers and are counted: an issued number is never
reused. A gap in a receipt book is a record; a reused number is a fraud.
"""

from django.db.models import Max

from ..models import CanteenSale, CanteenSettings, CanteenTransaction


def _lock(school_id):
    # get_or_create first: an empty receipt book still needs a row to lock.
    CanteenSettings.objects.get_or_create(school_id=school_id)
    CanteenSettings.objects.select_for_update().get(school_id=school_id)


def next_sale_no(school_id, economic_year_id):
    """Call inside the caller's atomic block, and keep it open through the save."""
    _lock(school_id)
    last = CanteenSale.objects.filter(
        school_id=school_id, economic_year_id=economic_year_id
    ).aggregate(last=Max("sale_no"))["last"]
    return (last or 0) + 1


def next_receipt_no(school_id, economic_year_id):
    """Call inside the caller's atomic block, and keep it open through the save."""
    _lock(school_id)
    last = CanteenTransaction.objects.filter(
        school_id=school_id, economic_year_id=economic_year_id, receipt_no__isnull=False
    ).aggregate(last=Max("receipt_no"))["last"]
    return (last or 0) + 1
