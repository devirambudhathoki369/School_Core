from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import logging

from django.utils import timezone
from django.db import transaction
from django.db.utils import DataError
from django.db.models import Min, Max
from collections import defaultdict
from .parsers import parse_attlog, parse_operlog, parse_rtlog
from ..models.Attendance import RFIDAttdLogs, RFIDAttdUser
from main.models.Student import Student
from main.models.Staff import Staff
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Attendance import ClassAttendance, StudentAttendance, StaffAttendance
from main.methods.nepaliDatetime import ndt_today, nepaliToEnglishDate
from main.methods.push import notify_students_checked_in

logger = logging.getLogger("django.request")

NEPAL_TZ = ZoneInfo("Asia/Kathmandu")
# Check-out is only recorded if the last punch is at least this long after the
# first punch — so a person tapping twice on the way in isn't logged as leaving.
CHECKOUT_MIN_GAP = timedelta(hours=1)


def _bs_day_utc_range(bs_date):
    """UTC [start, end) datetimes covering one Bikram-Sambat calendar day."""
    eng = nepaliToEnglishDate(bs_date)
    start = datetime(eng.year, eng.month, eng.day, tzinfo=NEPAL_TZ)
    return start, start + timedelta(days=1)


class AttendanceTransfer:
    STUDENT_STATUS_RUNNING = 1
    STAFF_STATUS_EMPLOYED = 1

    @staticmethod
    def process_attendance_logs(device, user_ids, bs_date=None):
        """
        user_ids : ids of RFIDAttdUsers that punched.

        For `bs_date` (default today), recomputes each user's first/last punch
        from RFIDAttdLogs and derives present/check-in/check-out:
          - check-in  = first punch of the day
          - check-out = last punch (last punch >= out_time for time-set schools,
            else last punch >= 1h after check-in)
        For schools with `time_set_required` and an in-time set, the in-time is a
        present cutoff: a first punch AFTER it is NOT marked present (left absent).
        Recomputing from the stored logs makes this idempotent and order-
        independent across push batches.
        """
        user_ids = set(user_ids)
        if not user_ids:
            return
        school_id = device.school_id
        bs_date = bs_date or ndt_today()
        school = (
            SchoolAdmin.objects.filter(id=school_id)
            .values("time_set_required", "attendance_in_time", "attendance_out_time")
            .first()
            or {}
        )
        time_set = bool(school.get("time_set_required"))
        in_time = school.get("attendance_in_time") if time_set else None
        out_time = school.get("attendance_out_time") if time_set else None

        start, end = _bs_day_utc_range(bs_date)
        spans = {
            row["user_id"]: (row["first"], row["last"])
            for row in (
                RFIDAttdLogs.objects.filter(
                    user_id__in=user_ids,
                    punch_time__gte=start,
                    punch_time__lt=end,
                )
                .values("user_id")
                .annotate(first=Min("punch_time"), last=Max("punch_time"))
            )
        }

        users = (
            RFIDAttdUser.objects.filter(id__in=user_ids)
            .only("id", "student", "staff")
            .select_related("student__class_info", "staff")
        )
        # `*_users` = everyone who punched (so absent rows still get created);
        # `*_times` = only those who count as present, with their in/out times.
        student_users, staff_users = [], []
        student_times, staff_times = {}, {}
        for u in users:
            span = spans.get(u.id)
            if not span:
                continue
            present, cin, cout = AttendanceTransfer._derive_in_out(
                span, in_time, out_time
            )
            if u.student_id:
                student_users.append(u)
                if present:
                    student_times[u.student_id] = (cin, cout)
            elif u.staff_id:
                staff_users.append(u)
                if present:
                    staff_times[u.staff_id] = (cin, cout)

        if student_users:
            AttendanceTransfer.saveStudentAttendances(
                bs_date, school_id, student_users, student_times
            )

        """--------- STAFF ATTENDANCE ENTRY"""
        if staff_users:
            AttendanceTransfer.saveStaffAttendances(bs_date, school_id, staff_times)

    @staticmethod
    def _derive_in_out(span, in_time, out_time):
        """
        (first, last) punch -> (present, check_in, check_out).

        - present : True unless an in_time cutoff is set and the first punch is
                    after it (late -> absent).
        - check_out : last punch >= out_time when out_time is set; otherwise the
                      last punch when it is >= 1h after check-in.
        """
        first, last = span
        if not first:
            return False, None, None

        if in_time is not None:
            first_local = first.astimezone(NEPAL_TZ).time()
            if first_local > in_time:
                return False, None, None  # late -> not present

        check_out = None
        if last:
            if out_time is not None:
                if last.astimezone(NEPAL_TZ).time() >= out_time:
                    check_out = last
            elif (last - first) >= CHECKOUT_MIN_GAP:
                check_out = last
        return True, first, check_out

    @staticmethod
    def saveStudentAttendances(date, school_id, student_users, present_times):
        """
        store them per class
        for each class:
            - get/create class-attd
                if created: create student-attds for every student in the class
                else:       flip present students and stamp check-in/out times

        present_times = { student_id: (check_in, check_out) }
        """
        # group every puncher per class (so the class-attendance + absent rows
        # get created even if some/all of them are "late")
        class_groups = defaultdict(list)
        for u in student_users:
            class_groups[u.student.class_info_id].append(u)

        # only on-time punchers (present_times) count as present
        all_present_ids = set(present_times.keys())

        # students who FIRST flip to present in this batch -> push them once.
        newly_present_ids = []

        for class_id, _punchers in class_groups.items():
            class_attd, created = ClassAttendance.objects.get_or_create(
                date=date,
                class_info_id=class_id,
                school_id=school_id,
                is_active=True,
            )
            present_ids = all_present_ids
            if created:
                # New class attendance - mark all students
                students = Student.objects.filter(
                    class_info_id=class_id,
                    is_active=True,
                    status=AttendanceTransfer.STUDENT_STATUS_RUNNING,
                )
                rows = []
                for student in students:
                    status = student.id in present_ids
                    cin, cout = present_times.get(student.id, (None, None))
                    if status:
                        newly_present_ids.append(student.id)
                    rows.append(
                        StudentAttendance(
                            class_attendance=class_attd,
                            student=student,
                            status=status,
                            checked_in_at=cin if status else None,
                            checked_out_at=cout if status else None,
                        )
                    )
                StudentAttendance.objects.bulk_create(rows)
            else:
                # Existing class attendance - flip present users and (re)stamp the
                # check-in/out times (authoritative: recomputed from all logs).
                rows = StudentAttendance.objects.filter(
                    class_attendance=class_attd,
                    student_id__in=present_ids,
                    student__is_active=True,
                    student__status=AttendanceTransfer.STUDENT_STATUS_RUNNING,
                )
                now = timezone.now()
                to_update = []
                for row in rows:
                    # was absent, becoming present now -> first transition today.
                    if not row.status:
                        newly_present_ids.append(row.student_id)
                    cin, cout = present_times.get(row.student_id, (None, None))
                    row.status = True
                    row.checked_in_at = cin
                    row.checked_out_at = cout
                    row.updated_at = now
                    to_update.append(row)
                if to_update:
                    StudentAttendance.objects.bulk_update(
                        to_update,
                        ["status", "checked_in_at", "checked_out_at", "updated_at"],
                    )

        # one background push for everyone who just became present in this batch.
        notify_students_checked_in(school_id, newly_present_ids)

    @staticmethod
    def saveStaffAttendances(date, school_id, present_times):
        """
        if any staff-attd for school and date exists:
            flip present staff and (re)stamp check-in/out
        else:
            create staff-attd for all staffs (absent), present ones with times

        present_times = { staff_id: (check_in, check_out) }
        """
        has_any = StaffAttendance.objects.filter(
            date=date,
            school_id=school_id,
            is_active=True,
        ).exists()
        present_ids = set(present_times.keys())

        if has_any:
            rows = StaffAttendance.objects.filter(
                date=date,
                school_id=school_id,
                staff_id__in=present_ids,
                staff__is_active=True,
                staff__status=AttendanceTransfer.STAFF_STATUS_EMPLOYED,
            )
            now = timezone.now()
            to_update = []
            for row in rows:
                cin, cout = present_times.get(row.staff_id, (None, None))
                row.status = True
                row.checked_in_at = cin
                row.checked_out_at = cout
                row.updated_at = now
                to_update.append(row)
            if to_update:
                StaffAttendance.objects.bulk_update(
                    to_update,
                    ["status", "checked_in_at", "checked_out_at", "updated_at"],
                )
        else:
            # Create staff-attd for all staffs with false, and true for incoming
            staffs = Staff.objects.filter(
                school_id=school_id,
                is_active=True,
                status=AttendanceTransfer.STAFF_STATUS_EMPLOYED,
            )
            rows = []
            for staff in staffs:
                status = staff.id in present_ids
                cin, cout = present_times.get(staff.id, (None, None))
                rows.append(
                    StaffAttendance(
                        staff=staff,
                        school_id=school_id,
                        date=date,
                        status=status,
                        checked_in_at=cin if status else None,
                        checked_out_at=cout if status else None,
                    )
                )
            StaffAttendance.objects.bulk_create(rows)


