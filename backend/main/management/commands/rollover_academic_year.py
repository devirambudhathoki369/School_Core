"""
Roll a higher-ed program's SINGLE running academic year over to the next one:
close the current year, open a new one, and carry every still-running student's
outstanding balance forward -- as PER-TITLE current dues (not a lump "old dues")
wherever it reconciles, so continuing juniors keep showing their live fees under
the real fee titles.

Why this exists (and why the built-in close is not enough here):
Nawa Nepal / Tulsipur style programs are a SHARED CLOCK -- every year-level maps
to one academic year. The built-in AcademicYearCloseView (a) can only sweep every
student's balance into a `{ob: net}` opening-balance row, which the payment screen
renders as "old dues", and (b) is blocked by the continuing-cohort guard because
juniors are still running. This command does the same money-safe roll but writes
the carry PER FEE TITLE where it cleanly reconciles, so juniors read as current
dues -- the exact end state we produced by hand in July 2026.

Money safety -- the carried TOTAL always equals the authoritative net:
  net (authoritative) = SUM(StudentLedger.total) - SUM(invoice paid) - SUM(discount)
                        [identical to AcademicYearCloseView.calculateBalances]
  per-title           = charges-per-title - paid-per-title
                        [identical to what LedgerViews shows on the trial balance]
  -> carry per-title ONLY when sum(per-title) == net and every title >= 0;
     otherwise carry a single {ob: net} row. Either way the row total == net, so
     no balance is ever created or lost. Zero-net students are skipped.

This command does NOT promote students between year-levels. After the roll every
student sits in the SAME class but under the NEW academic year, so promoting them
up a level afterwards (operator UI) is a same-academic-year move => its dues
carry-forward is a no-op and cannot double-count. New-intake enrolment is likewise
a normal follow-up in the new year.

Safety: DRY-RUN by default (prints the full plan, writes nothing). --apply writes
inside one transaction and drops a JSON snapshot for --revert. Take a pg_dump too.

Usage:
  python manage.py rollover_academic_year --school 56 --course 10 \
      --old-ay "EDUCATION 2082" --new-ay "EDUCATION 2083"
  python manage.py rollover_academic_year --school 56 --course 10 \
      --old-ay "EDUCATION 2082" --new-ay "EDUCATION 2083" --apply
  python manage.py rollover_academic_year --revert /path/to/snapshot.json
"""

import json
import os
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, AcademicYearMapping
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.Invoice import StudentInvoice
from main.models.Student import Student
from main.methods.academicYear import gen_class_key
from main.methods.nepaliDatetime import ndt_today
from main.constants.payment import (
    OPENING_BALANCE,
    OLD_DUES,
    DISCOUNTS,
    TITLE_NAMES_KEY,
    INVOICE_DETAILS,
)

HIGHER_ED_LEVELS = (4, 5, 8, 9)
RUNNING = 1
CENTS = Decimal("0.01")
_SKIP_KEYS = {TITLE_NAMES_KEY, DISCOUNTS}


def _q(v):
    return Decimal(v).quantize(CENTS, rounding=ROUND_HALF_UP)


def _bump_bs_year(date_str, by=1):
    """'2082-04-01' -> '2083-04-01' (increment the leading BS year)."""
    try:
        y, rest = date_str.split("-", 1)
        return f"{int(y) + by}-{rest}"
    except Exception:
        return date_str


def _authoritative_net(student_id, ay_id):
    """charges - paid - discount, exactly like AcademicYearCloseView."""
    net = Decimal(0)
    for total in StudentLedger.objects.filter(
        student_id=student_id, academic_year=ay_id,
        is_active=True, ledger_posting__is_active=True,
    ).values_list("total", flat=True):
        net += Decimal(total or 0)
    for paid, disc in StudentInvoice.objects.filter(
        student_id=student_id, academic_year=ay_id,
        is_active=True, isCashReceipt=False,
    ).values_list("total_paid", "total_discount"):
        net -= Decimal(paid or 0)
        net -= Decimal(disc or 0)
    return _q(net)


def _per_title_balance(student_id, ay_id):
    """Per-fee-title remaining, mirroring LedgerViews trial-balance display."""
    balance = defaultdict(Decimal)
    for details in StudentLedger.objects.filter(
        student_id=student_id, academic_year=ay_id,
        is_active=True, ledger_posting__is_active=True,
    ).values_list("details", flat=True):
        for title, amt in (details or {}).items():
            if title in _SKIP_KEYS:
                continue
            t = OLD_DUES if title == OPENING_BALANCE else title
            try:
                balance[t] += Decimal(str(amt))
            except Exception:
                continue
    for details in StudentInvoice.objects.filter(
        student_id=student_id, academic_year=ay_id,
        is_active=True, isCashReceipt=False,
    ).values_list("details", flat=True):
        for title, td in (details or {}).items():
            if title in _SKIP_KEYS or not isinstance(td, dict):
                continue
            t = OLD_DUES if title == OPENING_BALANCE else title
            balance[t] -= Decimal(str(td.get(INVOICE_DETAILS["AMOUNT"]) or 0))
    out = {}
    for t, v in balance.items():
        v = _q(v)
        if v != 0:
            out[t] = v
    return out


