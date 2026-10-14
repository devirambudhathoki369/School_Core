"""
Recompute the opening balances a closed accounting year handed to the next one.

Years closed before the dr/cr fix carried forward `opening + (debits + credits)`
instead of `opening + (debits - credits)`, inflating every balance-sheet ledger
by roughly twice its turnover. Income/expense ledgers look fine because they
always close to zero -- but the retained-earning figure built from them is
wrong too.

This only rewrites AccountingLedgerBalance rows of the NEXT year. Vouchers,
entries and the closed year itself are never touched, so entries already posted
in the running year survive untouched.

    # inspect (default, changes nothing)
    python manage.py repair_aey_opening_balances --school 3

    # write, after taking a backup
    python manage.py repair_aey_opening_balances --school 3 --apply
"""

import json
from datetime import datetime
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from accounting.models.AccountingEconomicYear import AccountingEconomicYear
from accounting.models.AccountingLedger import AccountingLedger, AccountingLedgerBalance
from accounting.methods.closingBalances import getAllMovements, calculateClosingBalances
from accounting.views.AccountingLedgerView import AccountingLedgerBalanceQueryMixin

RETAINED_EARNING_GROUP = 24
BALANCE_TYPES = {1: "Dr", 2: "Cr"}


class Command(BaseCommand):
    help = "Recompute next-year opening balances from a closed accounting year."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int)
        parser.add_argument(
            "--all-schools",
            action="store_true",
            help="Sweep every school that has a closed year with a following "
            "year. Repairs every such handover, not just the latest.",
        )
        parser.add_argument(
            "--economic-year",
            type=int,
            help="Closed accounting economic year id. Defaults to the most "
            "recently closed year that has a following year.",
        )
        parser.add_argument(
            "--retained-earning-ledger",
            type=int,
            help="Ledger the P&L result was closed into. Auto-detected from "
            "ledger group 24 when omitted.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the corrected balances. Without it, nothing changes.",
        )
        parser.add_argument(
            "--tolerance",
            type=str,
            default="0.01",
            help="Ignore differences at or below this amount (default 0.01).",
        )

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        tolerance = Decimal(options["tolerance"])

        handovers = self.getHandovers(options)
        if not handovers:
            raise CommandError("No closed year with a following year to repair.")

        # a school with chained closes (EY1->EY2->EY3) must be repaired oldest
        # first: each handover reads the opening balances the previous one wrote.
        chained = {s for s, _, _ in handovers}
        if len(handovers) > len(chained) and not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "NOTE: a school has chained closed years. In dry run the "
                    "later handover is computed from still-uncorrected data, so "
                    "only the earliest one per school is trustworthy here; "
                    "--apply fixes them in order."
                )
            )

        total_drifted, skipped = 0, []
        for school_id, closed_ey, next_ey in handovers:
            try:
                total_drifted += self.repairHandover(
                    school_id,
                    closed_ey,
                    next_ey,
                    options.get("retained_earning_ledger"),
                    tolerance,
                    apply_changes,
                )
            except CommandError as e:
                # never let one school's misconfiguration abort the sweep
                if not options.get("all_schools"):
                    raise
                skipped.append((school_id, closed_ey.id, str(e)))
                self.stdout.write(self.style.ERROR(f"  SKIPPED: {e}"))

        self.stdout.write("")
        if skipped:
            self.stdout.write(
                self.style.ERROR(f"{len(skipped)} handover(s) SKIPPED, unrepaired:")
            )
            for school_id, ey_id, reason in skipped:
                self.stdout.write(f"  school {school_id}, closed year {ey_id}: {reason}")
        if not total_drifted:
            self.stdout.write(self.style.SUCCESS("Nothing to repair anywhere."))
        elif apply_changes:
            self.stdout.write(
                self.style.SUCCESS(f"Repaired {total_drifted} opening balance(s).")
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN -- {total_drifted} opening balance(s) would change. "
                    "Re-run with --apply to write."
                )
            )

    def getHandovers(self, options):
        """[(school_id, closed_ey, next_ey)] to repair, oldest handover first."""
        if options.get("all_schools"):
            closed_years = AccountingEconomicYear.objects.filter(
                closed=True, next_eys__isnull=False
            ).order_by("school_id", "id")
        else:
            school_id = options.get("school")
            if not school_id:
                raise CommandError("Pass --school <id> or --all-schools.")
            closed_years = [
                self.getClosedYear(school_id, options.get("economic_year"))
            ]
        #
        handovers = []
        for closed_ey in closed_years:
            next_ey = AccountingEconomicYear.objects.filter(
                previous_ey=closed_ey.id
            ).first()
            if not next_ey:
                raise CommandError(
                    f"Closed year {closed_ey.id} ({closed_ey.name}) has no "
                    "following year, so there are no opening balances to repair."
                )
            handovers.append((closed_ey.school_id, closed_ey, next_ey))
        return handovers

    def repairHandover(
        self, school_id, closed_ey, next_ey, retained_override, tolerance, apply_changes
    ):
        retained_ledger_id = self.getRetainedEarningLedger(
            school_id, retained_override
        )
        self.stdout.write(
            f"\n=== School {school_id}: {closed_ey.name} (closed) -> "
            f"{next_ey.name} | retained-earning ledger {retained_ledger_id}"
        )

        expected = self.computeExpected(school_id, closed_ey, retained_ledger_id)
        current = {
            row["ledger_id"]: row
            for row in AccountingLedgerBalance.objects.filter(
                economic_year=next_ey.id
            ).values("id", "ledger_id", "opening_balance", "balance_type")
        }
        names = dict(
            AccountingLedger.objects.filter(school=school_id).values_list("id", "name")
        )

        drifted = self.report(expected, current, names, tolerance)
        self.reportInvariant(expected, current)
        if not drifted:
            self.stdout.write("  nothing to repair.")
            return 0
        if apply_changes:
            backup = self.writeBackup(school_id, closed_ey, next_ey, current)
            self.stdout.write(f"  backup -> {backup}")
            self.applyChanges(next_ey.id, drifted, current, expected)
            self.stdout.write(
                self.style.SUCCESS(f"  repaired {len(drifted)} ledger(s).")
            )
        return len(drifted)

    # ---
    def getClosedYear(self, school_id, ey_id):
        qs = AccountingEconomicYear.objects.filter(school=school_id, closed=True)
        if ey_id:
            closed_ey = qs.filter(id=ey_id).first()
            if not closed_ey:
                raise CommandError(
                    f"No closed accounting year {ey_id} for school {school_id}."
                )
            return closed_ey
        closed_ey = qs.filter(next_eys__isnull=False).order_by("-id").first()
        if not closed_ey:
            raise CommandError(f"School {school_id} has no closed year to repair.")
        return closed_ey

    def getRetainedEarningLedger(self, school_id, ledger_id):
        if ledger_id:
            return ledger_id
        candidates = list(
            AccountingLedger.objects.filter(
                is_active=True,
                school=school_id,
                ledger_group=RETAINED_EARNING_GROUP,
            ).values_list("id", "name")
        )
        if len(candidates) != 1:
            raise CommandError(
                f"Expected exactly one retained-earning ledger, found {candidates}. "
                "Pass --retained-earning-ledger explicitly."
            )
        return candidates[0][0]

    def computeExpected(self, school_id, closed_ey, retained_ledger_id):
        """Closing balances the closed year should have produced."""
        ledgers = AccountingLedger.objects.filter(is_active=True, school=school_id)
        ledgers = AccountingLedgerBalanceQueryMixin().getOpeningBalances(
            ledgers,
            closed_ey.id,
            include_economic_year_date=False,
            strict=False,
        )
        ledgers = ledgers.values("id", "ledger_group", "opening_balance", "balance_type")
        q = Q(
            entry__is_active=True,
            entry__school=school_id,
            entry__economic_year=closed_ey.id,
            entry__date__range=(closed_ey.start_date, closed_ey.end_date),
        )
        # strict=False: half-posted entries must not block a repair of data that
        # is already on disk; they are reported by the close endpoint instead.
        movements = getAllMovements(q, strict=False)
        balances = calculateClosingBalances(ledgers, movements, retained_ledger_id)
        return {b["ledger_id"]: b for b in balances}

    def report(self, expected, current, names, tolerance):
        drifted = []
        for lid, exp in expected.items():
            cur = current.get(lid)
            cur_amt = cur["opening_balance"] if cur else Decimal("0")
            cur_type = cur["balance_type"] if cur else None
            exp_amt = Decimal(exp["opening_balance"])
            if abs(exp_amt - cur_amt) <= tolerance and cur_type == exp["balance_type"]:
                continue
            if cur and abs(exp_amt) <= tolerance and abs(cur_amt) <= tolerance:
                # zero on both sides: a Dr/Cr flip on nothing carries no meaning
                continue
            drifted.append(lid)
            self.stdout.write(
                f"  {names.get(lid, lid)[:28]:<30}"
                f" stored {cur_amt:>18,.2f} {BALANCE_TYPES.get(cur_type, '--'):<3}"
                f" -> correct {exp_amt:>18,.2f} "
                f"{BALANCE_TYPES.get(exp['balance_type'], '--')}"
            )
        return drifted

    def reportInvariant(self, expected, current):
        """
        Carried-forward debits must equal credits. Any residual is inherited
        from opening balances that never balanced in the first place -- this
        repair preserves it rather than inventing a plug for it.
        """

        def sides(rows, amount_key, type_key):
            dr = sum(
                Decimal(r[amount_key]) for r in rows if r[type_key] == 1
            ) or Decimal("0")
            cr = sum(
                Decimal(r[amount_key]) for r in rows if r[type_key] == 2
            ) or Decimal("0")
            return dr, cr

        sd, sc = sides(current.values(), "opening_balance", "balance_type")
        ed, ec = sides(expected.values(), "opening_balance", "balance_type")
        self.stdout.write(
            f"  totals  stored  Dr {sd:>18,.2f}  Cr {sc:>18,.2f}  diff {sd - sc:>16,.2f}\n"
            f"          correct Dr {ed:>18,.2f}  Cr {ec:>18,.2f}  diff {ed - ec:>16,.2f}"
        )
        if abs(ed - ec) > Decimal("0.01"):
            self.stdout.write(
                self.style.WARNING(
                    f"  NOTE: corrected balances are still off by {ed - ec:,.2f}. "
                    "That imbalance is inherited from the closed year's own "
                    "opening balances and needs an accountant, not this command."
                )
            )

    def writeBackup(self, school_id, closed_ey, next_ey, current):
        stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        path = f"aey_opening_balances_backup_school{school_id}_ey{next_ey.id}_{stamp}.json"
        payload = {
            "school": school_id,
            "closed_economic_year": closed_ey.id,
            "next_economic_year": next_ey.id,
            "rows": [
                {
                    "id": row["id"],
                    "ledger_id": row["ledger_id"],
                    "opening_balance": str(row["opening_balance"]),
                    "balance_type": row["balance_type"],
                }
                for row in current.values()
            ],
        }
        with open(path, "w") as fh:
            json.dump(payload, fh, indent=2)
        return path

    def applyChanges(self, next_ey_id, drifted, current, expected):
        now = timezone.now()
        with transaction.atomic():
            to_update, to_create = [], []
            for lid in drifted:
                exp = expected[lid]
                cur = current.get(lid)
                if cur:
                    to_update.append(
                        AccountingLedgerBalance(
                            id=cur["id"],
                            opening_balance=exp["opening_balance"],
                            balance_type=exp["balance_type"],
                            updated_at=now,
                        )
                    )
                else:
                    to_create.append(
                        AccountingLedgerBalance(
                            ledger_id=lid,
                            economic_year_id=next_ey_id,
                            opening_balance=exp["opening_balance"],
                            balance_type=exp["balance_type"],
                        )
                    )
            if to_update:
                AccountingLedgerBalance.objects.bulk_update(
                    to_update, ["opening_balance", "balance_type", "updated_at"]
                )
            if to_create:
                AccountingLedgerBalance.objects.bulk_create(to_create)
