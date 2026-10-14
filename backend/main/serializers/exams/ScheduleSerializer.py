from rest_framework import serializers

#
from ...models.exams.Schedule import ExamSchedule


class ExamScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExamSchedule
        fields = "__all__"
