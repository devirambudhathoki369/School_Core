"""Running the hostel day to day: roll call, gate passes, visitors, complaints,
the mess menu, and the discipline register.

Every one of these is scoped by BOTH `school` and `hostel`. The school scope is
what the tenant boundary in the authenticator checks against
(`account/auth/Authentication.belongs_to_school`); the hostel scope is what lets
a school with a boys' and a girls' hostel run them as two separate registers
without two separate logins.
"""

from django.db.models import (
    ForeignKey,
    IntegerField,
    TextField,
    TimeField,
    CASCADE,
    SET_NULL,
)

from customs.NepaliDateField import NepaliDateField
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty
from main.methods.nepaliDatetime import ndt_today
from ..constants import (
    HOSTEL_ATTENDANCE_CHOICES,
    ATT_PRESENT,
    LEAVE_TYPE_CHOICES,
    LEAVE_DAY_OUT,
    LEAVE_STATUS_CHOICES,
    LEAVE_PENDING,
    COMPLAINT_CATEGORY_CHOICES,
    COMPLAINT_OTHER,
    COMPLAINT_STATUS_CHOICES,
    COMPLAINT_OPEN,
    PRIORITY_CHOICES,
    PRIORITY_NORMAL,
    WEEKDAY_CHOICES,
    MEAL_CHOICES,
)


class HostelAttendance(BaseModel):
    """Night roll call. One row per resident per day.

    Separate from `main.Attendance` on purpose: school attendance answers "were
    you in class", hostel attendance answers "did you sleep here", and the two
    disagree constantly (a day scholar's sick day, a boarder's exam leave). One
    table serving both questions would give the wrong answer to each.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="attendances")
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_attendances"
    )
    date = NepaliDateField(default=ndt_today)
    status = IntegerField(choices=HOSTEL_ATTENDANCE_CHOICES, default=ATT_PRESENT)
    remarks = CustomCharField(min_length=1, max_length=100, **_allow_empty)

    class Meta:
        # A second save for the same night is a CORRECTION, not a second row —
        # the view updates in place.
        unique_together = ("student", "date")

    def __str__(self):
        return f"{self.student_id} {self.date}"


class HostelLeave(BaseModel):
    """Gate pass / outpass — a resident leaving the premises, and coming back.

    `actual_return_date` is what makes an overdue list possible: an approved
    leave whose `to_date` has passed and that has never been marked returned is
    a student nobody can currently account for.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="leaves")
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_leaves"
    )
    leave_type = IntegerField(choices=LEAVE_TYPE_CHOICES, default=LEAVE_DAY_OUT)
    from_date = NepaliDateField(default=ndt_today)
    to_date = NepaliDateField(default=ndt_today)
    out_time = TimeField(**_allow_empty)
    in_time = TimeField(**_allow_empty)
    reason = TextField(**_allow_empty)
    # Where the student can be reached while away — often not the number on the
    # student record.
    contact_during_leave = CustomCharField(
        min_length=6, max_length=15, **_allow_empty
    )
    escorted_by = CustomCharField(min_length=2, max_length=60, **_allow_empty)
    status = IntegerField(choices=LEAVE_STATUS_CHOICES, default=LEAVE_PENDING)
    approved_by = ForeignKey(
        "main.Staff", on_delete=SET_NULL, related_name="approved_hostel_leaves",
        **_allow_empty,
    )
    actual_return_date = NepaliDateField(**_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=100, **_allow_empty)

    def __str__(self):
        return f"{self.student_id} {self.from_date}..{self.to_date}"


class HostelVisitor(BaseModel):
    """The gate register. Who came, for whom, when they left."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="visitors")
    # Nullable: a supplier or an inspector is a visitor to the hostel, not to a
    # student.
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_visitors",
        **_allow_empty,
    )
    name = CustomCharField(min_length=2, max_length=60)
    relation = CustomCharField(min_length=2, max_length=30, **_allow_empty)
    contact = CustomCharField(min_length=6, max_length=15, **_allow_empty)
    id_proof = CustomCharField(min_length=2, max_length=40, **_allow_empty)
    persons = IntegerField(default=1)
    purpose = CustomCharField(min_length=2, max_length=100, **_allow_empty)
    visit_date = NepaliDateField(default=ndt_today)
    in_time = TimeField(**_allow_empty)
    out_time = TimeField(**_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=100, **_allow_empty)

    def __str__(self):
        return f"{self.name} -> {self.student_id or self.hostel_id}"


class HostelComplaint(BaseModel):
    """Maintenance requests and grievances, with who owns them and when they closed."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="complaints")
    room = ForeignKey(
        "hostel.HostelRoom", on_delete=SET_NULL, related_name="complaints",
        **_allow_empty,
    )
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_complaints",
        **_allow_empty,
    )
    category = IntegerField(
        choices=COMPLAINT_CATEGORY_CHOICES, default=COMPLAINT_OTHER
    )
    priority = IntegerField(choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL)
    title = CustomCharField(min_length=2, max_length=100)
    description = TextField(**_allow_empty)
    status = IntegerField(choices=COMPLAINT_STATUS_CHOICES, default=COMPLAINT_OPEN)
    assigned_to = ForeignKey(
        "main.Staff", on_delete=SET_NULL, related_name="hostel_complaints",
        **_allow_empty,
    )
    reported_date = NepaliDateField(default=ndt_today)
    resolved_date = NepaliDateField(**_allow_empty)
    resolution = TextField(**_allow_empty)

    def __str__(self):
        return f"{self.hostel_id} :: {self.title}"


class HostelMessMenu(BaseModel):
    """The weekly menu — one row per (hostel, weekday, meal)."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="mess_menu")
    day_of_week = IntegerField(choices=WEEKDAY_CHOICES)
    meal = IntegerField(choices=MEAL_CHOICES)
    items = TextField(**_allow_empty)

    class Meta:
        unique_together = ("hostel", "day_of_week", "meal")

    def __str__(self):
        return f"{self.hostel_id} {self.day_of_week}/{self.meal}"


class HostelDisciplineRecord(BaseModel):
    """The incident register. Kept as its own table rather than as a complaint
    category, because a discipline note is about a STUDENT and follows them,
    while a complaint is about a room and closes when the tap is fixed."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    hostel = ForeignKey(
        "hostel.Hostel", on_delete=CASCADE, related_name="discipline_records"
    )
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_discipline_records"
    )
    date = NepaliDateField(default=ndt_today)
    severity = IntegerField(choices=PRIORITY_CHOICES, default=PRIORITY_NORMAL)
    description = TextField()
    action_taken = TextField(**_allow_empty)
    reported_by = ForeignKey(
        "main.Staff", on_delete=SET_NULL, related_name="hostel_discipline_reports",
        **_allow_empty,
    )
    guardian_informed = IntegerField(default=0)  # 0 no / 1 yes

    def __str__(self):
        return f"{self.student_id} {self.date}"
