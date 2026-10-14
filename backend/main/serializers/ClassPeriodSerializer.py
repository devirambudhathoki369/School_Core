from rest_framework import serializers

#
from ..models.ClassPeriod import ClassPeriod
from ..models.FiscalYears import AcademicYear


class ClassPeriodSerializer(serializers.ModelSerializer):
    academic_year = serializers.PrimaryKeyRelatedField(
        queryset=AcademicYear.objects.all()
    )

    class Meta:
        model = ClassPeriod
        fields = "__all__"

    def to_representation(self, data):
        return data
