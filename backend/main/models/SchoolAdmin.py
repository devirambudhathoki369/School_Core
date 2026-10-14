from django.db.models import (
    Model,
    OneToOneField,
    BooleanField,
    CharField,
    ImageField,
    TextField,
    TimeField,
    JSONField,
    ForeignKey,
    CASCADE,
)

#
from customs.NepaliDateField import NepaliDateField

#
from .BaseModel import BaseModel, CustomCharField, CustomEmailField, _allow_empty
from ..constants.ui_theme import UI_THEME_CHOICES, UI_THEME_CLASSIC

MAX_IMAGE_COUNT = 7


class SchoolAdmin(BaseModel):
    name = CustomCharField(min_length=10, max_length=50)
    address = CustomCharField(min_length=2, max_length=50)
    contact = CustomCharField(min_length=10, max_length=10, **_allow_empty)
    telephone = CustomCharField(min_length=6, max_length=10, **_allow_empty)
    estd_date = NepaliDateField()
    pan_no = CustomCharField(min_length=1, max_length=20)  # TODO: fix this size;
    email = CustomEmailField(min_length=12, max_length=50)
    account = OneToOneField("account.AdminAccount", on_delete=CASCADE)
    renew_date = NepaliDateField()
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE, **_allow_empty)
    slogan = CustomCharField(min_length=5, max_length=100, **_allow_empty)
    about_us = TextField(**_allow_empty)
    # [logos]
    logo = ImageField(upload_to="school_logos", **_allow_empty)
    award_logo = ImageField(upload_to="school_logos", **_allow_empty)
    # [signs]
    sign = ImageField(upload_to="school_signs", **_allow_empty)
    exam_coordinator_sign = ImageField(upload_to="school_signs", **_allow_empty)
    # [settings]
    # Which interface theme this school's screens are drawn in, chosen by the
    # superadmin. Defaults to the look every school already has, so an untouched
    # school never changes appearance because this field exists.
    ui_theme = CharField(
        max_length=24, default=UI_THEME_CLASSIC, choices=UI_THEME_CHOICES, blank=True
    )
    preferences = JSONField(default=dict)
    education_levels = JSONField(default=list)
    test_account = BooleanField(default=False)
    uses_sms = BooleanField(default=False)
    uses_mobile_app = BooleanField(default=False)
    # MODULE ACCESS: the hostel module is off for every school until the
    # superadmin turns it on (Setup > Hostel Access). It gates BOTH halves —
    # the rail never draws the Hostel menu, and every /hostel endpoint refuses
    # a school without it (hostel/views/BaseViews.HostelBaseView). Menu hiding
    # alone is decoration; a hidden page is still a URL.
    uses_hostel = BooleanField(default=False)
    # MODULE ACCESS: billing for people who are NOT students -- the tenant of a
    # shutter, a canteen contractor, an office renting a room. Off for every
    # school until the superadmin turns it on (Setup > Extra Billing Access).
    # Gates both halves, exactly like `uses_hostel`: the rail never draws the
    # menu, and every /extra-billing endpoint refuses a school without it
    # (extra_billing/views/BaseViews.ExtraBillingBaseView). Student billing is
    # untouched by it either way -- the two run side by side.
    uses_extra_billing = BooleanField(default=False)
    # When True, the school admin can set attendance in/out times (App > RFID >
    # Time Set) and the in-time acts as a present cutoff: a first device punch
    # after attendance_in_time is NOT marked present (automatic).
    time_set_required = BooleanField(default=False)
    # Clock times (no date). Used only when time_set_required is True.
    attendance_in_time = TimeField(null=True, blank=True)
    attendance_out_time = TimeField(null=True, blank=True)
    foundation = ForeignKey("main.SchoolFoundation", on_delete=CASCADE, **_allow_empty)

    def __str__(self) -> str:
        return self.name


class SchoolImage(Model):
    image = ImageField(upload_to="school_images")
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
