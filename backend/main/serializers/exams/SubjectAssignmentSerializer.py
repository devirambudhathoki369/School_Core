from rest_framework import serializers

#
from ...models.exams.SubjectAssignment import SubjectAssignment


class SubjectAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubjectAssignment
        fields = "__all__"
