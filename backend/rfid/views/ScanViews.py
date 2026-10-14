"""
POST /rfid/scan — the endpoint an ESP32 (or any controller) posts UHF reads to.

Auth is a per-device shared secret in X-Reader-Key rather than a user token:
the poster is a microcontroller bolted to a gate, not a logged-in human. It's
the same trust model as the /iclock/ endpoints the ZK terminals use, tightened
to per-device keys so one school's controller can't post for another's gate.
"""

import hmac

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models.Device import Device
from ..services.UHFIngest import UHFIngest, normalize_epc


class ReaderScanView(APIView):
    """Unauthenticated in the DRF sense — the reader key is the credential."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)
    swagger_schema = None

    def _device(self, request):
        """
        Resolve + authenticate the posting device.

        Returns (device, error_response). A device must be pre-registered (its
        school is what scans get attributed to) and must carry a reader_key —
        an unset key is treated as not-configured rather than as "no auth
        needed", so a half-set-up gate can't quietly post real attendance.
        """
        reader_id = (request.data.get("reader_id") or "").strip()
        if not reader_id:
            return None, Response(
                {"detail": "reader_id required"}, status=status.HTTP_400_BAD_REQUEST
            )

        device = Device.objects.filter(
            serial_number=reader_id, reader_kind=Device.KIND_UHF
        ).first()
        if device is None:
            return None, Response(
                {"detail": "reader not registered"}, status=status.HTTP_403_FORBIDDEN
            )

        presented = request.headers.get("X-Reader-Key", "") or ""
        expected = device.reader_key or ""
        # compare_digest to keep the check constant-time; a plain != leaks the
        # key a byte at a time to anyone who can time the response.
        if not expected or not hmac.compare_digest(presented, expected):
            return None, Response(
                {"detail": "invalid reader key"}, status=status.HTTP_403_FORBIDDEN
            )
        return device, None

    def post(self, request):
        device, error = self._device(request)
        if error is not None:
            return error

        epc = request.data.get("epc")
        if not epc:
            return Response(
                {"detail": "epc required"}, status=status.HTTP_400_BAD_REQUEST
            )

        bits = request.data.get("bits") or 0
        try:
            bits = int(bits)
        except (TypeError, ValueError):
            bits = 0

        direction = request.data.get("direction") or None
        if direction not in (Device.DIRECTION_IN, Device.DIRECTION_OUT, None):
            direction = None

        outcome, detail = UHFIngest.ingest_scan(
            device,
            epc,
            bits=bits,
            reader_id=device.serial_number,
            direction=direction,
        )

        # Mark the gate alive off real traffic, the same way DeviceRegistry.touch
        # does for polling terminals — a UHF reader never polls, so this POST is
        # the only sign of life we get.
        Device.objects.filter(pk=device.pk).update(
            last_seen=timezone.now(), state=Device.STATE_ONLINE
        )

        if outcome == "invalid":
            return Response(
                {"detail": "unreadable epc"}, status=status.HTTP_400_BAD_REQUEST
            )

        body = {"status": outcome, "epc": normalize_epc(epc)}
        if outcome == "recorded":
            body["pin"] = detail.pin
            body["role"] = detail.role
        # 'unknown' and 'duplicate' are both 200s: the controller did its job and
        # must not retry. Retrying an unknown tag just re-floods the table.
        return Response(body, status=status.HTTP_200_OK)
