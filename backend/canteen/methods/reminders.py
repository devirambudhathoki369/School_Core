"""Reminding families what they owe the canteen — an app message, never SMS.

Each family is told THEIR amount, item by item ("टिफिन रु. 3,000.00"), so the
messages differ and cannot be one topic send. They go out from ONE background
thread, one family after another: a reminder to a class of three hundred must
not start three hundred threads (and three hundred database connections) on a
four-worker server.

An account is reminded at most once a day (`CanteenAccount.last_reminded`), so a
second press of the button the same day reaches only families not yet told.
"""

import logging

from django.db import transaction

from main.models.Notification import RECIPIENT_ROLE_STUDENT
from main.models.Student import Student

from ..models import CanteenAccount

log = logging.getLogger(__name__)
TITLE = "क्यान्टिन"


def _rs(value):
    return f"रु. {float(value or 0):,.2f}"


def body_for(book):
    owed = [r for r in book["items"] if r["due"] > 0]
    lines = ", ".join(f"{r['name']} {_rs(r['due'])}" for r in owed[:4])
    if len(owed) > 4:
        lines += " …"
    return (f"क्यान्टिनको बक्यौता {_rs(book['due'])} ({lines}) बाँकी छ। "
            "कृपया क्यान्टिनमा भुक्तानी गर्नुहोस्।")


def reachable(student_ids):
    """{student id: device token} for running students with the app."""
    return dict(
        Student.objects.filter(
            id__in=list(student_ids), is_active=True, status=1, account__app_device_token__isnull=False,
        ).values_list("id", "account__app_device_token")
    )


def send_reminders(school_id, messages, today):
    """messages: [(account id, student id, token, body)]. Marks the accounts
    reminded now (so a double press does not double-send), then sends after
    commit, one by one, from a single thread."""
    if not messages:
        return
    CanteenAccount.objects.filter(id__in=[m[0] for m in messages]).update(last_reminded=today)

    def run():
        from main.methods.push import _in_background, dispatch_push

        def send_all():
            for _, student_id, token, body in messages:
                try:
                    dispatch_push(school_id, RECIPIENT_ROLE_STUDENT, [(student_id, token)], TITLE, body,
                                  data={"type": "canteen"}, store=True, include_notification=True)
                except Exception:  # one family's dead token must not stop the rest
                    log.exception("canteen reminder failed for student %s", student_id)

        _in_background(send_all)

    transaction.on_commit(run)
