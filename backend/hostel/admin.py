from django.contrib import admin

from .models.Allocation import HostelAllocation
from .models.Hostel import Hostel, HostelBed, HostelBlock, HostelRoom, HostelRoomType
from .models.Operations import (
    HostelAttendance,
    HostelComplaint,
    HostelDisciplineRecord,
    HostelLeave,
    HostelMessMenu,
    HostelVisitor,
)

for model in (
    Hostel, HostelBlock, HostelRoomType, HostelRoom, HostelBed,
    HostelAllocation, HostelAttendance, HostelLeave, HostelVisitor,
    HostelComplaint, HostelMessMenu, HostelDisciplineRecord,
):
    admin.site.register(model)
