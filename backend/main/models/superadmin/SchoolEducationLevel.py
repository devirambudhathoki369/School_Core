from django.db.models import Model, ForeignKey, IntegerField, CASCADE

from ...choices.Education import EDUCATION_LEVEL_CHOICES


class SchoolHiddenEducationLevel(Model):
    """An education level the superadmin has HIDDEN for a specific school.

    No row for a (school, level) means the level is VISIBLE — the default is that
    every school sees every level (so existing data is never orphaned). The
    superadmin hides the levels a school doesn't use; the pickers then omit them.
    """

    school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="hidden_education_levels"
    )
    education_level = IntegerField(choices=EDUCATION_LEVEL_CHOICES)

    class Meta:
        unique_together = ("school", "education_level")

    def __str__(self):
        return f"school={self.school_id} hides level {self.education_level}"
