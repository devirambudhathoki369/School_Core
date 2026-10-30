"""Telling a family what moved on their child's canteen account.

App push, stored to the app's inbox, through the same helpers every other event
uses (main/methods/push.py), and in Nepali like the payment and ledger pushes.

Sent only after the database has committed (`transaction.on_commit`), and never
allowed to fail the sale: a push service that is down must not stop a child
buying lunch, and a push for a sale that then rolled back would tell a parent
about money that never moved.
"""

import logging

from django.db import transaction

from ..constants import TXN_PURCHASE, TXN_REFUND, TXN_TOPUP

log = logging.getLogger(__name__)

TITLE = "क्यान्टिन"


def _rs(value):
    return f"रु. {float(value or 0):,.2f}"


def _body(kind, amount, balance, low_balance):
    amount = abs(amount or 0)
    if balance is not None and balance < 0:
        left = f"बक्यौता {_rs(-balance)}।"
    else:
        left = f"बाँकी रकम {_rs(balance)}।"
    if kind == TXN_PURCHASE:
        text = f"क्यान्टिनमा {_rs(amount)} खर्च भयो। {left}"
        if balance is not None and low_balance and balance < low_balance:
            text += " खातामा रकम कम छ, कृपया थप्नुहोस्।"
        return text
    if kind == TXN_TOPUP:
        return f"क्यान्टिन खातामा {_rs(amount)} जम्मा भयो। {left}"
    if kind == TXN_REFUND:
        return f"क्यान्टिन खाताबाट {_rs(amount)} फिर्ता गरियो। {left}"
    return None


def tell_family(settings, account, kind, amount, balance=None):
    """Queue the push for after commit. A no-op when the school turned it off."""
    if not settings.notify_parents or not account:
        return
    body = _body(kind, amount, balance, settings.low_balance)
    if not body:
        return
    school_id, student_id, staff_id = account.school_id, account.student_id, account.staff_id

    def send():
        try:
            from main.methods.push import notify_staff, notify_students

            if student_id:
                notify_students(school_id, [student_id], TITLE, body, "canteen")
            elif staff_id:
                notify_staff(school_id, [staff_id], TITLE, body, "canteen")
        except Exception:  # never let a push break the counter
            log.exception("canteen push failed")

    transaction.on_commit(send)
