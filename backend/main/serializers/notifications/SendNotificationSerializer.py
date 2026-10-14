from rest_framework import serializers

from account.auth.UserRole import UserRoles


class SendNotificationSerializer(serializers.Serializer):
    """
    Request body for sending a push notification to selected student/staff devices.
    """

    recipient_role = serializers.ChoiceField(
        choices=[UserRoles.ROLE_STUDENT, UserRoles.ROLE_STAFF],
        help_text="Whose devices to notify: 'student' or 'staff'.",
    )
    user_ids = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False,
        help_text="Student/Staff IDs to notify.",
    )
    title = serializers.CharField(max_length=120)
    body = serializers.CharField(max_length=500)
    data = serializers.DictField(
        required=False,
        help_text="Optional key/value payload delivered with the notification.",
    )
