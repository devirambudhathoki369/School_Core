"""
Shared carry-forward-of-dues helper used whenever a student's class changes to a
class that resolves to a DIFFERENT academic year.

Two call sites use this, so the logic lives in exactly one place:

  * Bulk promotion  -> StudentsView.promoteClass
  * Individual edit -> StudentSerializer.update (changing a single student's class,
                       academic year, or EDUCATION LEVEL from the student form)

Why it is needed
----------------
The payment/dues screen is single-year: it shows a student's balance in the
academic year their CURRENT class maps to (via AcademicYearMapping, keyed off
grade/education-level — see gen_class_key). When a student moves to a class in a
different year (a grade promotion, or a cross-track move like class 10 -> 11 that
crosses the SCHOOL -> HIGH SCHOOL academic-year tracks, or any education-level
change), their old outstanding stays parked in the previous year and becomes
INVISIBLE on the single-year screen — the "dues vanished" bug.

This moves that outstanding into the new mapped year as an opening balance so it
stays visible and collectible under the student's current class.

Guarantees (see the long-form rationale on the original promotion method)
-------------------------------------------------------------------------
  * Balance is MOVED, not duplicated: NEW year gets +amount as OPENING_BALANCE,
    SOURCE year gets a balancing -amount CARRY_FORWARD_OUT. Net across years is
    zero, so the student's all-years total never changes.
  * Only the SOURCE year's rolled-up outstanding is carried (charges − payments),
    exactly what the single-year screen shows — never a naive sum of every prior
    year (that would double-count close-created opening balances).
  * No-op when source and destination resolve to the SAME academic year.
  * Idempotent: a (student, source-year) already carried (has a CARRY_FORWARD_OUT
    row) is skipped, so re-running never double-counts.
  * NEVER edits or deletes an existing row — it only ADDS the balanced pair.

The caller is responsible for the surrounding transaction.atomic(); this function
does not open its own so the whole class change + carry commits or rolls back as a
unit.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from ..models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from ..models.Ledger import StudentLedger, LedgerPosting
from ..models.Invoice import StudentInvoice
from ..models.FiscalYears import EconomicYear
from ..methods.academicYear import get_class_academic_year
from ..methods.nepaliDatetime import ndt_today
from ..constants.payment import OPENING_BALANCE, CARRY_FORWARD_OUT

TWO_PLACES = Decimal("0.01")


def carry_forward_dues_on_class_change(student_ids, source_class_id, target_class_id):
    """Move each student's outstanding from the SOURCE class's academic year into
    the TARGET class's academic year as an opening balance.

    Args:
        student_ids: iterable of Student ids that just moved source -> target.
        source_class_id: the class the students were in before the change.
        target_class_id: the class the students are in after the change.

    Must be called inside the caller's transaction.atomic().
    """
    if not student_ids:
        return
    student_ids = list(student_ids)

    rows = {
        c["id"]: c
        for c in ClassInfo.objects.filter(
            id__in=[source_class_id, target_class_id]
        ).values("id", "school", "batch", *CLASS_DETAILS_FIELDS)
    }
    source = rows.get(int(source_class_id))
    target = rows.get(int(target_class_id))
    if not source or not target:
        return
    school_id = target["school"]
    dst_ay = get_class_academic_year(school_id, target)
    dst_ay_id = dst_ay and dst_ay.get("id")
    src_ay = get_class_academic_year(school_id, source)
    src_ay_id = src_ay and src_ay.get("id")
    if not dst_ay_id or not src_ay_id or src_ay_id == dst_ay_id:
        # No mapped year to carry into/from, or the balance already lives in the
        # destination year -> nothing to move.
        return

    # Ledgers require an economic year; use the current open one.
    economic_year_id = (
        EconomicYear.objects.filter(closed=False)
        .order_by("-id")
        .values_list("id", flat=True)
        .first()
    )
    if not economic_year_id:
        return

    # outstanding per student IN THE SOURCE YEAR ONLY:
    # charges (StudentLedger.total) - payments (invoice paid + discount).
    balances = {}  # student_id -> Decimal

    ledger_rows = (
        StudentLedger.objects.filter(
            student_id__in=student_ids,
            academic_year=src_ay_id,
            is_active=True,
            ledger_posting__is_active=True,
        )
        .values("student_id")
        .annotate(t=Sum("total"))
    )
    for r in ledger_rows:
        balances[r["student_id"]] = balances.get(
            r["student_id"], Decimal(0)
        ) + (r["t"] or Decimal(0))
    invoice_rows = (
        StudentInvoice.objects.filter(
            student_id__in=student_ids,
            academic_year=src_ay_id,
            is_active=True,
            isCashReceipt=False,
        )
        .values("student_id")
        .annotate(p=Sum("total_paid"), d=Sum("total_discount"))
    )
    for r in invoice_rows:
        balances[r["student_id"]] = (
            balances.get(r["student_id"], Decimal(0))
            - (r["p"] or Decimal(0))
            - (r["d"] or Decimal(0))
        )

    # idempotency: skip students already carried out of the source year.
    already_carried = set(
        StudentLedger.objects.filter(
            student_id__in=student_ids,
            academic_year=src_ay_id,
            details__has_key=CARRY_FORWARD_OUT,
        ).values_list("student_id", flat=True)
    )

    today = ndt_today()
    new_ledgers = []
    # one balancing posting in the source year + one opening-balance posting in the
    # new year (lazily created only if something actually carries).
    dst_posting = None
    out_posting = None
    for sid, amount in balances.items():
        amount = amount.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        if amount <= 0 or sid in already_carried:
            continue
        if dst_posting is None:
            dst_posting = LedgerPosting.objects.create(
                class_info_id=target_class_id,
                academic_year_id=dst_ay_id,
                economic_year_id=economic_year_id,
                months=[],
                date=today,
            )
            out_posting = LedgerPosting.objects.create(
                class_info_id=target_class_id,
                academic_year_id=src_ay_id,
                economic_year_id=economic_year_id,
                months=[],
                date=today,
            )
        new_ledgers.append(
            StudentLedger(
                student_id=sid,
                school_id=school_id,
                ledger_posting=dst_posting,
                academic_year_id=dst_ay_id,
                economic_year_id=economic_year_id,
                details={OPENING_BALANCE: float(amount)},
                total=amount,
                date=today,
            )
        )
        new_ledgers.append(
            StudentLedger(
                student_id=sid,
                school_id=school_id,
                ledger_posting=out_posting,
                academic_year_id=src_ay_id,
                economic_year_id=economic_year_id,
                details={CARRY_FORWARD_OUT: float(-amount)},
                total=-amount,
                date=today,
            )
        )
    if new_ledgers:
        StudentLedger.objects.bulk_create(new_ledgers)
