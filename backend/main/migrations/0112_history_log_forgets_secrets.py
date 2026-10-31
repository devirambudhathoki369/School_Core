from django.db import migrations

# The audit trail recorded a card reader PIN in full each time one changed. It now
# records only that it changed (main/models/history_log/diff.py).
KEYS = ("password", "otp", "secret", "sms_api", "push_comm_key")


class Migration(migrations.Migration):
    dependencies = [("main", "0111_tenant_keys")]

    operations = [
        migrations.RunSQL(
            [
                f"UPDATE main_historylog SET changes = changes - '{key}' "
                f"WHERE jsonb_typeof(changes) = 'object' AND changes ? '{key}'"
                for key in KEYS
            ],
            migrations.RunSQL.noop,
        ),
    ]
