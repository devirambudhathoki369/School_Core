"""Push notifications to the SchoolCore app (mobile/SPEC.md, phase 6).

The portal already raises a push for every event worth one: a gate tap-in,
attendance marked, a fee posted or paid, homework set, a notice published.
`main/methods/push.py` calls the functions here from those same places, so
the app's phones get each one too:

- a student event goes to the student's own phone and to the phones of their
  parents with a confirmed link, naming the child for the parents;
- a notice goes to every phone signed in at the school;
- a staff event goes to that staff member's phones.

Phones are reached through Expo's push service with the Expo push token the
app registers on its session (`PUT /me/push-token`). One phone hears an event
once, even with several accounts on it. A token Expo reports as gone is
cleared. Delivery needs the app built with the school's Firebase and Apple
push keys (set up with `eas credentials`); without a token nothing is sent.
"""
import logging

import requests
import sentry_sdk
from django.conf import settings

from main.models.Guardian import StudentGuardian
from main.models.Student import Student

from .auth import STAFF_EMPLOYED, STUDENT_RUNNING
from .models import AppSession

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH = 100  # Expo takes at most 100 messages a request
TIMEOUT = 10
MAX_BODY = 240


def _clip(text) -> str:
    text = " ".join(str(text or "").split())
    return text if len(text) <= MAX_BODY else text[: MAX_BODY - 3] + "..."


def _live(**filters):
    return AppSession.objects.filter(revoked_at__isnull=True, push_token__isnull=False, **filters)


def _message(token, session_id, title, body, data):
    return {
        "to": token,
        "title": _clip(title)[:120],
        "body": _clip(body),
        "sound": "default",
        "channelId": "school",
        "priority": "high",
        "data": {**data, "session": str(session_id)},
    }


def _post(messages: list[dict]) -> list[dict]:
    """Send to Expo; the tickets come back in the same order."""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = getattr(settings, "EXPO_ACCESS_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    url = getattr(settings, "EXPO_PUSH_URL", "") or EXPO_PUSH_URL
    response = requests.post(url, json=messages, headers=headers, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json().get("data") or []


def send(messages: list[dict]) -> int:
    """Send in batches; clear the tokens of phones that are gone. Returns how
    many were accepted."""
    accepted, gone = 0, set()
    for start in range(0, len(messages), BATCH):
        batch = messages[start: start + BATCH]
        try:
            tickets = _post(batch)
        except Exception:
            logger.exception("mobile push batch failed")
            sentry_sdk.capture_exception()
            continue
        for message, ticket in zip(batch, tickets):
            if ticket.get("status") == "ok":
                accepted += 1
            elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                gone.add(message["to"])
    if gone:
        AppSession.objects.filter(push_token__in=gone).update(push_token=None)
    return accepted


def _one_per_phone(rows):
    """[(token, session id, ...)] with each token once."""
    seen, out = set(), []
    for row in rows:
        if row[0] not in seen:
            seen.add(row[0])
            out.append(row)
    return out


def student_messages(school_id, student_ids, title, body, kind, parent_title=None, parent_body=None):
    """Messages about each student: to the student's phones and to their
    parents' phones. `parent_title`/`parent_body` may use {name}."""
    students = {
        s.id: s
        for s in Student.objects.filter(
            id__in=list(student_ids), class_info__school_id=school_id, is_active=True, status=STUDENT_RUNNING
        ).only("id", "first_name", "last_name", "account_id")
    }
    if not students:
        return []
    messages = []
    own = (
        _live(school_id=school_id, role=AppSession.STUDENT, student_account__student__id__in=list(students))
        .values_list("push_token", "id", "student_account__student__id")
    )
    for token, session_id, student_id in own:
        messages.append((token, student_id, _message(token, session_id, title, body,
                                                     {"type": kind, "student": str(student_id)})))
    parents = (
        StudentGuardian.objects.filter(
            student_id__in=list(students), state=StudentGuardian.LINKED,
            guardian__app_sessions__school_id=school_id,
            guardian__app_sessions__revoked_at__isnull=True,
            guardian__app_sessions__push_token__isnull=False,
        )
        .values_list("guardian__app_sessions__push_token", "guardian__app_sessions__id", "student_id")
    )
    for token, session_id, student_id in parents:
        child = students[student_id]
        name = " ".join(p for p in (child.first_name, child.last_name) if p)
        # only our own templates are formatted; the portal's text is used as is
        messages.append((token, student_id, _message(
            token, session_id,
            parent_title.format(name=name) if parent_title else f"{name}: {title}",
            parent_body.format(name=name) if parent_body else body,
            {"type": kind, "student": str(student_id)},
        )))
    # a phone hears about each child once, however many accounts it holds
    seen, out = set(), []
    for token, student_id, message in messages:
        if (token, student_id) not in seen:
            seen.add((token, student_id))
            out.append(message)
    return out


def school_messages(school_id, title, body, kind, image=None):
    rows = _one_per_phone(_live(school_id=school_id).order_by("-last_seen_at").values_list("push_token", "id"))
    data = {"type": kind, **({"image": image} if image else {})}
    return [_message(token, session_id, title, body, data) for token, session_id in rows]


def class_messages(school_id, class_info_id, title, body, kind="homework"):
    ids = Student.objects.filter(
        class_info_id=class_info_id, class_info__school_id=school_id, is_active=True, status=STUDENT_RUNNING
    ).values_list("id", flat=True)
    return student_messages(school_id, ids, title, body, kind)


def staff_messages(school_id, staff_ids, title, body, kind):
    rows = _one_per_phone(
        _live(
            school_id=school_id, role=AppSession.STAFF, staff_account__staff__id__in=list(staff_ids),
            staff_account__staff__is_active=True, staff_account__staff__status=STAFF_EMPLOYED,
        ).values_list("push_token", "id")
    )
    return [_message(token, session_id, title, body, {"type": kind}) for token, session_id in rows]


ATTENDANCE_TITLE = "हाजिरी"
PRESENT = "{name} आज उपस्थित जनाइएको छ।"
ABSENT = "{name} आज अनुपस्थित जनाइएको छ।"


def _background(build, *args, **kwargs):
    """Build and send off the request thread, as the portal's own pushes go."""
    from main.methods.push import _in_background

    def run():
        messages = build(*args, **kwargs)
        if messages:
            send(messages)

    if _live().exists():  # nobody has a token: skip the thread
        _in_background(run)


# --- called from main/methods/push.py ---------------------------------------
def on_notice(school_id, title, body, kind="notice", image=None):
    _background(school_messages, school_id, title, body, kind, image)


def on_homework(school_id, class_info_id, title, body):
    _background(class_messages, school_id, class_info_id, title, body)


def on_attendance(school_id, student_ids, present: bool, title, body):
    _background(
        student_messages, school_id, student_ids, title, body, "attendance",
        parent_title=ATTENDANCE_TITLE, parent_body=PRESENT if present else ABSENT,
    )


def on_students(school_id, student_ids, title, body, kind):
    _background(student_messages, school_id, student_ids, title, body, kind)


def on_staff(school_id, staff_ids, title, body, kind):
    _background(staff_messages, school_id, staff_ids, title, body, kind)
