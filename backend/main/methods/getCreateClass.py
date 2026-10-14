from django.db.models import Q

#
from ..models.ClassInfo import ClassInfo
from ..models.Section import Section
from ..models.Course import Course
from ..models.SchoolAdmin import SchoolAdmin
from .academicYear import new_class_academic_year_id


def get_or_create_class(class_info_data):
    created = False
    section = class_info_data.get("section")
    course = class_info_data.get("course")
    school = class_info_data.get("school")
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
