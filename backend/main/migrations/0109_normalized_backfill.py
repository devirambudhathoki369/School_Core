# Fills the tables from 0108 with what the JSON columns already hold.
#
# Not atomic, in batches: each batch commits alone, so no long transaction sits on
# these tables, and a re-run after an interruption just rewrites the same rows.

from django.db import migrations

BATCH = 5000
SOURCES = [
    ("main_classperiod", "norm_class_period_slots(id, subjects, teachers)"),
    ("main_examschedule", "norm_exam_schedule_subjects(id, schedule)"),
    ("main_subjectassignment", "norm_assignment_students(id, students)"),
    ("main_staff", "norm_staff_grants(id, permissions)"),
    ("main_studentledger", "norm_student_ledger_lines(id, details)"),
    ("main_studentinvoice", "norm_student_invoice_lines(id, details)"),
    ("main_staffledger", "norm_staff_ledger_lines(id, details)"),
    ("main_staffinvoice", "norm_staff_invoice_lines(id, details)"),
]


def backfill(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table, call in SOURCES:
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table}")
            last = cursor.fetchone()[0]
            for start in range(0, last + 1, BATCH):
                cursor.execute(
                    f"SELECT count({call}) FROM {table} WHERE id > %s AND id <= %s",
                    [start, start + BATCH],
                )


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("main", "0108_normalized_tables"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
