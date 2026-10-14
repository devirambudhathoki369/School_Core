import json
import os
from datetime import datetime

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count, Max
from extra_billing.models.Billing import ExtraInvoice

from main.models.Invoice import StudentInvoice


class Command(BaseCommand):
    help = (
        "Repair duplicate StudentInvoice numbers caused by the old "
        "per-academic-year counter. Within each (school, economic_year) the "
        "EARLIEST-created row keeps each colliding invoice_id; later duplicates "
        "are moved to the end of that fiscal year's sequence (max+1, max+2 ...), "
        "so the originally-issued numbers are preserved and only the wrongly "
        "restarted ones are 'continued'. Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write the changes. Without it, only reports what would change.",
        )

    def _groups_with_dupes(self):
        # (school, economic_year) groups where invoice_id is not unique.
        groups = (
            StudentInvoice.objects.values("school", "economic_year")
            .annotate(n=Count("id"), distinct_ids=Count("invoice_id", distinct=True))
        )
        return [
            (g["school"], g["economic_year"])
            for g in groups
            if g["n"] != g["distinct_ids"]
        ]

    def _plan_for_group(self, school_id, economic_year_id):
        """
        Return (next_number_start, [(invoice_pk, old_id, new_id), ...]) for one
        (school, economic_year). The keeper of each duplicate number is the row
        with the smallest pk; every other row with that number is renumbered.
        """
        rows = list(
            StudentInvoice.objects.filter(
                school=school_id, economic_year=economic_year_id
            )
            .order_by("id")
            .values("id", "invoice_id")
        )
        extra_max = ExtraInvoice.objects.filter(
            school_id=school_id, economic_year_id=economic_year_id
        ).aggregate(last=Max("invoice_id"))["last"] or 0
        max_id = max(extra_max, max(r["invoice_id"] for r in rows))
        seen = set()
        to_renumber = []  # rows that need a new number, already in id (creation) order
        for r in rows:
            num = r["invoice_id"]
            if num in seen:
                to_renumber.append(r)  # a later occurrence of an already-used number
            else:
                seen.add(num)
        plan = []
        next_id = max_id + 1
        for r in to_renumber:
            plan.append((r["id"], r["invoice_id"], next_id))
            next_id += 1
        return plan

    def handle(self, *args, **opts):
        w = self.stdout.write
        apply = opts["apply"]
        groups = self._groups_with_dupes()
        w(f"groups with duplicate invoice_id: {len(groups)}")

        full_plan = []  # (school, eco, pk, old_id, new_id)
        for school_id, eco_id in sorted(groups):
            plan = self._plan_for_group(school_id, eco_id)
            w(
                self.style.WARNING(
                    f"school={school_id} economic_year={eco_id}: "
                    f"{len(plan)} invoice(s) to renumber"
                )
            )
            for pk, old_id, new_id in plan:
                w(f"    invoice pk={pk}  {old_id} -> {new_id}")
                full_plan.append((school_id, eco_id, pk, old_id, new_id))

        w(f"\nTOTAL invoices to renumber: {len(full_plan)}")

        if not apply:
            w(self.style.NOTICE("\n(dry run) re-run with --apply to write changes."))
            return

        if not full_plan:
            w("nothing to do.")
            return

        # Backup the exact before-state of every row we are about to touch.
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(
            os.getcwd(), f"invoice_renumber_backup_{stamp}.json"
        )
        with open(backup_path, "w") as f:
            json.dump(
                [
                    {
                        "school": s,
                        "economic_year": e,
                        "pk": pk,
                        "old_invoice_id": old_id,
                        "new_invoice_id": new_id,
                    }
                    for (s, e, pk, old_id, new_id) in full_plan
                ],
                f,
                indent=2,
            )
        w(self.style.SUCCESS(f"backup written: {backup_path}"))

        with transaction.atomic():
            for _s, _e, pk, _old, new_id in full_plan:
                StudentInvoice.objects.filter(pk=pk).update(invoice_id=new_id)
        w(self.style.SUCCESS(f"DONE. Renumbered {len(full_plan)} invoice(s)."))

        # Verify: no remaining duplicates.
        remaining = self._groups_with_dupes()
        if remaining:
            w(self.style.ERROR(f"WARNING: {len(remaining)} group(s) still have dupes: {remaining}"))
        else:
            w(self.style.SUCCESS("verified: no duplicate invoice_id remains in any (school, economic_year)."))
