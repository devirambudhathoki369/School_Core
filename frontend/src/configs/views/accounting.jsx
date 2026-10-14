import dynamic from "next/dynamic";

const AccountingEconomicYear = dynamic(() => import("@/components/views/accounting/accounting_economic_year"));
const AccountingEconomicYearClosing = dynamic(() => import("@/components/views/accounting/accounting_economic_year/closing"));
// 
const CreateLedger = dynamic(() => import(/* webpackChunkName: "accounting" */"@/components/views/accounting/create_ledger"));
const IncomeEntry = dynamic(() => import(/* webpackChunkName: "accounting" */"@/components/views/accounting/income_entry"));
const ExpenseEntry = dynamic(() => import(/* webpackChunkName: "accounting" */"@/components/views/accounting/expense_entry"));
const JournalEntry = dynamic(() => import(/* webpackChunkName: "accounting" */"@/components/views/accounting/journal_entry"));
// const ContraEntry = dynamic(() => import("@/components/views/accounting/contra_entry"));
// 
const RecentAccountingLedgers = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/create_ledger/recent_accounting_ledgers"));
const RecentIncomeEntries = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/income_entry/recent_income_entries"));
const RecentExpenseEntries = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/expense_entry/recent_expense_entries"));
const RecentJournalEntries = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/journal_entry/recent_journal_entries"));
// const RecentContraEntries = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/contra_entry/recent_contra_entries"));
const IndividualLedgerReport = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/ledger_reports/individual_lr"));
const GroupwiseLedgerReport = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/ledger_reports/groupwise_lr"));
const ProfitLossReport = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/profit_loss_report"));
const BalanceSheetReport = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/balance_sheet"));
const DayBook = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/day_book"));
const AccountingTrialBalance = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/trial_balance"));
const CashFlowReport = dynamic(() => import(/* webpackChunkName: "accounting-reports" */"@/components/views/accounting/reports/cash_flow"));

const accountingViews = {
    'accounting.economic-year': () => <AccountingEconomicYear />,
    'accounting.economic-year-closing': () => <AccountingEconomicYearClosing />,
    // 
    'accounting.create-ledger': () => <CreateLedger />,
    'accounting.income-entry': () => <IncomeEntry />,
    'accounting.expense-entry': () => <ExpenseEntry />,
    'accounting.journal-entry': () => <JournalEntry />,
    // 'accounting.contra-entry': ()=> <ContraEntry />,
    // accounting-reports
    'accounting.ledgers': () => <RecentAccountingLedgers />,
    'accounting.income-entries': () => <RecentIncomeEntries />,
    'accounting.expense-entries': () => <RecentExpenseEntries />,
    'accounting.journal-entries': () => <RecentJournalEntries />,
    // 'accounting.contra-entries': () => <RecentContraEntries />,
    // 
    'accounting.reports.individual-ledger': () => <IndividualLedgerReport />,
    'accounting.reports.groupwise-ledger': () => <GroupwiseLedgerReport />,
    'accounting.reports.day-book': () => <DayBook />,
    'accounting.reports.trial-balance': () => <AccountingTrialBalance />,
    'accounting.reports.profit-loss': () => <ProfitLossReport />,
    'accounting.reports.balance-sheet': () => <BalanceSheetReport />,
    'accounting.reports.cash-flow-statement': () => <CashFlowReport />,
};

export default accountingViews;