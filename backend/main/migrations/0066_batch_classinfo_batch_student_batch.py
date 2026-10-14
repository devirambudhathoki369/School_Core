# Batch/cohort dimension for higher-ed. Fully additive:
#   * new Batch table
#   * nullable ClassInfo.batch + Student.batch
#   * ClassInfo uniqueness extended with batch (NULLs stay distinct in Postgres,
#     so every existing row remains valid unchanged)
# No column is dropped, retyped, or made required. Regenerate with
# `makemigrations` on staging if model state ever drifts from this file.

import django.db.models.deletion
import main.models.BaseModel
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0065_staffinvoice_insurance_deduction_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Batch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_active', models.BooleanField(default=True)),
                ('year', main.models.BaseModel.CustomCharField(max_length=9)),
                ('current_semester', models.IntegerField(blank=True, null=True)),
                ('graduated', models.BooleanField(default=False)),
                ('course', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.course')),
                ('school', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='main.schooladmin')),
                ('start_academic_year', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.academicyear')),
            ],
            options={
                'unique_together': {('school', 'course', 'year')},
            },
        ),
        migrations.AddField(
            model_name='classinfo',
            name='batch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.batch'),
        ),
        migrations.AddField(
            model_name='student',
            name='batch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, to='main.batch'),
        ),
        migrations.AlterUniqueTogether(
            name='classinfo',
            unique_together={('education_level', 'grade', 'faculty', 'course', 'section', 'year', 'semester', 'batch')},
        ),
    ]
