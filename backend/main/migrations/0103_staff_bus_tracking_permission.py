from django.db import migrations

BUS_STATIONS = 507
BUS_TRACKING = 511


def tracking_for_station_staff(apps, schema_editor):
    """Bus tracking gets a permission of its own (511).

    Until now the page opened for staff holding Bus Stations (507). Each of
    them is given the new permission, so nobody loses the page on the day the
    two are told apart; from then on a school ticks or unticks it by itself.
    Nothing else in a staff member's permissions is touched.
    """
    Staff = apps.get_model("main", "Staff")
    for staff_id, permissions in Staff.objects.values_list("id", "permissions"):
        if isinstance(permissions, list) and BUS_STATIONS in permissions and BUS_TRACKING not in permissions:
            Staff.objects.filter(id=staff_id).update(permissions=[*permissions, BUS_TRACKING])


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0102_seatplan_rooms_per_school'),
    ]

    operations = [
        migrations.RunPython(tracking_for_station_staff, migrations.RunPython.noop),
    ]
