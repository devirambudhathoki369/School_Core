from django.db.models import Q

#
from ..models.Ledger import StudentLedger
from .extractTitleIds import extractTitleIdsFromLedgers
from ..constants.payment import (
    DISCOUNTS,
    EXCEPTION_TITLES,
    EXCEPTION_TITLES_ALTERNATIVES,
    TITLE_NAMES_KEY,
)


def getStudentLedgerDetails(student_id: int, school_id: int, academic_year: int):
    """
    used for student's trial balance!
    """
    query = Q(
        student__id=student_id,
        school__id=school_id,
        is_active=True,
        ledger_posting__is_active=True,
    )
    if academic_year:
        query &= Q(academic_year=academic_year)
    ledgers = StudentLedger.objects.filter(query).values(
        "id",
        "date",
        "details",
        "total",
        "remarks",
        "extra_info",
        "ledger_posting",
        "ledger_posting__months",
        "ledger_posting__class_info",
        "academic_year",
        "academic_year__name",
    )
    titleIds = extractTitleIdsFromLedgers(ledgers)
    return [titleIds, ledgers]
    #


def formatStudentLedgerDetails(
    ledgers: list,
    titles: list,
    detailed_titles: bool = False,
    externalKeysToBeIncluded: list = [],
):
    """
    used for student's trial balance! \\
    returns [
        [
            {
                date, debit_amount, months, 
                particulars: [[title, amount], ...]
            }, ...
        ],
        {}
    ]
    """
    # print(ledgers)
    data = []
    for ledger in ledgers:
        det = {"id": ledger.get("id"), "debit_amount": ledger.get("total") or 0}
        if "date" in ledger:
            det["date"] = ledger.get("date") or ""
        if "ledger_posting__months" in ledger:
            det["months"] = ledger.get("ledger_posting__months") or []
        # historical class snapshot (immutable on LedgerPosting) + AY label
        if "ledger_posting__class_info" in ledger:
            det["class_info"] = ledger.get("ledger_posting__class_info")
        if "academic_year__name" in ledger:
            det["academic_year_name"] = ledger.get("academic_year__name") or ""
        if "academic_year" in ledger:
            det["academic_year_id"] = ledger.get("academic_year")
        if "remarks" in ledger:
            det["remarks"] = ledger.get("remarks") or ""
        det["particulars"] = []
        #
        # Snapshot of FeeTitle names captured at write time. Prefer this so
        # historical ledger lines render the original posting label even if
        # the FeeTitle has since been renamed or deleted.
        title_snapshot = ledger["details"].get(TITLE_NAMES_KEY) or {}
        for title, amount in ledger["details"].items():
            """
            titleId could be title.id or old_dues or transportation
            """
            if title == DISCOUNTS or title == TITLE_NAMES_KEY:
                continue
            if detailed_titles:
                if title in EXCEPTION_TITLES:
                    title = EXCEPTION_TITLES_ALTERNATIVES.get(title)
                else:
                    title = (
                        title_snapshot.get(str(title))
                        or titles.get(int(title))
                    )
            det["particulars"].append([title, amount])
        for key in externalKeysToBeIncluded:
            det[key] = ledger[key]
        data.append(det)
    # print(data)
    return data
