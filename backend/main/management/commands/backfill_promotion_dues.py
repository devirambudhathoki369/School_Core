"""
Backfill carried-forward dues for students who were promoted ACROSS academic years
BEFORE `StudentsView.carryForwardDuesOnPromotion` existed (or whose close-created
opening balance was later deleted), so their old dues never made it into the year
their current class is mapped to and are therefore invisible on the (single-year)
payment screen.

It mirrors the live promotion fix exactly: for each affected student it MOVES their
outstanding into their current mapped academic year as an opening balance, writing a
balanced pair of StudentLedger rows:

    * current year -> {OPENING_BALANCE: +amt}   (renders as "old dues", collectible)
    * source  year -> {CARRY_FORWARD_OUT: -amt} (zeroes the source; dues MOVED)

WHY THIS IS NON-DESTRUCTIVE
  - It NEVER edits or deletes an existing row. It only ADDS new rows.
  - Each carry is net-zero across all years (the +ob is offset by the -cfo), so a
    student's all-years total is unchanged; the balance is only relocated.
  - Idempotent: a source year that already has a `cfo` row is skipped, and a student
    whose current year already has an active ob/od is not a candidate at all. Re-runs
    are safe.

AVOIDING DOUBLE-COUNT (the trap the original promotion code fell into)
  A close rolls a year's net into the next year as an `ob` row but does NOT zero the
  closed year, so a balance can appear in BOTH the closed year and the later `ob`.
  Summing every prior year would double-count. Here a source year is treated as a
  SUPERSEDED duplicate (and excluded) when a LATER year already holds an active
  ob/od whose amount equals that year's net. Only the remaining "live" years are
  carried.

CLASSIFICATION
  - SAFE   : exactly one live source year -> unambiguous.
  - REVIEW : more than one live source year (parallel chains / cross-level history)
             -> the computed amount is shown but NOT applied unless --include-review.

USAGE
    # Dry-run everything (writes nothing) — start here:
    python manage.py backfill_promotion_dues

    # Dry-run a single school / single student with full per-year breakdown:
    python manage.py backfill_promotion_dues --school 4 --verbose
    python manage.py backfill_promotion_dues --student 1305 --verbose

    # Apply the SAFE cases for one school (writes inside a transaction):
    python manage.py backfill_promotion_dues --school 4 --apply

    # Also apply the REVIEW (multi-year) cases — only after eyeballing the dry-run:
    python manage.py backfill_promotion_dues --school 4 --apply --include-review
"""

from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum

from main.models.Student import Student
from main.models.Ledger import StudentLedger, LedgerPosting
from main.models.Invoice import StudentInvoice
from main.models.ClassInfo import CLASS_DETAILS_FIELDS
from main.models.FiscalYears import AcademicYear, AcademicYearMapping, EconomicYear
from main.methods.academicYear import gen_class_key
from main.methods.nepaliDatetime import ndt_today
from main.constants.payment import OPENING_BALANCE, OLD_DUES, CARRY_FORWARD_OUT

TWO_PLACES = Decimal("0.01")
CENT = Decimal("0.01")
BACKFILL_REMARK = "promo-dues-backfill"


