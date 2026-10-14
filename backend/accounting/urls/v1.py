from django.urls import path

#
from ..views.AccountingEconomicYearView import AccountingEconomicYearView
from ..views.AccountingLedgerView import AccountingLedgerView
from ..views.IncomeEntryView import IncomeEntryView
from ..views.ExpenseEntryView import ExpenseEntryView
from ..views.JournalEntryView import JournalEntryView
from ..views.ContraEntryView import ContraEntryView

#
from ..views.search.LedgersSearchView import LedgersSearchView
from ..views.search.EntriesSearchView import EntriesSearchView

#
from ..views.reports.AccountingLedgerReportView import AccountingLedgerReportView
from ..views.reports.TrialBalanceView import TrialBalanceView
from ..views.reports.DayBookView import DayBookView
from ..views.reports.ProfitLossReportView import ProfitLossReportView
from ..views.reports.BalanceSheetReportView import BalanceSheetReportView
from ..views.reports.CashFlowReportView import CashFlowReportView
from ..views.closing.AEYCloseView import AEYCloseView
from ..views.closing.UndoAEYCloseView import UndoAEYCloseView

# /accounting + ...
urlpatterns = [
    path(
        "economic_year",
        AccountingEconomicYearView.as_view(),
        name="accounting economic year",
    ),
    path(
        "economic_year/closing",
        AEYCloseView.as_view(),
        name="accounting economic year closing",
    ),
    path(
        "economic_year/closing/undo",
        UndoAEYCloseView.as_view(),
        name="undo accounting economic year close",
    ),
    path("ledgers", AccountingLedgerView.as_view(), name="accounting ledgers view"),
    path("income_entry", IncomeEntryView.as_view(), name="income entries"),
    path("expense_entry", ExpenseEntryView.as_view(), name="expense entries"),
    path("journal_entry", JournalEntryView.as_view(), name="journal entries"),
    path("contra_entry", ContraEntryView.as_view(), name="contra entries"),
    # search
    path("search/ledgers", LedgersSearchView.as_view(), name="search ledgers"),
    path("search/entries", EntriesSearchView.as_view(), name="search entries"),
    # reports
    path(
        "reports/ledger_report",
        AccountingLedgerReportView.as_view(),
        name="individual and groupwise ledger reports",
    ),
    path(
        "reports/day_book",
        DayBookView.as_view(),
        name="accounting day book",
    ),
    path(
        "reports/trial_balance",
        TrialBalanceView.as_view(),
        name="accounting trial balance",
    ),
    path(
        "reports/profit_loss",
        ProfitLossReportView.as_view(),
        name="profit loss accounting report",
    ),
    path(
        "reports/balance_sheet",
        BalanceSheetReportView.as_view(),
        name="balance sheet accounting report",
    ),
    path(
        "reports/cash_flow",
        CashFlowReportView.as_view(),
        name="cash flow accounting report",
    ),
]
