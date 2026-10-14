"""Per-school mobile app listing details, for the per-app privacy policy.

CentEducation is not shipped as one app. Each school that takes the mobile
product gets its own Play build (`com.centit.rolpasunlight.app`,
`com.centit.divineacademy.app`, …), and Google Play requires every one of those
listings to point at a privacy policy that names *that* app — a policy headed
"CentEducation" on a listing called "Rolpa Sunlight" is a review rejection.

This row carries what differs between those listings. Every field is optional:
a school with no row at all still gets a correct policy, because the serializer
falls back to the school's own name and contact details. So the feature works
for all ~40 app schools on day one, and a row only has to be created when the
Play listing name genuinely differs from the school name.
"""

from django.db.models import Model, CharField, TextField, URLField, EmailField, OneToOneField, CASCADE


class SchoolAppListing(Model):
    """The Play/App Store identity of one school's build."""

    school = OneToOneField(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="app_listing"
    )
    # Name as it appears on the store listing. Blank -> the school's own name.
    app_name = CharField(max_length=120, blank=True, default="")
    # e.g. com.centit.rolpasunlight.app — recorded so the policy can name the
    # exact package a reviewer is looking at.
    package_name = CharField(max_length=160, blank=True, default="")
    # What the app does, in the store's words. Blank -> a sentence built from
    # the app name, describing the standard product.
    description = TextField(blank=True, default="")
    play_url = URLField(max_length=300, blank=True, default="")
    # Whom a user of THIS app writes to. Blank -> the school's own email.
    support_email = EmailField(max_length=120, blank=True, default="")

    class Meta:
        verbose_name = "school app listing"

    def __str__(self) -> str:
        return f"{self.app_name or self.school.name} ({self.package_name or 'no package'})"
