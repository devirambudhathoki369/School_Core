from django.db import migrations


def seed_missing_accounting_years(apps, schema_editor):
    SchoolAdmin = apps.get_model("main", "SchoolAdmin")
    SchoolModule = apps.get_model("main", "SchoolModule")
    AccountingEconomicYear = apps.get_model("accounting", "AccountingEconomicYear")

    school_ids = SchoolModule.objects.filter(
        module_id="accounting", is_active=True
    ).values_list("school_id", flat=True)
    schools = SchoolAdmin.objects.filter(
        id__in=school_ids, economic_year__isnull=False
    ).select_related("economic_year")
    for school in schools.iterator():
        if AccountingEconomicYear.objects.filter(school_id=school.id).exists():
            continue
        source = school.economic_year
        AccountingEconomicYear.objects.create(
            school_id=school.id,
            name=source.name,
            start_date=source.start_date,
            end_date=source.end_date,
            remarks="Created automatically from the school's Economic Year",
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounting", "0004_alter_accountingledgerbalance_opening_balance_and_more"),
        ("main", "0111_tenant_keys"),
    ]

    operations = [
        migrations.RunPython(seed_missing_accounting_years, migrations.RunPython.noop),
    ]
