"""
Closing a school's payroll for an economic year, and carrying what the staff
are still owed into the next one.

Why it is needed
----------------
Payroll is single-year, like the student payment screen: a member of staff's
balance is what was posted to them in the school's CURRENT economic year less
what they were paid in it. The economic year changes under every school at
once, and nothing closed the old one. So on the first day of a new year the
payment screen read zero for everybody, the months of salary a school still
owed stayed parked in a year no screen looks at, and paying those arrears in
the new year drove the new year's balance below zero. Lok Priya ended 2082/083
owing its staff Rs 23 lakh that way and has been paying it off "from nothing"
since.

What a close does (see models/PayrollClose.py)
----------------------------------------------
  * Each balance is MOVED, not copied: the year that closes gets a `cfo` line
    for minus the balance, the next year an `ob` line for plus it. The two
    years together add up to exactly what they did before, so the staff's
    all-years statement never changes.
  * It is the balance the payment screen shows that moves -- one implementation
    (titleBalances) serves both, so they cannot drift apart.
  * A member of staff paid AHEAD carries too, as a negative: an advance is
    recovered from next year's salary, and dropping it would lose it.
  * The closed year then refuses postings, payments and deletions.
  * It never edits or deletes a row a school entered -- it only ADDS the pair.

When it happens
---------------
A school's payroll year closes with its ACCOUNTING year (AEYCloseView): the
payroll year that ends inside the accounting year being closed. The year a
school is working in can never be closed -- there is nowhere to carry to -- so
a school that closes its books before the economic year has moved on is picked
up when it does (closePayrollAfterYearSwitch).

Everything here that writes expects to run inside the caller's
transaction.atomic().
"""

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Q
from django.utils import timezone

#
from ..constants.payment import INVOICE_DETAILS, OPENING_BALANCE, CARRY_FORWARD_OUT
from ..constants.payroll import ALL_TITLES, CARRY_TITLES
from ..models.FiscalYears import EconomicYear
from ..models.Invoice import StaffInvoice
from ..models.Ledger import StaffLedger
from ..models.PayrollClose import StaffPayrollClose
from ..models.SchoolAdmin import SchoolAdmin
from ..models.Staff import Staff
from .nepaliDatetime import resolve_fiscal_year_end

CENT = Decimal("0.01")
# what a payment settles besides the cash handed over: everything withheld
SETTLED_FIELDS = (
    "total_paid",
    "total_deduction",
    "pf_deduction",
    "insurance_deduction",
)
NOT_CARRY = ~Q(details__has_any_keys=CARRY_TITLES)


class PayrollCloseError(Exception):
    """A payroll year that cannot be closed (or reopened) as things stand."""


def _amount(value):
    try:
        return Decimal(str(value if value is not None else 0))
    except Exception:
        return Decimal(0)


def _cents(value):
    return _amount(value).quantize(CENT, rounding=ROUND_HALF_UP)


# --- balances ---------------------------------------------------------------


def titleBalances(ledgers, invoices):
    """{title: still owed} for one member of staff in one economic year.

    `ledgers` are StaffLedger rows (details, total), `invoices` StaffInvoice
    rows (details and the SETTLED_FIELDS). Every earning title is present even
    at zero; a carried line (`ob`, `cfo`) only when the year holds one.
    """
    balance = {title: Decimal(0) for title in ALL_TITLES}
    for ledger in ledgers:
        details = ledger.get("details")
        if not details:
            balance["salary"] += _amount(ledger.get("total"))
            continue
        for title, amount in details.items():
            balance[title] = balance.get(title, Decimal(0)) + _amount(amount)
    for invoice in invoices:
        details = invoice.get("details")
        if not details:
            # no per-title breakdown: the gross salary settled is the net
            # cash plus every amount withheld from it (tds, pf, insurance)
            for field in SETTLED_FIELDS:
                balance["salary"] -= _amount(invoice.get(field))
            continue
        for title, line in details.items():
            paid = line.get(INVOICE_DETAILS["AMOUNT"]) if isinstance(line, dict) else 0
            balance[title] = balance.get(title, Decimal(0)) - _amount(paid)
    return balance


def staffBalances(school_id, economic_year_id):
    """{staff id: titleBalances} for everyone with payroll in that year."""
    q = Q(school=school_id, economic_year=economic_year_id, is_active=True)
    ledgers, invoices = defaultdict(list), defaultdict(list)
    for row in (
        StaffLedger.objects.filter(q).values("staff_id", "details", "total").order_by("id")
    ):
        ledgers[row["staff_id"]].append(row)
    for row in (
        StaffInvoice.objects.filter(q)
        .values("staff_id", "details", *SETTLED_FIELDS)
        .order_by("id")
    ):
        invoices[row["staff_id"]].append(row)
    return {
        staff_id: titleBalances(ledgers.get(staff_id, ()), invoices.get(staff_id, ()))
        for staff_id in sorted(set(ledgers) | set(invoices))
    }


