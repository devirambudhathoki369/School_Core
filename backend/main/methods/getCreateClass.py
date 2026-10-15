from django.db.models import Q

#
from ..models.ClassInfo import ClassInfo
from ..models.Section import Section
from ..models.Course import Course
from ..models.SchoolAdmin import SchoolAdmin
from .academicYear import new_class_academic_year_id


def class_info_keys_are_safe(class_info_data):
    """
    True when every key of a client-built class dict is a plain ClassInfo field.

    These dicts are unpacked straight into `ClassInfo.objects.filter(**data)` /
    `.create(**data)`, and a request body is the client's to shape. A key such
    as `school__account__tokens__key__startswith` is a perfectly valid Django
    lookup: it walked from a class to ANOTHER school's admin session token, and
    whether a class matched came back in the response — a yes/no oracle that
    read secrets out a character at a time. Only the model's own columns are
    allowed; nothing that traverses a relation.
    """
    if not isinstance(class_info_data, dict):
        return False
    allowed = set()
    for field in ClassInfo._meta.concrete_fields:
        allowed.add(field.name)
        allowed.add(field.attname)
    return all(isinstance(key, str) and key in allowed for key in class_info_data)


def get_or_create_class(class_info_data):
    created = False
    if not class_info_keys_are_safe(class_info_data):
        return None, False
    section = class_info_data.get("section")
    course = class_info_data.get("course")
    school = class_info_data.get("school")
    # The class is looked up by whatever the dict holds. Without a school --
    # the one value here the authenticator checks against the caller -- an
    # `id`, or just a level and grade, matched ANY school's class, and
    # students, fees and postings were written into it.
    if school in (None, ""):
        return None, False
    academic_year = class_info_data.pop("academic_year", None)

    q = Q(**class_info_data)
    if section is None:
        q &= Q(section__isnull=True)
    elif isinstance(section, int):
        section = Section.objects.get(id=section)
        class_info_data["section"] = section
    if course is None:
        q &= Q(course__isnull=True)
    elif isinstance(course, int):
        course = Course.objects.get(id=course)
        class_info_data["course"] = course
    # academic_year may arrive as an int, a model instance, a {"id": ...} dict —
    # or missing entirely (a client that dropped it, e.g. an empty value stripped
    # from the payload). The old chain called `.id` then `.get("id")` on it, so a
    # None raised AttributeError out of here and surfaced as a 500. Resolve
    # defensively and let the caller decide what a missing year means.
    if not isinstance(academic_year, int):
        academic_year = (
            getattr(academic_year, "id", None)
            or (academic_year.get("id") if isinstance(academic_year, dict) else None)
        )
    #
    #
    cls = ClassInfo.objects.filter(q).first()
    if not cls and school and academic_year:
        # A new row joins its class-group's year, not the year the calling page
        # was opened under (see new_class_academic_year_id).
        academic_year = new_class_academic_year_id(school, class_info_data) or academic_year
        if isinstance(school, int):
            school = SchoolAdmin.objects.get(id=school)
            class_info_data["school"] = school
        cls = ClassInfo.objects.create(
            **class_info_data, academic_year_id=academic_year
        )
        created = True
    return cls, created
