"""Retire student-ledger rows that charge nothing.

The ledger posting screen built one row per student in the class and zeroed
every fee title the student could not be charged for in the selected months — a
title whose fee months exclude the period, or one they already hold from an
earlier posting. When that left nothing, the row still went to the server with
`details: {}` and `total: 0` and landed in the student's ledger as a dated entry
with **no particulars and no amount**.

They change no balance — every dues and revenue calculation sums `details`, and
there is nothing in it to sum. What they do is make a parent reading the ledger
see a page of phantom charges, and a cashier read them as a double posting.
Divine Pathshala Dang (school 69) reported exactly that.

Both halves of the leak are now closed — the client no longer builds such a row
(`methods/payment/ledger.js`) and the API drops one that arrives anyway
(`LedgerViews.dropEmptyCharges`) — so this only clears what is already stored.

Retired, not deleted: `is_active=False`, the same soft delete the Delete button
on the ledger performs, so every row remains recoverable by id. A posting left
with no active row of its own is deactivated too, mirroring
`LedgerView._delete`.

A row is touched ONLY when all three hold:
  * `total` is exactly 0,
  * `details` names no fee title (an empty dict, or nothing but the
    `__titles` name snapshot),
  * it carries no `remarks` — a human wrote those, so the row was meant.

Dry run by default.

    manage.py drop_empty_ledger_rows                      # report, all schools
    manage.py drop_empty_ledger_rows --school 69          # scope to one school
    manage.py drop_empty_ledger_rows --school 69 --dates 2083-05-10,2083-05-11
    manage.py drop_empty_ledger_rows --school 69 --apply  # write it
"""

import json
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction

from main.constants.payment import TITLE_NAMES_KEY
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.SchoolAdmin import SchoolAdmin


def charges_nothing(details):
    """True when `details` names no fee title at all."""
    if not isinstance(details, dict):
        return True
    return not [title for title in details if title != TITLE_NAMES_KEY]


class Command(BaseCommand):
    help = "Retire student-ledger rows that bill no fee title and no amount."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="limit to one school id")
        parser.add_argument(
            "--dates", help="comma-separated BS dates to limit to, e.g. 2083-05-10,2083-05-11"
        )
        parser.add_argument(
            "--apply", action="store_true", help="write the change (default: dry run)"
        )
        parser.add_argument(
            "--backup", help="write the affected row ids to this JSON file"
        )
        parser.add_argument(
            "--limit-report", type=int, default=20, help="rows in the per-school table"
        )

    def handle(self, *args, **opts):
        school_id = opts.get("school")
        apply = opts["apply"]
        dates = [d.strip() for d in (opts.get("dates") or "").split(",") if d.strip()]

        q = StudentLedger.objects.filter(is_active=True, total=0, remarks=None)
        if school_id:
            q = q.filter(school_id=school_id)
        if dates:
            q = q.filter(date__in=dates)

        rows = [
            r
            for r in q.values("id", "school_id", "student_id", "date",
                              "ledger_posting_id", "details")
            if charges_nothing(r["details"])
        ]
        self.stdout.write(f"empty ledger rows found : {len(rows)}")
        if not rows:
            return

        names = {s.id: s.name for s in SchoolAdmin.objects.all()}
        per_school = Counter(r["school_id"] for r in rows)
        self.stdout.write("")
        for sid, n in per_school.most_common(opts["limit_report"]):
            self.stdout.write(f"   school {sid:>3}  {str(names.get(sid, sid))[:38]:<38} {n:>6}")
        if len(per_school) > opts["limit_report"]:
            self.stdout.write(f"   ... and {len(per_school) - opts['limit_report']} more school(s)")

        self.stdout.write("")
        per_date = Counter(str(r["date"]) for r in rows)
        for d, n in sorted(per_date.items())[: opts["limit_report"]]:
            self.stdout.write(f"   {d}  {n:>6}")
        if len(per_date) > opts["limit_report"]:
            self.stdout.write(f"   ... and {len(per_date) - opts['limit_report']} more date(s)")

        # Postings that would be left with nothing active at all.
        row_ids = {r["id"] for r in rows}
        touched_postings = {r["ledger_posting_id"] for r in rows}
        survivors = defaultdict(int)
        for pid, rid in StudentLedger.objects.filter(
            ledger_posting_id__in=touched_postings, is_active=True
        ).values_list("ledger_posting_id", "id"):
            if rid not in row_ids:
                survivors[pid] += 1
        emptied = sorted(p for p in touched_postings if survivors[p] == 0)
        self.stdout.write("")
        self.stdout.write(
            f"postings touched        : {len(touched_postings)}  "
            f"(of which {len(emptied)} are left with no active row and get retired too)"
        )
        self.stdout.write(
            f"students affected       : {len({r['student_id'] for r in rows})}"
        )

        if opts.get("backup"):
            with open(opts["backup"], "w") as fh:
                json.dump(
                    {
                        "student_ledger_ids": sorted(row_ids),
                        "ledger_posting_ids": emptied,
                        "rows": [
                            {k: str(v) for k, v in r.items()} for r in rows
                        ],
                    },
                    fh,
                    indent=1,
                )
            self.stdout.write(self.style.SUCCESS(f"backup written to {opts['backup']}"))

        if not apply:
            self.stdout.write("")
            self.stdout.write(self.style.WARNING("DRY RUN — nothing written. Re-run with --apply."))
            return

        with transaction.atomic():
            n_rows = StudentLedger.objects.filter(id__in=row_ids).update(is_active=False)
            n_postings = LedgerPosting.objects.filter(id__in=emptied).update(is_active=False)
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"retired {n_rows} student-ledger row(s) and {n_postings} posting(s)."
            )
        )
        self.stdout.write(
            "Undo: set is_active=True on the ids in the backup file."
        )
