from django.db.models import (
    Q,
    F,
    Value,
    Subquery,
    Case,
    When,
    IntegerField,
    OuterRef,
    DecimalField,
    Sum,
    Min,
    CharField,
)

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.methods.getDateRange import getDateRange
from main.views.BaseViews import SecuredAPIView

#
from ...models.AccountingLedger import AccountingLedger
from ..AccountingLedgerView import AccountingLedgerBalanceQueryMixin
from ...models.Particulars import IncomeParticular, ExpenseParticular, JournalParticular
from .Entries import ENTRIES
from ...methods.ieTypes import get_ie_types, IE_TYPE_CASES  # noqa: F401
from ...constants.ledger_groups import (
    INCOME_ID,
    EXPENSE_ID,
)


class ReportKind:
    INDIVIDUAL = "individual"
    GROUPWISE = "groupwise"


class LedgerEntriesSearchMixin:
    MAJOR_LEDGER_GROUPS = ()
    RETURN_FIELDS = ("id", "ledger", "ledger_str")  # and type, amount!
    DETAILED = True  # includes date, voucher-id etc and is sorted!.

    def getLedgers(
        self,
        base_query,
        ledger_id,
        ledger_group_id,
        report_kind=None,  # 'individual' | 'groupwise' | None
        strict=True,
        balances=None,
    ):
        # strict=False, for individual & groupwise ledger reports only!
        # balances=opening_balances
        RETURN_FIELDS = [*self.RETURN_FIELDS]
        #
        particulars = []
        if ledger_id and report_kind == ReportKind.INDIVIDUAL:
            # this part-only for individual ledger report!
            ledger_balance = balances.get(ledger_id) or {}
            economic_year_date = ledger_balance.get("economic_year_date") or "-"
            particulars.append(
                {
                    "balance_type": ledger_balance.get("balance_type"),
                    "amount": ledger_balance.get("opening_balance") or 0,
                    "ledger_str": f"Opening balance on {economic_year_date}",
                }
            )
        elif report_kind == ReportKind.GROUPWISE and balances:
            # one opening row per ledger; a ledger carrying a balance belongs in
            # the report even when it saw no postings in the period.
            particulars.extend(
                {
                    "ledger": lid,
                    "ledger_group": bal.get("ledger_group"),
                    "ledger_str": bal.get("name"),
                    "balance_type": bal.get("balance_type"),
                    "amount": bal.get("opening_balance") or 0,
                }
                for lid, bal in balances.items()
            )
        # JOURNAL PARTICULARS
        particulars.extend(
            self.getParticulars(
                JournalParticular,
                base_query,
                [*RETURN_FIELDS, "type"],
                ENTRIES.JOURNAL_ENTRY,
                ledger_id,
                ledger_group_id,
                report_kind,
                strict,
            )
        )
        # INCOME & EXPENSE particulars!
        particulars.extend(
            self.getParticulars(
                IncomeParticular,
                base_query,
                RETURN_FIELDS,
                ENTRIES.INCOME_ENTRY,
                ledger_id,
                ledger_group_id,
                report_kind,
                strict,
                INCOME_ID,
            )
        )
        particulars.extend(
            self.getParticulars(
                ExpenseParticular,
                base_query,
                RETURN_FIELDS,
                ENTRIES.EXPENSE_ENTRY,
                ledger_id,
                ledger_group_id,
                report_kind,
                strict,
                EXPENSE_ID,
            )
        )
        return particulars

    def getParticulars(
        self,
        ParticularModel,
        par_query,
        RETURN_FIELDS,
        entry_type_id,
        ledger_id,
        ledger_group_id,
        report_kind=None,
        strict=True,
        entry_kind=None,
    ):
        if strict and not report_kind:
            # reports except individual/groupwise use this!!
            sq = Q()
            if ledger_id:
                sq = Q(ledger_id=ledger_id)
            elif isinstance(ledger_group_id, int):
                sq = Q(ledger__ledger_group=ledger_group_id)
            elif isinstance(ledger_group_id, (list, tuple, set)):
                sq = Q(ledger__ledger_group__in=ledger_group_id)
            par_query = par_query & sq

        qs = ParticularModel.objects.select_related("entry", "ledger").filter(par_query)
        qs = qs.annotate(ledger_group=F("ledger__ledger_group"))
        RETURN_FIELDS.append("ledger_group")
        #
        swapped = False
        is_ie = ParticularModel.__name__ in (
            "IncomeParticular",
            "ExpenseParticular",
        )
        #
        if is_ie and entry_kind:
            qs = qs.annotate(
                type=Case(
                    *IE_TYPE_CASES[entry_kind],
                    default=Value(None),
                    output_field=IntegerField(),
                )
            )
            RETURN_FIELDS.append("type")
        #
        if report_kind:
            part_sel = Q(pk__in=[])
            header_sel = Q(pk__in=[])
            #
            #
            if report_kind == ReportKind.INDIVIDUAL:
                qs = self.getSingleSide(qs, ledger_id)
                swapped = True
                #
                part_sel = Q(ledger_id=ledger_id)
                header_sel = Q(entry__ledger_id=ledger_id) if is_ie else Q(pk__in=[])
            elif report_kind == ReportKind.GROUPWISE:
                part_sel = Q(ledger__ledger_group__in=ledger_group_id)
                header_sel = (
                    Q(entry__ledger__ledger_group__in=ledger_group_id)
                    if is_ie
                    else Q(pk__in=[])
                )
                qs = qs.exclude(~part_sel)  # keep only rows in group
                if not is_ie:
                    qs = qs.annotate(
                        priority=Case(
                            When(part_sel, then=Value(0)),
                            default=Value(1),
                            output_field=IntegerField(),
                        )
                    ).order_by("priority")
            #
            entries_with = (
                ParticularModel.objects.filter(part_sel).values("entry_id").distinct()
            )
            qs = qs.filter(Q(entry_id__in=Subquery(entries_with)) | header_sel)
        #
        if self.DETAILED:
            qs = qs.annotate(
                date=F("entry__date"),
                entry_type=Value(entry_type_id),
            ).with_voucher_number()
            # `entry_id` lets a report row open the voucher it came from, so a
            # single line can be traced back to the full document behind it.
            RETURN_FIELDS.extend(["voucher_id", "date", "entry_type", "entry_id"])
            if not swapped:
                # individual report builds `narration` via getSingleSide's swap;
                # other detailed reports just carry the row's own remark.
                qs = qs.annotate(narration=F("remarks"))
            RETURN_FIELDS.append("narration")
        #
        if swapped:
            RETURN_FIELDS.append("display_amount")
        else:
            RETURN_FIELDS.append("amount")
        qs = qs.values(*RETURN_FIELDS)
        return qs

    def getSingleSide(self, qs, ledger_id):
        """Single-side counterparty

        Used in INDIVIDUAL report. Each row must have `type`: 1=DR, 2=CR.
        Works for Journal (native type) and Income/Expense (type annotated earlier).
        """
        # 1
        """
        - dr_cnt/cr_cnt -> detect “single side”.
        - single_type & single_ledger_id -> know which row is the lone side.
        - user_amt -> user's total in that entry (needed to swap in B-case).
        """
        entry_facts = (
            qs.filter(entry_id=OuterRef("entry_id"))
            .values("entry_id")
            .annotate(
                user_amt=Sum(
                    Case(
                        When(ledger_id=ledger_id, then=F("amount")),
                        default=Value(0),
                        output_field=DecimalField(max_digits=20, decimal_places=2),
                    )
                ),
                user_remarks=Min(
                    Case(
                        When(ledger_id=ledger_id, then=F("remarks")),
                        default=Value(None),
                        output_field=CharField(),
                    )
                ),
                dr_cnt=Sum(
                    Case(
                        When(type=1, then=Value(1)),
                        default=Value(0),
                        output_field=IntegerField(),
                    )
                ),
                cr_cnt=Sum(
                    Case(
                        When(type=2, then=Value(1)),
                        default=Value(0),
                        output_field=IntegerField(),
                    )
                ),
                dr_ledger=Min(
                    Case(
                        When(type=1, then=F("ledger_id")),
                        default=None,
                        output_field=IntegerField(),
                    )
                ),
                cr_ledger=Min(
                    Case(
                        When(type=2, then=F("ledger_id")),
                        default=None,
                        output_field=IntegerField(),
                    )
                ),
            )
            .annotate(
                single_type=Case(
                    When(dr_cnt=1, then=Value(1)),
                    When(cr_cnt=1, then=Value(2)),
                    default=Value(None),
                    output_field=IntegerField(),
                ),
                single_ledger_id=Case(
                    When(dr_cnt=1, then=F("dr_ledger")),
                    When(cr_cnt=1, then=F("cr_ledger")),
                    default=Value(None),
                    output_field=IntegerField(),
                ),
            )
        )
        #
        qs = qs.annotate(
            _single_type=Subquery(entry_facts.values("single_type")[:1]),
            _single_ledger_id=Subquery(entry_facts.values("single_ledger_id")[:1]),
            _user_amt=Subquery(entry_facts.values("user_amt")[:1]),
            _user_remarks=Subquery(entry_facts.values("user_remarks")[:1]),
        )

        # 2
        # case A: is lone side
        inA = Q(_single_type__isnull=False, _single_ledger_id=ledger_id)
        # case B: is not lone side
        inB = Q(_single_type__isnull=False) & ~Q(_single_ledger_id=ledger_id)

        qs = qs.filter(
            (inA & ~Q(ledger_id=ledger_id))
            | (inB & Q(ledger_id=F("_single_ledger_id")))
        )

        # 4 [SWAP for case B]
        qs = (
            qs.annotate(
                display_amount=Case(
                    When(inA, then=F("amount")),  # A → others keep own amounts
                    When(
                        inB & Q(ledger_id=F("_single_ledger_id")), then=F("_user_amt")
                    ),  # B → lone row uses user's amount
                    default=Value(0),
                    output_field=DecimalField(max_digits=20, decimal_places=2),
                ),
                narration=Case(
                    When(inA, then=F("remarks")),  # A → counterparty's own remark
                    When(
                        inB & Q(ledger_id=F("_single_ledger_id")),
                        then=F("_user_remarks"),
                    ),  # B → lone row shows the user ledger's remark
                    default=Value(""),
                    output_field=CharField(),
                ),
            )
            .filter(~Q(display_amount=0))
            .order_by("entry__date", "entry_id", "id")
        )

        return qs


