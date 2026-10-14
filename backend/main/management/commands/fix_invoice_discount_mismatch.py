from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from main.models.Invoice import StudentInvoice

TITLE_NAMES_KEY = "__titles"
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _dec(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return ZERO


def _q(v):
    # Round to paisa so floating-point noise stored in the details JSON
    # (e.g. 19000.1799999999 for 19000.18) doesn't read as a real mismatch.
    return _dec(v).quantize(CENT)


def _detail_sums(details):
    """Return (sum_amt, sum_dis) over real title lines in an invoice's details."""
    sum_amt = ZERO
    sum_dis = ZERO
    for key, val in (details or {}).items():
        if key == TITLE_NAMES_KEY:
            continue
        if isinstance(val, dict):
            sum_amt += _dec(val.get("amt"))
            sum_dis += _dec(val.get("dis"))
    return sum_amt, sum_dis


class Command(BaseCommand):
    help = (
        "Reconcile StudentInvoice header totals with their per-title details.\n"
        "The student-search BALANCE uses the header (total_paid, total_discount) "
        "while the payment ledger / receipt uses the per-title detail (amt, dis). "
        "They agree only when  sum(detail.amt) == total_paid + total_discount. A "
        "handful of historical invoices break this (a frontend miscalculation "
        "duplicated a discount onto a sibling invoice in the same payment), which "
        "makes a student's two balances disagree.\n\n"
        "SAFE fix: when the detail is internally consistent "
        "( sum(amt) == total_paid + sum(dis) ) but the header total_discount "
        "differs from sum(dis), set total_discount = sum(dis). This keeps the "
        "actual cash (total_paid) and every detail line untouched — only the "
        "wrong header discount is corrected. Everything else is REPORTED ONLY "
        "(needs manual review). Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true",
                            help="Write the changes. Without it, only reports.")
        parser.add_argument("--school", type=int, default=None,
                            help="Limit to one school id.")
        parser.add_argument("--invoice", type=int, default=None,
                            help="Limit to a single invoice id.")

    def handle(self, *args, **opts):
        apply = opts["apply"]
        qs = StudentInvoice.objects.filter(is_active=True, isCashReceipt=False)
        if opts["school"]:
            qs = qs.filter(school=opts["school"])
        if opts["invoice"]:
            qs = qs.filter(id=opts["invoice"])
        qs = qs.values("id", "school", "student", "total_paid",
                       "total_discount", "details")

        safe = []       # (row, new_discount)
        ambiguous = []  # rows we won't touch automatically
        scanned = 0
        for row in qs.iterator():
            scanned += 1
            sum_amt, sum_dis = _detail_sums(row["details"])
            sum_amt, sum_dis = _q(sum_amt), _q(sum_dis)
            paid = _q(row["total_paid"])
            disc = _q(row["total_discount"])
            if sum_amt == paid + disc:
                continue  # header already agrees with detail — nothing to do
            # Detail internally consistent? then only the header discount is wrong.
            if sum_amt == paid + sum_dis:
                safe.append((row, sum_dis))
            else:
                ambiguous.append((row, sum_amt, sum_dis, paid, disc))

        self.stdout.write(f"Scanned {scanned} active non-cash invoices.")
        self.stdout.write(
            f"SAFE (header discount drifted from detail): {len(safe)}")
        for row, new_disc in safe:
            self.stdout.write(
                f"  inv {row['id']} school {row['school']} student {row['student']}: "
                f"total_discount {row['total_discount']} -> {new_disc} "
                f"(total_paid {row['total_paid']} kept)")
        self.stdout.write(
            f"AMBIGUOUS (detail doesn't reconcile with cash — manual review): "
            f"{len(ambiguous)}")
        for row, sum_amt, sum_dis, paid, disc in ambiguous:
            self.stdout.write(
                f"  inv {row['id']} school {row['school']} student {row['student']}: "
                f"sum(amt)={sum_amt} sum(dis)={sum_dis} total_paid={paid} "
                f"total_discount={disc}")

        if not apply:
            self.stdout.write(self.style.WARNING(
                "\nDRY-RUN. Re-run with --apply to write the SAFE fixes above."))
            return

        updated = 0
        with transaction.atomic():
            for row, new_disc in safe:
                StudentInvoice.objects.filter(id=row["id"]).update(
                    total_discount=new_disc)
                updated += 1
        self.stdout.write(self.style.SUCCESS(
            f"\nApplied {updated} SAFE fix(es). "
            f"{len(ambiguous)} ambiguous invoice(s) left untouched."))
