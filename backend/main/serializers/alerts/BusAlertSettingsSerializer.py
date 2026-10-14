from rest_framework import serializers

from ...models.Alerts import BusTrackOnAlertInfo
from ...models.Student import Student
from ...models.Staff import Staff
from account.auth.UserRole import UserRoles


class BusAlertSettingsSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(required=False, read_only=True)
    alerted_date = serializers.DateField(
        allow_null=True, required=False, read_only=True
    )
    #
    user_id = serializers.IntegerField(write_only=True, help_text="Student/Staff ID")

    class Meta:
        model = BusTrackOnAlertInfo
        fields = "__all__"
        read_only_fields = ["is_active", "student_id", "alerted_date"]

    def to_internal_value(self, data):
        role = data.pop("role")
        validated_data = super().to_internal_value(data)
        user_id = data.pop("user_id")
        if role == UserRoles.ROLE_STUDENT:
            validated_data["student_id"] = Student.objects.get(id=user_id)
        elif role == UserRoles.ROLE_STAFF:
            validated_data["staff_id"] = Staff.objects.get(id=user_id)
        validated_data.pop("user_id")
        return validated_data
