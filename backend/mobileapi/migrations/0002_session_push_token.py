# The phone's Expo push token on its session (mobile/SPEC.md, phase 6).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mobileapi', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='appsession',
            name='push_token',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddIndex(
            model_name='appsession',
            index=models.Index(condition=models.Q(('push_token__isnull', False), ('revoked_at__isnull', True)), fields=['school'], name='mobileapi_session_pushable'),
        ),
        migrations.AddConstraint(
            model_name='appsession',
            constraint=models.CheckConstraint(condition=models.Q(('push_token__isnull', True), ('push_token__regex', '^Expo(nent)?PushToken\\[[A-Za-z0-9_-]{8,200}\\]$'), _connector='OR'), name='mobileapi_session_push_token_format'),
        ),
    ]
