"""Who may open what in /api/mobile/v1/ (mobile/SPEC.md §5).

Every `/students/{id}/…` path first finds the student through the caller:
a parent reaches only children with a linked (state 1) link, a student only
their own record. Anyone else gets the same 404 as a student that does not
exist, so ids cannot be probed. Staff paths check the portal's permission ids
(`main/constants/staff_permissions.py`).
"""
import base64
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

import nepali_datetime
from rest_framework import status

from main.methods.nepaliDatetime import ndt_today
from main.models.Staff import Staff
from main.models.Student import Student

from .auth import STAFF_EMPLOYED, STUDENT_RUNNING, linked_students
from .errors import MobileError
from .models import AppSession

PAGE_SIZE = 30

# The portal's permission ids for the screens the app offers.
TAKE_ATTENDANCE, CHANGE_ATTENDANCE, SEE_ATTENDANCE, SEE_ATTENDANCE_REPORTS = 1501, 1502, 1503, 1504
ANY_ATTENDANCE = (TAKE_ATTENDANCE, CHANGE_ATTENDANCE, SEE_ATTENDANCE, SEE_ATTENDANCE_REPORTS)
PUBLISH_NOTICES, MANAGE_NOTICES = 1651, 1652
# Staff who may update a student's record (guardian details included) may
# also vouch for a parent with a family code; dues stay with the fee counter.
UPDATE_STUDENTS, TAKE_PAYMENTS = 102, 103

STUDENT_RELATED = ("class_info__school", "class_info__section", "class_info__course", "guardian_info")


def forbidden():
    return MobileError("forbidden", "This is not available for your account.", status.HTTP_403_FORBIDDEN)


def not_found(message="Nothing was found."):
    return MobileError("not_found", message, status.HTTP_404_NOT_FOUND)


def require_role(request, *roles: int) -> None:
    if request.auth.role not in roles:
        raise forbidden()


def student_for(request, student_id) -> Student:
    """The student the caller may open, or 404."""
    session = request.auth
    if session.role == AppSession.PARENT:
        students = linked_students(session.account)
    elif session.role == AppSession.STUDENT:
        students = Student.objects.filter(
            account=session.account, is_active=True, status=STUDENT_RUNNING,
            class_info__school_id=session.school_id,
        )
    else:
        raise forbidden()
    try:
        student_id = int(student_id)
    except (TypeError, ValueError):
        raise not_found()
    student = students.select_related(*STUDENT_RELATED).filter(pk=student_id).first()
    if student is None:
        raise not_found()
    return student


def staff_of(request) -> Staff:
    require_role(request, AppSession.STAFF)
    session = request.auth
    staff = (
        Staff.objects.select_related("role")
        .filter(account=session.account, school_id=session.school_id, is_active=True, status=STAFF_EMPLOYED)
        .first()
    )
    if staff is None:
        raise forbidden()
    return staff


def staff_permissions(staff: Staff) -> set[int]:
    return {int(p) for p in (staff.permissions or []) if str(p).isdigit()}


def require_permission(staff: Staff, *ids: int) -> None:
    if not staff_permissions(staff) & set(ids):
        raise forbidden()


# --- lists ------------------------------------------------------------------
def _encode(value: int) -> str:
    return base64.urlsafe_b64encode(str(value).encode()).decode().rstrip("=")


def _decode(cursor: str | None) -> int | None:
    if not cursor:
        return None
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        return int(base64.urlsafe_b64decode(padded.encode()).decode())
    except (ValueError, UnicodeDecodeError):
        raise MobileError("invalid", "That page link is not valid.", fields={"cursor": "Not a valid cursor."})


def page_by_id(queryset, request, size: int = PAGE_SIZE):
    """Newest first, `size` at a time; the cursor is the last id seen."""
    after = _decode(request.query_params.get("cursor"))
    if after is not None:
        queryset = queryset.filter(pk__lt=after)
    rows = list(queryset.order_by("-pk")[: size + 1])
    more = len(rows) > size
    rows = rows[:size]
    return rows, (_encode(rows[-1].pk) if more and rows else None)


