"""The ONE place that answers "what does this student's hostel cost?".

Every billing surface — the class-wide ledger posting screen, the student's own
ledger tab, reminder bills, tax invoices, printed receipts, the income
projection — needs the same three numbers, and they must all get them from the
same query or a bill and its receipt will one day disagree.

The rates come from the student's CURRENT allocation, where they were snapshot
at check-in (`hostel.HostelAllocation`). They are deliberately not read through
to the room type: re-pricing next year's rooms must never re-price this year's
bills.

The hostel app is imported lazily inside these functions. Most schools will
never have the module, and the billing core must not import it at startup, must
not gain a migration dependency on it, and must degrade to "nobody is a boarder"
rather than to a 500 if it is ever unavailable.
"""

from decimal import Decimal


def _models():
    try:
        from hostel.constants import ALLOC_ACTIVE
        from hostel.models.Allocation import HostelAllocation

        return HostelAllocation, ALLOC_ACTIVE
    except Exception:
        return None, None


# What each rate is called on a bill. Keys match main/constants/payment.py.
MONTHLY = "monthly_fee"
ADMISSION = "admission_fee"
DEPOSIT = "security_deposit"


def schoolUsesHostel(school_id):
    """Does this school have the hostel module at all?

    THIS IS WHY IT MATTERS. The hostel adds three fee titles — hostel, hostel
    admission, hostel deposit — and without this check every one of the
    ~70 schools that will never run a hostel would find three extra rows in the
    title dropdown on their ledger-posting screen and in every student's ledger
    tab, forever. A feature one school bought is not allowed to make the product
    worse for the rest, so every hostel title on a shared billing surface is
    gated on this.

    Cached the same way and for the same reason as the module gate in
    `hostel/views/BaseViews.py`: a flag flipped once in a school's lifetime,
    read on every ledger screen.
    """
    from django.core.cache import cache

    try:
        school_id = int(school_id)
    except (TypeError, ValueError):
        return False
    key = f"hostel-module:{school_id}"
    allowed = cache.get(key)
    if allowed is None:
        from main.models.SchoolAdmin import SchoolAdmin

        allowed = SchoolAdmin.objects.filter(
            id=school_id, is_active=True, uses_hostel=True
        ).exists()
        cache.set(key, allowed, 300)
    return bool(allowed)


def studentHostelRates(student_id, school_id):
    """`{monthly_fee, admission_fee, security_deposit}` — or None for a day scholar."""
    HostelAllocation, ALLOC_ACTIVE = _models()
    if not HostelAllocation or not student_id or not school_id:
        return None
    return (
        HostelAllocation.objects.filter(
            student_id=student_id,
            school_id=school_id,
            status=ALLOC_ACTIVE,
            is_active=True,
        )
        .values(MONTHLY, ADMISSION, DEPOSIT, "check_in_date")
        .first()
    )


def studentHostelRateMap(student_ids, school_id):
    """`{student_id: {monthly_fee, admission_fee, security_deposit, check_in_date}}`.

    ONE query for a whole class — the per-student form above would issue fifty
    of them behind a reminder-bill run.
    """
    HostelAllocation, ALLOC_ACTIVE = _models()
    if not HostelAllocation or not student_ids or not school_id:
        return {}
    rows = HostelAllocation.objects.filter(
        student_id__in=list(student_ids),
        school_id=school_id,
        status=ALLOC_ACTIVE,
        is_active=True,
    ).values("student_id", MONTHLY, ADMISSION, DEPOSIT, "check_in_date")
    return {r["student_id"]: r for r in rows}


def monthlyRate(rates):
    """The monthly figure alone, as a Decimal, from either shape above."""
    if not rates:
        return Decimal(0)
    return Decimal(str(rates.get(MONTHLY) or 0))
