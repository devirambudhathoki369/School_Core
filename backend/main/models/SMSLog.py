from django.db.models import (
    ForeignKey,
    IntegerField,
    BigIntegerField,
    PositiveSmallIntegerField,
    TextField,
    DateTimeField,
    Index,
    CASCADE,
)

#
from .BaseModel import BaseModel, CustomCharField, _allow_empty
from django.utils import timezone

#
from customs.NepaliDateField import NepaliDateField
from ..methods.nepaliDatetime import ndt_today_npt


# WHY THIS TABLE EXISTS
# ---------------------
# Until now the only record of what a school had actually texted lived in the
# SMS provider's own panel, behind ONE login shared by every school on the
# platform. A school could not answer "did the dues reminder reach this parent?"
# without us opening that panel for them.
#
# The provider does expose a report API, but it is a flat, key-scoped, page-only
# feed (no date range, no number search), so it cannot back a filtered report and
# cannot be shown to a school without risking another school's rows. So we keep
# our own copy: one row per recipient per message, stamped with the school, at
# the moment the gateway accepts it.


# What kind of send produced this message. Deliberately about the FEATURE the
# admin used (that is what they search by), not about the SMS template type.
SMS_TYPE_BULK = 1
SMS_TYPE_DUES = 2
SMS_TYPE_ATTENDANCE = 3
SMS_TYPE_STAFF = 4
SMS_TYPE_BIRTHDAY = 5
SMS_TYPE_PAYMENT = 6
SMS_TYPE_COLLECTION = 7
SMS_TYPE_OTP = 8
SMS_TYPE_OTHER = 9

SMS_TYPE_CHOICES = (
    (SMS_TYPE_BULK, "Bulk SMS"),
    (SMS_TYPE_DUES, "Dues Reminder"),
    (SMS_TYPE_ATTENDANCE, "Attendance"),
    (SMS_TYPE_STAFF, "Staff SMS"),
    (SMS_TYPE_BIRTHDAY, "Birthday"),
    (SMS_TYPE_PAYMENT, "Payment"),
    (SMS_TYPE_COLLECTION, "Daily Collection"),
    (SMS_TYPE_OTP, "OTP"),
    (SMS_TYPE_OTHER, "Other"),
)

# The gateway's own words, kept verbatim rather than mapped to codes of our own:
# the school sees the same status the provider's panel shows them.
STATUS_QUEUED = "queued"       # accepted by the gateway, not yet confirmed
STATUS_DELIVERED = "delivered"  # confirmed by the delivery report
STATUS_ABORTED = "aborted"     # gateway rejected the number
STATUS_FAILED = "failed"       # we never got an answer from the gateway


class SMSLog(BaseModel):
    """
    One row per RECIPIENT per message — the same granularity the provider's log
    uses, so a 300-parent bulk send writes 300 rows and the credit column adds up
    to what the school was actually charged.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    sms_type = IntegerField(choices=SMS_TYPE_CHOICES, default=SMS_TYPE_OTHER)
    #
    receiver = CustomCharField(min_length=1, max_length=20)
    message = TextField(blank=True)
    network = CustomCharField(min_length=1, max_length=20, blank=True, default="")
    credit = PositiveSmallIntegerField(default=0)
    status = CustomCharField(min_length=1, max_length=20, default=STATUS_QUEUED)
    # the provider's own message id — the join key for the delivery-report sync,
    # and what the school quotes at us when they query a message.
    provider_id = BigIntegerField(**_allow_empty)
    #
    # Both stamps are kept on purpose: `date` is the Nepali (BS) day every other
    # report in this system filters by, `sent_at` is the exact clock time the
    # log shows in its "Send On" column.
    date = NepaliDateField(default=ndt_today_npt)
    # `default=`, NOT `auto_now_add=`: an auto_now_add column ignores whatever
    # you assign it, so history imported from the provider would all have been
    # stamped with the moment of the import rather than when each message
    # actually went out. Live sends still get "now" without passing anything.
    sent_at = DateTimeField(default=timezone.now)
    delivered_at = DateTimeField(**_allow_empty)

    class Meta:
        ordering = ("-sent_at", "-id")
        indexes = [
            # the report's own query: one school, one BS date window.
            Index(fields=["school", "date"]),
            # "what went out just now" + the default ordering.
            Index(fields=["school", "-sent_at"]),
            # searching the log by mobile number.
            Index(fields=["school", "receiver"]),
            # the delivery-report sync looks rows up by the provider's id.
            Index(fields=["provider_id"]),
        ]

    def __str__(self) -> str:
        return f"{self.receiver} [{self.status}]"
