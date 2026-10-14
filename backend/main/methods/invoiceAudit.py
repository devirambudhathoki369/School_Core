"""
Who entered a bill, who deleted it, and when.

The invoice row cannot answer any of that. `created_at` is a date with no clock
time, `updated_at` moves on every later save, and nothing on the row names an
account. The history log does: every invoice saved since 2024-07-22 has one
"create" row, and deleting a bill (a soft delete, `is_active` going True to
False) leaves an "update" row, each with the account that was signed in and the
instant it happened.

So a receipt reads its accountant from the log. It used to be told a name only
when a member of staff had entered the bill, and the page filled every other
case with whoever was LOOKING at it: a bill entered from the school's own login
and reprinted by staff came out signed by that member of staff.
"""

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q

#
from ..models.history_log.HistoryLog import HistoryLog
from ..models.Staff import Staff
from .nepaliDatetime import npt, toNepaliDate

CREATE, UPDATE = 1, 3
STAFF_ACCOUNT = "staffaccount"
# What a receipt calls an account that is not a member of staff. The school's
# own login has always signed as "admin", and the reports print the same word.
ACCOUNT_LABELS = {"adminaccount": "admin", "superadminaccount": "superadmin"}


def clock(instant):
    """An instant the way the school reads it: (BS date, "hh:mm:ss AM")."""
    local = npt(instant)
    return toNepaliDate(local.date()), local.strftime("%I:%M:%S %p")


def staffNames(account_ids):
    """{staff account id: (the name as it was entered, designation)}. A member
    of staff who has since been deactivated still entered the bills they
    entered."""
    names = {}
    if not account_ids:
        return names
    for account, designation, *parts in Staff.objects.filter(
        account__in=account_ids
    ).values_list("account", "role__role", "first_name", "middle_name", "last_name"):
        name = " ".join(p.strip() for p in parts if p and p.strip())
        names[account] = (name, designation)
    return names


def _isDeletion(changes):
    change = (changes or {}).get("is_active")
    return bool(change) and str(change[-1]).lower() == "false"


def invoiceAudit(model, invoice_ids, deleted_ids=()):
    """
    {invoice id: {cashier, entered_on, entered_time, deleted}} for invoices of
    `model` (StudentInvoice, StaffInvoice, ExtraInvoice).

    cashier        who entered it: a staff name, "admin" for the school's own
                   login, None when the log has no record (bills older than
                   the log itself, or rows written outside the portal)
    cashier_designation  that member of staff's designation, for the slips
                   that print one under the name; None for the school's login
    entered_on     BS date it was entered on, by Nepal's clock. Not always the
                   bill's own date: about one bill in sixteen is back-dated
    entered_time   "hh:mm:ss AM" of that moment
    deleted        None for a bill that stands. For an id in `deleted_ids`,
                   {by, on, time} of its latest deletion, each None when the
                   log does not say
    """
    ids = [i for i in invoice_ids if i]
    deleted_ids = set(deleted_ids)
    audit = {
        i: {
            "cashier": None,
            "cashier_designation": None,
            "entered_on": None,
            "entered_time": None,
            "deleted": {"by": None, "on": None, "time": None}
            if i in deleted_ids
            else None,
        }
        for i in ids
    }
    if not ids:
        return audit
    wanted = Q(action=CREATE)
    if deleted_ids:
        wanted |= Q(
            action=UPDATE, object_id__in=deleted_ids, changes__has_key="is_active"
        )
    logs = list(
        HistoryLog.objects.filter(
            wanted,
            object_type=ContentType.objects.get_for_model(model),
            object_id__in=ids,
        )
        # oldest first, so a bill deleted, restored and deleted again ends on
        # its latest deletion
        .order_by("id")
        .values("object_id", "action", "user_type_id", "user_id", "timestamp", "changes")
    )
    kinds = {
        t: ContentType.objects.get_for_id(t).model
        for t in {log["user_type_id"] for log in logs}
    }
    names = staffNames(
        {log["user_id"] for log in logs if kinds[log["user_type_id"]] == STAFF_ACCOUNT}
    )

    def who(log):
        """(name, designation) of the account behind a log row."""
        kind = kinds[log["user_type_id"]]
        if kind == STAFF_ACCOUNT:
            name, designation = names.get(log["user_id"]) or (None, None)
            return name or None, designation
        return ACCOUNT_LABELS.get(kind), None

    for log in logs:
        row = audit[log["object_id"]]
        on, time = clock(log["timestamp"])
        name, designation = who(log)
        if log["action"] == CREATE:
            row.update(
                cashier=name,
                cashier_designation=designation,
                entered_on=on,
                entered_time=time,
            )
        elif _isDeletion(log["changes"]):
            row["deleted"] = {"by": name, "on": on, "time": time}
    return audit


def auditOf(model, invoice_id, is_active=True):
    """The audit of one invoice, for its receipt."""
    deleted_ids = () if is_active else (invoice_id,)
    return invoiceAudit(model, [invoice_id], deleted_ids).get(invoice_id) or {}


def stampEntered(rows, model, parents=None):
    """
    entered_on / entered_time on each row of a statement (dicts carrying the
    record's `id`), None where the log has no row for it.

    `parents` is (model, {row id: that model's id}) for records whose own save
    is not always logged: a class posting bulk-creates its students' ledger
    rows, which writes no log row for each, but the posting itself has one and
    it is the same moment.
    """
    rows = list(rows)
    own = invoiceAudit(model, [row["id"] for row in rows])
    inherited, parent_of = {}, {}
    if parents:
        parent_model, parent_of = parents
        missing = {
            parent_of.get(row["id"])
            for row in rows
            if not (own.get(row["id"]) or {}).get("entered_time")
        }
        inherited = invoiceAudit(parent_model, missing)
    for row in rows:
        audit = own.get(row["id"]) or {}
        if not audit.get("entered_time"):
            audit = inherited.get(parent_of.get(row["id"])) or audit
        row["entered_on"] = audit.get("entered_on")
        row["entered_time"] = audit.get("entered_time")
    return rows
