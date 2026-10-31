# The unique rules real data could not take until normalization_cleanup has run.
#
# On a database that still holds duplicates, each rule is skipped with a warning and
# the deploy carries on. The cleanup command adds them once the data is clean, and
# normalization_audit lists whatever is still missing.

from importlib import import_module

from django.db import migrations, models

# (index name, table, key, which rows it covers, whether NULLs count as equal)
UNIQUE_RULES = [
    ("uniq_class_attendance_per_day", "main_classattendance", "school_id, class_info_id, date", "is_active", False),
    ("uniq_exam_schedule_per_class", "main_examschedule", "exam_id, class_info_id", "is_active", False),
    ("uniq_timetable_per_class_year", "main_classperiod", "class_info_id, academic_year_id", "is_active", True),
    ("uniq_sms_template_per_type", "main_smstemplate", "school_id, type", "is_active", False),
    ("uniq_grading_rules_per_type", "main_gradingrules", "school_id, type", "is_active", False),
    ("uniq_year_mapping_per_key", "main_academicyearmapping", "school_id, key", "is_active", False),
    ("uniq_subject_assignment", "main_subjectassignment", "academic_year_id, class_info_id, subject_id", "is_active", False),
    ("uniq_section_per_school", "main_section", "school_id, lower(section)", "is_active", False),
    ("uniq_academic_year_per_school", "main_academicyear", "school_id, lower(name)", "is_active", False),
    ("uniq_fee_title_per_school", "main_feetitle", "school_id, lower(title)", "is_active", False),
    ("uniq_accounting_ledger_per_school", "accounting_accountingledger", "school_id, lower(name)", "is_active", False),
    ("uniq_subject_per_class", "main_subject", "class_info_id, lower(subject), type", "is_active", False),
    # What unique_together on ClassInfo meant to say: its NULLs let every duplicate through.
    (
        "uniq_class",
        "main_classinfo",
        "school_id, academic_year_id, education_level, grade, faculty, course_id, section_id, year, semester, name",
        "is_active",
        True,
    ),
]


def rule_is_clean(cursor, table, key, where):
    return not import_module("main.migrations.0110_integrity_keys").has_duplicates(cursor, table, key, where)


def add_rules(apps, schema_editor):
    integrity = import_module("main.migrations.0110_integrity_keys")
    with schema_editor.connection.cursor() as cursor:
        for name, table, key, where, nulls_equal in UNIQUE_RULES:
            integrity.drop_if_invalid(cursor, name)
            if nulls_equal and schema_editor.connection.pg_version < 150000:
                print(f"\n  SKIPPED {name}: needs PostgreSQL 15 or later")
                continue
            if not rule_is_clean(cursor, table, key, where):
                print(f"\n  SKIPPED {name}: {table} holds duplicates of ({key})")
                continue
            nulls = "NULLS NOT DISTINCT" if nulls_equal else ""
            try:
                cursor.execute(
                    f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({key}) {nulls} WHERE {where}"
                )
            except integrity.IntegrityError:
                integrity.drop_if_invalid(cursor, name)
                print(f"\n  SKIPPED {name}: {table} holds duplicates of ({key})")


def drop_rules(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for name, *_rest in UNIQUE_RULES:
            cursor.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("main", "0113_student_documents_private"),
        ("accounting", "0004_alter_accountingledgerbalance_opening_balance_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="CleanupChange",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("batch", models.CharField(db_index=True, max_length=32)),
                ("step", models.CharField(max_length=60)),
                ("table_name", models.CharField(max_length=63)),
                ("row_id", models.BigIntegerField()),
                ("column_name", models.CharField(max_length=63)),
                ("old_value", models.JSONField(null=True)),
                ("new_value", models.JSONField(null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.RunPython(add_rules, drop_rules),
    ]
