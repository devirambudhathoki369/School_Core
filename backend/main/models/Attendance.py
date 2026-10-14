from django.db.models import ForeignKey, BooleanField, DateTimeField, CASCADE


#
from customs.NepaliDateField import NepaliDateField
from .BaseModel import BaseModel, CustomCharField
from ..methods.nepaliDatetime import ndt_today


class ClassAttendance(BaseModel):
    date = NepaliDateField(default=ndt_today)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    teacher = ForeignKey("main.Staff", on_delete=CASCADE, null=True, blank=True)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    # class Meta:
    #     unique_together = ("date", "class_info", "school")


class StudentAttendance(BaseModel):
    class_attendance = ForeignKey("main.ClassAttendance", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE)
    status = BooleanField(default=False)
    # First punch (check-in) time for a present record; null for manual entries
    # or absent. Stored as a UTC instant (display in local time).
    checked_in_at = DateTimeField(null=True, blank=True)
    # Last punch (check-out), only when the school enables checkout tracking and
    # the punch is >= 1 hour after check-in. Null otherwise.
    checked_out_at = DateTimeField(null=True, blank=True)
    reason = CustomCharField(min_length=2, max_length=50)

    # class Meta:
    #     unique_together = ("class_attendance", "student", "status")


""" Staff Attendance """


class StaffAttendance(BaseModel):
    date = NepaliDateField(default=ndt_today)
    staff = ForeignKey("main.Staff", on_delete=CASCADE)
    status = BooleanField(default=False)
    # First punch (check-in) time for a present record; null for manual entries
    # or absent. Stored as a UTC instant (display in local time).
    checked_in_at = DateTimeField(null=True, blank=True)
    # Last punch (check-out), only when the school enables checkout tracking and
    # the punch is >= 1 hour after check-in. Null otherwise.
    checked_out_at = DateTimeField(null=True, blank=True)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    reason = CustomCharField(min_length=2, max_length=50)

    # class Meta:
    #     unique_together = ("date", "staff", "school", "status")
