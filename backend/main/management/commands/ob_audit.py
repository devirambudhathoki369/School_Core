"""
Reconcile what a school CLOSED against what it CARRIES — read-only.

Three questions a school asks when its opening-balance and closing figures stop
agreeing, answered from the same rows the screens read:

  1. Who is the opening-balance total actually made of? A close stamps an
     opening balance for EVERY student in the class that year, so years later
     the report's total is mostly students who have since passed out or dropped
     out, plus a long tail of zero rows. Great Araniko's "Rs 19.01 lakh" for
     High School 2083 was Rs 13.97 lakh of leavers and 709 zero rows.

  2. What did NOT come across the close? A balance left in a closed year with
     no opening balance in the year that succeeded it is money the school can
     no longer see or collect on any running screen -- it shows only if someone
     opens the closed year, where every carried balance ALSO still shows (a
     close does not zero the year it closes), so the two can never be added.

  3. What was waived by hand? Staff clear a carried balance by deleting its
     opening-balance row (remarks like "de"). That is a real decision and the
     command does not second-guess it -- but the amount stays visible in the
     closed year forever, which is exactly what makes the two reports disagree.
     Deletions are listed with their remark and date so a school can tell a
     deliberate waiver from a mistake.

Touches nothing. Safe to run against production at any time.

Usage:
    python manage.py ob_audit --school 4
    python manage.py ob_audit --school 4 --details
    python manage.py ob_audit            # every school, summary only
"""

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand

from main.models.FiscalYears import AcademicYear, AcademicYearMapping
from main.models.Invoice import StudentInvoice
from main.models.Ledger import StudentLedger
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, STUDENT_STATUS_CHOICES
from main.constants.payment import OPENING_BALANCE

STATUS_RUNNING = 1
STATUS_NAMES = dict(STUDENT_STATUS_CHOICES)
ZERO = Decimal("0.00")


def _money(v):
    return f"{Decimal(v or 0):,.2f}"


