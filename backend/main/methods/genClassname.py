from django.core.cache import cache

#
from ..models.ClassInfo import ClassInfo
from ..serializers.ClassInfoSerializer import ClassInfoSerializer


def getClassDetails(
    class_info_id: int,
    include_details: bool = True,
    classname: bool = True,
    exclude_section: bool = False,
    cls=None,
):
    """
    @param studentGradeInfoId (student's class_info.id)
    @returns [
        classname,
        student's class_details
    ]

    classname must be true!
    exclude_section for top level classname!
    """
    # v2 key — bumped when class-name formatting changed (title-casing).
    # Old "classnames:{id}" entries are ignored so stale lowercase values
    # ("school three") don't leak through after the format change.
    _classname = cache.get(f"classnames:v2:{class_info_id}")
    if _classname and not include_details:
        return [_classname, None]
    # if not in cache then generate and cache!
    classDetails = cls or ClassInfo.objects.get(id=class_info_id)
    serializer = ClassInfoSerializer(
        classDetails,
        classname=classname,
        detailed=include_details,
        exclude_section=exclude_section,
    )  # education_level, grade, faculty, course, year, semester, section
    data = serializer.data
    return [data.get("name", ""), data]
