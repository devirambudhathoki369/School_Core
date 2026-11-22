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
once, even with several accounts on it. Delivery needs the app built with
Firebase's google-services.json and the Firebase and Apple push keys (set up
with `eas credentials`, mobile/RELEASE.md §2); without a token nothing is sent.

Expo answers a send with a ticket per message, and about 15 minutes later
with a receipt saying whether Firebase or Apple took it. A busy or failing
Expo is tried again after a wait. Each accepted ticket is kept until
`manage.py mobile_push_receipts` reads its receipt. A phone reported gone, in
a ticket or a receipt, loses its token. Any other error (a wrong Firebase
key, a message too big) goes to the log and Sentry, so a broken setup is seen.
"""
import logging
import time
import uuid
from collections import Counter
from datetime import timedelta

import requests
import sentry_sdk
from django.conf import settings
from django.utils import timezone

from main.models.Guardian import StudentGuardian
from main.models.Student import Student

from .auth import STAFF_EMPLOYED, STUDENT_RUNNING
from .models import AppSession, PushTicket

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
BATCH = 100  # Expo takes at most 100 messages a request
RECEIPT_BATCH = 1000  # and at most 1000 receipt ids
RECEIPT_AFTER = timedelta(minutes=15)  # when Expo advises reading receipts
RECEIPT_KEPT = timedelta(hours=24)  # Expo drops receipts after a day
TIMEOUT = 10
TRIES = 3
WAIT = 2  # seconds before the second try; doubled before the third
MAX_BODY = 240
GONE = "DeviceNotRegistered"


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


class _Busy(Exception):
    """Expo answered 429 or 5xx: worth another try after a wait."""


def _expo(url, payload) -> dict:
    """POST to Expo. A busy or failing service is tried again with a growing
    wait, as Expo advises for 429 and 5xx. Any other refusal is raised with
    Expo's own words, since it won't mend itself."""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = getattr(settings, "EXPO_ACCESS_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(1, TRIES + 1):
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
            if response.status_code == 429 or response.status_code >= 500:
                raise _Busy(f"Expo answered {response.status_code}")
        except (requests.ConnectionError, requests.Timeout, _Busy):
            if attempt == TRIES:
                raise
            time.sleep(WAIT * 2 ** (attempt - 1))
            continue
        if response.status_code >= 400:
            raise requests.HTTPError(f"Expo answered {response.status_code}: {response.text[:500]}",
                                     response=response)
        return response.json()


def _post(messages: list[dict]) -> list[dict]:
    """Send to Expo; the tickets come back in the same order."""
    url = getattr(settings, "EXPO_PUSH_URL", "") or EXPO_PUSH_URL
    return _expo(url, messages).get("data") or []


def _error(result) -> str:
    return (result.get("details") or {}).get("error") or "unknown"


def _report(stage, errors: Counter):
    """One log line and one Sentry event per stage and set of errors."""
    counts = ", ".join(f"{error} x{n}" for error, n in errors.most_common())
    logger.error("mobile push %s failed: %s", stage, counts)
    with sentry_sdk.new_scope() as scope:
        scope.set_extra("counts", dict(errors))
        scope.fingerprint = ["mobile-push", stage, *sorted(errors)]
        sentry_sdk.capture_message(f"Mobile push {stage} failed: {', '.join(sorted(errors))}", level="error")


def _ticket_id(ticket):
    try:
        return uuid.UUID(str(ticket.get("id")))
    except ValueError:
        return None


def send(messages: list[dict]) -> int:
    """Send in batches, keep each accepted ticket for its receipt, and clear
    the tokens of phones that are gone. Returns how many were accepted."""
    accepted, gone, errors, kept = 0, set(), Counter(), []
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
                ticket_id = _ticket_id(ticket)
                if ticket_id:
                    kept.append(PushTicket(id=ticket_id, push_token=message["to"]))
            elif _error(ticket) == GONE:
                gone.add(message["to"])
            else:
                errors[_error(ticket)] += 1
    if gone:
        AppSession.objects.filter(push_token__in=gone).update(push_token=None)
    if kept:
        PushTicket.objects.bulk_create(kept, ignore_conflicts=True)
    if errors:
        _report("tickets", errors)
    return accepted


def check_receipts(now=None) -> dict:
    """Read the receipts of pushes sent at least 15 minutes ago. A receipt
    that isn't ready stays for the next run; a ticket a day old is dropped."""
    now = now or timezone.now()
    dropped = PushTicket.objects.filter(sent_at__lt=now - RECEIPT_KEPT).delete()[0]
    rows = list(
        PushTicket.objects.filter(sent_at__lte=now - RECEIPT_AFTER).order_by("sent_at").values_list("id", "push_token")
    )
    url = getattr(settings, "EXPO_RECEIPTS_URL", "") or EXPO_RECEIPTS_URL
    read, gone, errors = 0, set(), Counter()
    for start in range(0, len(rows), RECEIPT_BATCH):
        tokens = {str(ticket_id): token for ticket_id, token in rows[start: start + RECEIPT_BATCH]}
        try:
            receipts = _expo(url, {"ids": list(tokens)}).get("data") or {}
        except Exception:
            logger.exception("mobile push receipts failed")
            sentry_sdk.capture_exception()
            break  # the rest wait for the next run
        done = [ticket_id for ticket_id in tokens if ticket_id in receipts]
        for ticket_id in done:
            receipt = receipts[ticket_id]
            if receipt.get("status") == "ok":
                continue
            if _error(receipt) == GONE:
                gone.add(tokens[ticket_id])
            else:
                errors[_error(receipt)] += 1
        PushTicket.objects.filter(id__in=done).delete()
        read += len(done)
    if gone:
        AppSession.objects.filter(push_token__in=gone).update(push_token=None)
    if errors:
        _report("receipts", errors)
    return {"read": read, "waiting": len(rows) - read, "gone": len(gone), "failed": sum(errors.values()),
            "dropped": dropped}


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
