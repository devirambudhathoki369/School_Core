"""Seed the per-(school, education_level) Education Equality Fee targeting from
the LEGACY per-school opt-in (SchoolAdmin.preferences["education_service_fee_percent"]).

Any school that had the fee enabled school-wide keeps the same behaviour: every
education level it actually uses (distinct ClassInfo.education_level) is enabled.
No-op for schools without the legacy pref. Reversible (clears seeded rows).
"""

from django.db import migrations

LEGACY_PREF = "education_service_fee_percent"


def seed_from_legacy_pref(apps, schema_editor):
    SchoolAdmin = apps.get_model("main", "SchoolAdmin")
    ClassInfo = apps.get_model("main", "ClassInfo")
    SchoolEducationEqualityFee = apps.get_model("main", "SchoolEducationEqualityFee")

    for school in SchoolAdmin.objects.all():
        prefs = getattr(school, "preferences", None) or {}
        if not isinstance(prefs, dict):
            continue
        try:
            percent = float(prefs.get(LEGACY_PREF) or 0)
        except (TypeError, ValueError):
            percent = 0
        if percent <= 0:
            continue
        levels = (
            ClassInfo.objects.filter(school_id=school.id, is_active=True)
            .exclude(education_level__isnull=True)
            .values_list("education_level", flat=True)
            .distinct()
        )
        for lvl in set(levels):
            SchoolEducationEqualityFee.objects.get_or_create(
                school_id=school.id, education_level=lvl
            )


def unseed(apps, schema_editor):
    SchoolEducationEqualityFee = apps.get_model("main", "SchoolEducationEqualityFee")
    SchoolEducationEqualityFee.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0069_schooleducationequalityfee"),
    ]

    operations = [
        migrations.RunPython(seed_from_legacy_pref, unseed),
    ]
