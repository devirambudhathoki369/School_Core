from django.db.models import CheckConstraint, IntegerField, ForeignKey, DecimalField, DateField, CASCADE, Q

#
from .BaseModel import BaseModel, _allow_empty

# Student/Staff Bus Tracking!
from .BusStation import location_configs


class BusTrackOnAlertInfo(BaseModel):
    """The bus a student or member of staff follows, and, when they asked for
    one, the "bus is near" alert: their home spot and how near counts.

    The SchoolCore app lets a student (or their parent) pick their bus without
    an alert, so the spot and the range are both there or both absent; the
    alert job (main/scripts/StudentBusAlert.py) reads only rows that have them.
    """

    bus_id = IntegerField()
    student_id = ForeignKey("main.Student", on_delete=CASCADE, **_allow_empty)
    staff_id = ForeignKey("main.Staff", on_delete=CASCADE, **_allow_empty)
    # student's location
    latitude = DecimalField(**location_configs, **_allow_empty)
    longitude = DecimalField(**location_configs, **_allow_empty)
    alert_range = IntegerField(**_allow_empty)
    # alerted dateA
    alerted_date = DateField(**_allow_empty)

    class Meta:
        constraints = [
            CheckConstraint(
                condition=Q(latitude__isnull=True, longitude__isnull=True, alert_range__isnull=True)
                | Q(latitude__isnull=False, longitude__isnull=False, alert_range__isnull=False),
                name="bus_follow_alert_all_or_nothing",
            ),
        ]


# -----
from django.contrib import admin


class BusTrackOnAlertInfoAdmin(admin.ModelAdmin):
    list_select_related = ("student_id", "staff_id")
    #
    list_display = (
        "id",
        "bus_id",
        "user",
        "alerted_date",
    )
    list_filter = ("updated_at", "alerted_date")
    search_fields = ("user",)
    ordering = ("alerted_date",)

    @admin.display(description="User")
    def user(self, obj):
        if obj.student_id:
            return f"{obj.student_id} (Student)"
        elif obj.staff_id:
            return f"{obj.staff_id} (Staff)"
        return "-"
