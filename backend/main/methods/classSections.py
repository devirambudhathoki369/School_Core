"""Resolve the sibling sections of a class.

A "grade/class" (e.g. Montessory) can be split into several sections
(ROSE, LILY, B, …). Each section is its own `ClassInfo` row; they share every
grade field and differ only by `section`. The photo-matching UI treats all
sections of a grade as one pool, so it needs every sibling's `class_info` id.
"""

from ..models.ClassInfo import ClassInfo

# Fields that define a grade. Sections of the same grade share all of these and
# differ only by `section` (deliberately excluded). Mirrors CLASS_DETAILS_FIELDS
# minus `section`. School + academic year are added so we never merge across
# schools or years.
_GRADE_FIELDS = (
    "school_id",
    "academic_year_id",
    "education_level",
    "grade",
    "faculty",
    "course_id",
    "year",
    "semester",
)


def sibling_class_info_ids(class_info_id):
    """All `ClassInfo` ids in the same grade as `class_info_id`, across sections.

    Returns the full sibling list (which includes `class_info_id` itself), or an
    empty list if the class doesn't exist.
    """
    base = (
        ClassInfo.objects.filter(id=class_info_id)
        .values(*_GRADE_FIELDS)
        .first()
    )
    if not base:
        return []
    return list(ClassInfo.objects.filter(**base).values_list("id", flat=True))
