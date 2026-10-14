from rest_framework import serializers

#
from ...models.exams.Exam import Exam
from ...constants.marks_field import MARKS_FIELD_CONFIGS


class ExamSerializer(serializers.ModelSerializer):
    inclusion = serializers.DecimalField(
        **MARKS_FIELD_CONFIGS, required=False, allow_null=True
    )
    attendance_inclusion = serializers.BooleanField(
        default=False, required=False, allow_null=True
    )

    class Meta:
        model = Exam
        fields = "__all__"

    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        if data.get("attendance_inclusion") is None:
            data["attendance_inclusion"] = False
        return data
