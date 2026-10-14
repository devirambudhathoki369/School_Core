from django.db import migrations

SHRAWAN_MONTH = 4


def _period(months):
    ms = [m for m in (months or []) if isinstance(m, int)]
    if not ms:
        return "none"
    return "shrawan" if max(ms) >= SHRAWAN_MONTH else "pre_shrawan"


def backfill(apps, schema_editor):
    LedgerPosting = apps.get_model("main", "LedgerPosting")
    batch, size = [], 2000
    qs = LedgerPosting.objects.all().only("id", "months").iterator(chunk_size=size)
    for lp in qs:
        lp.fiscal_period = _period(lp.months)
        batch.append(lp)
        if len(batch) >= size:
            LedgerPosting.objects.bulk_update(batch, ["fiscal_period"])
            batch = []
    if batch:
        LedgerPosting.objects.bulk_update(batch, ["fiscal_period"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0072_ledgerposting_fiscal_period"),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
