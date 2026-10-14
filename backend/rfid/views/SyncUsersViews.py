from rest_framework.response import Response

from account.auth.Authentication import (
    SuperAdminTokenAuthentication,
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from ..models.Device import Device, DeviceCommand
from ..models.Attendance import RFIDAttdUser
from ..services.UsersSyncReg import UsersSyncReg, profile_name
from ..services.Commands import Commands, is_access_control
from ..services.DeviceCommandQueueReg import CommandQueue

# A device takes 10 commands per poll and polls roughly every 10 seconds, so a
# big school's sync is minutes of trickle, not instant. Reported back so the
# operator knows to wait rather than press the button again.
COMMANDS_PER_POLL = 10
SECONDS_PER_POLL = 10

# Enrolment commands all start with "DATA UPDATE" on both dialects (USERINFO on
# attendance terminals, user/userauthorize on access panels).
ENROL_PREFIX = "DATA UPDATE"


class SyncDeviceUsersView(SecuredAPIView):
    """
    Push every user we hold for a device back down to the device.

    Enrolment commands are normally queued once, at the moment someone is added
    through Users Setup. If the device rejects one — an access panel answering
    an attendance-terminal command with -629, say — or the device is later
    reset or swapped, our table still says "registered" while the device holds
    nothing, and the person's card silently stops opening the door. This is the
    way back: it re-queues the enrolment for everyone we have, in whichever
    dialect the device speaks.

    Safe to repeat. Both dialects upsert on the PIN, so re-sending an enrolment
    the device already has changes nothing on it.
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

        # `school` is optional here, so the device must be the caller's own
        devices = self.scope_to_caller(Device.objects.filter(id=device_id), request)
        if school_id:
            devices = devices.filter(school_id=school_id)
        device = devices.first()
        if not device:
            return self.RESPONSE__INVALID_REQUEST

        # An in-flight sync must not be stacked on top of. The queue drains at
        # a fixed trickle, so a second press would only double the wait and
        # re-send what is already on its way.
        in_flight = DeviceCommand.objects.filter(
            device=device,
            status__in=(DeviceCommand.STATUS_PENDING, DeviceCommand.STATUS_SENT),
            cmd_content__startswith=ENROL_PREFIX,
        ).count()
        if in_flight:
            return Response(
                {
                    "message": (
                        f"A sync is already running — {in_flight} enrolment "
                        "command(s) still on their way to the device. Let it "
                        "finish before starting another."
                    ),
                    "queued": 0,
                    "in_flight": in_flight,
                }
            )

        users = RFIDAttdUser.objects.filter(device=device).select_related(
            "student", "staff"
        )

        payload = []
        no_profile = 0
        no_card = 0
        for u in users:
            profile = u.student or u.staff
            if profile is None:
                # the student/staff record was deleted out from under the
                # enrolment (FK is SET_NULL) — nothing left to send.
                no_profile += 1
                continue
            # The card on the profile is the source of truth; the copy stored
            # against the device can predate a re-issued card.
            card = (getattr(profile, "rfid_card", "") or "").strip() or (
                u.card or ""
            ).strip()
            if not card:
                no_card += 1
                continue
            payload.append(
                {
                    "name": profile_name(profile),
                    "card": card,
                    "pin": u.pin,
                }
            )

        if not payload:
            return Response(
                {
                    "message": (
                        "Nothing to push — no enrolled user on this device has a "
                        "card number. Add cards in Users Setup first."
                    ),
                    "queued": 0,
                    "users": 0,
                    "skipped_no_card": no_card,
                    "skipped_no_profile": no_profile,
                }
            )

        commands = UsersSyncReg.add_users(device, payload)
        # Queued last, so it runs after every enrolment above and reports the
        # count as it stands once the sync has actually landed. An attendance
        # terminal needs no such prompt — it reports its counters unasked on
        # every poll.
        if is_access_control(device):
            CommandQueue.enqueue(device, Commands.QUERY_USER)
        queued = len(commands)
        eta_seconds = -(-queued // COMMANDS_PER_POLL) * SECONDS_PER_POLL

        message = (
            f"Pushing {len(payload)} user(s) to the device "
            f"({queued} commands, about {max(1, round(eta_seconds / 60))} min "
            "as the device polls)."
        )
        skipped = []
        if no_card:
            skipped.append(f"{no_card} with no card number")
        if no_profile:
            skipped.append(f"{no_profile} whose profile was removed")
        if skipped:
            message += " Skipped " + " and ".join(skipped) + "."

        return Response(
            {
                "message": message,
                "queued": queued,
                "users": len(payload),
                "skipped_no_card": no_card,
                "skipped_no_profile": no_profile,
                "eta_seconds": eta_seconds,
            }
        )
