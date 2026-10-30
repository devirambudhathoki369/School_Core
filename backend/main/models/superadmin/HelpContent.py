"""The content behind the Support and Guides pages.

Both pages used to be hard-coded in the frontend, so correcting a phone number
or adding a guide meant a code change and a deploy. They are now rows the
superadmin edits from the console; the frontend keeps its old content only as
the fallback it renders while the request is in flight or if the API is down.

`SupportInfo` is a singleton — there is one help desk, not one per school — so
it is always read and written through `SupportInfo.load()`, which creates the
row on first touch rather than leaving the page with nothing to render.
"""

from django.db.models import (
    Model,
    CharField,
    TextField,
    URLField,
    EmailField,
    BooleanField,
    PositiveIntegerField,
    JSONField,
    ForeignKey,
    DateTimeField,
    CASCADE,
)


def _default_closed_weekdays():
    """Saturday, the weekend in Nepal."""
    return [5]


def _default_checklist():
    return [
        "The page you were on (e.g. Payment ▸ Student).",
        "A screenshot showing the error message.",
        "The student / staff name or bill number involved.",
        "What you expected to happen instead.",
    ]


class SupportInfo(Model):
    """Who to contact, and how. One row, always id=1."""

    name = CharField(max_length=120, default="Cent IT Solutions Pvt. Ltd.")
    product = CharField(
        max_length=160, blank=True, default="SchoolCore · School Management System"
    )
    address = CharField(max_length=200, blank=True, default="")
    open_days = CharField(max_length=80, blank=True, default="Sunday – Friday")
    open_time = CharField(max_length=80, blank=True, default="9:00 AM – 5:00 PM")

    # Office hours as numbers, so the "we're online now" badge is driven by the
    # same data the page prints instead of a constant compiled into the bundle.
    open_from_hour = PositiveIntegerField(default=9)
    open_to_hour = PositiveIntegerField(default=17)
    # Weekday numbers that are closed, Python's Monday=0 … Sunday=6. Saturday is
    # the weekend in Nepal, so [5] is the default and not [5, 6].
    #
    # These two default to something usable rather than empty, because the row
    # is created on first read by `load()` — and the frontend keeps empty lists
    # (they are how you say "open every day" / "no checklist"), so an empty
    # default would render as a real setting on a site nobody had configured yet.
    closed_weekdays = JSONField(default=_default_closed_weekdays, blank=True)

    contact = CharField(max_length=40, blank=True, default="")
    email = EmailField(max_length=120, blank=True, default="")
    website = URLField(max_length=200, blank=True, default="")
    whatsapp_contact = CharField(max_length=300, blank=True, default="")
    fb_page_id = CharField(max_length=60, blank=True, default="")

    # The "help us fix it faster" list — a plain list of strings.
    checklist = JSONField(default=_default_checklist, blank=True)

    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Support information"
        verbose_name_plural = "Support information"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Pin the singleton. Anything that tries to create a second row simply
        # overwrites the first, which is the behaviour the console expects.
        self.pk = 1
        return super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class GuideCategory(Model):
    """A grouping chip on the Guides page."""

    key = CharField(max_length=40, unique=True)
    name = CharField(max_length=80)
    order = PositiveIntegerField(default=0, db_index=True)
    is_active = BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("order", "id")
        verbose_name_plural = "Guide categories"

    def __str__(self):
        return self.name


class Guide(Model):
    """One step-by-step answer.

    `view` is the in-app hash the sidebar uses (`payment.student`), which is what
    lets a guide hand the reader straight to the screen it describes. It is
    optional — plenty of guides describe a habit rather than a page.
    """

    slug = CharField(max_length=60, unique=True)
    category = ForeignKey(
        GuideCategory, on_delete=CASCADE, related_name="guides", null=True, blank=True
    )
    title = CharField(max_length=200)
    summary = TextField(blank=True, default="")
    where = CharField(max_length=160, blank=True, default="")
    view = CharField(max_length=120, blank=True, default="")
    steps = JSONField(default=list, blank=True)
    tips = JSONField(default=list, blank=True)
    order = PositiveIntegerField(default=0, db_index=True)
    is_active = BooleanField(default=True, db_index=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        ordering = ("order", "id")

    def __str__(self):
        return self.title