def page_by_offset(queryset, request, size: int = PAGE_SIZE):
    """For lists in a fixed order other than newest first (names)."""
    start = _decode(request.query_params.get("cursor")) or 0
    rows = list(queryset[start: start + size + 1])
    more = len(rows) > size
    return rows[:size], (_encode(start + size) if more else None)


# --- Bikram Sambat dates -------------------------------------------------------
BS_MONTHS = (
    "Baishakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Asoj",
    "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
)
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MONTH = re.compile(r"^(\d{4})-(\d{2})$")


def bs_date(value: str | None, field: str = "date", default_today: bool = True) -> str:
    """A BS date as the database holds it (zero-padded), checked to exist."""
    if not value:
        if default_today:
            return ndt_today()
        raise MobileError("invalid", "Choose a date.", fields={field: "Required."})
    if not _DATE.match(str(value)):
        raise MobileError("invalid", "Dates are YYYY-MM-DD in Bikram Sambat.", fields={field: "Use YYYY-MM-DD."})
    try:
        year, month, day = (int(part) for part in str(value).split("-"))
        return nepali_datetime.date(year, month, day).strftime("%Y-%m-%d")
    except (ValueError, OverflowError, AssertionError, KeyError, IndexError):
        raise MobileError("invalid", "That date is not in the calendar.", fields={field: "Not a real date."})


def bs_month(value: str | None) -> dict:
    """A BS month: its first and last day, its length, the weekday it starts
    on (0 = Sunday), and the months either side."""
    if value:
        match = _MONTH.match(str(value))
        if not match:
            raise MobileError("invalid", "Months are YYYY-MM in Bikram Sambat.", fields={"month": "Use YYYY-MM."})
        year, month = int(match.group(1)), int(match.group(2))
        if not (1 <= month <= 12 and nepali_datetime.MINYEAR <= year < nepali_datetime.MAXYEAR):
            raise MobileError("invalid", "That month is not in the calendar.", fields={"month": "Not a real month."})
    else:
        today = nepali_datetime.datetime.strptime(ndt_today(), "%Y-%m-%d").date()
        year, month = today.year, today.month
    try:
        days = nepali_datetime._days_in_month(year, month)
        first = nepali_datetime.date(year, month, 1)
    except (ValueError, KeyError, OverflowError, IndexError, AssertionError):
        raise MobileError("invalid", "That month is not in the calendar.", fields={"month": "Not a real month."})
    prev_year, prev_month = (year - 1, 12) if month == 1 else (year, month - 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    return {
        "month": f"{year:04d}-{month:02d}",
        "label": f"{BS_MONTHS[month - 1]} {year}",
        "start": first.strftime("%Y-%m-%d"),
        "end": nepali_datetime.date(year, month, days).strftime("%Y-%m-%d"),
        "days": days,
        "starts_on": first.weekday(),  # nepali_datetime counts Sunday as 0
        "previous": f"{prev_year:04d}-{prev_month:02d}",
        "next": f"{next_year:04d}-{next_month:02d}",
    }


def month_names(months) -> list[str]:
    """[4, 5] -> ["Shrawan", "Bhadra"]; anything that is not a month is dropped."""
    if isinstance(months, (int, str)):
        months = [months]
    names = []
    for month in months or []:
        try:
            number = int(month)
        except (ValueError, TypeError):
            continue
        if 1 <= number <= 12:  # 0 would read the list from its end: Chaitra
            names.append(BS_MONTHS[number - 1])
    return names


MAX_FILE_MB = 10


def check_file_sizes(files, field="files") -> None:
    """Each uploaded file at most MAX_FILE_MB: a phone on mobile data should
    not send, and the server should not keep, a long video as homework."""
    for upload in files:
        if upload.size > MAX_FILE_MB * 1024 * 1024:
            message = f"{upload.name} is larger than {MAX_FILE_MB} MB. Send a smaller file or a photo of the page."
            raise MobileError("file_too_large", message, fields={field: message})


def paisa(amount) -> int:
    """Rupees (Decimal, str, int or None) as whole paisa, rounded half up."""
    try:
        return int((Decimal(str(amount or 0)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError):
        return 0

