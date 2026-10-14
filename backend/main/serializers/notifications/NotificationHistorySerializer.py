from rest_framework import serializers

from ...models.Notification import NotificationHistory


class NotificationHistorySerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = NotificationHistory
        fields = (
            "id",
            "recipient_role",
            "recipient_id",
            "title",
            "body",
            "data",
            "status",
            "status_display",
            "sent_at",
        )
