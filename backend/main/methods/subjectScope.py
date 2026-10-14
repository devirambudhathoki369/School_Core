"""Which subjects a class is allowed to record marks under.

A `Subject` hangs off one `ClassInfo`, but a class is really a *group* of
ClassInfo rows — the section-less "class" row plus one row per section — and
schools keep the subjects on whichever row they happened to use. So belonging
is decided on the class DETAILS (education level, grade, faculty, course, year,
semester, name), ignoring the section, exactly like `getClassInfoQuery` does
for the subject list.

Older schools were set up before subjects were bound to real classes: their
subjects still point at a seed `ClassInfo` (academic_year NULL, someone else's
grade) and are wired to the class only through its routine. Those must keep
working, so a subject the class's own timetable references counts as in scope
too. The marks-entry picker is fed from that same timetable
(`ClassPeriodView.get` with strict=true), which makes this check a superset of
everything the UI can offer — it can only ever reject an id the user could not
legitimately have picked.
"""

from django.db.models import Q

from ..models.ClassInfo import ClassInfo
from ..models.ClassPeriod import ClassPeriod
from ..views.fields import CLASS_DETAILS_FIELDS

# section is deliberately excluded: sections share their class's subjects.
_GROUP_FIELDS = tuple(f for f in CLASS_DETAILS_FIELDS if f != "section")


def class_group_query(class_info):
    """Q matching every ClassInfo of `class_info`'s class, across sections."""
    details = {
        f: getattr(class_info, f if f != "course" else "course_id")
        for f in _GROUP_FIELDS
    }
    return Q(school=class_info.school_id, **{k: v for k, v in details.items()})


def is_subject_in_class_scope(subject, class_info) -> bool:
    """True when `subject` may carry marks for `class_info`."""
    if subject is None or class_info is None:
        return False
    if subject.school_id != class_info.school_id:
        return False
    # 1. owned by any ClassInfo of this class (the normal case);
    group = ClassInfo.objects.filter(class_group_query(class_info))
    if group.filter(id=subject.class_info_id).exists():
        return True
    # 2. or wired to the class through its timetable (legacy setups);
    for subjects_map in ClassPeriod.objects.filter(
        class_info__in=group.values("id"), is_active=True
    ).values_list("subjects", flat=True):
        if not isinstance(subjects_map, dict):
            continue
        for value in subjects_map.values():
            try:
                if int(value) == subject.id:
                    return True
            except (TypeError, ValueError):
                continue
    return False
