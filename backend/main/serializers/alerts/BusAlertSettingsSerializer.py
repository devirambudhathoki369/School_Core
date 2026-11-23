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
        # The alert's spot and range: this endpoint sets up an alert, so they
        # are asked for as they always were (the model allows a bus followed
        # without an alert, chosen in the SchoolCore app).
        extra_kwargs = {
            "latitude": {"required": True, "allow_null": False},
            "longitude": {"required": True, "allow_null": False},
            "alert_range": {"required": True, "allow_null": False},
        }

    ALERT_FIELDS = ("latitude", "longitude", "alert_range")

    def validate(self, attrs):
        """A partial update of a bus followed without an alert must bring the
        whole alert: the database keeps the three together."""
        attrs = super().validate(attrs)
        given = [field for field in self.ALERT_FIELDS if attrs.get(field) is not None]
        kept = [field for field in self.ALERT_FIELDS
                if self.instance is not None and getattr(self.instance, field) is not None]
        if set(given) | set(kept) not in (set(), set(self.ALERT_FIELDS)):
            raise serializers.ValidationError("Send the latitude, longitude and alert range together.")
        return attrs

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
