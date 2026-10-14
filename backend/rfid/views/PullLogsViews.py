from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from rest_framework.response import Response

from account.auth.Authentication import (
    SuperAdminTokenAuthentication,
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from ..models.Device import Device
from ..services.DeviceCommandQueueReg import CommandQueue
from ..services.Commands import Commands, is_access_control

# The device clock runs Nepal local time, and DATA QUERY ATTLOG bounds are
# matched against that clock — so build the window in Asia/Kathmandu.
NEPAL_TZ = ZoneInfo("Asia/Kathmandu")
# If the caller doesn't bound the window, look this far back. The device only
# keeps a finite log buffer, so this comfortably covers anything it still holds.
DEFAULT_LOOKBACK_DAYS = 30


def _day_bounds(start_date, end_date):
    """
    Turn optional 'YYYY-MM-DD' AD date strings into device-local
    'YYYY-MM-DD HH:MM:SS' start/end bounds (full days), defaulting to the last
    DEFAULT_LOOKBACK_DAYS up to today. Returns (start, end) or None on a bad date.
    """
    today = datetime.now(NEPAL_TZ).date()
    try:
        end = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else today
        start = (
            datetime.strptime(start_date, "%Y-%m-%d").date()
            if start_date
            else end - timedelta(days=DEFAULT_LOOKBACK_DAYS)
        )
    except ValueError:
        return None
    if start > end:
        return None
    return f"{start} 00:00:00", f"{end} 23:59:59"


class PullDeviceLogsView(SecuredAPIView):
    """
    Ask a device to re-upload its stored attendance logs (pending punches the
    server may have missed while offline). Enqueues a ZKTeco-push
    `DATA QUERY ATTLOG` command the device picks up on its next poll; the
    re-sent logs are ingested idempotently, so this is safe to repeat.
    """

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
    )

    def post(self, request):
        device_id = request.data.get("device")
        school_id = request.data.get("school")
        if not device_id:
            return self.RESPONSE__INVALID_REQUEST

        devices = Device.objects.filter(id=device_id)
        if school_id:
            devices = devices.filter(school_id=school_id)
        device = devices.first()
        if not device:
            return self.RESPONSE__INVALID_REQUEST

        bounds = _day_bounds(
            request.data.get("start_date"), request.data.get("end_date")
        )
        if bounds is None:
            return self.RESPONSE__INVALID_REQUEST
        start, end = bounds

        # An access panel has no ATTLOG table and answers a query for one with
        # -629, which is why this button did nothing on the InBio. Its punches
        # live in `transaction`, and it wants to be asked in that dialect.
        if is_access_control(device):
            cmd = CommandQueue.enqueue(device, Commands.QUERY_TRANSACTION)
            return Response(
                {
                    "message": "Log pull queued. The panel will upload its stored "
                    "punches on its next poll.",
                    "command_id": cmd.cmd_id,
                }
            )

        cmd = CommandQueue.enqueue_pull_attlog(device, start=start, end=end)
        return Response(
            {
                "message": "Log pull queued. The device will re-upload its stored "
                "punches on its next poll.",
                "command_id": cmd.cmd_id,
                "start": start,
                "end": end,
            }
        )
