from ..models.ClassInfo import ClassInfo
from ..models.Ledger import LedgerPosting
from .carriedOverPostings import carriedOverPostings
from .getCreateClass import class_info_keys_are_safe


def classPostedMonths(class_ids, academic_year_id=None):
    """Months these class rows already hold a CLASS-WIDE posting for.

    Profile catch-ups (`single_student=True`) don't count — they bill one pupil,
    not the class. Postings left behind on a row the class has since moved off
    (a mid-year section split) do, see carriedOverPostings.
    """
    postings = LedgerPosting.objects.filter(
        class_info__id__in=class_ids, is_active=True, single_student=False
    )
    if academic_year_id:
        postings = postings.filter(academic_year=academic_year_id)
    months = set()
    for posted in postings.values_list("months", flat=True):
        months.update(posted or [])
    for posted in carriedOverPostings(class_ids, academic_year_id).values_list(
        "months", flat=True
    ):
        months.update(posted or [])
    return months


def findClass(class_info_data):
    """The existing ClassInfo row a class-wide posting payload points at, or
    None. Same lookup as get_or_create_class, without the create."""
    if not class_info_keys_are_safe(class_info_data):
        return None
    data = {k: v for k, v in class_info_data.items() if k != "academic_year"}
    for key in ("section", "course"):
        value = data.pop(key, None)
        if value is None:
            data[f"{key}__isnull"] = True
        else:
            data[f"{key}_id" if isinstance(value, int) else key] = value
    try:
        return ClassInfo.objects.filter(**data).first()
    except (TypeError, ValueError):
        return None
