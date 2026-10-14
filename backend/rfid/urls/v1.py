from django.urls import path
from ..views.DeviceViews import DeviceView
from ..views.UserViews import AttdUserViews, StripCardZerosView
from ..views.AttdLogsViews import AttdLogsView
from ..views.PullLogsViews import PullDeviceLogsView
from ..views.SyncUsersViews import SyncDeviceUsersView
from ..views.ScanViews import ReaderScanView

# admin panel apis
urlpatterns = [
    path("devices", DeviceView.as_view(), name="devices"),
    path("devices/pull-logs", PullDeviceLogsView.as_view(), name="pull device logs"),
    path("users", AttdUserViews.as_view(), name="attendance users"),
    path("users/strip-zeros", StripCardZerosView.as_view(), name="strip card zeros"),
    path("users/sync", SyncDeviceUsersView.as_view(), name="sync device users"),
    path("logs", AttdLogsView.as_view(), name="attendance logs"),
    # controller-fronted UHF readers (ESP32 -> here). Reader-key auth, not a
    # user token, so it sits outside the SecuredAPIView group above.
    path("scan", ReaderScanView.as_view(), name="uhf reader scan"),
]
