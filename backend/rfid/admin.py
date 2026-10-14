from django.contrib import admin

# Register your models here.
from .models.Device import Device, DeviceAdmin, DeviceCommand
from .models.Attendance import RFIDAttdUser, RFIDAttdLogs
from .models.UHF import UnknownScan


class UnknownScanAdmin(admin.ModelAdmin):
    list_select_related = ("device",)
    list_display = ("epc", "device", "seen_count", "last_seen", "resolved")
    list_filter = ("resolved", "device")
    search_fields = ("epc",)


admin.site.register(Device, DeviceAdmin)
admin.site.register(DeviceCommand)
admin.site.register(RFIDAttdUser)
admin.site.register(RFIDAttdLogs)
admin.site.register(UnknownScan, UnknownScanAdmin)
