from django.db.models import (
    Model,
    ForeignKey,
    OneToOneField,
    IntegerField,
    ImageField,
    JSONField,
    DecimalField,
    CASCADE,
)

#
from customs.NepaliDateField import NepaliDateField

#
from .BaseModel import BaseModel, CustomCharField, CustomEmailField
from .base_models.OtherInfo import BaseOtherInfo
from ..choices import GENDER_CHOICES
from ..constants.name_sizes import NAME_CONFIG, FULL_NAME_CONFIG, SALARY_CONFIG

#
STAFF_STATUS_CHOICES = [
    (1, "employed"),
    (2, "departed"),
    (3, "retired"),
    (4, "on leave"),
]
#
MARRITAL_STATUS_CHOICES = [
    (1, "unmarried"),
    (2, "married"),
]


#
class StaffRole(Model):
    role = CustomCharField(min_length=2, max_length=30)


class StaffFinanceInfo(Model):
    # The NET basic pay agreed with the staff member. Labelled "Basic salary
    # (Net)" on screen so there is no argument about whether the deductions are
    # already inside it: they are not, they are withheld at payment time.
    basic_salary = DecimalField(**SALARY_CONFIG, default=0)
    # A second earning that behaves exactly like the basic salary -- it is
    # posted with the month, settled on the same receipt, and appears on the
    # pay slip, the salary sheet and the staff ledger beside it. Schools use it
    # for the fund amounts they pay on top of pay (welfare / provident style
    # contributions that are part of what the staff is owed, not a deduction).
    # Default 0, so every staff member who existed before this field simply
    # earns nothing under it and no bill or sheet changes.
    funds = DecimalField(**SALARY_CONFIG, default=0)
    grade = DecimalField(**SALARY_CONFIG, default=0)
    allowance = DecimalField(**SALARY_CONFIG, default=0)
    extra = DecimalField(**SALARY_CONFIG, default=0)
    pan_no = CustomCharField(
        min_length=1, max_length=20, null=True, blank=True
    )  # TODO: fix this size;
    insurance = DecimalField(**SALARY_CONFIG, default=0)
    pf_contrib = DecimalField(
        **SALARY_CONFIG,
        default=0,
    )

    class Meta:
        abstract = True


class StaffOtherInfo(BaseOtherInfo, StaffFinanceInfo):
    birth_date = NepaliDateField()
    gender = IntegerField(choices=GENDER_CHOICES)
    email = CustomEmailField(null=True, blank=True)
    # citizenship number, as printed on the certificate (digits, slashes and
    # dashes) — optional: plenty of staff are enrolled without it to hand.
    citizenship_no = CustomCharField(min_length=1, max_length=30, null=True, blank=True)
    father_name = CustomCharField(**FULL_NAME_CONFIG)
    mother_name = CustomCharField(**FULL_NAME_CONFIG)
    qualification = CustomCharField(min_length=3, max_length=300, null=True, blank=True)
    experience = CustomCharField(min_length=3, max_length=300, null=True, blank=True)
    marrital_status = IntegerField(choices=MARRITAL_STATUS_CHOICES, default=1)
    joined_date = NepaliDateField(null=True, blank=True)


class Staff(BaseModel):
    role = ForeignKey("main.StaffRole", on_delete=CASCADE)
    status = IntegerField(choices=STAFF_STATUS_CHOICES, default=1)
    first_name = CustomCharField(**NAME_CONFIG)
    middle_name = CustomCharField(**NAME_CONFIG, null=True)
    last_name = CustomCharField(**NAME_CONFIG)
    #
    # TODO: convert subjects to CustomCharField.
    primary_subject = ForeignKey(
        "main.Subject",
        null=True,
        blank=True,
        on_delete=CASCADE,
        related_name="primary_subjects",
    )
    secondary_subject = ForeignKey(
        "main.Subject",
        null=True,
        blank=True,
        on_delete=CASCADE,
        related_name="secondary_subjects",
    )
    #
    primary_contact = CustomCharField(min_length=10, max_length=10)
    secondary_contact = CustomCharField(
        min_length=10, max_length=10, null=True, blank=True
    )
    #
    location = CustomCharField(min_length=2, max_length=50)
    # RFID card number, storable independently of any attendance device so it
    # can be recorded before a device is registered and synced once one is.
    rfid_card = CustomCharField(max_length=32, null=True, blank=True)
    image = ImageField(upload_to="staff_profiles", null=True, blank=True)
    other_info = OneToOneField(
        "main.StaffOtherInfo", on_delete=CASCADE, null=True, blank=True
    )
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    account = OneToOneField(
        "account.StaffAccount", on_delete=CASCADE, null=True, blank=True
    )
    permissions = JSONField(default=list)
