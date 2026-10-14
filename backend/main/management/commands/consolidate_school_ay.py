"""
Consolidate a school's higher-ed year-level/semester academic years into ONE
running academic year, carrying every student's outstanding dues forward as an
opening balance -- exactly like the app's Academic Year Closing does, but folding
MANY year-level academic years into a SINGLE existing running year (the built-in
close creates a fresh year per close, so it cannot merge-to-one).

Why: higher-ed programs were set up with one academic year PER intake
(e.g. EDUCATION 2078..2081), so a program has several parallel "running" years.
The correct model is ONE running academic year + the batch dimension telling the
cohorts apart. This command performs that one-time consolidation safely.

For each higher-ed class-group (education_level + course, by year/semester):
  1. read its CURRENT mapped academic year,
  2. compute each student's balance = SUM(ledger.total) - SUM(invoice.total_paid)
     - SUM(invoice.total_discount)  [identical to AcademicYearCloseView],
  3. (apply) create an opening-balance StudentLedger for that balance in the
     TARGET year, repoint the mapping to the target, close the old year, and set
     the classes' academic_year to the target.

Billing is preserved: past invoices/ledgers keep their academic_year snapshot
(immutable history in the now-closed years); the carried opening balance means
no due is lost -- it simply follows the student into the single running year.

Safety: DRY-RUN by default (prints the full per-year, per-total plan and touches
nothing). Pass --apply to write, inside a single transaction. Take a pg_dump
first -- this moves real money balances.

Usage:
    python manage.py consolidate_school_ay --school 56 --course 10 --target-ay "EDUCATION 2082"
    python manage.py consolidate_school_ay --school 56 --course 10 --target-ay "EDUCATION 2082" --apply
"""

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Sum, F

from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, AcademicYearMapping
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.Invoice import StudentInvoice
from main.methods.academicYear import gen_class_key
from main.methods.nepaliDatetime import ndt_today
from main.constants.payment import OPENING_BALANCE

HIGHER_ED_LEVELS = (4, 5, 8, 9)


def _student_balances(class_ids, academic_year_id):
    """Per (class_info, student) balance under an academic year -- mirrors
    AcademicYearCloseView.calculateBalances exactly."""
    balances = defaultdict(lambda: defaultdict(Decimal))
    ledgers = (
        StudentLedger.objects.filter(
            is_active=True,
            ledger_posting__is_active=True,
            student__is_active=True,
            student__class_info__in=class_ids,
            academic_year=academic_year_id,
        )
        .values("student")
        .annotate(class_info=F("student__class_info"), total_credit=Sum("total"))
        .values("student", "class_info", "total_credit")
    )
    for l in ledgers.iterator():
        balances[l["class_info"]][l["student"]] += l["total_credit"] or Decimal(0)
    invoices = (
        StudentInvoice.objects.filter(
            is_active=True,
            student__is_active=True,
            isCashReceipt=False,
            student__class_info__in=class_ids,
            academic_year=academic_year_id,
        )
        .values("student")
        .annotate(
            class_info=F("student__class_info"),
            total_debit=Sum("total_paid"),
            total_discount=Sum("total_discount"),
        )
        .values("student", "class_info", "total_debit", "total_discount")
    )
    for i in invoices.iterator():
        balances[i["class_info"]][i["student"]] -= i["total_debit"] or Decimal(0)
        balances[i["class_info"]][i["student"]] -= i["total_discount"] or Decimal(0)
    return balances


