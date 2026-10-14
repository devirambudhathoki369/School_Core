from ..models.Course import Course
from ..models.ClassInfo import ClassInfo
from ..choices.Education import FACULTY_CHOICES

#
from rest_framework import serializers

HIGHSCHOOL = 3
FACULTY_NAMES = dict(FACULTY_CHOICES)


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = "__all__"

    def to_representation(self, data):
        """Convert to JSON."""
        return data

    def validate(self, attrs):
        """A +2 stream must name its faculty; nothing else may carry one.

        The faculty is what keeps Education ▸ Computer Science out of the
        Management picker. Once classes are built on a stream, its faculty is
        fixed — moving it would leave those classes under a stream of another
        faculty.
        """
        instance = self.instance
        level = attrs.get("education_level", getattr(instance, "education_level", None))
        if level != HIGHSCHOOL:
            attrs["faculty"] = None
            return attrs

        faculty = attrs.get("faculty", getattr(instance, "faculty", None))
        if not faculty:
            raise serializers.ValidationError(
                {"faculty": "Pick the faculty this stream belongs to."}
            )

        if instance is not None and instance.faculty != faculty:
            used_under = set(
                ClassInfo.objects.filter(course=instance)
                .exclude(faculty=faculty)
                .exclude(faculty__isnull=True)
                .values_list("faculty", flat=True)
            )
            if used_under:
                names = ", ".join(FACULTY_NAMES.get(f, str(f)).title() for f in used_under)
                raise serializers.ValidationError(
                    {"faculty": f"Classes already use this stream under {names}; its faculty can't change."}
                )

        school = attrs.get("school", getattr(instance, "school", None))
        name = (attrs.get("course", getattr(instance, "course", "")) or "").strip()
        twin = Course.objects.filter(
            school=school,
            education_level=HIGHSCHOOL,
            faculty=faculty,
            course__iexact=name,
            is_active=True,
        )
        if instance is not None:
            twin = twin.exclude(id=instance.id)
        if twin.exists():
            raise serializers.ValidationError(
                {"course": f"{FACULTY_NAMES.get(faculty, '').title()} already has a stream called {name}."}
            )
        return attrs


def first_error(errors) -> str:
    """The first readable message out of a serializer's errors."""
    if isinstance(errors, dict):
        for value in errors.values():
            return first_error(value)
    if isinstance(errors, (list, tuple)) and errors:
        return first_error(errors[0])
    return str(errors) if errors else "Invalid request!"
