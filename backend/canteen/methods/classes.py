"""Which "class" a canteen rate belongs to.

A monthly item's rate is set per class — "Class 1: Rs. 1,500 a month, Class 2:
Rs. 2,500" — so the key is the GRADE, shared by every section and every +2
stream of it (Class 1 A and Class 1 B pay the Class 1 rate). A higher-education
class has no grade; its key is the course and its year or semester.
"""

from main.choices.Education import EDUCATION_LEVEL_CHOICES, GRADE_CHOICES, SEMESTER_CHOICES, YEAR_CHOICES
from main.models.Student import Student

GRADE_ORDER = {value: i for i, (value, _) in enumerate(GRADE_CHOICES)}
GRADES = dict(GRADE_CHOICES)
LEVELS = dict(EDUCATION_LEVEL_CHOICES)
YEARS = dict(YEAR_CHOICES)
SEMESTERS = dict(SEMESTER_CHOICES)

KEY_VALUES = (
    "class_info__education_level",
    "class_info__grade",
    "class_info__course",
    "class_info__course__course",
    "class_info__year",
    "class_info__semester",
    "class_info__name",
)


def class_key(row, prefix="class_info__"):
    grade = row.get(f"{prefix}grade")
    if grade:
        return f"g{grade}"
    return "el{}-c{}-y{}-s{}".format(
        row.get(f"{prefix}education_level") or 0, row.get(f"{prefix}course") or 0,
        row.get(f"{prefix}year") or 0, row.get(f"{prefix}semester") or 0,
    )


def key_label(row, prefix="class_info__"):
    grade = row.get(f"{prefix}grade")
    if grade:
        name = str(GRADES.get(grade, "")).strip()
        return name[:1].upper() + name[1:]
    label = (row.get(f"{prefix}course__course") or row.get(f"{prefix}name")
             or str(LEVELS.get(row.get(f"{prefix}education_level"), "Class")).title())
    if row.get(f"{prefix}year"):
        label += f" {YEARS.get(row[f'{prefix}year'], '')} year"
    elif row.get(f"{prefix}semester"):
        label += f" {SEMESTERS.get(row[f'{prefix}semester'], '')} semester"
    return label.strip()


def sort_key(row, prefix="class_info__"):
    grade = row.get(f"{prefix}grade")
    if grade:
        return (0, GRADE_ORDER.get(grade, 99), "")
    return (1, 0, key_label(row, prefix))


def school_classes(school_id):
    """[{key, label, students}] for every class with running students, in
    grade order — the rows of an item's class-rate table."""
    out = {}
    rows = Student.objects.filter(
        class_info__school_id=school_id, is_active=True, status=1
    ).values(*KEY_VALUES)
    for row in rows:
        key = class_key(row)
        if key not in out:
            out[key] = {"key": key, "label": key_label(row), "students": 0, "_sort": sort_key(row),
                        "_level": str(LEVELS.get(row.get("class_info__education_level"), "")).title()}
        out[key]["students"] += 1
    ordered = sorted(out.values(), key=lambda r: r["_sort"])
    # Two different classes that would read the same ("Agriculture first
    # semester" under two levels) say which level each is.
    seen = {}
    for row in ordered:
        seen.setdefault(row["label"], []).append(row)
    for same in seen.values():
        if len(same) > 1:
            for row in same:
                row["label"] = f"{row['label']} ({row['_level']})"
    for row in ordered:
        del row["_sort"], row["_level"]
    return ordered


def student_class_keys(school_id, student_ids):
    """{student id: (class key, class label)}."""
    return {
        r["id"]: (class_key(r), key_label(r))
        for r in Student.objects.filter(id__in=list(student_ids), class_info__school_id=school_id)
        .values("id", *KEY_VALUES)
    }
