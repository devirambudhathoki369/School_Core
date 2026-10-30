"""How a school's canteen is set up, and what it sells.

    CanteenSettings     one row per school: who runs it, how buyers may pay,
                        the default limits, the slip
    CanteenCategory     Snacks, Drinks, Meals ...
      CanteenItem         one thing on the counter, at its current price

A price here is the CURRENT price. A sale copies the name and price onto its own
line when it is rung up, so changing a price tomorrow never changes what a slip
printed today says, or what an account was charged.
"""

from django.db.models import (
    CASCADE,
    SET_NULL,
    BooleanField,
    DecimalField,
    ForeignKey,
    IntegerField,
    OneToOneField,
    Q,
    UniqueConstraint,
)

from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty

from ..constants import FOOD_CHOICES, FOOD_NONE, RUN_BY_CHOICES, RUN_BY_SCHOOL

MONEY = {"max_digits": 10, "decimal_places": 2}


class CanteenSettings(BaseModel):
    """The school's canteen rules. Read through `methods.settings.settings_for`,
    which hands back defaults for a school that has never saved any — so a
    school switched on today can sell at once.

    The row is also the LOCK every number in this app is minted under (a sale
    number, a top-up receipt number): one row per school, so two counters
    selling at the same instant queue on it for a millisecond instead of both
    taking the same number.
    """

    school = OneToOneField("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_settings")
    run_by = IntegerField(choices=RUN_BY_CHOICES, default=RUN_BY_SCHOOL)
    allow_cash = BooleanField(default=True)
    allow_account = BooleanField(default=True)
    # How far an account may go below zero. 0 means prepaid only: a child
    # cannot buy what nobody has paid for. Overridable per account.
    credit_limit = DecimalField(**MONEY, default=0)
    # Most an account may spend in one day. 0 means no daily limit.
    # Overridable per account.
    daily_limit = DecimalField(**MONEY, default=0)
    # A family is told when their child's account is spent, topped up, or
    # posted for the month (app push, stored in the app's inbox).
    notify_parents = BooleanField(default=True)
    # Below this balance the purchase message says the account is running low.
    low_balance = DecimalField(**MONEY, default=100)
    # The counter's slip printer: 80 or 58 (mm), or 0 for A4/A5 paper.
    slip_width = IntegerField(default=80)
    slip_footer = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    def __str__(self):
        return f"{self.school_id} > canteen settings"


class CanteenCategory(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_categories")
    name = CustomCharField(min_length=2, max_length=40)
    order = IntegerField(default=0)

    class Meta:
        constraints = [
            # Partial, on the ACTIVE rows only: deletes are soft, and a category
            # removed by mistake must be addable again.
            UniqueConstraint(
                fields=("school", "name"),
                condition=Q(is_active=True),
                name="uniq_active_canteen_category_per_school",
            )
        ]

    def __str__(self):
        return f"{self.school_id} > {self.name}"


class CanteenItem(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_items")
    category = ForeignKey(
        "canteen.CanteenCategory", on_delete=SET_NULL, related_name="items", **_allow_empty
    )
    name = CustomCharField(min_length=2, max_length=60)
    price = DecimalField(**MONEY)
    # A short key typed at the counter ("SAM" for samosa) — quicker than a
    # search when the queue is twenty children long.
    code = CustomCharField(min_length=1, max_length=12, **_allow_empty)
    food_type = IntegerField(choices=FOOD_CHOICES, default=FOOD_NONE)
    # "On the counter today." Switched off when it runs out; the item, its
    # price and its sales history all stay.
    is_available = BooleanField(default=True)
    # Sold over the counter at `price` (a samosa, a tiffin taken cash or due).
    # Off for something only ever billed monthly, like Day care.
    sold_at_counter = BooleanField(default=True)
    # Billed every month to its regular users at their CLASS's rate
    # (CanteenClassRate) — tiffin monthly, day care.
    monthly = BooleanField(default=False)
    order = IntegerField(default=0)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("school", "name"),
                condition=Q(is_active=True),
                name="uniq_active_canteen_item_per_school",
            )
        ]

    def __str__(self):
        return f"{self.school_id} > {self.name} @ {self.price}"


class CanteenClassRate(BaseModel):
    """What a monthly item costs a month for one class: "Tiffin — Class 1:
    Rs. 1,500, Class 2: Rs. 2,500". `class_key` is the grade (every section and
    stream of it), or the course and year/semester for higher education —
    methods/classes.py. Changing a rate changes the next posting only; months
    already posted keep the amount they were posted at."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_class_rates")
    item = ForeignKey("canteen.CanteenItem", on_delete=CASCADE, related_name="class_rates")
    class_key = CustomCharField(min_length=1, max_length=40)
    class_label = CustomCharField(min_length=1, max_length=80)
    monthly_rate = DecimalField(**MONEY, default=0)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("item", "class_key"),
                condition=Q(is_active=True),
                name="uniq_active_canteen_class_rate",
            )
        ]

    def __str__(self):
        return f"{self.item_id} {self.class_key} = {self.monthly_rate}"
