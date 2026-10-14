"""Mark historical single-student ledger postings.

Every catch-up posted from a student profile's Ledger tab writes its own
`LedgerPosting` against the CLASS (see `LedgerSerializer.LedgerPostingSerializer.
create`), identical in shape to a class-wide posting made from Payment > Ledger
posting. The month picker on the profile reads that list back, so classes ended
up offering the same period several times over — "Ashad" once class-wide and
again for every profile catch-up — and re-offering months the class had already
been billed for.

`LedgerPosting.single_student` now records which is which at write time. This
backfills the flag for rows written before the field existed.

Discriminator: a posting carrying exactly ONE student ledger, in a class where
some other posting carries more than one. The second half is what keeps a
genuinely single-pupil class (where a class-wide posting also has one row) from
being mislabelled — those are left alone and reported as `ambiguous`.

Nothing but the flag is written; no ledger, invoice or amount is touched.
Dry run by default.

    manage.py backfill_single_student_postings                # report only
    manage.py backfill_single_student_postings --school 39    # scope to a school
    manage.py backfill_single_student_postings --apply
"""

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from main.models.Ledger import LedgerPosting
from main.models.SchoolAdmin import SchoolAdmin


class Command(BaseCommand):
    help = "Flag ledger postings that were made for a single student from a profile."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="limit to one school id")
        parser.add_argument(
            "--apply", action="store_true", help="write the flag (default: dry run)"
        )
        parser.add_argument(
            "--limit-report", type=int, default=15, help="rows in the per-school table"
        )

    def handle(self, *args, **opts):
        school_id = opts.get("school")
        apply = opts["apply"]

        q = LedgerPosting.objects.filter(is_active=True)
        if school_id:
            q = q.filter(class_info__school_id=school_id)

        rows = list(
            q.annotate(n=Count("studentledger"))
            .values("id", "class_info_id", "class_info__school_id", "n", "months")
        )
        self.stdout.write(f"active postings examined : {len(rows)}")

        # Classes that have at least one demonstrably class-wide posting. Only in
        # those can "exactly one student ledger" safely mean "single student".
        multi_student_classes = {
            r["class_info_id"] for r in rows if r["n"] > 1
        }

        singles, ambiguous = [], []
        for r in rows:
            if r["n"] != 1:
                continue
            if r["class_info_id"] in multi_student_classes:
                singles.append(r)
            else:
                ambiguous.append(r)

        self.stdout.write(f"  class-wide (2+ ledgers): {sum(1 for r in rows if r['n'] > 1)}")
        self.stdout.write(f"  single-student         : {len(singles)}")
        self.stdout.write(
            f"  ambiguous (left alone) : {len(ambiguous)}  "
            f"— only posting(s) in their class, cannot tell a one-pupil class apart"
        )
        self.stdout.write("")

        # What the profile month picker actually stops showing, per class.
        before = defaultdict(set)
        after = defaultdict(set)
        single_ids = {r["id"] for r in singles}
        for r in rows:
            key = tuple(sorted(r["months"] or []))
            if not key:
                continue
            before[r["class_info_id"]].add(key)
            if r["id"] not in single_ids:
                after[r["class_info_id"]].add(key)
        shrank = {
            c: (len(before[c]), len(after[c]))
            for c in before
            if len(after[c]) < len(before[c])
        }
        worst = sorted(shrank.items(), key=lambda kv: kv[1][0] - kv[1][1], reverse=True)
        self.stdout.write(
            f"classes whose month picker shrinks: {len(shrank)} of {len(before)}"
        )
        names = {s.id: s.name for s in SchoolAdmin.objects.all()}
        by_class_school = {r["class_info_id"]: r["class_info__school_id"] for r in rows}
        for cid, (b, a) in worst[: opts["limit_report"]]:
            sch = by_class_school.get(cid)
            self.stdout.write(
                f"   class {cid:>6}  {str(names.get(sch, sch))[:34]:<34} "
                f"{b:>3} groups -> {a:>3}"
            )
        empties = [c for c, (b, a) in shrank.items() if a == 0]
        if empties:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    f"{len(empties)} class(es) would be left with NO offerable month "
                    f"group — they have only ever been posted per-student. Their "
                    f"profile picker will read 'no posted months' until a class-wide "
                    f"posting is made: {empties[:10]}"
                )
            )
        self.stdout.write("")

        if not apply:
            self.stdout.write(
                self.style.WARNING("DRY RUN — nothing written. Re-run with --apply.")
            )
            return

        with transaction.atomic():
            updated = LedgerPosting.objects.filter(id__in=single_ids).update(
                single_student=True
            )
        self.stdout.write(self.style.SUCCESS(f"flagged {updated} postings."))
