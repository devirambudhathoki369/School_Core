import re
from zoneinfo import ZoneInfo

from nepali_datetime import date as ndate
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from .BaseViews import SecuredAPIView
from ..models.Attendance import StudentAttendance, StaffAttendance
from ..models.Student import Student
from ..models.Staff import Staff
from ..methods.nepaliDatetime import ndt_today

NEPAL = ZoneInfo("Asia/Kathmandu")
BS_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# what a form wrote into the reason when nothing was typed
NO_REASON = {"undefined", "null", "none"}


def month_table(year):
    """
    The twelve months of one BS year: how many days each has and the weekday
    its first day falls on (0 = Sunday), which is all a calendar needs to be
    drawn. None for a year the calendar does not cover, e.g. a mistyped date.
    """
    try:
        firsts = [ndate(year, month, 1).to_datetime_date() for month in range(1, 13)]
        firsts.append(ndate(year + 1, 1, 1).to_datetime_date())
    except (ValueError, KeyError, IndexError, OverflowError):
        return None
    return [
        {
            "month": month + 1,
            "days": (firsts[month + 1] - firsts[month]).days,
            # Python counts the week from Monday; the calendar here starts on Sunday.
            "starts": (firsts[month].weekday() + 1) % 7,
        }
        for month in range(12)
    ]


def minute_of_day(moment):
    """A punch as minutes after midnight in Nepal; None when there was none."""
    if not moment:
        return None
    local = moment.astimezone(NEPAL)
    return local.hour * 60 + local.minute


def said(value):
    """The reason as it was typed; a blank, or a form's own placeholder, is none."""
    text = (value or "").strip()
    return "" if text.lower() in NO_REASON else text


def merge_days(rows):
    """
    One entry per date.

    Nothing stops a person from having two rows on one date (a class marked
    twice, a manual entry beside a card punch). Present on any of them is
    present, the way the rest of the system reads a punch; the day keeps its
    first arrival and its last leaving.

    `reason` is what was written beside the mark the day ends up with: why, on
    an absent day; a note such as "late" or "bus duty" on a present one. The
    reason of an absent row is not carried onto a day that turned out present.
    """
    days = {}
    for row in rows:
        date = row["date"]
        if not date or not BS_DATE.match(date):
            continue
        day = days.setdefault(
            date,
            {"date": date, "present": False, "in": None, "out": None, "reason": "", "note": ""},
        )
        reason = said(row["reason"])
        if row["status"]:
            day["present"] = True
            arrived = minute_of_day(row["checked_in_at"])
            left = minute_of_day(row["checked_out_at"])
            if arrived is not None and (day["in"] is None or arrived < day["in"]):
                day["in"] = arrived
            if left is not None and (day["out"] is None or left > day["out"]):
                day["out"] = left
            if reason and not day["note"]:
                day["note"] = reason
        elif reason and not day["reason"]:
            day["reason"] = reason
    for day in days.values():
        note = day.pop("note")
        if day["present"]:
            day["reason"] = note
    return [days[date] for date in sorted(days)]


class AttendanceHistoryView(SecuredAPIView):
    """
    One student's or one staff member's attendance for a BS year, for the
    Attendance tab on their profile.

    GET ?school=&student=   or   ?school=&staff=      [&year=2083]

    Answers with the years that hold any record (newest first), the year
    shown, that year's calendar and one entry per day attendance was marked:

        {
          "year": "2083", "years": ["2083", "2082"], "today": "2083-06-24",
          "months": [{"month": 1, "days": 31, "starts": 2}, ...],
          "days": [{"date": "2083-01-02", "present": true,
                    "in": 581, "out": null, "reason": ""}, ...]
        }

    `in` / `out` are minutes after midnight in Nepal. `reason` is why, on an
    absent day, and the note written beside the mark on a present one.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        params = request.query_params
        school_id = self._id(params.get("school"))
        student_id = self._id(params.get("student"))
        staff_id = self._id(params.get("staff"))
        # exactly one of the two: a profile is a student's or a staff member's
        if not school_id or bool(student_id) == bool(staff_id):
            return self.RESPONSE__INVALID_REQUEST

        if student_id:
            if not Student.objects.filter(
                id=student_id, class_info__school_id=school_id
            ).exists():
                return self.RESPONSE__NOT_FOUND
            rows = StudentAttendance.objects.filter(
                student_id=student_id, is_active=True
            ).values_list(
                "class_attendance__date", "status", "checked_in_at", "checked_out_at", "reason"
            )
        else:
            if not Staff.objects.filter(id=staff_id, school_id=school_id).exists():
                return self.RESPONSE__NOT_FOUND
            rows = StaffAttendance.objects.filter(
                staff_id=staff_id, is_active=True
            ).values_list("date", "status", "checked_in_at", "checked_out_at", "reason")

        days = merge_days(
            {
                "date": date,
                "status": status,
                "checked_in_at": checked_in_at,
                "checked_out_at": checked_out_at,
                "reason": reason,
            }
            for date, status, checked_in_at, checked_out_at, reason in rows
        )

        today = ndt_today()
        tables = {}
        for day in days:
            year = day["date"][:4]
            if year not in tables:
                tables[year] = month_table(int(year))
        years = sorted((year for year, table in tables.items() if table), reverse=True)

        asked = (params.get("year") or "").strip()
        this_year = today[:4]
        if asked in years:
            year = asked
        elif this_year in years or not years:
            year = this_year
        else:
            year = years[0]

        return Response(
            {
                "year": year,
                "years": years,
                "today": today,
                "months": tables.get(year) or month_table(int(year)) or [],
                "days": [day for day in days if day["date"].startswith(year + "-")],
            }
        )

    @staticmethod
    def _id(value):
        try:
            value = int(value)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None
