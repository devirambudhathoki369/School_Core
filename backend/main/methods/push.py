import threading

import sentry_sdk

from account.models import StudentAccount, StaffAccount
from backend.firebase.messaging import send_notification, RESULT_SENT, RESULT_STALE
from backend.firebase.topics import (
    send_to_topic,
    subscribe_tokens,
    unsubscribe_tokens,
)
from ..models.Student import Student
from ..models.Staff import Staff
from ..models.Notification import (
    NotificationHistory,
    NOTIFICATION_STATUS_SENT,
    NOTIFICATION_STATUS_FAILED,
    NOTIFICATION_STATUS_STALE,
    RECIPIENT_ROLE_STUDENT,
    RECIPIENT_ROLE_STAFF,
)

# notification bodies can come from long text fields; keep the push readable.
MAX_PUSH_BODY = 240
STUDENT_STATUS_RUNNING = 1
STAFF_STATUS_EMPLOYED = 1

# map a per-token send result to a stored history status.
_RESULT_TO_STATUS = {
    RESULT_SENT: NOTIFICATION_STATUS_SENT,
    RESULT_STALE: NOTIFICATION_STATUS_STALE,
}
# which account model owns the device token, per recipient role.
_ACCOUNT_MODEL = {
    RECIPIENT_ROLE_STUDENT: StudentAccount,
    RECIPIENT_ROLE_STAFF: StaffAccount,
}


def dispatch_push(
    school_id,
    role,
    recipients,
    title,
    body,
    data=None,
    store=True,
    include_notification=True,
):
    """
    Send one push to many recipients and clear device tokens FCM reports as dead.

    `recipients` is a list of (recipient_id, device_token) pairs.
    With store=True a NotificationHistory row is recorded per recipient (the
    manual admin-send path). With store=False nothing is persisted — the
    fire-and-forget, real-time path used by content/attendance pushes.
    With include_notification=False the push is DATA-ONLY (title/body ride in the
    `data` payload, like the bus alert) so the app renders it even foregrounded.
    Returns the send summary dict ({"sent", "failed", ...}).
    """
    recipients = [(rid, tok) for rid, tok in recipients if tok]
    if not recipients:
        return {"sent": 0, "failed": 0}

    tokens = [tok for _, tok in recipients]
    result = send_notification(tokens, title, body, data, include_notification)
    per_token = result["results"]

    if store:
        NotificationHistory.objects.bulk_create(
            [
                NotificationHistory(
                    school_id=school_id,
                    recipient_role=role,
                    recipient_id=rid,
                    title=title,
                    body=body,
                    data=data,
                    status=_RESULT_TO_STATUS.get(
                        per_token.get(tok), NOTIFICATION_STATUS_FAILED
                    ),
                )
                for rid, tok in recipients
            ]
        )

    stale = result.get("stale_tokens")
    if stale:
        account_model = _ACCOUNT_MODEL.get(role)
        if account_model:
            account_model.objects.filter(app_device_token__in=stale).update(
                app_device_token=None
            )
    return result


def _in_background(fn, *args, **kwargs):
    """
    Run fn(*args, **kwargs) in a worker thread so the caller responds immediately
    (e.g. saving a notice). This project has no task queue, hence raw threads.
    """

    def _run():
        from django.db import connection

        try:
            fn(*args, **kwargs)
        except Exception:
            # never let a background job fail silently — surface it in Sentry.
            sentry_sdk.capture_exception()
        finally:
            # don't leak this thread's DB connection back into the pool.
            connection.close()

    threading.Thread(target=_run, daemon=False).start()


def dispatch_push_async(
    school_id,
    role,
    recipients,
    title,
    body,
    data=None,
    store=True,
    include_notification=True,
):
    """Fire-and-forget version of dispatch_push (token-targeted send)."""
    _in_background(
        dispatch_push,
        school_id,
        role,
        recipients,
        title,
        body,
        data,
        store=store,
        include_notification=include_notification,
    )


def _clip(text):
    text = text or ""
    if len(text) > MAX_PUSH_BODY:
        return text[: MAX_PUSH_BODY - 3] + "..."
    return text


def _student_recipients(filters):
    """(id, device_token) pairs for active, push-reachable students."""
    return list(
        Student.objects.filter(
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
            account__app_device_token__isnull=False,
            **filters,
        ).values_list("id", "account__app_device_token")
    )


# content/attendance pushes go out real-time as a HYBRID message: a `notification`
# block (so the OS auto-draws it when the app is backgrounded/killed — the common
# case, needs no app code) PLUS title/body in the `data` payload (so a foreground
# handler can still render it). They are persisted to history (store=True) so each
# student can see them in the in-app inbox (GET /api/v1/me/notifications) even if
# the OS banner never displayed.
_REALTIME = {"store": True, "include_notification": True}

# students subscribe to this topic at login; one topic send reaches the whole
# school in a single FCM call (no per-token loop — scales to thousands).
SCHOOL_TOPIC = "school_{}"


def school_topic(school_id):
    return SCHOOL_TOPIC.format(school_id)


