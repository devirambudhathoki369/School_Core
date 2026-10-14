"""Collapse the duplicate marks headers and marks rows already written.

Nothing stopped either from being written twice, so prod carried 1.32M
duplicate `StudentResult` rows and 1,724 twin `ClassResult` headers. Readers
hid it by taking the newest of each group, which is why it surfaced only as odd
symptoms (a subject listed twice on a class ledger, totals that move when a
report skips the de-duplication).

The repair keeps the row and header each reader already renders and moves
hidden marks onto the survivor, so no gradesheet changes except to regain marks
that were stranded — see `main/methods/resultDedupe.py`.

Verified against a copy of prod (2026-08-17): 1,319,063 duplicate rows retired,
1,724 headers folded, 732 stranded marks recovered, **0 displayed marks changed
or lost**, ~35s to run.

The unique indexes land separately in 0088: moving a row rewrites a foreign key,
and Postgres will not build an index in a transaction that still has deferred
trigger events queued.
"""

from django.db import migrations


def collapse_duplicates(apps, schema_editor):
    from main.methods.resultDedupe import (
        dedupe_student_rows,
        duplicate_header_groups,
        merge_header_group,
    )

    dedupe_student_rows()
    for keeper, losers in duplicate_header_groups():
        merge_header_group(keeper, losers)


def noop(apps, schema_editor):
    """The soft-deleted duplicates stay soft-deleted; nothing to undo."""


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0086_school_app_listing"),
    ]

    operations = [
        migrations.RunPython(collapse_duplicates, noop),
    ]
