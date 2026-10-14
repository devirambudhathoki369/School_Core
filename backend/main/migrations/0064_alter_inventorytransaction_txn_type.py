from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0063_shareholder"),
    ]

    operations = [
        migrations.AlterField(
            model_name="inventorytransaction",
            name="txn_type",
            field=models.IntegerField(
                choices=[
                    (1, "Purchase"),
                    (2, "Issue"),
                    (3, "Adjustment"),
                    (4, "Wastage"),
                ],
                default=1,
            ),
        ),
    ]
