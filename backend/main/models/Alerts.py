from django.db.models import IntegerField, ForeignKey, DecimalField, DateField, CASCADE

#
from .BaseModel import BaseModel, _allow_empty

# Student/Staff Bus Tracking!
from .BusStation import location_configs


class BusTrackOnAlertInfo(BaseModel):
    bus_id = IntegerField()
    student_id = ForeignKey("main.Student", on_delete=CASCADE, **_allow_empty)
    staff_id = ForeignKey("main.Staff", on_delete=CASCADE, **_allow_empty)
    # student's location
    latitude = DecimalField(**location_configs)
    longitude = DecimalField(**location_configs)
    alert_range = IntegerField()
    # alerted dateA
    alerted_date = DateField(**_allow_empty)


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
