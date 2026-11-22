# Pushes Expo accepted, kept until their receipts are read (mobileapi/push.py, check_receipts).

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mobileapi', '0003_familycode_issued_by_student'),
    ]

    operations = [
        migrations.CreateModel(
            name='PushTicket',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False)),
                ('push_token', models.CharField(max_length=255)),
                ('sent_at', models.DateTimeField(default=django.utils.timezone.now)),
            ],
            options={
                'db_table': 'mobileapi_pushticket',
                'indexes': [models.Index(fields=['sent_at'], name='mobileapi_pushticket_sent')],
                'constraints': [models.CheckConstraint(condition=models.Q(('push_token__regex', '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]{8,200}\\]$')), name='mobileapi_pushticket_token_format')],
            },
        ),
    ]
