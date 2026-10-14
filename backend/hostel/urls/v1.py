from django.urls import path

from ..views.AllocationViews import (
    HostelAllocationView,
    HostelCandidatesView,
    HostelCheckoutView,
    HostelTransferView,
)
from ..views.HostelViews import (
    HostelBedView,
    HostelBlockView,
    HostelRoomTypeView,
    HostelRoomView,
    HostelView,
)
from ..views.ManageAccessView import ManageHostelAccessView
from ..views.OperationViews import (
    HostelAttendanceView,
    HostelComplaintView,
    HostelDisciplineView,
    HostelLeaveView,
    HostelMessMenuView,
    HostelVisitorView,
)
from ..views.ReportViews import HostelDashboardView, HostelReportsView

# /hostel + ...
urlpatterns = [
    # setup
    path("hostels", HostelView.as_view(), name="hostels"),
    path("blocks", HostelBlockView.as_view(), name="hostel blocks"),
    path("room-types", HostelRoomTypeView.as_view(), name="hostel room types"),
    path("rooms", HostelRoomView.as_view(), name="hostel rooms"),
    path("beds", HostelBedView.as_view(), name="hostel beds"),
    # residents
    path("allocations", HostelAllocationView.as_view(), name="hostel allocations"),
    path(
        "allocations/candidates",
        HostelCandidatesView.as_view(),
        name="students who can be admitted",
    ),
    path(
        "allocations/transfer",
        HostelTransferView.as_view(),
        name="move a resident",
    ),
    path(
        "allocations/checkout",
        HostelCheckoutView.as_view(),
        name="close a stay",
    ),
    # operations
    path("attendance", HostelAttendanceView.as_view(), name="hostel roll call"),
    path("leaves", HostelLeaveView.as_view(), name="hostel gate passes"),
    path("visitors", HostelVisitorView.as_view(), name="hostel gate register"),
    path("complaints", HostelComplaintView.as_view(), name="hostel complaints"),
    path("mess-menu", HostelMessMenuView.as_view(), name="hostel mess menu"),
    path("discipline", HostelDisciplineView.as_view(), name="hostel discipline register"),
    # reporting
    path("dashboard", HostelDashboardView.as_view(), name="hostel dashboard"),
    path("reports", HostelReportsView.as_view(), name="hostel reports"),
    # superadmin
    path(
        "manage/access",
        ManageHostelAccessView.as_view(),
        name="which schools have the hostel module",
    ),
]
