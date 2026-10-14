from django.db.models import (
    Model, ForeignKey, CharField, TextField, BooleanField, JSONField,
    ImageField, DateTimeField, Index, Q, UniqueConstraint, CASCADE,
)

from ..constants.birthday_layout import (  # noqa: F401
    FORMAT_KEYS, PRESET_KEYS, DEFAULT_WISH, sanitize_layout, card_size,
    export_scale,
)

AUDIENCE_CHOICES = [
    ("student", "Students"),
    ("staff", "Staff"),
]
AUDIENCES = [k for k, _ in AUDIENCE_CHOICES]


class BirthdayTemplate(Model):
    """A birthday card a SCHOOL designs for itself.

    Unlike `IDCardTemplate` this is the ADMIN's, not the superadmin's. An ID
    card is a document the school issues and the operator is responsible for it
    being uniform and correct; a birthday wish is the school talking to its own
    families in its own voice, and having to file a ticket to change the wording
    would mean it never gets changed.

    NO ROW MEANS NO CARD. Nothing about the existing birthday SMS or push
    notification depends on this table — those keep working exactly as they do
    whether a school ever opens the designer or not. This only adds a picture a
    school can make and share.

    One active template per (school, audience), enforced in the database, for
    the same reason as the ID card: the generator must be deterministic about
    which design it is drawing.
    """

    school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="birthday_templates"
    )
    audience = CharField(max_length=10, default="student", choices=AUDIENCE_CHOICES)
    name = CharField(max_length=60, default="Untitled card")
    is_active = BooleanField(default=False)

    card_format = CharField(max_length=12, default="square")
    background = ImageField(upload_to="birthday_backgrounds/%Y/", null=True, blank=True)
    background_color = CharField(max_length=9, default="#0d9488", blank=True)
    # The message itself. Held on the row rather than only inside the layout's
    # `wish` element so it can be edited without touching the design — and so
    # the SMS/push side could read the same wording later if that is ever wanted.
    wish = TextField(default=DEFAULT_WISH, blank=True)
    layout = JSONField(default=list, blank=True)
    preset = CharField(max_length=20, default="celebration", blank=True)

    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "birthday card template"
        ordering = ("school_id", "audience", "-is_active", "name")
        constraints = [
            UniqueConstraint(
                fields=("school", "audience"),
                condition=Q(is_active=True),
                name="one_active_birthday_template_per_school_and_audience",
            ),
        ]
        indexes = [Index(fields=("school", "audience", "is_active"))]

    def __str__(self):
        state = "active" if self.is_active else "draft"
        return f"school={self.school_id} {self.audience} {self.name} ({state})"

    @property
    def safe_format(self):
        return self.card_format if self.card_format in FORMAT_KEYS else "square"

    @property
    def size(self):
        width, height = card_size(self.safe_format)
        return {
            "width": width,
            "height": height,
            "scale": export_scale(self.safe_format),
        }

    @property
    def effective_layout(self):
        return sanitize_layout(self.layout)
