from django.db.models import (
    Model, ForeignKey, CharField, BooleanField, JSONField, ImageField,
    DateTimeField, Index, Q, UniqueConstraint, CASCADE,
)

from ...constants.idcard_layout import (  # noqa: F401
    ORIENTATIONS, PRESET_KEYS, sanitize_layout, default_layout, card_size,
)

CARD_TYPE_CHOICES = [
    ("student", "Student card"),
    ("staff", "Staff card"),
]
CARD_TYPES = [k for k, _ in CARD_TYPE_CHOICES]


class IDCardTemplate(Model):
    """One school's ID-card design, drawn by the superadmin.

    NO ROW MEANS THE BUILT-IN CARD. Every school that has never been designed
    for keeps exactly the card it prints today — `IDCard.jsx` falls back to its
    own hardcoded layout when this returns nothing. That is deliberate and load
    bearing: this table starts empty in production and no school's cards may
    change on the day it ships.

    A school may hold MANY templates per card type — a draft beside the one in
    use, last year's beside this year's — but only one is `is_active` at a time,
    which is the one the card generator reads. That is what `manage each and
    every template` means in practice: designs accumulate and are switched
    between, rather than being overwritten.
    """

    school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="idcard_templates"
    )
    card_type = CharField(max_length=10, default="student", choices=CARD_TYPE_CHOICES)
    name = CharField(max_length=60, default="Untitled design")
    # Exactly one active template per (school, card_type) — enforced in the
    # database below, not just in the view, because a half-failed save that left
    # two active would silently make card generation non-deterministic.
    is_active = BooleanField(default=False)

    orientation = CharField(max_length=10, default="portrait")
    # The artwork the fields are placed over. Optional — a template with no
    # background is drawn on `background_color`, which is how the classic card
    # (plain white) is expressed.
    background = ImageField(upload_to="idcard_backgrounds/%Y/", null=True, blank=True)
    background_back = ImageField(upload_to="idcard_backgrounds/%Y/", null=True, blank=True)
    background_color = CharField(max_length=9, default="#ffffff", blank=True)
    # The reverse of the card, laid out exactly like the front. Empty means the
    # card is single-sided, which is the common case and must stay the default.
    layout = JSONField(default=list, blank=True)
    layout_back = JSONField(default=list, blank=True)
    # Which preset the design started from. Kept only so the editor can offer
    # "reset to this preset" honestly; nothing renders from it.
    preset = CharField(max_length=20, default="classic", blank=True)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "ID card template"
        ordering = ("school_id", "card_type", "-is_active", "name")
        constraints = [
            UniqueConstraint(
                fields=("school", "card_type"),
                condition=Q(is_active=True),
                name="one_active_idcard_template_per_school_and_type",
            ),
        ]
        indexes = [Index(fields=("school", "card_type", "is_active"))]

    def __str__(self):
        state = "active" if self.is_active else "draft"
        return f"school={self.school_id} {self.card_type} {self.name} ({state})"

    @property
    def safe_orientation(self):
        return self.orientation if self.orientation in ORIENTATIONS else "portrait"

    @property
    def size(self):
        width, height = card_size(self.safe_orientation)
        return {"width": width, "height": height}

    @property
    def effective_layout(self):
        """Sanitised on READ as well as on write, so a row edited straight in
        the database still yields something printable."""
        return sanitize_layout(self.layout)

    @property
    def effective_layout_back(self):
        return sanitize_layout(self.layout_back)
