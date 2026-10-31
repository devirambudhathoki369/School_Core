"""
Real rows for facts that still live in JSON columns.

    ClassPeriod       1 ──── 0..* ClassPeriodSlot            0..* ──── 0..1 Subject, Staff
    ExamSchedule      1 ──── 0..* ExamScheduleSubject        0..* ──── 1    Subject
    SubjectAssignment 1 ──── 0..* SubjectAssignmentStudent   0..* ──── 1    Student
    Staff             1 ──── 0..* StaffPermissionGrant       0..* ──── 1    StaffPermission
    StudentLedger     1 ──── 0..* StudentLedgerLine          0..* ──── 0..1 FeeTitle
    StudentInvoice    1 ──── 0..* StudentInvoiceLine         0..* ──── 0..1 FeeTitle
    StaffLedger       1 ──── 0..* StaffLedgerLine
    StaffInvoice      1 ──── 0..* StaffInvoiceLine

This is the expand step of expand/contract. Triggers from migration 0108 rewrite
these rows whenever the JSON column changes, so bulk_create and update() are
covered and no view has to change yet. Read them; never write them from the app.
The JSON stays the source of truth until a later release moves the writers here
and drops it.

A reference the JSON holds to a row that no longer exists is left out (or NULL
where the line must survive), because a foreign key cannot hold it.
"""

from django.db.models import (
    CASCADE,
    PROTECT,
    SET_NULL,
    CharField,
    DecimalField,
    ForeignKey,
    Model,
    PositiveIntegerField,
    PositiveSmallIntegerField,
    TextField,
    UniqueConstraint,
)

from customs.NepaliDateField import NepaliDateField


class ClassPeriodSlot(Model):
    # No index of its own: the unique key below starts with this column.
    class_period = ForeignKey(
        "main.ClassPeriod", on_delete=CASCADE, db_index=False, related_name="slots"
    )
    period_no = PositiveSmallIntegerField()
    subject = ForeignKey(
        "main.Subject", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )
    teacher = ForeignKey(
        "main.Staff", on_delete=SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["class_period", "period_no"], name="one_slot_per_period"
            )
        ]


class ExamScheduleSubject(Model):
    schedule = ForeignKey(
        "main.ExamSchedule", on_delete=CASCADE, db_index=False, related_name="subjects"
    )
    subject = ForeignKey("main.Subject", on_delete=CASCADE, related_name="+")
    exam_date = NepaliDateField(null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["schedule", "subject"], name="one_date_per_schedule_subject"
            )
        ]


class SubjectAssignmentStudent(Model):
    assignment = ForeignKey(
        "main.SubjectAssignment",
        on_delete=CASCADE,
        db_index=False,
        related_name="student_links",
    )
    student = ForeignKey("main.Student", on_delete=CASCADE, related_name="+")

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["assignment", "student"], name="student_once_per_assignment"
            )
        ]


class StaffPermission(Model):
    """The catalog. The ids are the ones the frontend menus and the permission map use."""

    code = PositiveIntegerField(primary_key=True)
    name = CharField(max_length=80)


class StaffPermissionGrant(Model):
    staff = ForeignKey(
        "main.Staff", on_delete=CASCADE, db_index=False, related_name="permission_grants"
    )
    permission = ForeignKey(
        "main.StaffPermission", on_delete=PROTECT, related_name="grants"
    )

    class Meta:
        constraints = [
            UniqueConstraint(fields=["staff", "permission"], name="grant_once_per_staff")
        ]


class BaseFeeLine(Model):
    line_no = PositiveSmallIntegerField()
    # NULL for what is not a fee title: `code` then holds the JSON key, such as
    # tn (transportation), od (old dues), ob (opening balance) or cfo (carried out).
    title = ForeignKey("main.FeeTitle", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    code = CharField(max_length=32, blank=True, default="")
    # The title as it was printed on that day, which a later rename must not change.
    label = TextField(null=True, blank=True)
    amount = DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        abstract = True


class StudentLedgerLine(BaseFeeLine):
    ledger = ForeignKey(
        "main.StudentLedger", on_delete=CASCADE, db_index=False, related_name="lines"
    )

    class Meta:
        constraints = [
            UniqueConstraint(fields=["ledger", "line_no"], name="one_student_ledger_line_no")
        ]


class StudentInvoiceLine(BaseFeeLine):
    invoice = ForeignKey(
        "main.StudentInvoice", on_delete=CASCADE, db_index=False, related_name="lines"
    )
    due = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    discount = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["invoice", "line_no"], name="one_student_invoice_line_no")
        ]


class StaffLedgerLine(Model):
    ledger = ForeignKey(
        "main.StaffLedger", on_delete=CASCADE, db_index=False, related_name="lines"
    )
    line_no = PositiveSmallIntegerField()
    code = CharField(max_length=32)  # salary, grade, allowance, extra, ...
    amount = DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["ledger", "line_no"], name="one_staff_ledger_line_no")
        ]


class StaffInvoiceLine(Model):
    invoice = ForeignKey(
        "main.StaffInvoice", on_delete=CASCADE, db_index=False, related_name="lines"
    )
    line_no = PositiveSmallIntegerField()
    code = CharField(max_length=32)
    amount = DecimalField(max_digits=14, decimal_places=2)
    due = DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["invoice", "line_no"], name="one_staff_invoice_line_no")
        ]
