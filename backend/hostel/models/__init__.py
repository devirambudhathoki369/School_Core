# Re-exported so Django's app registry discovers every model during
# makemigrations, the way main/models/__init__.py does.
from .Hostel import (  # noqa: F401
    Hostel,
    HostelBlock,
    HostelRoomType,
    HostelRoom,
    HostelBed,
)
from .Allocation import HostelAllocation  # noqa: F401
from .Operations import (  # noqa: F401
    HostelAttendance,
    HostelLeave,
    HostelVisitor,
    HostelComplaint,
    HostelMessMenu,
    HostelDisciplineRecord,
)
