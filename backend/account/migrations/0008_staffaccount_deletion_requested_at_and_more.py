# Added for mobile "delete account" support (Google Play requirement).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('account', '0007_staffaccount_app_device_token_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffaccount',
            name='deletion_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='studentaccount',
            name='deletion_requested_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