# --- which year, and is it closed --------------------------------------------


def closedPayrollYearIds(school_id):
    return set(
        StaffPayrollClose.objects.filter(school=school_id, is_active=True).values_list(
            "economic_year_id", flat=True
        )
    )


def isPayrollClosed(school_id, economic_year_id):
    if not (school_id and economic_year_id):
        return False
    return StaffPayrollClose.objects.filter(
        school=school_id, economic_year=economic_year_id, is_active=True
    ).exists()


def closedPayrollMessage(school_id, economic_year_id):
    """Why a write to that year is refused, or None when the year is open."""
    if not isPayrollClosed(school_id, economic_year_id):
        return None
    name = (
        EconomicYear.objects.filter(id=economic_year_id)
        .values_list("name", flat=True)
        .first()
    )
    return (
        f"Payroll for {name or 'this year'} is closed. What was still owed "
        "there has been carried into the next year as old dues."
    )


def _month(date):
    return str(date or "")[:7]


def nextEconomicYear(year):
    """The economic year that follows: the first to START after this one ENDS.

    Not simply the next start date. A stray year dated inside this one (a test
    row, a year entered twice) starts later too, and would then be handed
    every balance. By month, so an end date typed a day short changes nothing.
    """
    ends = _month(year.end_date) or _month(year.start_date)
    for candidate in EconomicYear.objects.filter(is_active=True).order_by("start_date", "id"):
        if candidate.id != year.id and _month(candidate.start_date) > ends:
            return candidate
    return None


def payrollYearsEndingIn(accounting_year):
    """The economic years whose last month falls inside that accounting year.

    By month, not by day: the same year end is written 2083-03-30, -31, -32
    and 2083-04-01 across the schools' accounting years, and a payroll year
    must not be missed over which of them somebody typed.
    """
    start, end = _month(accounting_year.start_date), _month(accounting_year.end_date)
    if not (start and end):
        return []
    return [
        year
        for year in EconomicYear.objects.filter(is_active=True).order_by("start_date", "id")
        if start <= _month(year.end_date) <= end
    ]


def hasPayroll(school_id, economic_year_id):
    q = Q(school=school_id, economic_year=economic_year_id, is_active=True)
    return StaffLedger.objects.filter(q).exists() or StaffInvoice.objects.filter(q).exists()


def payrollYearsToClose(school_id, accounting_year):
    """The payroll years closing that accounting year closes, oldest first.

    Never the year the school is working in, and never a year with no payroll
    in it (there is nothing to close).
    """
    current = (
        SchoolAdmin.objects.filter(id=school_id)
        .values_list("economic_year__start_date", flat=True)
        .first()
    )
    if not current:
        return []
    closed = closedPayrollYearIds(school_id)
    return [
        year
        for year in payrollYearsEndingIn(accounting_year)
        if year.id not in closed
        and year.start_date < current
        and hasPayroll(school_id, year.id)
    ]


# --- the close ---------------------------------------------------------------


def _staffNames(staff_ids):
    names = {}
    for staff_id, *parts in Staff.objects.filter(id__in=staff_ids).values_list(
        "id", "first_name", "middle_name", "last_name"
    ):
        names[staff_id] = " ".join(p.strip() for p in parts if p and p.strip())
    return names


def previewPayrollClose(school_id, year):
    """What closing that year would carry, without writing anything.

    {economic_year, next_economic_year, staff_count, total, rows}; one row per
    member of staff whose balance is not zero: {staff, name, total, titles}.
    """
    next_year = nextEconomicYear(year)
    rows = []
    for staff_id, titles in staffBalances(school_id, year.id).items():
        total = _cents(sum(titles.values(), Decimal(0)))
        if total == 0:
            continue
        rows.append(
            {
                "staff": staff_id,
                "total": total,
                "titles": {t: _cents(a) for t, a in titles.items() if _cents(a) != 0},
            }
        )
    names = _staffNames([row["staff"] for row in rows])
    for row in rows:
        row["name"] = names.get(row["staff"]) or ""
    rows.sort(key=lambda row: (row["name"].lower(), row["staff"]))
    return {
        "economic_year": {"id": year.id, "name": year.name},
        "next_economic_year": (
            {"id": next_year.id, "name": next_year.name} if next_year else None
        ),
        "staff_count": len(rows),
        "total": sum((row["total"] for row in rows), Decimal(0)),
        "rows": rows,
    }


