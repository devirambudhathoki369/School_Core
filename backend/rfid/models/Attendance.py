from django.core.validators import MaxLengthValidator
from django.db import models

from customs.EncryptedField import EncryptedCharField
from main.models.BaseModel import BaseModel
from .Device import Device


class RFIDAttdUser(BaseModel):
    """
    User linked to device and app:main.profiles
    """

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="users")
    pin = models.CharField(max_length=24)
    privilege = models.IntegerField(default=0)
    password = EncryptedCharField(blank=True, validators=[MaxLengthValidator(16)])
    card = models.CharField(max_length=32, blank=True)
    group_id = models.IntegerField(default=1)
    tz_str = models.CharField(max_length=32, blank=True)
    verify = models.IntegerField(default=-1)
    student = models.ForeignKey(
        "main.Student",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="students",
    )
    staff = models.ForeignKey(
        "main.Staff",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="staffs",
    )

    class Meta:
        unique_together = ("device", "pin")

    def __str__(self):
        return f"{self.pin} [Device: {self.device}] [{self.role}]"

    @property
    def role(self):
        has_student = hasattr(self, "student") and self.student is not None
        has_staff = hasattr(self, "staff") and self.staff is not None

        if has_student and not has_staff:
            return "student"
        elif has_staff and not has_student:
            return "staff"
        elif has_student and has_staff:
            return "both"
        else:
            return "unknown"


# ===


class RFIDAttdLogs(models.Model):
    """
    RFID Attendance Logs or User Activities

    TODO:
    - Apply Retention-Period
    """

    STATUS_LABELS = {
        0: "Check-in",
        1: "Check-out",
        2: "Break-out",
        3: "Break-in",
        4: "OT-in",
        5: "OT-out",
        255: "Punch",
    }
    VERIFY_LABELS = {
        1: "Fingerprint",
        4: "RFID card",
        15: "Face",
        25: "Palm",
        200: "Barcode/QR",
    }

    user = models.ForeignKey(
        RFIDAttdUser,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="attlogs",
    )
    punch_time = models.DateTimeField()
    status = models.IntegerField()
    verify = models.IntegerField()
    workcode = models.IntegerField(default=0)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "punch_time", "status", "verify")
        indexes = [
            models.Index(fields=["user", "punch_time"]),
        ]

    def __str__(self):
        return f"{self.punch_time:%Y-%m-%d %H:%M:%S} ({self.status_label}) ({self.verify_label})"

    @property
    def verify_label(self):
        return self.VERIFY_LABELS.get(self.verify, f"Mode {self.verify}")

    @property
    def status_label(self):
        return self.STATUS_LABELS.get(self.status, f"Status {self.status}")