class AttendanceIngest:
    STATUS_CHECKIN = 0

    @staticmethod
    def ingest_attlog(device, body, _records=None):
        """
        Store punches, then transfer to attendance.

        Every punch is kept for students and staff alike: check-in is derived
        from the first punch of the day and check-out from the last (last punch
        >= out_time for time-set schools, else last punch >= 1h after check-in).
        Exact device resends of the same punch are deduped by the
        (user, punch_time, status, verify) unique constraint + ignore_conflicts.
        """
        records = _records or list(parse_attlog(body))
        if not records:
            return 0

        pins = {r["pin"] for r in records}
        users = {
            p.pin: p
            for p in RFIDAttdUser.objects.filter(pin__in=pins).only(
                "id", "pin", "student_id", "staff_id"
            )
        }

        def _row(r):
            return RFIDAttdLogs(
                user=users.get(r["pin"]),
                punch_time=r["punch_time"],
                status=r["status"],
                verify=r["verify"],
                workcode=r["workcode"],
            )

        rows = [_row(r) for r in records]

        with transaction.atomic():
            """create logs and transfer successfully or fail completely!"""
            RFIDAttdLogs.objects.bulk_create(
                rows,
                ignore_conflicts=True,
            )
            # Any punch (Check-in, OT-in, Break-out, ...) means the person was
            # physically present that day; don't restrict to status 0 only.
            # process_attendance_logs recomputes each user's first/last punch
            # from the stored logs to derive check-in / check-out.
            user_ids = {
                user.id for r in records if (user := users.get(r["pin"])) is not None
            }
            AttendanceTransfer.process_attendance_logs(device, user_ids)
            # Acknowledge every record the device sent (not just the rows we
            # kept) so the device doesn't think some failed and resend them.
            return len(records)

    @staticmethod
    def ingest_rtlog(device, body):
        """
        Store punches from an access-control panel's real-time log.

        Access panels post table=rtlog instead of table=ATTLOG. Once parsed
        the records are identical in shape, so this hands straight off to
        ingest_attlog and inherits presence, check-in/check-out derivation and
        resend deduping unchanged. Door alarms and exit-button events carry no
        PIN and are dropped by the parser, so only real verifications land.
        """
        # `timezone_min` on an access panel means "minutes to add to this
        # panel's clock to get school wall time". It is unused by the acc
        # handshake (build_registered_response deliberately sends a panel no
        # TimeZone at all), so setting it here has no other effect.
        records = AttendanceIngest._resolve_pins_by_card(
            device,
            list(parse_rtlog(body, getattr(device, "timezone_min", 0) or 0)),
        )
        if not records:
            return 0
        try:
            return AttendanceIngest.ingest_attlog(device, body, _records=records)
        except DataError:
            # A value the columns cannot hold must not cost the device its
            # acknowledgement. Unacknowledged, a panel re-sends the same batch
            # every few seconds indefinitely and stops asking for commands at
            # all — one unstorable field takes the whole reader offline.
            # Logged with the rows so the offending field is findable.
            logger.exception(
                "rtlog insert rejected for device %s; records=%r",
                getattr(device, "serial_number", device),
                records[:5],
            )
            return 0

    @staticmethod
    def _resolve_pins_by_card(device, records):
        """
        Put a person back on punches the panel could not name.

        A panel that does not hold a badge logs the tap with pin=0 and the card
        number only. The student still tapped, and we know whose badge it is —
        so the punch is recoverable from the card. Without this a mis-enrolled
        panel loses attendance silently: the taps are recorded on the device,
        acknowledged by us, and dropped for having no PIN.

        Panels report the badge in hex, we store the decimal printed on it, so
        both readings are tried. Anything still unattributable is dropped, as
        before — an unknown badge is not attendance.
        """
        named = [r for r in records if r.get("pin") and r["pin"] != "0"]
        anonymous = [r for r in records if not r.get("pin") or r["pin"] == "0"]
        if not anonymous:
            return named

        wanted = set()
        for r in anonymous:
            card = (r.get("cardno") or "").strip().lstrip("0")
            if not card:
                continue
            wanted.add(card)
            try:
                wanted.add(str(int(card, 16)))
            except ValueError:
                pass

        if not wanted:
            return named

        by_card = {}
        for pin, card in (
            RFIDAttdUser.objects.filter(device=device, card__in=wanted)
            .values_list("pin", "card")
        ):
            by_card[(card or "").strip().lstrip("0")] = pin

        for r in anonymous:
            card = (r.get("cardno") or "").strip().lstrip("0")
            if not card:
                continue
            pin = by_card.get(card)
            if pin is None:
                try:
                    pin = by_card.get(str(int(card, 16)))
                except ValueError:
                    pin = None
            if pin is not None:
                r["pin"] = str(pin)
                named.append(r)
        return named

    @staticmethod
    def ingest_operlog(device, body):
        count = 0
        for prefix, kv in parse_operlog(body):
            if prefix == "USER":
                pin = kv.get("PIN")
                if not pin:
                    continue
                RFIDAttdUser.objects.update_or_create(
                    device=device,
                    pin=pin,
                    defaults={
                        # "name": kv.get("Name", ""),
                        "privilege": int(kv.get("Pri", "0") or 0),
                        "password": kv.get("Passwd", ""),
                        "card": kv.get("Card", ""),
                        "group_id": int(kv.get("Grp", "1") or 1),
                        "tz_str": kv.get("TZ", ""),
                        "verify": int(kv.get("Verify", "-1") or -1),
                    },
                )
                count += 1
            """NOT NEEDED YET;
            elif prefix in ("FP", "FACE", "BIODATA"):
                if AttendanceIngest._store_biometric(device, prefix, kv):
                    count += 1
            """
            # OPLOG entries are ignored for now.
        return count