class Command(BaseCommand):
    help = "Backfill carried-forward old dues for already-promoted students (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, default=None,
                            help="Limit to one school id.")
        parser.add_argument("--student", type=int, default=None,
                            help="Limit to one student id.")
        parser.add_argument("--apply", action="store_true",
                            help="Actually write the carries. Without it, dry-run only.")
        parser.add_argument("--include-review", action="store_true",
                            help="Also apply multi-year (REVIEW) cases, not just SAFE.")
        parser.add_argument("--verbose", action="store_true",
                            help="Print the per-year net breakdown for each student.")

    # ------------------------------------------------------------------ helpers
    def handle(self, *args, **opts):
        school = opts.get("school")
        only_student = opts.get("student")
        do_apply = opts.get("apply")
        include_review = opts.get("include_review")
        verbose = opts.get("verbose")

        # 1) (school, key) -> current mapped academic_year id
        mp = {}
        for m in AcademicYearMapping.objects.values("school", "key", "academic_year").order_by("id"):
            mp[(m["school"], m["key"])] = m["academic_year"]  # last (highest id) wins

        # 2) academic year end_date for chronological compare
        ay_end = {a["id"]: (a["end_date"] or "") for a in AcademicYear.objects.values("id", "end_date")}

        # 3) candidate active students -> current class details + resolved dst year
        sq = Student.objects.filter(status=1)
        if only_student:
            sq = sq.filter(id=only_student)
        if school:
            sq = sq.filter(class_info__school=school)
        studs = {}
        for s in sq.values("id", "class_info", "class_info__school",
                           *[f"class_info__{f}" for f in CLASS_DETAILS_FIELDS]):
            ci = {f: s[f"class_info__{f}"] for f in CLASS_DETAILS_FIELDS}
            sch = s["class_info__school"]
            dst = mp.get((sch, gen_class_key(ci)))
            studs[s["id"]] = {"school": sch, "class": s["class_info"], "dst": dst}
        sids = list(studs.keys())
        if not sids:
            self.stdout.write("No students match the given filters.")
            return

        # 4) net per (student, ay): Σ active ledger.total − Σ active non-cash (paid+discount)
        net = defaultdict(Decimal)
        for r in (StudentLedger.objects
                  .filter(student_id__in=sids, is_active=True, ledger_posting__is_active=True)
                  .values("student_id", "academic_year").annotate(t=Sum("total"))):
            net[(r["student_id"], r["academic_year"])] += r["t"] or Decimal(0)
        for r in (StudentInvoice.objects
                  .filter(student_id__in=sids, is_active=True, isCashReceipt=False)
                  .values("student_id", "academic_year").annotate(p=Sum("total_paid"), d=Sum("total_discount"))):
            net[(r["student_id"], r["academic_year"])] -= (r["p"] or Decimal(0)) + (r["d"] or Decimal(0))

        # 5) active ob/od markers per (student, ay): amount(s) already "carried in"
        obod = defaultdict(list)  # (sid, ay) -> [amounts]
        for sid, ay, det in (StudentLedger.objects
                             .filter(student_id__in=sids, is_active=True, ledger_posting__is_active=True)
                             .values_list("student_id", "academic_year", "details")):
            if isinstance(det, dict):
                for k in (OPENING_BALANCE, OLD_DUES):
                    if k in det:
                        try:
                            obod[(sid, ay)].append(Decimal(str(det[k])))
                        except Exception:
                            pass

        # 6) (student, ay) already carried OUT (has a cfo) -> never re-carry
        carried_out = set(
            StudentLedger.objects.filter(student_id__in=sids, details__has_key=CARRY_FORWARD_OUT)
            .values_list("student_id", "academic_year")
        )

        # ----------------------------------------------------------- classify
        plans = []  # dict per affected student
        for sid, info in studs.items():
            dst = info["dst"]
            if not dst:
                continue
            # already carried into current year? (active ob/od present) -> correct, skip
            if obod.get((sid, dst)):
                continue
            cand = [(ay, n) for (s2, ay), n in net.items()
                    if s2 == sid and ay != dst and n > CENT and (sid, ay) not in carried_out]
            if not cand:
                continue
            # supersession: drop a candidate year Y if a LATER year holds an active
            # ob/od ~= net(Y) (Y's balance already lives there).
            live, superseded = [], []
            for ay, n in cand:
                dup = False
                for (s2, zay), amts in obod.items():
                    if s2 != sid or zay == ay:
                        continue
                    if ay_end.get(zay, "") < ay_end.get(ay, ""):
                        continue  # only a LATER year can supersede
                    if any(abs(m - n) <= CENT for m in amts):
                        dup = True
                        break
                (superseded if dup else live).append((ay, n))
            if not live:
                continue
            carry = sum((n for _, n in live), Decimal(0)).quantize(TWO_PLACES, ROUND_HALF_UP)
            if carry <= 0:
                continue
            plans.append({
                "sid": sid, "school": info["school"], "class": info["class"], "dst": dst,
                "live": live, "superseded": superseded, "carry": carry,
                "kind": "SAFE" if len(live) == 1 else "REVIEW",
            })

        self._report(plans, verbose, ay_end, net, do_apply, include_review)

        if do_apply and plans:
            self._apply(plans, include_review)

    # ------------------------------------------------------------------- report
    def _report(self, plans, verbose, ay_end, net, do_apply, include_review):
        safe = [p for p in plans if p["kind"] == "SAFE"]
        review = [p for p in plans if p["kind"] == "REVIEW"]
        by_school = defaultdict(lambda: [0, Decimal(0)])
        for p in plans:
            by_school[p["school"]][0] += 1
            by_school[p["school"]][1] += p["carry"]

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nStranded students: {len(plans)}  (SAFE {len(safe)}, REVIEW {len(review)})"
        ))
        self.stdout.write(f"Total to carry: {sum((p['carry'] for p in plans), Decimal(0))}")
        self.stdout.write("Per school (count, sum-to-carry):")
        for sch in sorted(by_school):
            c, amt = by_school[sch]
            self.stdout.write(f"  school {sch}: {c} students, {amt}")

        if verbose:
            self.stdout.write("\nPer-student detail:")
            for p in sorted(plans, key=lambda x: (x["school"], -x["carry"])):
                tag = self.style.SUCCESS("SAFE") if p["kind"] == "SAFE" else self.style.WARNING("REVIEW")
                self.stdout.write(
                    f"  [{tag}] student {p['sid']} (school {p['school']}) "
                    f"-> carry {p['carry']} into AY#{p['dst']}"
                )
                for ay, n in sorted(p["live"], key=lambda x: ay_end.get(x[0], "")):
                    self.stdout.write(f"        live  AY#{ay} net {round(n, 2)}")
                for ay, n in sorted(p["superseded"], key=lambda x: ay_end.get(x[0], "")):
                    self.stdout.write(f"        (superseded duplicate) AY#{ay} net {round(n, 2)}")

        if not do_apply:
            self.stdout.write(self.style.WARNING(
                "\nDRY-RUN — nothing written. Re-run with --apply (SAFE only) "
                "or --apply --include-review (also multi-year)."
            ))
        else:
            scope = "SAFE + REVIEW" if include_review else "SAFE only"
            self.stdout.write(self.style.MIGRATE_HEADING(f"\nAPPLYING ({scope})..."))

    # -------------------------------------------------------------------- apply
    def _apply(self, plans, include_review):
        targets = [p for p in plans if p["kind"] == "SAFE" or include_review]
        if not targets:
            self.stdout.write("Nothing to apply for the chosen scope.")
            return
        economic_year_id = (EconomicYear.objects.filter(closed=False)
                            .order_by("-id").values_list("id", flat=True).first())
        if not economic_year_id:
            self.stderr.write(self.style.ERROR("No open economic year — aborting."))
            return

        today = ndt_today()
        written, total = 0, Decimal(0)
        with transaction.atomic():
            postings = {}  # (class_id, ay_id) -> LedgerPosting

            def posting(class_id, ay_id):
                key = (class_id, ay_id)
                if key not in postings:
                    postings[key] = LedgerPosting.objects.create(
                        class_info_id=class_id, academic_year_id=ay_id,
                        economic_year_id=economic_year_id, months=[], date=today,
                    )
                return postings[key]

            rows = []
            for p in targets:
                sid, cls, dst = p["sid"], p["class"], p["dst"]
                # re-check idempotency at write time
                if StudentLedger.objects.filter(
                    student_id=sid, academic_year=dst, is_active=True,
                    ledger_posting__is_active=True,
                ).filter(details__has_key=OPENING_BALANCE).exists() or \
                   StudentLedger.objects.filter(
                    student_id=sid, academic_year=dst, is_active=True,
                    ledger_posting__is_active=True,
                ).filter(details__has_key=OLD_DUES).exists():
                    continue
                carry = p["carry"]
                dst_post = posting(cls, dst)
                rows.append(StudentLedger(
                    student_id=sid, school_id=p["school"], ledger_posting=dst_post,
                    academic_year_id=dst, economic_year_id=economic_year_id,
                    details={OPENING_BALANCE: float(carry)}, total=carry,
                    date=today, remarks=BACKFILL_REMARK,
                ))
                for ay, n in p["live"]:
                    amt = n.quantize(TWO_PLACES, ROUND_HALF_UP)
                    out_post = posting(cls, ay)
                    rows.append(StudentLedger(
                        student_id=sid, school_id=p["school"], ledger_posting=out_post,
                        academic_year_id=ay, economic_year_id=economic_year_id,
                        details={CARRY_FORWARD_OUT: float(-amt)}, total=-amt,
                        date=today, remarks=BACKFILL_REMARK,
                    ))
                written += 1
                total += carry
            if rows:
                StudentLedger.objects.bulk_create(rows)
        self.stdout.write(self.style.SUCCESS(
            f"Applied carries for {written} students, total {total} moved into current years."
        ))
