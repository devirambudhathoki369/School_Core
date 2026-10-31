"""
Real rows for facts the canteen keeps in JSON. Triggers write them from the JSON, so
read them and never write them from the app (main/models/Normalized.py explains why).

    CanteenTransaction 1 ──── 0..* CanteenTransactionLine 0..* ──── 0..1 CanteenItem
    CanteenUser        1 ──── 0..* CanteenUserPage
    CanteenPosting     1 ──── 0..* CanteenPostingPlan     0..* ──── 1    CanteenPlan
"""

from django.db.models import (
    CASCADE,
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


class CanteenTransactionLine(Model):
    transaction = ForeignKey("canteen.CanteenTransaction", on_delete=CASCADE, db_index=False, related_name="lines")
    line_no = PositiveSmallIntegerField()
    item = ForeignKey("canteen.CanteenItem", on_delete=SET_NULL, null=True, blank=True, related_name="+")
    code = CharField(max_length=32, blank=True, default="")
    label = TextField(null=True, blank=True)
    amount = DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [UniqueConstraint(fields=["transaction", "line_no"], name="one_canteen_txn_line_no")]


class CanteenUserPage(Model):
    user = ForeignKey("canteen.CanteenUser", on_delete=CASCADE, db_index=False, related_name="pages")
    page = PositiveIntegerField()

    class Meta:
        constraints = [UniqueConstraint(fields=["user", "page"], name="page_once_per_canteen_user")]


class CanteenPostingPlan(Model):
    posting = ForeignKey("canteen.CanteenPosting", on_delete=CASCADE, db_index=False, related_name="plan_links")
    plan = ForeignKey("canteen.CanteenPlan", on_delete=CASCADE, related_name="+")

    class Meta:
        constraints = [UniqueConstraint(fields=["posting", "plan"], name="plan_once_per_canteen_posting")]
