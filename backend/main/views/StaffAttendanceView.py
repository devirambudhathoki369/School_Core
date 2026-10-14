from django.db.models import Q, F, Value, CharField
from django.db.models.functions import Concat, Collate
from django.db import transaction
from django.utils import timezone

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..methods.nepaliDatetime import ndt_today

#
from ..models.Attendance import StaffAttendance
from ..models.Staff import Staff
from .BaseViews import SecuredAPIView


class StaffAttendanceView(SecuredAPIView):
    """CRUD endpoint for daily staff attendance.

    Mirrors ClassAttendanceView but for staff — there's no class_info layer,
    just school + date + staff.
    """

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
    )
    STAFF_STATUS_EMPLOYEED = 1

    def _staffs_qs(self, school_id):
        return (
            Staff.objects.filter(
                school_id=school_id, status=self.STAFF_STATUS_EMPLOYEED
            )
            .annotate(
                name=Concat(
                    "first_name",
                    Value(" "),
                    "middle_name",
                    Value(" "),
                    "last_name",
                    output_field=CharField(),
                ),
            )
            .order_by(Collate("name", "und-x-icu"))
        )

    def get(self, request):
        """Returns the staff roster + each staff's attendance for the date.

        Query params: ?school=&date= (date optional, defaults to today).
        """
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        date = request.query_params.get("date") or ndt_today()
        staffs = list(self._staffs_qs(school_id).values("id", "name"))
        if not staffs:
            return self.RESPONSE__NOT_FOUND
        records = StaffAttendance.objects.filter(
            school_id=school_id,
            date=date,
            is_active=True,
        ).values("id", "staff", "status", "reason")
        by_staff = {r["staff"]: r for r in records}
        attendances = []
        for s in staffs:
            r = by_staff.get(s["id"])
            attendances.append({
                "id": r.get("id") if r else None,
                "staff": s["id"],
                "name": s["name"],
                "status": r.get("status") if r else True,
                "reason": (r.get("reason") if r else "") or "",
            })
        present = sum(1 for a in attendances if a["id"] is not None and a["status"] is True)
        absent = sum(1 for a in attendances if a["id"] is not None and a["status"] is False)
        return Response(
            {
                "date": date,
                "attendances": attendances,
                "present": present,
                "absent": absent,
                "total": len(attendances),
                "exists": any(a["id"] is not None for a in attendances),
            }
        )

    def post(self, request):
        """Bulk-create staff attendance for a given date.

        Body: { school, date, attendances: [{staff, status, reason}] }
        """
        school_id = request.data.get("school")
        date = request.data.get("date")
        attendances = request.data.get("attendances") or []
        if not (school_id and date and isinstance(attendances, list) and attendances):
            return self.RESPONSE__INVALID_REQUEST
        existing_ids = set(
            StaffAttendance.objects.filter(
                school_id=school_id, date=date, is_active=True
            ).values_list("staff_id", flat=True)
        )
        rows = []
        for a in attendances:
            staff_id = a.get("staff")
            if not staff_id or staff_id in existing_ids:
                continue
            rows.append(
                StaffAttendance(
                    school_id=school_id,
                    date=date,
                    staff_id=staff_id,
                    status=bool(a.get("status", False)),
                    reason=(a.get("reason") or "")[:50],
                )
            )
        if not rows:
            return Response({"message": "Record already exists!"})
        with transaction.atomic():
            StaffAttendance.objects.bulk_create(rows)
        return Response({"message": "Staff attendance saved!"})

    def put(self, request):
        """Bulk update / upsert staff attendance for a given date.

        Body: { school, date, attendances: [{id?, staff, status, reason}] }
        Rows with `id` are updated in-place. Rows without `id` (newly enrolled
        staff added between create and edit) are created.
        """
        school_id = request.data.get("school")
        date = request.data.get("date")
        attendances = request.data.get("attendances") or []
        if not (school_id and date and isinstance(attendances, list)):
            return self.RESPONSE__INVALID_REQUEST
        updates_by_id = {}
        creates = []
        for a in attendances:
            payload = {
                "status": bool(a.get("status", False)),
                "reason": (a.get("reason") or "")[:50],
            }
            if a.get("id"):
                updates_by_id[a["id"]] = payload
            elif a.get("staff"):
                creates.append({
                    "school_id": school_id,
                    "date": date,
                    "staff_id": a["staff"],
                    **payload,
                })
        with transaction.atomic():
            if updates_by_id:
                updated_at = timezone.now()
                instances = StaffAttendance.objects.filter(
                    id__in=updates_by_id.keys(),
                    school_id=school_id,
                ).select_for_update()
                for ins in instances:
                    upd = updates_by_id.get(ins.id) or {}
                    for field, value in upd.items():
                        setattr(ins, field, value)
                    setattr(ins, "updated_at", updated_at)
                StaffAttendance.objects.bulk_update(
                    instances, ("status", "reason", "updated_at")
                )
            if creates:
                StaffAttendance.objects.bulk_create(
                    [StaffAttendance(**c) for c in creates]
                )
        return Response({"message": "Staff attendance updated!"})
