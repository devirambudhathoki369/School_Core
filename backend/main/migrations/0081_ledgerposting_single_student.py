from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0080_studenttaxinvoice"),
    ]

    operations = [
        migrations.AddField(
            model_name="ledgerposting",
            name="single_student",
            field=models.BooleanField(default=False),
        ),
    ]
