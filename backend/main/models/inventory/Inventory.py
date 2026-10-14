"""Inventory management.

A single dated transaction ledger is the source of truth:

    InventoryCategory   grouping (Stationery, Furniture, Lab, …)
    InventoryItem       the master asset (persists across academic years)
    InventoryTransaction every dated movement — purchase / issue / adjustment

Derived (never stored, so they can't drift):
  • current stock(item)   = Σ in  − Σ out   (cumulative across years)
  • investment            = Σ purchase.total (filter by academic year / date)

Items & categories persist across years; only transactions carry the academic
year, so reports/registers are per-year while physical stock carries over.
"""

from django.db.models import (
    ForeignKey,
    IntegerField,
    DecimalField,
    CASCADE,
    SET_NULL,
)

from customs.NepaliDateField import NepaliDateField
from ..BaseModel import BaseModel, CustomCharField, _allow_empty
from ...methods.nepaliDatetime import ndt_today


# Movement types in the ledger.
TXN_PURCHASE = 1   # stock in  — a buy (carries unit_price/total/supplier)
TXN_ISSUE = 2      # stock out — consumed / handed out (carries party_or_purpose)
TXN_ADJUSTMENT = 3 # correction — signed quantity (+/-) for stock-takes/damage
TXN_WASTAGE = 4    # stock out — written off: expired / spoiled / leftover waste
                   # (carries party_or_purpose as the reason)
TXN_TYPE_CHOICES = (
    (TXN_PURCHASE, "Purchase"),
    (TXN_ISSUE, "Issue"),
    (TXN_ADJUSTMENT, "Adjustment"),
    (TXN_WASTAGE, "Wastage"),
)

# Movement direction each type applies to the running stock balance.
TXN_DIRECTION = {
    TXN_PURCHASE: 1,
    TXN_ISSUE: -1,
    TXN_ADJUSTMENT: 1,  # adjustment quantity is already signed
    TXN_WASTAGE: -1,    # waste leaves stock, like an issue
}


class InventoryCategory(BaseModel):
    name = CustomCharField(min_length=1, max_length=60)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    def __str__(self):
        return self.name


class InventoryItem(BaseModel):
    name = CustomCharField(min_length=1, max_length=100)
    category = ForeignKey(
        "main.InventoryCategory", on_delete=SET_NULL, **_allow_empty
    )
    unit = CustomCharField(min_length=1, max_length=20, **_allow_empty)  # pcs/kg/ltr
    # Low-stock threshold; reports flag items at/below this.
    reorder_level = DecimalField(max_digits=12, decimal_places=2, **_allow_empty)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    def __str__(self):
        return self.name


class InventoryTransaction(BaseModel):
    item = ForeignKey(
        "main.InventoryItem", on_delete=CASCADE, related_name="transactions"
    )
    txn_type = IntegerField(choices=TXN_TYPE_CHOICES, default=TXN_PURCHASE)
    quantity = DecimalField(max_digits=12, decimal_places=2)
    # Purchases: per-unit cost + line total (quantity × unit_price).
    unit_price = DecimalField(max_digits=12, decimal_places=2, **_allow_empty)
    total = DecimalField(max_digits=14, decimal_places=2, **_allow_empty)
    date = NepaliDateField(default=ndt_today)
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    economic_year = ForeignKey("main.EconomicYear", on_delete=SET_NULL, **_allow_empty)
    # Free-text vendor for purchases (no supplier master by design).
    supplier = CustomCharField(min_length=1, max_length=100, **_allow_empty)
    # Who took it / why, for issues.
    party_or_purpose = CustomCharField(min_length=1, max_length=150, **_allow_empty)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    remarks = CustomCharField(min_length=1, max_length=250, **_allow_empty)

    class Meta:
        ordering = ("-date", "-id")
