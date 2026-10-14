from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0054_schooladmin_checkout_required_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="schooladmin",
            old_name="checkout_required",
            new_name="time_set_required",
        ),
        migrations.AddField(
            model_name="schooladmin",
            name="attendance_in_time",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="schooladmin",
            name="attendance_out_time",
            field=models.TimeField(blank=True, null=True),
        ),
    ]