def _academicYears(school_id, economic_year_id):
    """{staff id: an academic year of theirs in that year}. A ledger row cannot
    be saved without one, and for payroll it decides nothing -- balances are
    read by economic year alone -- so the carried pair takes the one the
    staff's own latest entry has."""
    q = Q(school=school_id, economic_year=economic_year_id, is_active=True)
    years = {}
    for model in (StaffInvoice, StaffLedger):  # a posting's year wins
        for staff_id, academic_year_id in (
            model.objects.filter(q).order_by("id").values_list("staff_id", "academic_year_id")
        ):
            years[staff_id] = academic_year_id
    return years


def closePayrollYear(school_id, year, accounting_year=None):
    """Close `year`'s payroll for the school and carry the balances forward.

    Returns the StaffPayrollClose, or None when there was nothing to do (the
    year is already closed, or holds no payroll). Raises PayrollCloseError --
    before anything is written -- when the year cannot be closed.
    """
    # one close at a time per school: a double-submitted accounting close
    # would otherwise carry every balance twice
    SchoolAdmin.objects.select_for_update().filter(id=school_id).first()
    if isPayrollClosed(school_id, year.id) or not hasPayroll(school_id, year.id):
        return None
    next_year = nextEconomicYear(year)
    if not next_year:
        raise PayrollCloseError(
            f"There is no economic year after {year.name} to carry the staff balances into."
        )
    if isPayrollClosed(school_id, next_year.id):
        raise PayrollCloseError(
            f"Payroll for {next_year.name} is already closed, so {year.name} "
            "can no longer be carried into it."
        )
    preview = previewPayrollClose(school_id, year)
    carried_out_on = str(resolve_fiscal_year_end(year.start_date, year.end_date))
    carried_in_on = str(next_year.start_date)
    academic_years = _academicYears(school_id, year.id)
    common = {"school_id": school_id, "months": [], "single_staff": False}
    for row in preview["rows"]:
        staff_id, total = row["staff"], row["total"]
        pair = {**common, "staff_id": staff_id, "academic_year_id": academic_years[staff_id]}
        # .create(), not bulk_create: each line is then in the history log
        # under whoever closed the year, like any other ledger entry
        StaffLedger.objects.create(
            economic_year=year,
            date=carried_out_on,
            details={CARRY_FORWARD_OUT: float(-total)},
            total=-total,
            remarks=f"Carried forward to {next_year.name}"[:50],
            **pair,
        )
        StaffLedger.objects.create(
            economic_year=next_year,
            date=carried_in_on,
            details={OPENING_BALANCE: float(total)},
            total=total,
            remarks=f"Balance from {year.name}"[:50],
            **pair,
        )
    return StaffPayrollClose.objects.create(
        school_id=school_id,
        economic_year=year,
        next_economic_year=next_year,
        accounting_economic_year=accounting_year,
        carried_out_on=carried_out_on,
        carried_in_on=carried_in_on,
        staff_count=preview["staff_count"],
        total_carried=preview["total"],
        breakdown={
            str(row["staff"]): {t: str(a) for t, a in row["titles"].items()}
            for row in preview["rows"]
        },
    )


def closeSummary(close):
    return {
        "economic_year": close.economic_year.name,
        "next_economic_year": close.next_economic_year.name,
        "staff_count": close.staff_count,
        "total_carried": close.total_carried,
    }


def closePayrollForAccountingYear(school_id, accounting_year):
    """Close the payroll years that accounting year covers.

    Returns (closed, skipped): StaffPayrollClose rows, and (year, reason) for a
    year that could not be closed in order. A payroll year that cannot close
    must not stop a school closing its books, so it is reported, not raised.
    """
    closed, skipped = [], []
    for year in payrollYearsToClose(school_id, accounting_year):
        try:
            close = closePayrollYear(school_id, year, accounting_year)
        except PayrollCloseError as reason:
            skipped.append((year, str(reason)))
            continue
        if close:
            closed.append(close)
    return closed, skipped


def closedAccountingYearCovering(school_id, year):
    """The school's CLOSED accounting year that payroll year ends in, if any."""
    from accounting.models.AccountingEconomicYear import AccountingEconomicYear

    end = _month(year.end_date)
    for accounting_year in AccountingEconomicYear.objects.filter(
        school=school_id, closed=True, is_active=True
    ).order_by("start_date", "id"):
        if _month(accounting_year.start_date) <= end <= _month(accounting_year.end_date):
            return accounting_year
    return None


