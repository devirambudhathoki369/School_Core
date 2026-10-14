"""
Automatic section-change detection.

A student can move to a different ClassInfo two ways:

  * SECTION change  -> same class, only the section differs (e.g. Class One "A"
                       -> Class One "B"). Their exam results MUST follow them to
                       the new section (see ResultMigrationMixin.migrate).
  * CLASS change    -> a real grade/faculty/course/year/semester/academic-year
                       move (e.g. Class One -> Class Two). Results must STAY with
                       the old class; only outstanding dues carry forward.

Which one it is is fully determined by the two ClassInfo rows, so it is decided
here from the data itself rather than trusting an operator to tick a checkbox.
Both call sites -- the individual student edit (StudentSerializer.update) and the
bulk class promotion (StudentsView.promoteClass) -- use this single helper so the
rule stays identical everywhere.
"""

from ..models.ClassInfo import ClassInfo

# Fields that, together, identify the CLASS a student sits in. `section` is
# deliberately excluded: two rows differing ONLY in section are the same class,
# different section. academic_year and batch are included so a same-grade move
# into a different year/cohort still counts as a real class change (its results
# must not follow the student).
_CLASS_IDENTITY_FIELDS = (
    "education_level",
    "grade",
    "faculty",
    "course",
    "year",
    "semester",
    "academic_year",
    "batch",
)


def is_section_only_change(previous_class_info_id, new_class_info_id):
    """Return True iff moving previous -> new is a SECTION change within the same
    class: every class-identity field is identical and only ``section`` differs.

    Returns False for a real class change, for a no-op (same row), and for any
    case where either row is missing -- callers then treat it as a class change,
    which is the safe default (results stay put).
    """
    if not previous_class_info_id or not new_class_info_id:
        return False
    prev_id = int(previous_class_info_id)
    new_id = int(new_class_info_id)
    if prev_id == new_id:
        return False
    rows = {
        c["id"]: c
        for c in ClassInfo.objects.filter(id__in=[prev_id, new_id]).values(
            "id", "section", *_CLASS_IDENTITY_FIELDS
        )
    }
    prev = rows.get(prev_id)
    curr = rows.get(new_id)
    if not prev or not curr:
        return False
    # A genuine section change moves to a DIFFERENT section...
    if prev["section"] == curr["section"]:
        return False
    # ...while every other class-identity field stays the same.
    return all(prev[f] == curr[f] for f in _CLASS_IDENTITY_FIELDS)


def is_same_grade(previous_class_info_id, new_class_info_id):
    """True iff the two classes are the same grade/level, section aside.

    Unlike is_section_only_change this does NOT require the section to differ, so
    it also holds for a same-grade move across academic years. Used to keep exam
    results from ever crossing grades: a grade-1 result must never migrate onto a
    grade-2 sheet, whatever the operator ticked. A direct two-row comparison, so
    it is reliable regardless of how each subject's owning class is recorded.
    """
    if not previous_class_info_id or not new_class_info_id:
        return False
    prev_id = int(previous_class_info_id)
    new_id = int(new_class_info_id)
    if prev_id == new_id:
        return True
    rows = {
        c["id"]: c
        for c in ClassInfo.objects.filter(id__in=[prev_id, new_id]).values(
            "id", *_CLASS_IDENTITY_FIELDS
        )
    }
    prev = rows.get(prev_id)
    curr = rows.get(new_id)
    if not prev or not curr:
        return False
    # academic_year is in _CLASS_IDENTITY_FIELDS but must NOT block a same-grade
    # move to a new year, so compare on everything except it.
    return all(
        prev[f] == curr[f] for f in _CLASS_IDENTITY_FIELDS if f != "academic_year"
    )


def should_migrate_results(flag, previous_class_info_id, new_class_info_id):
    """Decide whether exam results follow the student to the new ClassInfo.

    Auto-detection is the default, but an operator can override it: the data
    cannot tell you that a move recorded as a real class change was actually a
    correction that should take the results along. When the request carries no
    flag at all the structural answer stands.

    Note this governs RESULTS ONLY. Whether dues carry forward, and the
    academic-year guardrail on promotion, stay keyed to the structural
    comparison -- those follow from the classes themselves and must not be
    switched off by a checkbox.
    """
    if flag is None:
        return is_section_only_change(previous_class_info_id, new_class_info_id)
    return bool(flag)
