from ..models.FiscalYears import AcademicYearMapping
from ..models.ClassInfo import ClassInfo


def is_terminal_level(level, level_type, total_years, total_semesters):
    """Is a class-group's level the FINAL level of its program (a graduating year)?

    Uses the program length carried on Course (total_years / total_semesters).
    Returns True/False when the relevant length is known, else None so the caller
    can fall back to the "highest running level" heuristic. `level_type` is
    "year" or "semester"; only the matching total is consulted.
    """
    if not level:
        return None
    if level_type == "year" and total_years:
        return level >= total_years
    if level_type == "semester" and total_semesters:
        return level >= total_semesters
    return None


def gen_class_key_no_batch(class_info: dict):
    """The key a class had BEFORE it was stamped with a batch (batch omitted).

    Used to locate the existing mapping row so it can be mirrored onto the new
    batch-aware key when a higher-ed class is stamped.
    """
    return gen_class_key({**class_info, "batch": None})


def mirror_mapping_to_batch_key(school_id, old_key, new_key):
    """Ensure an AcademicYearMapping exists for a class's NEW batch-aware key.

    Stamping ``ClassInfo.batch`` changes what ``gen_class_key`` returns, so the
    class would otherwise resolve to a key that has no mapping row. This copies
    the class's existing (pre-batch) mapping onto the new key WITHOUT touching or
    deleting the old row (purely additive, so any un-migrated reference to the
    old key keeps working). Idempotent: returns the existing new-key row if one
    is already present. Returns (mapping, created) or (None, False) if there is
    no source mapping / nothing to do.
    """
    if not new_key or not old_key or old_key == new_key or not school_id:
        return None, False
    existing = (
        AcademicYearMapping.objects.filter(school=school_id, key=new_key)
        .order_by("-id")
        .first()
    )
    if existing:
        return existing, False
    src = (
        AcademicYearMapping.objects.filter(school=school_id, key=old_key)
        .order_by("-id")
        .first()
    )
    if not src:
        return None, False
    created = AcademicYearMapping.objects.create(
        school_id=school_id,
        key=new_key,
        academic_year_id=src.academic_year_id,
        previous_academic_year_id=src.previous_academic_year_id,
    )
    return created, True


def gen_class_key(class_info: dict):
    """
    Derive the AcademicYearMapping key for a class from its details.

    This is the single source of truth for class-group keys:
      - school/secondary levels (EL 1,2,10) -> "el<EL>"
      - high-school grades (EL 3)           -> "g<grade>"
      - bachelor/master/diploma (EL 4,5,8,9) by year/semester
                                            -> "el<EL>c<course><y|s><value>"
    """
    EL = class_info.get("education_level")
    name = "education_level"
    value = str(EL)
    if EL == 3:
        name = "grade"
        value = str(class_info.get("grade"))
    elif EL in [4, 5, 8, 9]:
        year = class_info.get("year")
        semester = class_info.get("semester")
        if year:
            name = "year"
            value = year
        elif semester:
            name = "semester"
            value = semester
    #
    key = None
    if name == "education_level" and EL in [1, 2, 10]:
        key = "el" + str(EL)
    elif name == "grade" and EL == 3:
        key = "g" + value
    elif name in ["year", "semester"] and EL in [4, 5, 8, 9]:
        course = class_info.get("course")
        nameo = name[0]
        # Batch (cohort) segment. Present ONLY for stamped higher-ed rows, so a
        # class with no batch yields the SAME key it always has -> every existing
        # mapping keeps resolving unchanged. When present it lets two intakes in
        # the same course+semester map to independent academic years.
        batch = class_info.get("batch")
        batch_seg = "b" + str(batch) if batch else ""
        key = "el" + str(EL) + "c" + str(course) + batch_seg + nameo + str(value)
    return key


def get_class_academic_year_id(school_id, class_info: dict):
    """
    Resolve a class's CURRENT academic year id via its mapping key.

    The mapping — not ClassInfo.academic_year — is the authoritative answer to
    "which academic year is this class-group operating in", because closing
    rolls a class-group's year independently of other grades.
    Returns the academic_year id, or None if there is no mapping yet.
    """
    key = gen_class_key(class_info)
    if not key or not school_id:
        return None
    return (
        AcademicYearMapping.objects.filter(key=key, school=school_id)
        .order_by("-id")
        .values_list("academic_year", flat=True)
        .first()
    )