class Command(BaseCommand):
    help = "Reconcile a school's opening balances against what it closed (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="School id (default: all)")
        parser.add_argument(
            "--details", action="store_true", help="List every affected student"
        )

    # ------------------------------------------------------------------ helpers
    def _net(self, student_id, ay_id):
        """charges - paid - discount, the same formula the close itself uses."""
        net = Decimal(0)
        for total in StudentLedger.objects.filter(
            student_id=student_id,
            academic_year=ay_id,
            is_active=True,
            ledger_posting__is_active=True,
        ).values_list("total", flat=True):
            net += Decimal(total or 0)
        for paid, disc in StudentInvoice.objects.filter(
            student_id=student_id,
            academic_year=ay_id,
            is_active=True,
            isCashReceipt=False,
        ).values_list("total_paid", "total_discount"):
            net -= Decimal(paid or 0) + Decimal(disc or 0)
        return net

    def _successors(self, school_id):
        """closed year -> the open year that succeeded it, from the mappings.

        `previous_academic_year` is the only record of which year a close came
        from, and it is set by the close itself.
        """
        pairs = {}
        for m in AcademicYearMapping.objects.filter(
            school_id=school_id, previous_academic_year__isnull=False
        ).select_related("academic_year", "previous_academic_year"):
            if m.previous_academic_year.closed and not m.academic_year.closed:
                pairs[m.previous_academic_year_id] = m.academic_year_id
        return pairs

    # --------------------------------------------------------------------- run
    def handle(self, *args, **o):
        schools = (
            SchoolAdmin.objects.filter(id=o["school"])
            if o.get("school")
            else SchoolAdmin.objects.all().order_by("id")
        )
        for school in schools:
            self.audit(school, o.get("details"))

    def audit(self, school, details=False):
        self.stdout.write(
            self.style.MIGRATE_HEADING(f"\n=== {school.id} {school.name} ===")
        )
        years = list(AcademicYear.objects.filter(school=school).order_by("id"))
        names = {a.id: a.name for a in years}

        # ---------------------------------------------------- 1. what is in it
        any_ob = False
        for a in years:
            if a.closed:
                continue
            rows = StudentLedger.objects.filter(
                school=school,
                academic_year=a.id,
                details__has_key=OPENING_BALANCE,
                is_active=True,
                ledger_posting__is_active=True,
            ).values_list("total", "student__status")
            if not rows:
                continue
            any_ob = True
            buckets = defaultdict(lambda: [0, Decimal(0)])
            zeros = 0
            for total, status in rows:
                total = Decimal(total or 0)
                if total == 0:
                    zeros += 1
                buckets[status][0] += 1
                buckets[status][1] += total
            shown = sum(b[1] for b in buckets.values())
            running = buckets.get(STATUS_RUNNING, [0, ZERO])
            left = shown - running[1]
            self.stdout.write(f"  {a.name} (AY {a.id}) opening balances")
            self.stdout.write(
                f"    report total          {len(rows):5} rows  {_money(shown):>16}"
            )
            for status, (n, v) in sorted(buckets.items(), key=lambda x: x[0] or 0):
                self.stdout.write(
                    f"      {STATUS_NAMES.get(status, status) or '?':<12}{n:5} rows  {_money(v):>16}"
                )
            self.stdout.write(
                f"    zero-value rows       {zeros:5} rows   (a close stamps one per student)"
            )
            if shown and left:
                self.stdout.write(
                    self.style.WARNING(
                        f"    -> {_money(left)} of the total belongs to students who have LEFT"
                    )
                )
        if not any_ob:
            self.stdout.write("  no opening balances in any running year")

        # ------------------------------------------- 2. what did not come across
        pairs = self._successors(school.id)
        stranded = []
        for old_ay, new_ay in pairs.items():
            carried = set(
                StudentLedger.objects.filter(
                    school=school,
                    academic_year=new_ay,
                    details__has_key=OPENING_BALANCE,
                    is_active=True,
                    ledger_posting__is_active=True,
                ).values_list("student_id", flat=True)
            )
            in_old = set(
                StudentLedger.objects.filter(
                    school=school, academic_year=old_ay, is_active=True
                ).values_list("student_id", flat=True)
            ) | set(
                StudentInvoice.objects.filter(
                    school=school, academic_year=old_ay, is_active=True
                ).values_list("student_id", flat=True)
            )
            in_old.discard(None)
            for student_id in in_old - carried:
                net = self._net(student_id, old_ay)
                if net:
                    stranded.append((old_ay, new_ay, student_id, net))
        if stranded:
            total = sum(s[3] for s in stranded)
            self.stdout.write(
                self.style.WARNING(
                    f"\n  LEFT BEHIND IN A CLOSED YEAR: {len(stranded)} students, {_money(total)}"
                )
            )
            self.stdout.write(
                "    (a balance in a closed year with no opening balance in the year that\n"
                "     succeeded it -- invisible on every running screen)"
            )
            if details:
                for old_ay, new_ay, student_id, net in sorted(
                    stranded, key=lambda s: -s[3]
                ):
                    s = Student.objects.filter(id=student_id).first()
                    name = f"{s.first_name} {s.last_name}" if s else "?"
                    status = STATUS_NAMES.get(getattr(s, "status", None), "?")
                    self.stdout.write(
                        f"      stu {student_id:6} {name[:28]:28} {status:11} "
                        f"{_money(net):>13}  in {names.get(old_ay, old_ay)}"
                    )
        else:
            self.stdout.write("\n  nothing left behind in a closed year")

        # -------------------------------------------------- 3. waived by hand
        deleted = list(
            StudentLedger.objects.filter(
                school=school, details__has_key=OPENING_BALANCE, is_active=False
            ).values(
                "id", "student_id", "academic_year_id", "total", "remarks", "updated_at"
            )
        )
        if deleted:
            total = sum(Decimal(d["total"] or 0) for d in deleted)
            self.stdout.write(
                self.style.WARNING(
                    f"\n  DELETED (waived) OPENING BALANCES: {len(deleted)} rows, {_money(total)}"
                )
            )
            self.stdout.write(
                "    (cleared from the running year by hand; the same amount still shows\n"
                "     in the closed year, which is what makes the two reports disagree)"
            )
            if details:
                for d in sorted(deleted, key=lambda d: -Decimal(d["total"] or 0)):
                    s = Student.objects.filter(id=d["student_id"]).first()
                    name = f"{s.first_name} {s.last_name}" if s else "?"
                    self.stdout.write(
                        f"      stu {d['student_id']:6} {name[:26]:26} "
                        f"{_money(d['total']):>13}  {names.get(d['academic_year_id'], '?')[:18]:18} "
                        f"{d['updated_at']:%Y-%m-%d}  remarks={d['remarks']!r}"
                    )
        else:
            self.stdout.write("\n  no opening balance has been deleted")
