# Generated for StudentInvoice.class_info snapshot column.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0049_studentmedicalinfo'),
    ]

    operations = [
        migrations.AddField(
            model_name='studentinvoice',
            name='class_info',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                to='main.classinfo',
            ),
        ),
    ]
