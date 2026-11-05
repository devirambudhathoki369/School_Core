from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("account", "0011_encrypted_secrets"), ("main", "0001_initial")]
    operations = [migrations.AddField(
        model_name="studentaccount", name="pending_student",
        field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                related_name="pending_accounts", to="main.student"),
    )]
