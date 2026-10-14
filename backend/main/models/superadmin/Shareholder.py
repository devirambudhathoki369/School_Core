from django.db.models import ForeignKey, CASCADE

from ..BaseModel import BaseModel, CustomCharField, _allow_empty


class Shareholder(BaseModel):
    """A recipient of a school's daily "Today's Collection Point" SMS.

    Superadmin-managed. Replaces the old server-only `shareholders.json` (which
    a deploy wiped, silently stopping the SMS) so the recipient list can be
    edited from the panel. The daily collection cron groups active shareholders
    by school and texts each one that day's total collection.
    """

    school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="shareholders"
    )
    name = CustomCharField(min_length=1, max_length=50, **_allow_empty)
    contact = CustomCharField(min_length=7, max_length=20)

    class Meta:
        ordering = ("school_id", "id")

    def __str__(self):
        return f"{self.name or 'Shareholder'} ({self.contact})"
