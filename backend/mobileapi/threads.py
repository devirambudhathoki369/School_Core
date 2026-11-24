"""Short messages about a homework, between a student and the teacher who
set it (mobile/SPEC.md §5, "Homework messages").

Not a chat app: one thread per homework and student, text only, at most
500 characters a message and 30 a day from each side of a thread. The
student writes in their own thread; their parents may read it but not write
in it; the teacher who set the homework reads every thread on it and writes
to the students of its class. Opening a thread marks what the other side
wrote as read, so each side sees a count of new messages.
"""
from datetime import timedelta

from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework import status

from main.models.Homework import HomeworkMessage
from main.models.Student import Student

from . import push
from .access import page_by_id
from .errors import MobileError
from .profiles import _media, _name

DAILY_LIMIT = 30
STUDENT, TEACHER = "student", "teacher"


def _by(rows, sender):
    """Only the messages one side wrote."""
    return rows.filter(staff__isnull=sender == STUDENT)


def message_payload(message) -> dict:
    return {
        "id": message.id,
        "sender": TEACHER if message.staff_id else STUDENT,
        "body": message.body,
        "sent_at": message.created_at,
        "seen": message.read_at is not None,
    }


def thread_payload(request, homework, student, *, can_write: bool, reader: str | None) -> dict:
    """One thread, newest first in pages. `reader` is the side opening it:
    the first page marks what the other side wrote as read. A parent reads
    without marking anything (reader None)."""
    rows = HomeworkMessage.objects.filter(homework=homework, student=student)
    if reader and not request.query_params.get("cursor"):
        other = TEACHER if reader == STUDENT else STUDENT
        _by(rows, other).filter(read_at__isnull=True).update(read_at=timezone.now())
    items, cursor = page_by_id(rows, request)
    return {
        "homework_id": homework.id,
        "homework_title": homework.title,
        "student_id": student.id,
        "student_name": _name(student),
        "teacher_name": _name(homework.staff) if homework.staff_id else "",
        "can_write": can_write,
        "items": [message_payload(m) for m in items],
        "next_cursor": cursor,
    }


def send(homework, student, body: str, staff=None) -> HomeworkMessage:
    """Save one message and tell the other side's phones."""
    since = timezone.now() - timedelta(days=1)
    sender = TEACHER if staff else STUDENT
    thread = HomeworkMessage.objects.filter(homework=homework, student=student)
    if _by(thread, sender).filter(created_at__gte=since).count() >= DAILY_LIMIT:
        raise MobileError(
            "too_many_messages", f"At most {DAILY_LIMIT} messages a day can be sent about one homework.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
    message = HomeworkMessage.objects.create(homework=homework, student=student, staff=staff, body=body)
    if staff:
        push.on_homework_message(homework.school_id, homework.id, student.id, None,
                                 f"{_name(staff)} · {homework.title}", body)
    else:
        push.on_homework_message(homework.school_id, homework.id, student.id, homework.staff_id,
                                 f"{_name(student)} · {homework.title}", body)
    return message


# --- counts for the lists ---------------------------------------------------------
def student_counts(student, homework_ids) -> dict:
    """{homework id: (messages, new from the teacher)} in this student's threads."""
    return {
        row["homework_id"]: (row["total"], row["unread"])
        for row in HomeworkMessage.objects.filter(student=student, homework_id__in=list(homework_ids))
        .values("homework_id")
        .annotate(total=Count("id"), unread=Count("id", filter=Q(staff__isnull=False, read_at__isnull=True)))
    }


def teacher_unread(homework_ids) -> dict:
    """{homework id: messages from students the teacher has not opened}."""
    return dict(
        HomeworkMessage.objects.filter(homework_id__in=list(homework_ids), staff__isnull=True, read_at__isnull=True)
        .values("homework_id")
        .annotate(n=Count("id"))
        .values_list("homework_id", "n")
    )


def teacher_unread_total(staff) -> int:
    return HomeworkMessage.objects.filter(
        homework__staff=staff, homework__is_active=True, staff__isnull=True, read_at__isnull=True
    ).count()


def threads_of(request, homework) -> list[dict]:
    """Every thread on a homework, the one with the latest message first."""
    rows = list(
        HomeworkMessage.objects.filter(homework=homework)
        .values("student_id")
        .annotate(last_id=Max("id"), unread=Count("id", filter=Q(staff__isnull=True, read_at__isnull=True)))
    )
    if not rows:
        return []
    last = HomeworkMessage.objects.in_bulk([row["last_id"] for row in rows])
    students = Student.objects.only("id", "first_name", "middle_name", "last_name", "roll_no", "image").in_bulk(
        [row["student_id"] for row in rows]
    )
    out = []
    for row in sorted(rows, key=lambda r: r["last_id"], reverse=True):
        student, message = students[row["student_id"]], last[row["last_id"]]
        out.append({
            "student_id": student.id,
            "student_name": _name(student),
            "roll_no": student.roll_no or None,
            "photo_url": _media(request, student.image),
            "last": message_payload(message),
            "unread": row["unread"],
        })
    return out
