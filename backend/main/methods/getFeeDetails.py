from ..constants.payment import (
    OLD_DUES,
    TRANSPORTATION,
    HOSTEL,
    HOSTEL_ADMISSION,
    HOSTEL_DEPOSIT,
    HOSTEL_TITLES,
    LIBRARY_FINE,
    EXCEPTION_TITLES_ALTERNATIVES,
)
from ..models.Fee import FeeTitle
from .extractTitleIds import extractTitleIdsFromInvoice
from ..models.Fee import feeq


#
def transportationFeeDetail(transportation_fee):
    return {
        "title__id": TRANSPORTATION,
        "title__title": "transportation",
        "fee": transportation_fee,
    }


def hostelFeeDetails(hostel_rates):
    """The three hostel rows on a bill: monthly, admission, deposit.

    Same shape as `transportationFeeDetail` and for the same reason — the rates
    are per student (their room and the terms agreed at check-in), not per
    class, so they cannot come out of the class fee table with the rest.

    Only the rows the invoice ACTUALLY carries are produced — see the caller.
    A school without the hostel module never has a hostel line on an invoice, so
    it never gets one of these rows, and a reprint of an old boarder's receipt
    still renders its hostel line even though the student has since checked out
    and has no live rate to quote.
    """
    rates = hostel_rates or {}
    return [
        {
            "title__id": HOSTEL,
            "title__title": "hostel",
            "fee": rates.get("monthly_fee") or 0,
        },
        {
            "title__id": HOSTEL_ADMISSION,
            "title__title": "hostel admission",
            "fee": rates.get("admission_fee") or 0,
        },
        {
            "title__id": HOSTEL_DEPOSIT,
            "title__title": "hostel deposit",
            "fee": rates.get("security_deposit") or 0,
        },
    ]


def oldDueFeeDetail():
    return {"title__id": OLD_DUES, "title__title": "old dues", "fee": None}


def libraryFineFeeDetail():
    return {"title__id": LIBRARY_FINE, "title__title": "library_fine", "fee": None}


def getFeeTitlesFromTitleIds(titleIds):
    feeTitles = FeeTitle.objects.filter(id__in=titleIds).values("id", "title")
    # print(feeTitles)
    return {title["id"]: title["title"] for title in feeTitles}


def getFeeTitlesOfSchool(schoolId):
    feeTitles = FeeTitle.objects.filter(school=schoolId).values("id", "title")
    return {
        **{title["id"]: title["title"] for title in feeTitles},
        **EXCEPTION_TITLES_ALTERNATIVES,
    }


# -- OLD


def getFeeDetailsFromInvoice(
    invoiceBill: dict, class_info: dict, transportation_fee, hostel_rates=None
):
    """
    from a single invoice. \\
    extract title/fee-details from bill then extract fee-details.
    """
    titleIds = extractTitleIdsFromInvoice(invoiceBill)
    # Hostel rows ONLY when THIS invoice actually carries a hostel line, and
    # ALWAYS when it does.
    #
    # Decided here rather than downstream because `extractTitleIdsFromInvoice`
    # deliberately strips the exception titles out of `titleIds` — the hostel
    # keys are only visible on the raw bill.
    #
    # The `or {}` is the important half. Presence of the row is decided by the
    # BILL; the rate merely fills it in. Without it, reprinting a receipt after
    # the student checked out (or after the school's module was switched off)
    # silently dropped the hostel line from a receipt that was paid for it —
    # the amount vanishing from a document a guardian already holds.
    has_hostel_line = any(t in (invoiceBill or {}) for t in HOSTEL_TITLES)
    hostel_rates = (hostel_rates or {}) if has_hostel_line else None
    return getFeeDetailsFromTitleIds(
        titleIds, class_info, transportation_fee, hostel_rates
    )


def getFeeDetailsFromTitleIds(
    title_ids, class_info, transportation_fee=0, hostel_rates=None
):
    """
    uses title-ids to extract fee-details like fee-title-id, fee-title, fee-rate.
    """
    section = class_info.pop("section")
    feeDetails = feeq(
        class_info, section, ("title__id", "title__title", "fee"), title_ids
    )
    feeDetails = list(feeDetails)
    feeDetails.append(transportationFeeDetail(transportation_fee))
    # `hostel_rates is None` means "this bill has nothing to do with a hostel"
    # — the caller decided (see getFeeDetailsFromInvoice). An empty dict still
    # produces the rows, at rate 0, for a boarder whose allocation has closed.
    if hostel_rates is not None:
        feeDetails.extend(hostelFeeDetails(hostel_rates))
    feeDetails.append(oldDueFeeDetail())
    feeDetails.append(libraryFineFeeDetail())
    return feeDetails
