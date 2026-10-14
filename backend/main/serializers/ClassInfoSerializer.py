from rest_framework import serializers
from django.core.cache import cache

#
from ..models.Section import Section
from ..models.ClassInfo import ClassInfo, ClassDetails
from ..models.Course import Course
from ..models.Batch import Batch
from ..models.FiscalYears import AcademicYear


class ClassDetailsSerializer(serializers.ModelSerializer):
    # education_level = serializers.CharField()
    grade = serializers.IntegerField(required=False, allow_null=True, default=None)
    faculty = serializers.IntegerField(required=False, allow_null=True, default=None)
    course = serializers.PrimaryKeyRelatedField(
        queryset=Course.objects.all(), required=False, allow_null=True, default=None
    )
    section = serializers.PrimaryKeyRelatedField(
        queryset=Section.objects.all(), required=False, allow_null=True, default=None
    )
    year = serializers.IntegerField(required=False, allow_null=True, default=None)
    semester = serializers.IntegerField(required=False, allow_null=True, default=None)
    #
    CLASSNAME = False
    DETAILED = False
    raw = None

    class Meta:
        model = ClassDetails
        fields = "__all__"

    def __init__(
        self,
        instance=None,
        classname=False,
        detailed=False,
        exclude_section=False,
        **kwargs,
    ):
        self.CLASSNAME = classname
        self.DETAILED = detailed
        self.EXCLUDE_SECTION = exclude_section
        super().__init__(instance, **kwargs)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if self.CLASSNAME:
            ID = data.get("id")
            repr_data = {}
            repr_data["education_level"] = instance.get_education_level_display()
            repr_data["course"] = instance.course.course if instance.course else None
            repr_data["grade"] = instance.get_grade_display()
            repr_data["faculty"] = instance.get_faculty_display()
            year = instance.get_year_display()
            repr_data["year"] = f"{year} year" if year else None
            semester = instance.get_semester_display()
            repr_data["semester"] = f"{semester} sem." if semester else None
            repr_data["section"] = (
                instance.section.section if instance.section else None
            )
            classname = self.generateClassName(repr_data, self.EXCLUDE_SECTION)
            # v2 key — invalidates pre-titlecase cached values.
            cache.set(f"classnames:v2:{ID}", classname)
            data["name"] = classname
        return data

    name_fields = (
        "grade",
        "faculty",
        "course",
        "year",
        "semester",
    )

    def generateClassName(
        self, class_details: dict, exclude_section: bool = False
    ) -> str:
        """if class_details.education_level
        montessory ? "montessory"
        school ? "<grade> <section?>"
        highschool ? "<faculty> <grade> <section?>"
        diploma/prediploma ? "<course> <year/semester> <section>"
        bachelor/master ? "<course> <year/semester?> <section?>"

        exclude_section for top-level class name!
        """
        class_details = {
            key: value for key, value in class_details.items() if value
        }  # cleaned class_details;
        level = class_details.get("education_level")
        if not level:
            return ""
        # ---
        delimeter = "_" if exclude_section else "-"

        def genName():
            classname = delimeter.join(
                [class_details[key] for key in self.name_fields if key in class_details]
            ).replace("--", "")
            if not exclude_section and "section" in class_details:
                section = class_details.get("section")
                classname += " " + f"({section})"
            return classname

        # ---
        className = ""
        if level == "montessory":
            exclude_section = False
            className = level + " " + genName()
        elif level == "school" or level == "school (GOVT.)":
            className = level + " " + genName()
        elif level == "highschool":
            className = genName()
        elif level in ["pre diploma", "diploma", "bachelor", "master"]:
            className = genName()
        return self._titleCase(className)

    @staticmethod
    def _titleCase(className: str) -> str:
        # Title-case each whitespace-separated token while leaving fully
        # upper-case tokens like "(BLUE)" / "(GOVT.)" untouched. Tokens
        # joined by "-" inside genName() (e.g. "science-eleven") get each
        # segment capitalised, yielding "Science-Eleven".
        if not className:
            return className
        out = []
        for token in className.split(" "):
            if any(ch.isalpha() for ch in token) and not any(
                ch.islower() for ch in token
            ):
                out.append(token)
            else:
                out.append("-".join(p.capitalize() for p in token.split("-")))
        return " ".join(out)


class ClassInfoSerializer(ClassDetailsSerializer, serializers.ModelSerializer):
    """
    ClassInfo contains each class details separately per school.
    """

    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.all(), required=False
    )
    # batch is an additive, mostly-NULL dimension (see Batch/ClassInfo).
    batch = serializers.PrimaryKeyRelatedField(
        queryset=Batch.objects.all(), required=False, allow_null=True, default=None
    )

    class Meta:
        model = ClassInfo
        fields = "__all__"

    def to_internal_value(self, data):
        # `batch` is part of ClassInfo.unique_together, so DRF auto-adds a
        # UniqueTogetherValidator that treats batch as IMPLICITLY REQUIRED,
        # overriding the field-level `required=False`. Worse, when this serializer
        # is nested under a `partial=True` parent (e.g. Fee update), DRF skips the
        # field default, so an omitted `batch` never reaches `attrs` and the
        # validator raised "This field is required" -> the client saw
        # "Invalid request!" on every fee edit. This serializer always FULLY
        # describes a class for get_or_create, and batch-agnostic callers legitimately
        # omit batch (fees are batch-agnostic by design), so inject an explicit
        # NULL when it's absent. Batch-aware callers that pass a batch are untouched.
        if isinstance(data, dict) and "batch" not in data:
            data = {**data, "batch": None}
        return super().to_internal_value(data)