class AccountingLedgerReportView(
    SecuredAPIView,
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    MAJOR_LEDGER_GROUPS = (3, 7)  # 3: bank account, 7: cash in hand

    def post(self, request):
        """
        [ledger_id and ledger-group-id] -> individual ledger report
        [ledger-group-id] -> groupwise ledger report
        """
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")  # accounting economic year
        ledger_id = request.data.get("ledger") or None
        ledger_group_id = request.data.get("ledger_group")
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        #
        if school_id and ledger_group_id and ecoy_id and start_date and end_date:
            date_range = getDateRange(start_date, end_date)
            base_q = Q(
                entry__is_active=True,
                entry__school=school_id,
                entry__economic_year=ecoy_id,
                entry__date__range=date_range,
            )
            #
            acq = Q(is_active=True, school=school_id)
            if ledger_id:
                acq &= Q(id=ledger_id)
            elif ledger_group_id:
                acq &= Q(ledger_group__in=ledger_group_id)
            acc_ledgers = AccountingLedger.objects.filter(acq)
            acc_ledgers = self.getOpeningBalances(acc_ledgers, ecoy_id, True)
            balances = acc_ledgers.values(
                "id",
                "name",
                "ledger_group",
                "balance_type",
                "opening_balance",
                "economic_year_date",
            )
            #
            report_kind = ReportKind.INDIVIDUAL if ledger_id else ReportKind.GROUPWISE
            data = self.getLedgers(
                base_q,
                ledger_id,
                ledger_group_id,
                report_kind,
                False,
                {led.pop("id"): led for led in balances},
            )
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST


"""
opening_balance handling:
- Individual & Groupwise ledger reports: done (rows carrying `balance_type` are
  opening positions, not transactions)
- Trial Balance: done, seeded from opening balances so ledgers with no postings
  still appear
- Balance Sheet & Cash Flow [Opening Cash]: already read opening balances
"""
