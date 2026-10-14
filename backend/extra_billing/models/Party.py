"""WHO the school bills besides its students, and what they are charged for.

    BillingParty        one payer: a tenant, a shop, a canteen, an office
      PartyCharge         "this party pays Rs. X of this title every month"

    BillingTitle        a charge head the school raises (Rent, Water, ...)

WHY A SEPARATE TABLE AND NOT A FAKE STUDENT
-------------------------------------------
Modelling a tenant as a student with a made-up class was the tempting shortcut,
and it would have quietly broken a dozen readers that assume every Student row
is a child: the headcount on the dashboard, classwise statistics, promotion, the
attendance register, SMS to guardians, ID cards, the app. A payer who is not a
student therefore lives in its own table, and student billing is not touched by
a single line of this app.
"""

from django.db.models import (
    CASCADE,
    DecimalField,
    ForeignKey,
    IntegerField,
    Q,
    TextField,
    UniqueConstraint,
)

from customs.NepaliDateField import NepaliDateField
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty

from ..constants import PARTY_TENANT, PARTY_TYPE_CHOICES

MONEY = {"max_digits": 12, "decimal_places": 2}


class BillingTitle(BaseModel):
    """A charge head: Rent, Water, Electricity, Service charge.

    One row per school, reused by every party — every report groups money by the
    title, so a title duplicated per party would scatter the same rupees across
    rows nobody can add up.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="extra_billing_titles")
    title = CustomCharField(min_length=2, max_length=40)
    # Where it sits on a bill. Rent first, then the utilities, is what a printed
    # bill is expected to look like.
    order = IntegerField(default=0)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    class Meta:
        constraints = [
            # Partial, on the ACTIVE rows only: deletes here are soft, and a
            # school that removes "Water" by mistake must be able to add it
            # again. A plain unique_together would refuse that forever.
            UniqueConstraint(
                fields=("school", "title"),
                condition=Q(is_active=True),
                name="uniq_active_extra_billing_title_per_school",
            )
        ]

    def __str__(self):
        return f"{self.school_id} > {self.title}"


class BillingParty(BaseModel):
    """One payer who is not a student."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="billing_parties")
    name = CustomCharField(min_length=2, max_length=60)
    party_type = IntegerField(choices=PARTY_TYPE_CHOICES, default=PARTY_TENANT)
    contact = CustomCharField(min_length=6, max_length=15, **_allow_empty)
    address = CustomCharField(min_length=2, max_length=80, **_allow_empty)
    # WHAT they hold: "Shutter No. 3", "Old block, 2nd floor", "Canteen".
    # Free text on purpose — a school's property list is not worth a table until
    # a school asks to report on the property rather than on the payer.
    property_name = CustomCharField(min_length=1, max_length=80, **_allow_empty)
    agreement_start = NepaliDateField(**_allow_empty)
    agreement_end = NepaliDateField(**_allow_empty)
    # What they already owed on the day the school started keeping this record
    # here. Counted as a charge everywhere, so a party carried in mid-year shows
    # a true balance from day one instead of looking settled.
    opening_due = DecimalField(**MONEY, default=0)
    remarks = TextField(**_allow_empty)

    def __str__(self):
        return f"{self.school_id} > {self.name}"


class PartyCharge(BaseModel):
    """What one party owes per month under one title.

    This is the rate card, not the bill. Editing it never changes a bill that
    has already been raised — the amount is copied onto the ledger row when the
    month is posted, exactly the way a hostel rate is copied onto an allocation.
    """

    party = ForeignKey("extra_billing.BillingParty", on_delete=CASCADE, related_name="charges")
    title = ForeignKey("extra_billing.BillingTitle", on_delete=CASCADE, related_name="charges")
    amount = DecimalField(**MONEY, default=0)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("party", "title"),
                condition=Q(is_active=True),
                name="uniq_active_party_charge_per_title",
            )
        ]

    def __str__(self):
        return f"{self.party_id} > {self.title_id} = {self.amount}"
