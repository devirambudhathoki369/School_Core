from main.methods.uploads import private_documents
from django.db.models import (
    Model,
    IntegerField,
    DecimalField,
    ForeignKey,
    OneToOneField,
    ImageField,
    BooleanField,
    TextField,
    CASCADE,
)

#
from customs.NepaliDateField import NepaliDateField

#

from .BaseModel import BaseModel, CustomCharField, CustomEmailField, _allow_empty
from .base_models.OtherInfo import BaseOtherInfo
from ..methods.nepaliDatetime import ndt_today

from ..choices import GENDER_CHOICES, OCCUPATION_CHOICES
from ..constants.name_sizes import NAME_CONFIG, FULL_NAME_CONFIG

STUDENT_STATUS_CHOICES = [(1, "running"), (2, "passed out"), (3, "dropped out")]


class StudentGuardianInfo(Model):
    father_name = CustomCharField(**FULL_NAME_CONFIG)
    mother_name = CustomCharField(**FULL_NAME_CONFIG)
    guardian_name = CustomCharField(**FULL_NAME_CONFIG, **_allow_empty)
    father_occupation = IntegerField(choices=OCCUPATION_CHOICES, **_allow_empty)
    mother_occupation = IntegerField(choices=OCCUPATION_CHOICES, **_allow_empty)
    grandfather_occupation = IntegerField(choices=OCCUPATION_CHOICES, **_allow_empty)
    guardian_contact = CustomCharField(min_length=10, max_length=10)
    guardian_email = CustomEmailField(**_allow_empty)
    guardian_location = CustomCharField(min_length=2, max_length=50, **_allow_empty)


class StudentOtherInfo(BaseOtherInfo):
    pass


class Student(BaseModel):
    first_name = CustomCharField(**NAME_CONFIG)
    middle_name = CustomCharField(**NAME_CONFIG, **_allow_empty)
    last_name = CustomCharField(**NAME_CONFIG)
    birth_date = NepaliDateField()
    gender = IntegerField(choices=GENDER_CHOICES)
    email = CustomEmailField(**_allow_empty)
    contact = CustomCharField(min_length=10, max_length=10, **_allow_empty)
    location = CustomCharField(min_length=2, max_length=50)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    guardian_info = OneToOneField("main.StudentGuardianInfo", on_delete=CASCADE)
    other_info = OneToOneField(
        "main.StudentOtherInfo", on_delete=CASCADE, **_allow_empty
    )
    status = IntegerField(choices=STUDENT_STATUS_CHOICES, default=1)
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    # Immutable cohort tag for higher-ed students (set once at admission, never
    # changed by promotion or closing). NULL for every existing row and for
    # school students. See main/models/Batch.py.
    batch = ForeignKey("main.Batch", on_delete=CASCADE, **_allow_empty)
    roll_no = CustomCharField(min_length=1, max_length=15, **_allow_empty)
    symbol_no = CustomCharField(min_length=1, max_length=15, **_allow_empty)
    regd_no = CustomCharField(
        min_length=1,
        max_length=15,
        **_allow_empty,
        verbose_name="Registration Number",
    )
    emis = CustomCharField(min_length=1, max_length=50, **_allow_empty)
    image = ImageField(upload_to="student_profiles/%Y/", **_allow_empty)
    birth_certificate = ImageField(upload_to="student_documents/%Y/", storage=private_documents, **_allow_empty)
    nid = ImageField(upload_to="student_documents/%Y/", storage=private_documents, **_allow_empty)
    citizenship_front = ImageField(upload_to="student_documents/%Y/", storage=private_documents, **_allow_empty)
    citizenship_back = ImageField(upload_to="student_documents/%Y/", storage=private_documents, **_allow_empty)
    previous_school = CustomCharField(min_length=10, max_length=50, **_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=50, **_allow_empty)
    # RFID card number, storable independently of any attendance device so it
    # can be recorded before a device is registered and synced once one is.
    rfid_card = CustomCharField(max_length=32, **_allow_empty)
    account = OneToOneField("account.StudentAccount", on_delete=CASCADE, **_allow_empty)

    def __str__(self) -> str:
        return (
            f"{self.first_name} {self.middle_name} {self.last_name}"
            if self.middle_name
            else f"{self.first_name} {self.last_name}"
        )


class StudentTransportationInfo(BaseModel):
    bus_station = ForeignKey("main.BusStation", on_delete=CASCADE, **_allow_empty)
    start_date = NepaliDateField(default=ndt_today, **_allow_empty)
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="student_transportation_infos"
    )
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    remarks = CustomCharField(min_length=1, max_length=50, **_allow_empty)


class StudentDiscountInfo(BaseModel):
    title = ForeignKey("main.FeeTitle", on_delete=CASCADE, **_allow_empty)
    discount = DecimalField(max_digits=10, decimal_places=2, **_allow_empty)
    percentage = DecimalField(max_digits=10, decimal_places=2, **_allow_empty)
    student = ForeignKey("main.Student", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    remarks = CustomCharField(min_length=1, max_length=50, **_allow_empty)
    # The academic year the discount applies to (derived from the student's class
    # at creation). Lets the same fee title be discounted again after the student
    # moves to a new class/year, and lets reports group discounts by year.
    # Nullable so existing rows are untouched by the migration (backfill skipped).
    academic_year = ForeignKey(
        "main.AcademicYear", on_delete=CASCADE, **_allow_empty
    )


class StudentMedicalInfo(BaseModel):
    """One comprehensive medical record per student. All fields optional —
    the form is meant to be filled progressively as info is collected."""

    student = OneToOneField(
        "main.Student", on_delete=CASCADE, related_name="medical_info"
    )
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    # 1. Chronic illness
    has_chronic_illness = BooleanField(default=False)
    chronic_illness_details = TextField(**_allow_empty)
    # 2. Allergies (Food / Medicine / Others)
    allergies = TextField(**_allow_empty)
    # 3. Previous surgeries or hospitalization
    previous_surgeries = TextField(**_allow_empty)
    # 4. Physical disability (if any)
    physical_disability = TextField(**_allow_empty)
    # 5. Vision problem
    has_vision_problem = BooleanField(default=False)
    vision_problem_details = TextField(**_allow_empty)
    # 6. Hearing problem
    has_hearing_problem = BooleanField(default=False)
    hearing_problem_details = TextField(**_allow_empty)
    # 7. Current medication (if any)
    current_medication = TextField(**_allow_empty)
    # Free-form notes — for anything the structured fields don't cover.
    remarks = TextField(**_allow_empty)
