from django.db.models import (
    ForeignKey,
    IntegerField,
    DateTimeField,
    JSONField,
    Index,
    CASCADE,
)

#
from .BaseModel import BaseModel, CustomCharField, _allow_empty


# delivery outcome of a single push to a single device.
NOTIFICATION_STATUS_SENT = 1
NOTIFICATION_STATUS_FAILED = 2
NOTIFICATION_STATUS_STALE = 3  # FCM rejected the device token (unregistered/invalid)

NOTIFICATION_STATUS_CHOICES = (
    (NOTIFICATION_STATUS_SENT, "Sent"),
    (NOTIFICATION_STATUS_FAILED, "Failed"),
    (NOTIFICATION_STATUS_STALE, "Stale Token"),
)

# who the notification was addressed to.
RECIPIENT_ROLE_STUDENT = "student"
RECIPIENT_ROLE_STAFF = "staff"
RECIPIENT_ROLE_CHOICES = (
    (RECIPIENT_ROLE_STUDENT, "Student"),
    (RECIPIENT_ROLE_STAFF, "Staff"),
)


class NotificationHistory(BaseModel):
    """
    One row per push notification delivered (or attempted) to one device.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    recipient_role = CustomCharField(
        min_length=1, max_length=10, choices=RECIPIENT_ROLE_CHOICES
    )
    recipient_id = IntegerField(help_text="Student/Staff id the push was sent to")
    #
    title = CustomCharField(min_length=1, max_length=120)
    body = CustomCharField(min_length=1, max_length=500)
    data = JSONField(**_allow_empty)
    #
    status = IntegerField(choices=NOTIFICATION_STATUS_CHOICES)
    sent_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-sent_at",)
        indexes = [
            # the common lookup: a school's recent notifications for one recipient.
            Index(fields=["school", "recipient_role", "recipient_id", "-sent_at"]),
        ]
