from django.db.models import Count, Q

from ..models.ClassInfo import ClassInfo
from ..models.Ledger import LedgerPosting
from ..models.Student import Student

# What makes two class rows THE SAME CLASS. Everything ClassInfo is keyed on
# except `section` (and `batch`, which no school class carries): a row that
# differs only by section is the same class re-organised, a row that differs by
# grade or course is a different class altogether.
SAME_CLASS_FIELDS = (
    "school",
    "education_level",
    "grade",
    "faculty",
    "course",
    "year",
    "semester",
)


def carriedOverPostings(class_ids, academic_year_id):
    """Class-wide postings this class was billed under while it sat on a
    DIFFERENT ClassInfo row of the same class.

    "Which months has this class already been posted for?" was answered purely
    from LedgerPosting rows hanging off the class row being looked at. A class
    row is not stable for a whole year: split UKG into sections Darwin and
    Newton mid-year and every student moves to a NEW ClassInfo row, leaving the
    Baishakh posting behind on the old section-less one. From that moment the
    month picker showed Baishakh as never posted, and the profile's Ledger tab
    — which only offers months the class holds — did not offer it at all. At
    Rapti Bal Academy that is exactly what happened: 29 UKG students had their
    Baishakh ledger deleted and re-entered from their profiles, and because
    Baishakh was not on the list the fees were re-stamped Ashad.

    So the question is answered from the STUDENTS instead: a posting that billed
    the people who are in this class now is this class's posting, whichever row
    it was recorded against.

    Two limits keep that from swallowing other classes' periods:

    - Same class, different SECTION only. Promotion and class changes move whole
      cohorts too, and without this grade 5's picker inherited grade 4's months
      (78 of the 341 class/year groups a section-only rule leaves untouched).
    - A MAJORITY of the class. One pupil moved over from the other section must
      not drag that section's periods across; a split moves nearly everyone at
      once (29 of Darwin's 33).

    Deleted student-ledger rows still count. The posting reached that student —
    that is what makes the month the class's — and whether the row was later
    removed is precisely what the school is trying to see.
    """
    class_ids = [cid for cid in (class_ids or []) if cid]
    if not class_ids:
        return LedgerPosting.objects.none()
    roster = Student.objects.filter(class_info__id__in=class_ids).count()
    if not roster:
        return LedgerPosting.objects.none()
    # Sibling rows: the same class, recorded under another section (or none).
    identity = (
        ClassInfo.objects.filter(id__in=class_ids)
        .values(*SAME_CLASS_FIELDS)
        .distinct()
    )
    sibling_q = Q()
    for details in identity:
        sibling_q |= Q(**details)
    if not sibling_q:
        return LedgerPosting.objects.none()
    siblings = list(
        ClassInfo.objects.filter(sibling_q)
        .exclude(id__in=class_ids)
        .values_list("id", flat=True)
    )
    if not siblings:
        return LedgerPosting.objects.none()
    threshold = max(1, -(-roster // 2))  # ceil(roster / 2)
    q = Q(
        is_active=True,
        single_student=False,
        class_info__id__in=siblings,
        studentledger__student__class_info__id__in=class_ids,
    )
    if academic_year_id:
        q &= Q(academic_year=academic_year_id)
    # filter() BEFORE annotate() so the Count reuses the filtered join and
    # counts only this class's students, not everyone the posting billed.
    return (
        LedgerPosting.objects.filter(q)
        .annotate(billed=Count("studentledger__student", distinct=True))
        .filter(billed__gte=threshold)
    )
