from django.db import migrations


class Migration(migrations.Migration):
    """Drop the pre-Shrawan / fiscal-period concept.

    `fiscal_period` was introduced (0072/0073) to split Baishakh-Ashad 2083
    postings from Shrawan-onwards ones for the 3% education service fee. That
    fee was withdrawn and removed, and the column is fully derived from
    `months`, so nothing is lost by dropping it — a posting's period is always
    readable from the months it covers.
    """

    dependencies = [
        ("main", "0074_remove_education_equality_fee"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="ledgerposting",
            name="fiscal_period",
        ),
    ]