class Command(BaseCommand):
    help = "Consolidate a school's higher-ed academic years into one running year (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, required=True)
        parser.add_argument("--course", type=int, required=True)
        parser.add_argument("--education-level", type=int, default=4)
        parser.add_argument("--target-ay", type=str, required=True,
                            help="Name of the EXISTING running academic year to fold everything into")
        parser.add_argument("--apply", action="store_true", help="Write changes (default is dry-run)")

    def handle(self, *args, **o):
        sid, course, el = o["school"], o["course"], o["education_level"]
        apply = o["apply"]
        if el not in HIGHER_ED_LEVELS:
            raise CommandError(f"education-level {el} is not higher-ed {HIGHER_ED_LEVELS}")

        target = AcademicYear.objects.filter(school_id=sid, name=o["target_ay"]).first()
        if not target:
            raise CommandError(f"target academic year '{o['target_ay']}' not found for school {sid}")
        if target.closed:
            raise CommandError(f"target academic year '{target.name}' is CLOSED; pick the open running year")

        # current economic year = the one the school is posting under right now.
        eco = (
            StudentLedger.objects.filter(school_id=sid, is_active=True)
            .order_by("-id")
            .values_list("economic_year", flat=True)
            .first()
        )
        if not eco:
            raise CommandError("could not determine current economic year (no ledgers for school)")

        classes = list(
            ClassInfo.objects.filter(
                school_id=sid, education_level=el, course=course, is_active=True
            )
        )
        # group classes by (year, semester) -> the class-group that shares a key
        groups = defaultdict(list)
        for c in classes:
            groups[(c.year, c.semester)].append(c)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nConsolidate school {sid} course {course} (EL {el}) -> '{target.name}' "
            f"(econ year id {eco}) [{'APPLY' if apply else 'DRY-RUN'}]"))

        plan = []       # (label, old_ay_id, mapping_id, [classes], balances)
        grand_total = Decimal(0)
        grand_students = 0
        for (year, sem), cls_list in sorted(groups.items(), key=lambda x: (x[0][0] or 0, x[0][1] or 0)):
            sample = cls_list[0]
            key = gen_class_key({
                "education_level": el, "course": course,
                "year": year, "semester": sem, "grade": None, "batch": None,
            })
            mapping = AcademicYearMapping.objects.filter(school_id=sid, key=key).first()
            if not mapping:
                self.stdout.write(f"  key {key}: no mapping, skipped")
                continue
            if mapping.academic_year_id == target.id:
                self.stdout.write(f"  key {key}: already on target, skipped")
                continue
            old_ay = AcademicYear.objects.filter(id=mapping.academic_year_id).values("id", "name").first()
            class_ids = [c.id for c in cls_list]
            balances = _student_balances(class_ids, mapping.academic_year_id)
            n_students = sum(len(v) for v in balances.values())
            subtotal = sum((b for sv in balances.values() for b in sv.values()), Decimal(0))
            label = f"Year {year}" if year else (f"Sem {sem}" if sem else key)
            self.stdout.write(
                f"  {label:8} key={key:14} old-AY={old_ay['name']:16} "
                f"classes={len(cls_list):2} students={n_students:3} "
                f"carry-forward=Rs {subtotal.quantize(Decimal('0.01'), ROUND_HALF_UP)}"
            )
            plan.append((label, mapping, old_ay, cls_list, balances))
            grand_total += subtotal
            grand_students += n_students

        self.stdout.write(self.style.WARNING(
            f"  ---- {grand_students} students, TOTAL carry-forward = Rs "
            f"{grand_total.quantize(Decimal('0.01'), ROUND_HALF_UP)} ----"))

        if not plan:
            self.stdout.write("Nothing to consolidate.")
            return
        if not apply:
            self.stdout.write(self.style.NOTICE("\nDRY-RUN -- nothing written. Re-run with --apply to commit."))
            return

        _common = {"economic_year_id": eco, "date": ndt_today(), "academic_year": target}
        with transaction.atomic():
            new_ledgers = []
            for label, mapping, old_ay, cls_list, balances in plan:
                for cls_id, student_balances in balances.items():
                    lp = LedgerPosting.objects.create(class_info_id=cls_id, months=[], **_common)
                    for std_id, bal in student_balances.items():
                        bal = bal.quantize(Decimal("0.01"), ROUND_HALF_UP)
                        new_ledgers.append(StudentLedger(
                            ledger_posting=lp, student_id=std_id, school_id=sid,
                            details={OPENING_BALANCE: float(bal)}, total=bal, **_common,
                        ))
                # close the old year
                AcademicYear.objects.filter(id=old_ay["id"]).update(closed=True)
                # repoint mapping to the single running year
                AcademicYearMapping.objects.filter(id=mapping.id).update(
                    academic_year=target, previous_academic_year_id=old_ay["id"]
                )
                # point the classes at the running year
                ClassInfo.objects.filter(id__in=[c.id for c in cls_list]).update(academic_year=target)
            StudentLedger.objects.bulk_create(new_ledgers)

        self.stdout.write(self.style.SUCCESS(
            f"\nDONE. {grand_students} opening balances written into '{target.name}', "
            f"{len(plan)} old academic years closed & mappings repointed."))
