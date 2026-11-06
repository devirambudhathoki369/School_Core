# A student may invite their own parent with a family code (mobile/SPEC.md §2).

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mobileapi', '0002_session_push_token'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='familycode',
            name='mobileapi_familycode_one_issuer',
        ),
        migrations.AddField(
            model_name='familycode',
            name='issued_by_student',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to='account.studentaccount'),
        ),
        migrations.AddConstraint(
            model_name='familycode',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('issued_by_admin__isnull', False), ('issued_by_staff__isnull', True), ('issued_by_student__isnull', True)), models.Q(('issued_by_admin__isnull', True), ('issued_by_staff__isnull', False), ('issued_by_student__isnull', True)), models.Q(('issued_by_admin__isnull', True), ('issued_by_staff__isnull', True), ('issued_by_student__isnull', False)), _connector='OR'), name='mobileapi_familycode_one_issuer'),
        ),
    ]