def notify_school_students(school_id, title, body, notif_type="notice", image=None):
    """
    Real-time push of a notice to every active, app-using student of a school.

    Token-targeted (the proven homework/attendance path): we send to each
    student's saved device token directly, so delivery does NOT depend on the
    student having subscribed to the school topic (topic membership is only set
    at login and silently misses anyone who logged in earlier — which left
    notices reaching nobody). Backgrounded so a big school can't time out, and
    sent as a hybrid message (notification block + data) so the OS auto-displays
    it when the app is backgrounded while a foreground handler can still render
    it from `data`. Stored to each recipient's in-app inbox (store=True via
    _REALTIME) so the notice shows up under the app's notifications list even if
    the OS banner never drew.

    `notif_type` ("notice"/"news") rides in the `data` payload so the mobile app
    can tell push kinds apart.

    `image` is a fully-qualified URL, or None. It rides in `data` — which is all
    the app's own foreground handler needs — and `build_message` also lifts it
    into the FCM `notification` block from there, so the OS draws it as a big
    picture without the URL ever being stated twice and left to drift.
    """
    recipients = _student_recipients({"class_info__school": school_id})
    if recipients:
        data = {"type": notif_type}
        if image:
            data["image"] = image
        dispatch_push_async(
            school_id,
            RECIPIENT_ROLE_STUDENT,
            recipients,
            title,
            _clip(body),
            data=data,
            **_REALTIME,
        )


def _student_school_id(account):
    """The school a student account belongs to (via class_info), or None."""
    return (
        Student.objects.filter(account=account)
        .values_list("class_info__school", flat=True)
        .first()
    )


def subscribe_student_to_school(account, token):
    """
    Background-subscribe a student's device token to their school topic. Called
    at login, right after the token is saved. No-op without a token/school.
    """
    if not token:
        return
    school_id = _student_school_id(account)
    if school_id:
        _in_background(subscribe_tokens, school_topic(school_id), [token])


def unsubscribe_student_from_school(account, token):
    """Background-unsubscribe a student's token from their school topic at logout."""
    if not token:
        return
    school_id = _student_school_id(account)
    if school_id:
        _in_background(unsubscribe_tokens, school_topic(school_id), [token])


def notify_class_students(school_id, class_info_id, title, body):
    """Real-time hybrid push to active app-using students of a class."""
    recipients = _student_recipients({"class_info": class_info_id})
    if recipients:
        dispatch_push_async(
            school_id, RECIPIENT_ROLE_STUDENT, recipients, title, _clip(body),
            data={"type": "homework"},
            **_REALTIME,
        )


def notify_students_checked_in(school_id, student_ids):
    """
    Real-time 'marked present' push to the given students. Caller must
    pass only students who JUST became present (first transition today) so no one
    is notified twice during the morning punch rush. Stored to each recipient's
    in-app inbox (store=True via _REALTIME).
    """
    student_ids = list(student_ids or [])
    if not student_ids:
        return
    recipients = _student_recipients({"id__in": student_ids})
    if recipients:
        dispatch_push_async(
            school_id,
            RECIPIENT_ROLE_STUDENT,
            recipients,
            "हाजिरी",
            "तपाईंलाई आज उपस्थित जनाइएको छ।",
            data={"type": "attendance"},
            **_REALTIME,
        )


def notify_students_absent(school_id, student_ids):
    """
    Real-time 'marked absent' push to the given students, stored to each
    recipient's in-app inbox. Mirror of notify_students_checked_in for the absent
    side; used when attendance is marked manually (teacher in app/web). Caller
    must pass only students whose absence was JUST recorded so no one is notified
    twice for the same day.
    """
    student_ids = list(student_ids or [])
    if not student_ids:
        return
    recipients = _student_recipients({"id__in": student_ids})
    if recipients:
        dispatch_push_async(
            school_id,
            RECIPIENT_ROLE_STUDENT,
            recipients,
            "हाजिरी",
            "तपाईंलाई आज अनुपस्थित जनाइएको छ।",
            data={"type": "attendance"},
            **_REALTIME,
        )


def notify_attendance_marked(school_id, present_ids, absent_ids):
    """
    Push present/absent attendance notifications for a manual marking event.

    One call covers a whole class: present students get a 'marked present' push,
    absent students get a 'marked absent' push. Both are stored to the in-app
    inbox so they show up alongside notices even if the OS banner never drew.
    Safe to call with empty lists.
    """
    notify_students_checked_in(school_id, present_ids)
    notify_students_absent(school_id, absent_ids)


def _staff_recipients(filters):
    """(id, device_token) pairs for active, push-reachable staff."""
    return list(
        Staff.objects.filter(
            is_active=True,
            status=STAFF_STATUS_EMPLOYED,
            account__app_device_token__isnull=False,
            **filters,
        ).values_list("id", "account__app_device_token")
    )


def notify_students(school_id, student_ids, title, body, notif_type):
    """
    Generic real-time hybrid push to the given active, app-using students, stored
    to each recipient's in-app inbox. Used by event hooks (bill payment, ledger
    posted, absent, birthday). De-dupes ids; no-op when nobody is reachable.
    `notif_type` rides in `data.type` so the app can tell push kinds apart.
    """
    student_ids = list(dict.fromkeys(student_ids or []))
    if not student_ids:
        return
    recipients = _student_recipients({"id__in": student_ids})
    if recipients:
        dispatch_push_async(
            school_id,
            RECIPIENT_ROLE_STUDENT,
            recipients,
            title,
            _clip(body),
            data={"type": notif_type},
            **_REALTIME,
        )


def notify_staff(school_id, staff_ids, title, body, notif_type):
    """Generic real-time hybrid push to active, app-using staff (stored)."""
    staff_ids = list(dict.fromkeys(staff_ids or []))
    if not staff_ids:
        return
    recipients = _staff_recipients({"id__in": staff_ids, "school_id": school_id})
    if recipients:
        dispatch_push_async(
            school_id,
            RECIPIENT_ROLE_STAFF,
            recipients,
            title,
            _clip(body),
            data={"type": notif_type},
            **_REALTIME,
        )