class Command(BaseCommand):
    help = "Roll a higher-ed program's running academic year to the next (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int)
        parser.add_argument("--course", type=int)
        parser.add_argument("--education-level", type=int, default=4)
        parser.add_argument("--old-ay", type=str, help="Name of the current OPEN running academic year")
        parser.add_argument("--new-ay", type=str, help="Name for the NEW academic year to create")
        parser.add_argument("--start-date", type=str, help="New AY start (BS YYYY-MM-DD); default = old start +1 yr")
        parser.add_argument("--end-date", type=str, help="New AY end (BS YYYY-MM-DD); default = old end +1 yr")
        parser.add_argument("--snapshot", type=str, help="Path to write/read the revert snapshot JSON")
        parser.add_argument("--details", action="store_true", help="Print per-student carry lines")
        parser.add_argument("--apply", action="store_true", help="Write changes (default is dry-run)")
        parser.add_argument("--revert", type=str, help="Undo a prior --apply using its snapshot JSON")

    # ------------------------------------------------------------------ revert
    def handle(self, *args, **o):
        if o.get("revert"):
            return self._revert(o["revert"])
        return self._roll(o)

    # -------------------------------------------------------------------- roll
    def _roll(self, o):
        for req in ("school", "course", "old_ay", "new_ay"):
            if not o.get(req):
                raise CommandError(f"--{req.replace('_','-')} is required")
        sid, course, el = o["school"], o["course"], o["education_level"]
        apply = o["apply"]
        if el not in HIGHER_ED_LEVELS:
            raise CommandError(f"education-level {el} is not higher-ed {HIGHER_ED_LEVELS}")

        old_ay = AcademicYear.objects.filter(school_id=sid, name=o["old_ay"]).first()
        if not old_ay:
            raise CommandError(f"old academic year '{o['old_ay']}' not found for school {sid}")
        if old_ay.closed:
            raise CommandError(f"old academic year '{old_ay.name}' is already CLOSED")
        if AcademicYear.objects.filter(school_id=sid, name=o["new_ay"]).exists():
            raise CommandError(f"an academic year named '{o['new_ay']}' already exists for school {sid}")

        start_date = o.get("start_date") or _bump_bs_year(old_ay.start_date)
        end_date = o.get("end_date") or _bump_bs_year(old_ay.end_date)

        eco = (
            StudentLedger.objects.filter(school_id=sid, is_active=True)
            .order_by("-id").values_list("economic_year", flat=True).first()
        )
        if not eco:
            raise CommandError("could not determine current economic year (no ledgers for school)")

        classes = list(
            ClassInfo.objects.filter(
                school_id=sid, education_level=el, course=course, is_active=True
            )
        )
        groups = defaultdict(list)
        for c in classes:
            groups[(c.year, c.semester)].append(c)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nRoll school {sid} course {course} (EL {el}): "
            f"'{old_ay.name}' -> NEW '{o['new_ay']}' [{start_date} .. {end_date}] "
            f"econ-year id {eco} [{'APPLY' if apply else 'DRY-RUN'}]"))

        # plan[group] = list of (student_id, class_id, net, details_dict, mode)
        plan = []
        grand_total = Decimal(0)
        grand_students = 0
        n_pertitle = n_lump = n_skip = 0

        for (year, sem), cls_list in sorted(
            groups.items(), key=lambda x: (x[0][0] or 0, x[0][1] or 0)
        ):
            key = gen_class_key({
                "education_level": el, "course": course,
                "year": year, "semester": sem, "grade": None, "batch": None,
            })
            mapping = AcademicYearMapping.objects.filter(school_id=sid, key=key).first()
            if not mapping:
                self.stdout.write(f"  key {key}: no mapping, skipped")
                continue
            if mapping.academic_year_id != old_ay.id:
                self.stdout.write(
                    f"  key {key}: maps to AY {mapping.academic_year_id} != old "
                    f"({old_ay.id}), skipped")
                continue
            class_ids = [c.id for c in cls_list]
            students = list(
                Student.objects.filter(
                    class_info__in=class_ids, status=RUNNING, is_active=True
                ).values_list("id", "class_info")
            )
            group_rows = []
            subtotal = Decimal(0)
            for std_id, cls_id in students:
                net = _authoritative_net(std_id, old_ay.id)
                if net == 0:
                    n_skip += 1
                    continue
                per_title = _per_title_balance(std_id, old_ay.id)
                reconciles = (
                    net > 0
                    and all(v > 0 for v in per_title.values())
                    and sum(per_title.values(), Decimal(0)) == net
                )
                if reconciles:
                    details = {t: float(v) for t, v in per_title.items()}
                    mode = "per-title"
                    n_pertitle += 1
                else:
                    details = {OPENING_BALANCE: float(net)}
                    mode = "lump-ob"
                    n_lump += 1
                group_rows.append((std_id, cls_id, net, details, mode))
                subtotal += net
            label = f"Year {year}" if year else (f"Sem {sem}" if sem else key)
            self.stdout.write(
                f"  {label:8} key={key:14} classes={len(cls_list):2} "
                f"carry={len(group_rows):3} students  Rs {_q(subtotal)}")
            if o["details"]:
                for std_id, cls_id, net, details, mode in group_rows:
                    self.stdout.write(f"      student {std_id}: Rs {net}  [{mode}] {details}")
            plan.append((key, mapping, cls_list, group_rows))
            grand_total += subtotal
            grand_students += len(group_rows)

        self.stdout.write(self.style.WARNING(
            f"  ---- carry {grand_students} students, TOTAL Rs {_q(grand_total)} "
            f"(per-title {n_pertitle}, lump-ob {n_lump}, zero/skip {n_skip}) ----"))

        if not plan:
            self.stdout.write("Nothing to roll.")
            return
        if not apply:
            self.stdout.write(self.style.NOTICE(
                "\nDRY-RUN -- nothing written. Re-run with --apply to commit."))
            return

        snapshot = {
            "school": sid, "course": course, "old_ay_id": old_ay.id,
            "old_ay_name": old_ay.name, "new_ay_name": o["new_ay"],
            "created_posting_ids": [], "created_ledger_ids": [],
            "mapping_changes": [], "class_ids": [], "new_ay_id": None,
        }
        _common = {"economic_year_id": eco, "date": ndt_today()}
        with transaction.atomic():
            new_ay = AcademicYear.objects.create(
                school_id=sid, name=o["new_ay"],
                start_date=start_date, end_date=end_date, closed=False,
            )
            snapshot["new_ay_id"] = new_ay.id
            common = {**_common, "academic_year": new_ay}
            new_ledgers = []
            for key, mapping, cls_list, group_rows in plan:
                per_class = defaultdict(list)
                for std_id, cls_id, net, details, mode in group_rows:
                    per_class[cls_id].append((std_id, net, details))
                for cls_id, rows in per_class.items():
                    lp = LedgerPosting.objects.create(class_info_id=cls_id, months=[], **common)
                    snapshot["created_posting_ids"].append(lp.id)
                    for std_id, net, details in rows:
                        new_ledgers.append(StudentLedger(
                            ledger_posting=lp, student_id=std_id, school_id=sid,
                            details=details, total=net, **common,
                        ))
                snapshot["mapping_changes"].append({
                    "id": mapping.id,
                    "prev_academic_year_id": mapping.academic_year_id,
                })
                AcademicYearMapping.objects.filter(id=mapping.id).update(
                    academic_year=new_ay, previous_academic_year_id=old_ay.id)
                cls_ids = [c.id for c in cls_list]
                snapshot["class_ids"].extend(cls_ids)
                ClassInfo.objects.filter(id__in=cls_ids).update(academic_year=new_ay)
            created = StudentLedger.objects.bulk_create(new_ledgers)
            snapshot["created_ledger_ids"] = [l.id for l in created]
            AcademicYear.objects.filter(id=old_ay.id).update(closed=True)

        snap_path = o.get("snapshot") or os.path.join(
            os.getcwd(), f"rollover_{sid}_{course}_{new_ay.id}_snapshot.json")
        with open(snap_path, "w") as f:
            json.dump(snapshot, f, indent=2)

        self.stdout.write(self.style.SUCCESS(
            f"\nDONE. New AY '{new_ay.name}' (id {new_ay.id}) opened; "
            f"'{old_ay.name}' closed; {grand_students} balances carried "
            f"(Rs {_q(grand_total)}). Snapshot: {snap_path}"))
        self.stdout.write(
            "Next (operator UI): promote each level up one year & enrol the new "
            "intake -- both are same-year moves now, so dues will NOT double-carry.")

    # ------------------------------------------------------------------ revert
    def _revert(self, path):
        with open(path) as f:
            snap = json.load(f)
        with transaction.atomic():
            StudentLedger.objects.filter(id__in=snap["created_ledger_ids"]).delete()
            LedgerPosting.objects.filter(id__in=snap["created_posting_ids"]).delete()
            for mc in snap["mapping_changes"]:
                AcademicYearMapping.objects.filter(id=mc["id"]).update(
                    academic_year_id=mc["prev_academic_year_id"],
                    previous_academic_year=None,
                )
            if snap.get("old_ay_id"):
                AcademicYear.objects.filter(id=snap["old_ay_id"]).update(closed=False)
            if snap.get("class_ids") and snap.get("old_ay_id"):
                ClassInfo.objects.filter(id__in=snap["class_ids"]).update(
                    academic_year_id=snap["old_ay_id"])
            if snap.get("new_ay_id"):
                AcademicYear.objects.filter(id=snap["new_ay_id"]).delete()
        self.stdout.write(self.style.SUCCESS(
            f"Reverted rollover: reopened '{snap.get('old_ay_name')}', "
            f"removed new AY id {snap.get('new_ay_id')} and its carried ledgers."))