def _pk(value):
    """An FK given as a model instance, a {"id": ..} dict or a raw id -> the id."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value.get("id")
    return getattr(value, "pk", value)


def new_class_academic_year_id(school_id, class_info: dict):
    """The academic year a NEW class row must be created in.

    A class belongs to its class-group's current year (Eleven ▸ Management ▸
    Computer Science is in whatever year Eleven is in), never to whatever year
    the page happened to have selected: Fee setup, enrolment and ledger posting
    all create a missing class with the year they were opened under, which put
    a new stream class in an unrelated test year while its postings went to
    Eleven's year — so its ledger read empty.

    Order: the one year every existing active row of the group already shares
    (what the rest of the app shows for that group); else the group's mapping;
    else None, and the caller keeps the year it was given.
    """
    school_id = _pk(school_id)
    info = {
        "education_level": class_info.get("education_level"),
        "grade": class_info.get("grade"),
        "course": _pk(class_info.get("course")),
        "year": class_info.get("year"),
        "semester": class_info.get("semester"),
        "batch": _pk(class_info.get("batch")),
    }
    key = gen_class_key(info)
    if not key or not school_id:
        return None
    siblings = ClassInfo.objects.filter(
        school=school_id,
        education_level=info["education_level"],
        is_active=True,
        academic_year__isnull=False,
    )
    if info["education_level"] == 3:
        siblings = siblings.filter(grade=info["grade"])
    elif info["course"]:
        siblings = siblings.filter(course=info["course"])
    years = {
        row["academic_year"]
        for row in siblings.values(
            "education_level", "grade", "course", "year", "semester", "batch", "academic_year"
        )
        if gen_class_key(row) == key
    }
    if len(years) == 1:
        return years.pop()
    return get_class_academic_year_id(school_id, info)


def get_class_academic_year(school_id, class_info: dict):
    """
    Resolve a class's CURRENT academic year id AND period via its mapping key.

    Like get_class_academic_year_id, but also returns the academic year's
    start/end dates so callers can compare class-groups by the period they are
    operating in rather than by raw id. This matters across levels: a school and
    a bachelor calendar are distinct AcademicYear records but may cover the same
    period, so id-equality would wrongly flag them as different years.

    Dates are NepaliDateField, stored as zero-padded "YYYY-MM-DD" strings, so a
    plain string compare on them is chronological.

    Returns {"id", "start_date", "end_date"} or None if there is no mapping yet.
    """
    key = gen_class_key(class_info)
    if not key or not school_id:
        return None
    row = (
        AcademicYearMapping.objects.filter(key=key, school=school_id)
        .order_by("-id")
        .values(
            "academic_year",
            "academic_year__start_date",
            "academic_year__end_date",
        )
        .first()
    )
    if not row:
        return None
    return {
        "id": row["academic_year"],
        "start_date": row["academic_year__start_date"],
        "end_date": row["academic_year__end_date"],
    }


def academic_years_aligned(src_ay: dict, dst_ay: dict) -> bool:
    """
    True when two resolved academic years (from get_class_academic_year) are the
    same RUNNING period and a promotion between their class-groups is safe.

    Periods are considered aligned when their date ranges overlap, so distinct
    AcademicYear records that cover the same calendar window (e.g. a school vs a
    bachelor calendar) count as aligned. A target still rolled to a strictly
    older/newer disjoint period does not overlap and is treated as misaligned.

    Falls back to id-equality only when a period is missing its dates, preserving
    the original behaviour rather than silently allowing the move.
    """
    if not src_ay or not dst_ay:
        # Unknown on either side -> nothing to block on.
        return True
    s_start, s_end = src_ay.get("start_date"), src_ay.get("end_date")
    d_start, d_end = dst_ay.get("start_date"), dst_ay.get("end_date")
    if s_start and s_end and d_start and d_end:
        return s_start <= d_end and d_start <= s_end
    return src_ay.get("id") == dst_ay.get("id")
