"""One subject = one marks header; one student = one marks row.

Separate from the 0087 repair on purpose: that migration rewrites
`StudentResult.class_result_id` to move stranded marks onto the surviving
header, and Postgres refuses to CREATE INDEX in a transaction that still has
deferred foreign-key trigger events pending ("cannot CREATE INDEX ... because
it has pending trigger events"). Its own transaction gives this a clean slate.

Both constraints are scoped to `is_active`, so deleting a marks header and
entering the subject again still works.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0087_result_uniqueness"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="classresult",
            constraint=models.UniqueConstraint(
                fields=("exam", "class_info", "subject"),
                condition=models.Q(is_active=True),
                name="uniq_active_class_result_per_subject",
            ),
        ),
        migrations.AddConstraint(
            model_name="studentresult",
            constraint=models.UniqueConstraint(
                fields=("class_result", "student"),
                condition=models.Q(is_active=True),
                name="uniq_active_student_result_per_student",
            ),
        ),
    ]
