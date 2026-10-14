"""
Close a school's payroll for the economic years its books are already closed
for, carrying what the staff are still owed into the next year.

A payroll year now closes together with the school's accounting year (see
main/methods/payrollClose.py). This command is for the years that were closed
BEFORE that existed, and for a school that keeps no books here at all.

DRY RUN by default: it prints, staff by staff, exactly what would be carried
and writes nothing. Nothing is written without --apply.

    python manage.py close_payroll_year --all
    python manage.py close_payroll_year --school 51
    python manage.py close_payroll_year --school 51 --apply
    python manage.py close_payroll_year --school 73 --economic-year 4 --without-accounting
    python manage.py close_payroll_year --school 51 --economic-year 4 --undo --apply

A year is closed only when the school's accounting year covering it is closed,
unless --without-accounting names one year of one school explicitly. Years are
taken oldest first, because each one carries into the next.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from main.methods.payrollClose import (
    PayrollCloseError,
    closedAccountingYearCovering,
    closedPayrollYearIds,
    closePayrollYear,
    hasPayroll,
    nextEconomicYear,
    previewPayrollClose,
    reopenPayrollYear,
)
from main.models.FiscalYears import EconomicYear
from main.models.Invoice import StaffInvoice
from main.models.Ledger import StaffLedger
from main.models.PayrollClose import StaffPayrollClose
from main.models.SchoolAdmin import SchoolAdmin


class Command(BaseCommand):
    help = "Close payroll years whose accounting year is already closed (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, action="append", help="school id (repeatable)")
        parser.add_argument("--all", action="store_true", help="every school with payroll")
        parser.add_argument("--economic-year", type=int, help="only this economic year id")
        parser.add_argument(
            "--without-accounting",
            action="store_true",
            help="close the named year of the named school although no closed accounting year covers it",
        )
        parser.add_argument("--undo", action="store_true", help="reopen the named year instead")
        parser.add_argument("--apply", action="store_true", help="write (default is a dry run)")

    def handle(self, *args, **options):
        school_ids = options["school"] or []
        if options["all"] == bool(school_ids):
            raise CommandError("Give --school <id> (repeatable) or --all, not both.")
        if options["all"]:
            school_ids = sorted(
                set(StaffLedger.objects.values_list("school_id", flat=True))
                | set(StaffInvoice.objects.values_list("school_id", flat=True))
            )
        only_year = options["economic_year"]
        if (options["without_accounting"] or options["undo"]) and not (
            only_year and len(school_ids) == 1 and not options["all"]
        ):
            raise CommandError(
                "--without-accounting and --undo need exactly one --school and an --economic-year."
            )
        self.apply = options["apply"]
        self.stdout.write(
            self.style.WARNING("APPLYING" if self.apply else "DRY RUN: nothing is written")
        )
        grand_total, grand_staff = 0, 0
        for school_id in school_ids:
            school = SchoolAdmin.objects.filter(id=school_id).select_related("economic_year").first()
            if not school:
                raise CommandError(f"No school {school_id}.")
            if options["undo"]:
                self.undo(school, only_year)
                continue
            # One transaction per school, rolled back on a dry run. The dry run
            # therefore DOES the close and shows its real result -- including a
            # later year opening with what an earlier one carried into it --
            # and then leaves no trace.
            with transaction.atomic():
                for year, accounting_year, why_not in self.candidates(
                    school, only_year, options["without_accounting"]
                ):
                    label = f"school {school.id} {school.name} | payroll {year.name} (id {year.id})"
                    if why_not:
                        self.stdout.write(f"-- {label}: skipped, {why_not}")
                        continue
                    total, staff = self.close(school, year, accounting_year, label)
                    grand_total += total
                    grand_staff += staff
                if not self.apply:
                    transaction.set_rollback(True)
        self.stdout.write(
            self.style.SUCCESS(
                f"{'Carried' if self.apply else 'Would carry'} Rs {grand_total:,.2f} "
                f"in {grand_staff} staff balances."
            )
        )

    def candidates(self, school, only_year, without_accounting):
        """(year, accounting year, reason it is skipped or None), oldest first."""
        current = school.economic_year
        years = EconomicYear.objects.filter(is_active=True).order_by("start_date", "id")
        if only_year:
            years = years.filter(id=only_year)
        for year in years:
            if not hasPayroll(school.id, year.id):
                continue
            accounting_year = closedAccountingYearCovering(school.id, year)
            if not accounting_year and not without_accounting:
                # books still open for that year: it closes when they do
                if only_year:
                    yield year, None, "no closed accounting year covers it"
                continue
            # read inside the loop: an earlier year closed a moment ago counts
            if year.id in closedPayrollYearIds(school.id):
                reason = "already closed"
            elif not current or not year.start_date < current.start_date:
                reason = "it is the year the school is working in (or later)"
            else:
                reason = None
            yield year, accounting_year, reason

    def close(self, school, year, accounting_year, label):
        preview = previewPayrollClose(school.id, year)
        next_year = nextEconomicYear(year)
        covered = (
            f"accounting year {accounting_year.name} (id {accounting_year.id})"
            if accounting_year
            else "NO accounting year"
        )
        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"== {label} -> {next_year.name if next_year else '?'} | {covered}"
            )
        )
        for row in preview["rows"]:
            titles = ", ".join(f"{t} {a:,.2f}" for t, a in row["titles"].items())
            self.stdout.write(
                f"   staff {row['staff']:>6}  {row['name'][:32]:<32} {row['total']:>14,.2f}   [{titles}]"
            )
        self.stdout.write(
            f"   {preview['staff_count']} staff, Rs {preview['total']:,.2f} to carry"
        )
        try:
            with transaction.atomic():
                close = closePayrollYear(school.id, year, accounting_year)
        except PayrollCloseError as reason:
            self.stdout.write(self.style.ERROR(f"   NOT closed: {reason}"))
            return 0, 0
        if not close:
            self.stdout.write("   nothing to close")
            return 0, 0
        self.stdout.write(
            self.style.SUCCESS(
                f"   closed (record {close.id})" if self.apply else "   would close"
            )
        )
        return preview["total"], preview["staff_count"]

    def undo(self, school, year_id):
        close = (
            StaffPayrollClose.objects.filter(
                school=school.id, economic_year=year_id, is_active=True
            )
            .select_related("economic_year", "next_economic_year")
            .first()
        )
        if not close:
            raise CommandError(f"School {school.id} has no closed payroll for year {year_id}.")
        self.stdout.write(
            f"== school {school.id} {school.name} | reopen payroll {close.economic_year.name}: "
            f"{close.staff_count} staff, Rs {close.total_carried:,.2f} carried"
        )
        if self.apply:
            try:
                with transaction.atomic():
                    removed = reopenPayrollYear(close)
            except PayrollCloseError as reason:
                raise CommandError(str(reason))
            self.stdout.write(self.style.SUCCESS(f"   reopened, {removed} carried lines removed"))