def closePayrollAfterYearSwitch(previous_year_by_school, new_year):
    """The economic year has just moved on for these schools.

    A school that had already closed its books for the year it was working in
    could not have its payroll closed then (see the module note). It can now.
    `previous_year_by_school` is {school id: economic year id before the move}.
    Returns the closes made.
    """
    years = {
        year.id: year
        for year in EconomicYear.objects.filter(
            id__in={y for y in previous_year_by_school.values() if y}
        )
    }
    closes = []
    for school_id, previous_id in previous_year_by_school.items():
        previous = years.get(previous_id)
        if not previous or not previous.start_date < new_year.start_date:
            continue
        if isPayrollClosed(school_id, previous.id) or not hasPayroll(school_id, previous.id):
            continue
        accounting_year = closedAccountingYearCovering(school_id, previous)
        if not accounting_year:
            continue
        try:
            close = closePayrollYear(school_id, previous, accounting_year)
        except PayrollCloseError:
            continue
        if close:
            closes.append(close)
    return closes


def reopenPayrollYear(close):
    """Undo a close: the carried pair goes, the year takes entries again.

    Soft, like every other deletion here. Payments already made against the
    carried balance stay where they are; closing the year again carries the
    same balance back in under them.
    """
    if isPayrollClosed(close.school_id, close.next_economic_year_id):
        raise PayrollCloseError(
            f"Payroll for {close.next_economic_year.name} has been closed since, "
            f"so the close of {close.economic_year.name} cannot be undone on its own."
        )
    now = timezone.now()
    base = Q(school=close.school_id, is_active=True)
    carried = StaffLedger.objects.filter(
        base
        & (
            Q(economic_year=close.economic_year_id, details__has_key=CARRY_FORWARD_OUT)
            | Q(economic_year=close.next_economic_year_id, details__has_key=OPENING_BALANCE)
        )
    )
    removed = carried.update(is_active=False, updated_at=now)
    close.is_active = False
    close.save(update_fields=["is_active", "updated_at"])
    return removed


# --- the salary sheet's previous dues ------------------------------------------


def _net(ledgers, invoices):
    """{staff id: posted less settled} over those rows."""
    net = defaultdict(Decimal)
    for staff_id, total in ledgers.values_list("staff_id", "total"):
        net[staff_id] += _amount(total)
    for staff_id, *settled in invoices.values_list("staff_id", *SETTLED_FIELDS):
        net[staff_id] -= sum((_amount(v) for v in settled), Decimal(0))
    return net


def payrollYearOf(date):
    """The economic year a date falls in: the latest one to start on or before
    it that has not ended before it (by month, as everywhere here)."""
    date = str(date)
    for year in EconomicYear.objects.filter(is_active=True, start_date__lte=date).order_by(
        "-start_date", "-id"
    ):
        if _month(year.end_date) >= date[:7]:
            return year
    return None


def duesBroughtForward(school_id, start_date, end_date):
    """{staff id: what they were owed coming into that date range}.

    A salary sheet lists what was posted and paid INSIDE its range. On its own
    that says nothing about the months before it, so a sheet for Bhadra showed
    a "balance" that ignored an unpaid Shrawan, and went below zero when the
    arrears were paid. This is the missing opening line: with it the sheet's
    balance is what the payment screen says the member of staff is owed.

    For the payroll year the range starts in, it is
      + the old dues carried INTO that year by a year-close (its `ob` lines),
      + everything posted and paid in that year before the range.

    The balance leaving a closed year (`cfo`) is never counted: it would turn
    the closed year's own sheet into zeros, and a range running on into the
    next year already holds what that balance is made of.

    One correction, because the sheet reads by DATE and a close carries by
    YEAR. An entry stamped with the year that closed but dated inside the
    range is in the sheet's own columns AND inside the old dues, so it is
    taken off here rather than counted twice.
    """
    start_date, end_date = str(start_date), str(end_date)
    year = payrollYearOf(start_date)
    if not year:
        return {}
    base = Q(school=school_id, is_active=True)
    this_year = base & Q(economic_year=year.id)
    brought = _net(
        StaffLedger.objects.filter(this_year & NOT_CARRY, date__lt=start_date),
        StaffInvoice.objects.filter(this_year, date__lt=start_date),
    )
    for staff_id, total in StaffLedger.objects.filter(
        this_year, details__has_key=OPENING_BALANCE, date__lte=end_date
    ).values_list("staff_id", "total"):
        brought[staff_id] += _amount(total)
    closed_into_it = StaffPayrollClose.objects.filter(
        school=school_id, next_economic_year=year.id, is_active=True
    ).values_list("economic_year_id", flat=True)
    for closed_year_id in closed_into_it:
        closed_year = base & Q(economic_year=closed_year_id)
        late = _net(
            StaffLedger.objects.filter(
                closed_year & NOT_CARRY, date__range=(start_date, end_date)
            ),
            StaffInvoice.objects.filter(closed_year, date__range=(start_date, end_date)),
        )
        for staff_id, amount in late.items():
            brought[staff_id] -= amount
    return brought
