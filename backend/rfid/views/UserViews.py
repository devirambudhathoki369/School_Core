from django.db.models import Q, Case, When, Value, CharField

from rest_framework.response import Response
from rest_framework.pagination import CursorPagination

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)

from main.methods.nameConcat import nameConcat
from main.views.BaseViews import SecuredAPIView
from main.models.Student import Student
from main.models.Staff import Staff
from ..models.Device import Device
from ..models.Attendance import RFIDAttdUser
from ..serializers.AttendanceSerializers import RFIDAttdUserSerializer
from ..services.CardPropagation import (
    KIND_STAFF,
    KIND_STUDENT,
    propagate_card_changes,
)
from ..services.CardZeros import strip_school_cards
from .Roles import Roles


class RFIDAttdUsersCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class AttdUserViews(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    @staticmethod
    def _store_cards_on_profiles(school_id, users):
        """
        Persist RFID card numbers on the student/staff profiles, independently
        of any attendance device. This is the source of truth for a card, so
        it survives even before a device is registered and can be re-synced to
        a device later.

        Returns {("student"|"staff", profile_id): card} for the profiles whose
        card actually MOVED. Those are the ones whose device-side copies are
        now stale — a card that was merely re-submitted unchanged (which is
        every other row of a search result the operator saved) needs nothing
        sent anywhere.
        """
        wanted = {}
        for u in users:
            card = (u.get("card") or "").strip()
            if not card:
                continue
            if u.get("student"):
                wanted[(KIND_STUDENT, u["student"])] = card
            elif u.get("staff"):
                wanted[(KIND_STAFF, u["staff"])] = card
        if not wanted:
            return {}

        student_ids = [pid for kind, pid in wanted if kind == KIND_STUDENT]
        staff_ids = [pid for kind, pid in wanted if kind == KIND_STAFF]
        # School-scoped, so a request can't write a card onto someone else's
        # profile — and an id that isn't this school's simply drops out.
        current = {}
        if student_ids:
            current.update(
                {
                    (KIND_STUDENT, pid): (card or "").strip()
                    for pid, card in Student.objects.filter(
                        id__in=student_ids, class_info__school=school_id
                    ).values_list("id", "rfid_card")
                }
            )
        if staff_ids:
            current.update(
                {
                    (KIND_STAFF, pid): (card or "").strip()
                    for pid, card in Staff.objects.filter(
                        id__in=staff_ids, school=school_id
                    ).values_list("id", "rfid_card")
                }
            )

        changed = {
            key: card
            for key, card in wanted.items()
            if key in current and current[key] != card
        }
        students, staffs = [], []
        for (kind, pid), card in changed.items():
            if kind == KIND_STUDENT:
                students.append(Student(id=pid, rfid_card=card))
            else:
                staffs.append(Staff(id=pid, rfid_card=card))
        if students:
            Student.objects.bulk_update(students, ["rfid_card"])
        if staffs:
            Staff.objects.bulk_update(staffs, ["rfid_card"])
        return changed

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        device_id = data.get("device")
        users = data.get("users") or []
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # Card numbers live on the profile regardless of device selection, so
        # they can be entered and saved before any device exists.
        changed = self._store_cards_on_profiles(school_id, users)
        if device_id:
            device = Device.objects.only("id").filter(
                id=device_id, school=school_id
            ).first()
            if device:
                # Correct the stored copies BEFORE enrolling. The enrolment
                # below bulk-creates with ignore_conflicts, so it never touches
                # a row that already exists — which is exactly how an edited
                # card used to stop at the profile. It does re-send this device
                # the new number itself, so its command is skipped here rather
                # than queued twice.
                propagate_card_changes(
                    school_id, changed, skip_command_device_id=device.id
                )
                s = RFIDAttdUserSerializer(
                    data=users,
                    many=True,
                    context={"device": device},
                )
                if s.is_valid():
                    s.save()
                    return Response({"message": "Users enrolled"})
            return self.RESPONSE__INVALID_REQUEST
        # No device selected: the cards still have to reach every reader the
        # person is already enrolled on, or the profile and the door disagree.
        copies, devices = propagate_card_changes(school_id, changed)
        message = "Card numbers saved"
        if copies:
            message += (
                f" — {copies} changed card(s) sent to {devices} reader(s); "
                "they apply on the next device poll."
            )
        return Response({"message": message})

    def get(self, request):
        school_id = request.query_params.get("school")
        device_id = request.query_params.get("device")
        role = request.query_params.get("role")
        if school_id and device_id:
            q = Q(device__school_id=school_id, device_id=device_id)
            _name_field = ""
            if role == Roles.STUDENT:
                _name_field = "student"
                q &= Q(student__isnull=False)
            elif role == Roles.STAFF:
                _name_field = "staff"
                q &= Q(staff__isnull=False)
            #
            users_q = (
                RFIDAttdUser.objects.filter(q)
                .annotate(
                    user_name=nameConcat(_name_field),
                )
                .order_by("-id")
                .values("id", "pin", "card", "user_name")
            )
            paginator = RFIDAttdUsersCursorPagination()
            logs = paginator.paginate_queryset(users_q, request)
            return paginator.get_paginated_response(logs)

        return self.RESPONSE__INVALID_REQUEST


class StripCardZerosView(SecuredAPIView):
    """
    Superadmin-only "Remove leading zeros" button. Normalizes every stored
    RFID card number for a school (student/staff profiles + device-linked
    copies) by stripping leading zeros so they match what the readers emit.
    """

    authentication_classes = (SuperAdminTokenAuthentication,)

    def post(self, request):
        school_id = request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        changes = strip_school_cards(school_id=school_id, dry_run=False)
        students = len(changes["students"])
        staffs = len(changes["staffs"])
        attd_users = len(changes["attd_users"])
        total = students + staffs + attd_users

        if total == 0:
            return Response(
                {"message": "All RFID cards are already clean — nothing to strip."}
            )
        return Response(
            {
                "message": (
                    f"Removed leading zeros from {total} card(s): "
                    f"{students} student, {staffs} staff, {attd_users} device-user."
                ),
                "counts": {
                    "students": students,
                    "staffs": staffs,
                    "attd_users": attd_users,
                    "total": total,
                },
            }
        )
