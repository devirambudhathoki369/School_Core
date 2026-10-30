import { Chip } from "@material-tailwind/react";
// ONE icon set for the whole product.
//
// `.icon` sets `stroke-[1.4]`, and a SOLID heroicon has no stroke to set — so a
// rail drawn from both sets rendered half its rows heavy and half light, and no
// amount of alignment made that column look deliberate. Everything here is
// outline. Every row also gets its OWN glyph: the superadmin rail had three
// rows sharing UserIcon and three sharing CalendarIcon, which turns an icon
// column into decoration instead of navigation.
import {
    ChatBubbleLeftRightIcon, CreditCardIcon, TableCellsIcon, IdentificationIcon, UserIcon, CakeIcon,
    SquaresPlusIcon, ChartPieIcon, QuestionMarkCircleIcon, AcademicCapIcon, BanknotesIcon,
    BellAlertIcon, ReceiptPercentIcon, DevicePhoneMobileIcon, BuildingLibraryIcon,
    CameraIcon, SwatchIcon, PaintBrushIcon,
    CheckBadgeIcon, QueueListIcon,
    CalendarIcon, ChartBarSquareIcon, DocumentMagnifyingGlassIcon,
    CircleStackIcon,
    ArchiveBoxIcon, CalculatorIcon, ChartBarIcon, ClipboardDocumentCheckIcon,
    ClipboardDocumentListIcon, Cog6ToothIcon, CpuChipIcon, CurrencyRupeeIcon,
    DocumentChartBarIcon, DocumentTextIcon, PencilSquareIcon, TruckIcon, UserGroupIcon,
    Squares2X2Icon, BuildingStorefrontIcon, CalendarDaysIcon, UserCircleIcon,
    MegaphoneIcon, BookOpenIcon, DocumentDuplicateIcon,
    ArrowUturnLeftIcon, ArrowPathRoundedSquareIcon, SparklesIcon,
    ArrowDownTrayIcon, PresentationChartLineIcon, ServerStackIcon, ShieldCheckIcon,
    UserPlusIcon, LifebuoyIcon,
    HomeModernIcon, KeyIcon, ClipboardIcon, WrenchScrewdriverIcon,
    ShoppingCartIcon, ShoppingBagIcon, WalletIcon, TagIcon,
} from "@heroicons/react/24/outline";
import { PERMISSIONS } from "./permissions";

/*
TODO: submenu with id: null must be managed in other ways!
*/

// The canteen's pages. The school's own rail files them under "Canteen"; a
// canteen user's rail (`canteenUserMenu` below) is these and nothing else.
const canteenPages = [
    { id: PERMISSIONS.CANTEEN.COUNTER, name: "Counter", prefix: <ShoppingCartIcon className="icon" />, view: 'counter' },
    { id: PERMISSIONS.CANTEEN.ITEMS, name: "Items & rates", prefix: <QueueListIcon className="icon" />, view: 'items' },
    { id: PERMISSIONS.CANTEEN.USE_TYPES, name: "Use types", prefix: <TagIcon className="icon" />, view: 'use-types' },
    { id: PERMISSIONS.CANTEEN.MONTHLY_POSTING, name: "Monthly posting", prefix: <CalendarDaysIcon className="icon" />, view: 'monthly-posting' },
    { id: PERMISSIONS.CANTEEN.COLLECT, name: "Collect & receipt", prefix: <BanknotesIcon className="icon" />, view: 'collect' },
    { id: PERMISSIONS.CANTEEN.ACCOUNTS, name: "Card accounts", prefix: <WalletIcon className="icon" />, view: 'accounts' },
    { id: PERMISSIONS.CANTEEN.REPORTS, name: "Canteen reports", prefix: <DocumentChartBarIcon className="icon" />, view: 'reports' },
    { id: PERMISSIONS.CANTEEN.SETUP, name: "Canteen setup", prefix: <Cog6ToothIcon className="icon" />, view: 'setup' },
    { id: PERMISSIONS.CANTEEN.USERS, name: "Canteen users", prefix: <UserPlusIcon className="icon" />, view: 'users' },
];

// 
const adminMenu = [
    {
        section: "Daily",
        // The dashboard is ONE page, so it is one row — a group that unfolds to
        // a single "Dashboard ▸ Dashboard" was a chevron in front of the most
        // used page in the portal. Its former companion, the classwise count,
        // is an enrollment report and now lives under Enrollment.
        id: PERMISSIONS.DASHBOARD.SUMMARY,
        name: "Dashboard", view: "dashboard",
        prefix: <ChartPieIcon className="icon" />,
    },
    {
        section: "Daily",
        // Attendance is a daily job, not a part of the mobile app: it lived
        // under "App" (#app.attendance.*, #app.rfid.*). Those addresses still
        // open -- they are kept as aliases in configs/views/admin.jsx.
        name: "Attendance", view: "attendance",
        prefix: <ClipboardDocumentCheckIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.ATTENDANCE.ENTRY, name: "Take student attendance", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'entry' },
            { id: PERMISSIONS.ATTENDANCE.MANAGEMENT, name: "Manage student attendance", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'management' },
            { id: PERMISSIONS.ATTENDANCE.REPORT, name: "Student attendance report", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'report' },
            { id: PERMISSIONS.ATTENDANCE.OVERALL_REPORT, name: "Student overall report", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'overall' },
            { id: PERMISSIONS.ATTENDANCE.HISTORY, name: "Student attendance history", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'history' },
            { id: PERMISSIONS.ATTENDANCE.ENTRY, name: "Take staff attendance", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'staff-entry' },
            { id: PERMISSIONS.ATTENDANCE.MANAGEMENT, name: "Manage staff attendance", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'staff-management' },
            { id: PERMISSIONS.ATTENDANCE.REPORT, name: "Staff attendance report", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'staff-report' },
            { id: PERMISSIONS.ATTENDANCE.HISTORY, name: "Staff attendance history", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'staff-history' },
            {
                id: null, name: "Card readers", prefix: <CpuChipIcon className="icon" />, view: 'rfid', submenu: [
                    { id: PERMISSIONS.RFID.USERS_SETUP, name: "Set up card users", prefix: <UserIcon className="icon" />, view: 'users-setup' },
                    { id: PERMISSIONS.RFID.REGISTERED_USERS, name: "Registered card users", prefix: <UserIcon className="icon" />, view: 'registered-users' },
                    { id: PERMISSIONS.RFID.ATTENDANCE_LOGS, name: "Punch log", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'attd-logs' },
                    // only shown when the superadmin enabled time_set_required
                    { id: PERMISSIONS.RFID.TIME_SET, name: "Attendance times", prefix: <CpuChipIcon className="icon" />, view: 'time-set', profileFlag: 'time_set_required' },
                ]
            },
        ]
    },
    {
        section: "Daily",
        name: "Fees & payments", view: 'payment',
        prefix: <CreditCardIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.STUDENT.PAYMENT, name: "Collect fees", prefix: <UserGroupIcon className="icon" />, view: 'student' },
            { id: PERMISSIONS.STUDENT.FAST_CASH_RECEIPT, name: "Fast cash receipt", prefix: <ReceiptPercentIcon className="icon" />, view: 'fast-cash-receipt' },
            { id: PERMISSIONS.STUDENT.REMINDER_BILLS, name: 'Reminder bills', prefix: <ReceiptPercentIcon className="icon" />, view: 'reminder-bills' },
            { id: PERMISSIONS.STUDENT.TAX_INVOICE, name: "Tax invoices", prefix: <ReceiptPercentIcon className="icon" />, view: 'tax-invoice' },
            { id: PERMISSIONS.STUDENT.LEDGER_POSTING, name: 'Ledger posting', prefix: <CalculatorIcon className="icon" />, view: 'ledger-posting' },
            { id: PERMISSIONS.STUDENT.DUES_POSTING, name: 'Old dues posting', prefix: <ReceiptPercentIcon className="icon" />, view: 'old-dues-posting' },
        ]
    },
    {
        section: "Daily",
        id: PERMISSIONS.COMMUNICATION.SMS.SEND_MESSAGES,
        name: "Absence SMS", view: 'send-sms-absent',
        prefix: <DevicePhoneMobileIcon className="icon" />,
    },
    {
        section: "Daily",
        // Every school has this row, and the header shortcut that goes with
        // it. A school with no bus yet is told on the page how its buses come
        // to be listed; which buses are a school's is the backend's to say.
        id: PERMISSIONS.MANAGE.BUS_TRACKING,
        name: "Bus tracking", view: "view-bus-tracking",
        prefix: <TruckIcon className="icon" />,
    },
    {
        section: "People",
        name: "Students & staff", view: "enrollment",
        prefix: <IdentificationIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.STUDENT.ENROLLMENT, name: "Students", prefix: <UserGroupIcon className="icon" />, view: 'student' },
            { id: PERMISSIONS.STAFF.ENROLLMENT, name: 'Staff', prefix: <UserIcon className="icon" />, view: 'staff' },
            { id: null, name: "Class promotion", prefix: <UserGroupIcon className="icon" />, view: 'class-promotion' },
            {
                name: "Bulk import & update", prefix: <QueueListIcon className="icon" />, view: 'bulk',
                submenu: [
                    { id: PERMISSIONS.STUDENT.ENROLLMENT, name: "Bulk enrollment", prefix: <UserGroupIcon className="icon" />, view: 'student-enrollments' },
                    { id: PERMISSIONS.STUDENT.UPDATE, name: "Bulk update", prefix: <UserGroupIcon className="icon" />, view: 'student-updates' },
                ]
            },
            { id: null, name: "Class-wise statistics", prefix: <ChartBarSquareIcon className="icon" />, view: 'classwise-student-statistics' },
        ]
    },
    {
        section: "People",
        name: "Match photos", view: 'student-photos',
        prefix: <CameraIcon className="icon" />,
    },
    {
        section: "Academics",
        name: "Exams & results", view: "exams",
        prefix: <AcademicCapIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.EXAM.SETUP, name: "Exams", prefix: <ClipboardDocumentListIcon className="icon" />, view: "setup" },
            { id: PERMISSIONS.EXAM.SCHEDULE_SETUP, name: "Exam schedule", prefix: <ClipboardDocumentListIcon className="icon" />, view: "schedule-setup" },
            { id: PERMISSIONS.EXAM.GRADING_RULES_SETUP, name: "Grading rules", prefix: <ClipboardDocumentListIcon className="icon" />, view: "grading-rules-setup" },
            { id: PERMISSIONS.EXAM.OPTIONAL_SUBJECT_ASSIGNMENT, name: "Optional subjects", prefix: <ClipboardDocumentListIcon className="icon" />, view: "optional-subject-assignment" },
            { id: PERMISSIONS.EXAM.ENTRY_CARDS, name: "Entry cards", prefix: <PencilSquareIcon className="icon" />, view: "entry-cards" },
            { id: PERMISSIONS.EXAM.SEAT_PLAN, name: "Seat plan", prefix: <PencilSquareIcon className="icon" />, view: "seat-plan" },
            { id: PERMISSIONS.EXAM.SEAT_PLAN, name: "Seat plan (old)", prefix: <PencilSquareIcon className="icon" />, view: "seat-plan-old" },
            { id: PERMISSIONS.EXAM.MARKS_ENTRY, name: "Marks entry", prefix: <PencilSquareIcon className="icon" />, view: "marks-entry" },
            { id: PERMISSIONS.EXAM.MARKS_ENTRY_SLIP, name: "Marks entry slip", prefix: <PencilSquareIcon className="icon" />, view: "marks-entry-slip" },
            { id: PERMISSIONS.EXAM.EXTRA_ACTIVITY_ENTRY, name: "Extra activities entry", prefix: <DocumentTextIcon className="icon" />, view: 'extra-activities-entry' },
            { id: PERMISSIONS.EXAM.RESULTS_PUBLISH, name: "Publish results", prefix: <DocumentChartBarIcon className="icon" />, view: "publish-results" },
            {
                id: PERMISSIONS.EXAM.VIEW_RESULTS,
                name: "Results", prefix: <DocumentChartBarIcon className="icon" />, view: "results", submenu: [
                    {
                        name: "Number system", prefix: <CalculatorIcon className="icon" />, view: 'number-system', submenu: [
                            { name: 'Class result (NS)', prefix: <DocumentChartBarIcon className="icon" />, view: 'class-result' },
                            { name: 'Marksheet (NS)', prefix: <DocumentChartBarIcon className="icon" />, view: 'marksheet' },
                            {
                                name: 'Final result (NS)', prefix: <CheckBadgeIcon className="icon" />, view: 'final', submenu: [
                                    { name: "Final class result (NS)", prefix: <DocumentChartBarIcon className="icon" />, view: 'class-result' },
                                    { name: "Final marksheet (NS)", prefix: <DocumentChartBarIcon className="icon" />, view: 'marksheet' },
                                ]
                            },
                        ]
                    },
                    {
                        name: "Letter grading system", prefix: <AcademicCapIcon className="icon" />, view: 'letter-grading-system', submenu: [
                            { name: 'Class result (LGS)', prefix: <DocumentChartBarIcon className="icon" />, view: 'class-result' },
                            { name: 'Gradesheet (LGS)', prefix: <DocumentChartBarIcon className="icon" />, view: 'gradesheet' },
                            {
                                name: 'Final result (LGS)', prefix: <CheckBadgeIcon className="icon" />, view: 'final', submenu: [
                                    { name: "Final class result (LGS)", prefix: <DocumentChartBarIcon className="icon" />, view: 'class-result' },
                                    { name: "Final gradesheet (LGS)", prefix: <DocumentChartBarIcon className="icon" />, view: 'gradesheet' },
                                ]
                            },
                        ]
                    },
                    { name: "Combined marksheet", prefix: <DocumentChartBarIcon className="icon" />, view: 'combined-marksheet' },
                    { name: "Final combined marksheet", prefix: <DocumentChartBarIcon className="icon" />, view: 'final-combined-marksheet' },
                ]
            },
            { id: PERMISSIONS.EXAM.CHARACTER_CERTIFICATE, name: "Character certificate", prefix: <CheckBadgeIcon className="icon" />, view: "character-certificate" },
            // { id: null, name: "Character Certificates", prefix: <CheckBadgeIcon className="icon" />, view: "character-certificates" },
        ]
    },
    {
        section: "Finance",
        name: "Accounting", view: 'accounting',
        prefix: <ReceiptPercentIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.ACCOUNTING.INCOME_ENTRY, name: "Income entry", prefix: <CalculatorIcon className="icon" />, view: 'income-entry' },
            { id: PERMISSIONS.ACCOUNTING.INCOME_ENTRIES, name: "Income entries", prefix: <CalculatorIcon className="icon" />, view: 'income-entries' },
            { id: PERMISSIONS.ACCOUNTING.EXPENSE_ENTRY, name: "Expense entry", prefix: <CalculatorIcon className="icon" />, view: 'expense-entry' },
            { id: PERMISSIONS.ACCOUNTING.EXPENSE_ENTRIES, name: "Expense entries", prefix: <CalculatorIcon className="icon" />, view: 'expense-entries' },
            { id: PERMISSIONS.ACCOUNTING.JOURNAL_ENTRY, name: "Journal entry", prefix: <CalculatorIcon className="icon" />, view: 'journal-entry' },
            { id: PERMISSIONS.ACCOUNTING.JOURNAL_ENTRIES, name: "Journal entries", prefix: <CalculatorIcon className="icon" />, view: 'journal-entries' },
            { id: PERMISSIONS.ACCOUNTING.LEDGER, name: "Create ledger", prefix: <CalculatorIcon className="icon" />, view: 'create-ledger' },
            { id: PERMISSIONS.ACCOUNTING.LEDGERS, name: "Ledgers", prefix: <CalculatorIcon className="icon" />, view: 'ledgers' },
            {
                id: null, name: "Reports", prefix: <ChartBarIcon className="icon" />, view: 'reports', submenu: [
                    { id: PERMISSIONS.ACCOUNTING.DAY_BOOK, name: "Day book", prefix: <CalendarDaysIcon className="icon" />, view: 'day-book' },
                    { id: PERMISSIONS.ACCOUNTING.INDIVIDUAL_LEDGER_REPORT, name: "Ledger statement", prefix: <CalculatorIcon className="icon" />, view: 'individual-ledger' },
                    { id: PERMISSIONS.ACCOUNTING.GROUPWISE_LEDGER_REPORT, name: "Group-wise ledgers", prefix: <CalculatorIcon className="icon" />, view: 'groupwise-ledger' },
                    { id: PERMISSIONS.ACCOUNTING.TRIAL_BALANCE, name: "Trial balance", prefix: <CalculatorIcon className="icon" />, view: 'trial-balance' },
                    { id: PERMISSIONS.ACCOUNTING.PROFIT_LOSS_REPORT, name: "Profit and loss", prefix: <CalculatorIcon className="icon" />, view: 'profit-loss' },
                    { id: PERMISSIONS.ACCOUNTING.BALANCE_SHEET, name: "Balance sheet", prefix: <CalculatorIcon className="icon" />, view: 'balance-sheet' },
                    { id: PERMISSIONS.ACCOUNTING.CASH_FLOW_STATEMENT, name: "Cash flow statement", prefix: <CalculatorIcon className="icon" />, view: 'cash-flow-statement' },
                ]
            },
            { id: PERMISSIONS.ACCOUNTING.ECONOMIC_YEAR, name: "Accounting year", prefix: <CalendarIcon className="icon" />, view: 'economic-year' },
            /* CONTRA ENTRY is not shipped. Its component exists
               (`views/accounting/contra_entry`) but the view is commented out in
               `configs/views/accounting.jsx`, so this row resolved to nothing
               and opened "COMING SOON!!!" for every school that had the
               permission. A menu row is a promise that a page is there; until
               both halves are switched on, neither is.
            { id: PERMISSIONS.ACCOUNTING.CONTRA_ENTRY, name: "Contra entry", prefix: <CalculatorIcon className="icon" />, view: 'contra-entry' },
            */
        ]
    },
    {
        section: "Finance",
        name: "Payroll", view: 'payroll',
        prefix: <BanknotesIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.STAFF.SALARY_POSTING, name: 'Salary posting', prefix: <BanknotesIcon className="icon" />, view: 'salary-posting' },
            { id: PERMISSIONS.STAFF.PAYMENT, name: "Staff payment", prefix: <BanknotesIcon className="icon" />, view: 'staff' },
            // One staff member's catch-up posting + ledger — formerly only the
            // "Staff Ledger" tab of Manage ▸ Users. Same permission as Salary
            // posting: it writes the same StaffLedger rows.
            { id: PERMISSIONS.STAFF.SALARY_POSTING, name: 'Staff ledger', prefix: <CalculatorIcon className="icon" />, view: 'staff-ledger' },
            { id: PERMISSIONS.STAFF.PAY_SLIPS, name: 'Pay slips', prefix: <BanknotesIcon className="icon" />, view: 'pay-slips' },
            { id: PERMISSIONS.STAFF.SALARY_SHEET, name: 'Salary sheet', prefix: <BanknotesIcon className="icon" />, view: 'salary-sheet' },
        ]
    },
    {
        section: "Finance",
        // EXTRA BILLING — the people a school bills who are NOT students: the
        // tenant of a shutter, a canteen contractor, an office renting a room.
        // `profileFlag` keeps the whole branch off the rail for a school the
        // superadmin has not granted it to; `configs/moduleGates.js` drops its
        // pages from the view map as well, and the backend refuses every
        // /extra-billing endpoint regardless (extra_billing/views/BaseViews.py).
        // Student billing lives in the Payment menu and is untouched by this.
        name: "Extra billing", view: 'extra-billing', profileFlag: 'uses_extra_billing',
        prefix: <BuildingStorefrontIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.EXTRA_BILLING.PARTIES, name: "Parties & charges", prefix: <UserGroupIcon className="icon" />, view: 'parties' },
            { id: PERMISSIONS.EXTRA_BILLING.BILLING, name: "Raise bills", prefix: <CalculatorIcon className="icon" />, view: 'billing' },
            { id: PERMISSIONS.EXTRA_BILLING.PAYMENT, name: "Collect & receipt", prefix: <BanknotesIcon className="icon" />, view: 'payment' },
            { id: PERMISSIONS.EXTRA_BILLING.REPORTS, name: "Records & dues", prefix: <DocumentChartBarIcon className="icon" />, view: 'reports' },
        ]
    },
    {
        section: "Facilities",
        name: "Library", view: 'library',
        prefix: <BuildingLibraryIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.LIBRARY.BOOK_TRANSACTION, name: "Issue & return", prefix: <BuildingLibraryIcon className="icon" />, view: 'book-transaction' },
            { id: PERMISSIONS.LIBRARY.BOOK_SETUP, name: "Books", prefix: <BuildingLibraryIcon className="icon" />, view: 'books' },
            { id: PERMISSIONS.LIBRARY.BOOK_SETUP, name: "Barcodes", prefix: <BuildingLibraryIcon className="icon" />, view: 'bar-codes' },
            {
                id: PERMISSIONS.LIBRARY.REPORTS, name: "Reports", prefix: <ChartBarIcon className="icon" />, view: 'reports', submenu: [
                    { name: "Member profile", prefix: <UserIcon className="icon" />, view: 'member-profile' },
                    { name: "Daily report", prefix: <ChartBarIcon className="icon" />, view: 'daily' },
                    { name: "Issued to students", prefix: <BuildingLibraryIcon className="icon" />, view: 'issued-by-students' },
                    { name: "Issued to teachers", prefix: <BuildingLibraryIcon className="icon" />, view: 'issued-by-teachers' },
                    { name: "Issued & returned count", prefix: <BuildingLibraryIcon className="icon" />, view: 'issued-returned-count' },
                    { name: "Overall report", prefix: <BuildingLibraryIcon className="icon" />, view: 'overall' },
                    { name: "Book operations", prefix: <BuildingLibraryIcon className="icon" />, view: 'book-operation' },
                    { name: "Fines", prefix: <ChartBarIcon className="icon" />, view: 'fine' },
                ]
            },
            { id: PERMISSIONS.LIBRARY.SETUP, name: "Library setup", prefix: <BuildingLibraryIcon className="icon" />, view: 'lib-setup' },
        ]
    },
    {
        section: "Facilities",
        // PER-SCHOOL MODULE. `profileFlag` drops this whole branch for a school
        // the superadmin has not granted the hostel to — and `configs/
        // moduleGates.js` drops its pages from the view map at the same time,
        // so an un-listed page is not merely un-listed. The backend refuses the
        // endpoints regardless; see hostel/views/BaseViews.py.
        name: "Hostel", view: 'hostel', profileFlag: 'uses_hostel',
        prefix: <HomeModernIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.HOSTEL.REPORTS, name: "Hostel overview", prefix: <ChartPieIcon className="icon" />, view: 'dashboard' },
            { id: PERMISSIONS.HOSTEL.ALLOCATION, name: "Residents", prefix: <UserGroupIcon className="icon" />, view: 'residents' },
            { id: PERMISSIONS.HOSTEL.ROOMS, name: "Rooms & beds", prefix: <Squares2X2Icon className="icon" />, view: 'rooms' },
            { id: PERMISSIONS.HOSTEL.ATTENDANCE, name: "Roll call", prefix: <ClipboardDocumentCheckIcon className="icon" />, view: 'attendance' },
            { id: PERMISSIONS.HOSTEL.LEAVE, name: "Gate passes", prefix: <KeyIcon className="icon" />, view: 'leaves' },
            { id: PERMISSIONS.HOSTEL.VISITORS, name: "Visitors", prefix: <UserPlusIcon className="icon" />, view: 'visitors' },
            { id: PERMISSIONS.HOSTEL.COMPLAINTS, name: "Complaints", prefix: <WrenchScrewdriverIcon className="icon" />, view: 'complaints' },
            { id: PERMISSIONS.HOSTEL.MESS, name: "Mess menu", prefix: <ClipboardIcon className="icon" />, view: 'mess' },
            { id: PERMISSIONS.HOSTEL.DISCIPLINE, name: "Discipline register", prefix: <ShieldCheckIcon className="icon" />, view: 'discipline' },
            { id: PERMISSIONS.HOSTEL.REPORTS, name: "Hostel reports", prefix: <ChartBarIcon className="icon" />, view: 'reports' },
            { id: PERMISSIONS.HOSTEL.SETUP, name: "Hostel setup", prefix: <Cog6ToothIcon className="icon" />, view: 'setup' },
        ]
    },
    {
        section: "Facilities",
        // CANTEEN — the school's own counter and its OWN billing: items with
        // class-wise monthly rates, use types and regular users, monthly
        // posting, item-wise collection and receipts, card accounts. Nothing
        // here touches the student fee bills.
        // Per-school, exactly like Extra Billing: `profileFlag` drops the
        // branch, `configs/moduleGates.js` drops its pages, and every /canteen
        // endpoint refuses a school without it (canteen/views/BaseViews.py).
        name: "Canteen", view: 'canteen', profileFlag: 'uses_canteen',
        prefix: <ShoppingBagIcon className="icon" />,
        submenu: canteenPages,
    },
    {
        section: "Facilities",
        name: "Inventory", view: 'inventory',
        prefix: <CircleStackIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.INVENTORY.ITEMS, name: "Items & categories", prefix: <ArchiveBoxIcon className="icon" />, view: 'items' },
            { id: PERMISSIONS.INVENTORY.PURCHASES, name: "Purchases", prefix: <ArchiveBoxIcon className="icon" />, view: 'purchases' },
            { id: PERMISSIONS.INVENTORY.ISSUES, name: "Issues", prefix: <ArchiveBoxIcon className="icon" />, view: 'issues' },
            { id: PERMISSIONS.INVENTORY.WASTAGE, name: "Wastage", prefix: <ArchiveBoxIcon className="icon" />, view: 'wastage' },
            { id: PERMISSIONS.INVENTORY.REPORTS, name: "Stock & reports", prefix: <ArchiveBoxIcon className="icon" />, view: 'report' },
        ]
    },
    {
        section: "Communication",
        name: "SMS & messages", view: "communication",
        prefix: <BellAlertIcon className="icon" />,
        submenu: [
            {
                id: null, name: "SMS", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'sms', submenu: [
                    { id: PERMISSIONS.COMMUNICATION.SMS.SETTINGS, name: "SMS settings", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'settings' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.TEMPLATES, name: "SMS templates", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'templates' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.BULK_SMS, name: "Bulk SMS", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'bulk-sms' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.STAFF_SMS, name: "SMS to staff", prefix: <UserGroupIcon className="icon" />, view: 'staff-sms' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.DUES_REMINDER, name: "Dues reminders", prefix: <ReceiptPercentIcon className="icon" />, view: 'dues-reminder' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.SEND_MESSAGES, name: "Messages", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'send-messages' },
                    { id: PERMISSIONS.COMMUNICATION.SMS.REPORT, name: "SMS report", prefix: <ChartBarIcon className="icon" />, view: 'report' },
                ]
            },
            { id: null, name: "App notifications", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'notifications' },
            { id: PERMISSIONS.COMMUNICATION.NOTICE.LETTER_TO_STUDENTS, name: "Letter to students", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'letter-to-students' },
            { id: null, name: "Birthday cards", prefix: <CakeIcon className="icon" />, view: 'birthday-cards' },
        ]
    },
    {
        section: "Communication",
        name: "Mobile app", view: "app",
        prefix: <DevicePhoneMobileIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.COMMUNICATION.NOTICE.CREATE, name: "Post a notice", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'notice' },
            { id: PERMISSIONS.COMMUNICATION.NOTICE.LIST, name: "Notices", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'notices', hidden: true },
            { id: PERMISSIONS.COMMUNICATION.NEWS.CREATE, name: "Post news & events", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'news-events' },
            { id: PERMISSIONS.COMMUNICATION.NEWS.LIST, name: "News & events", prefix: <ChatBubbleLeftRightIcon className="icon" />, view: 'news-events-view', hidden: true },
            { id: PERMISSIONS.COMMUNICATION.APP.SLIDE_IMAGES, name: "Slideshow images", prefix: <ChartBarIcon className="icon" />, view: 'slide-show-images' },
        ]
    },
    {
        section: "Insights",
        name: "Reports", view: 'reports',
        prefix: <TableCellsIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.REPORTS.RECENT_ENROLLMENTS, name: 'Recent enrollments', prefix: <UserGroupIcon className="icon" />, view: 'enrollments' },
            { id: PERMISSIONS.REPORTS.NEW_ADMISSIONS_REPORT, name: 'New admissions report', prefix: <UserGroupIcon className="icon" />, view: 'new-admissions-report' },
            { id: PERMISSIONS.REPORTS.ENROLLMENT_HISTORY, name: 'Enrollments history', prefix: <UserGroupIcon className="icon" />, view: 'enrollments-history' },
            { id: PERMISSIONS.REPORTS.STUDENTS_PROFILE_PRINT, name: "Student profiles (print)", prefix: <UserGroupIcon className="icon" />, view: 'students-profile-print' },
            { id: PERMISSIONS.REPORTS.ETHNIC_GROUP_REPORT, name: 'Ethnic group report', prefix: <UserGroupIcon className="icon" />, view: 'ethnic-group-report' },
            { id: PERMISSIONS.REPORTS.TRANSPORTATION_REPORT, name: 'Transportation history', prefix: <TruckIcon className="icon" />, view: 'transportation-history' },
            { id: null, name: "Homework report", prefix: <ChartBarIcon className="icon" />, view: 'homework-report' },
            { id: PERMISSIONS.REPORTS.RECENT_TRANSACTIONS, name: "Recent transactions", prefix: <DocumentTextIcon className="icon" />, view: 'recent-transactions' },
            { id: PERMISSIONS.REPORTS.TRANSACTIONS_HISTORY, name: 'Transactions history', prefix: <ChartBarIcon className="icon" />, view: 'transactions-history' },
            { id: PERMISSIONS.REPORTS.RECENT_POSTINGS, name: 'Recent postings', prefix: <DocumentTextIcon className="icon" />, view: 'recent-postings' },
            { id: PERMISSIONS.REPORTS.LEDGER_POSTING_HISTORY, name: "Ledger posting history", prefix: <CalculatorIcon className="icon" />, view: 'ledger-posting-history' },
            { id: PERMISSIONS.REPORTS.OVERALL_REMAINING_DUES, name: "Overall remaining dues", prefix: <ReceiptPercentIcon className="icon" />, view: 'overall-remaining-dues' },
            { id: PERMISSIONS.REPORTS.OVERALL_STUDENT_LEDGERS, name: "Overall student ledgers", prefix: <CalculatorIcon className="icon" />, view: 'overall-student-ledgers' },
            { id: PERMISSIONS.REPORTS.STUDENTS_BALANCE_RANGE_REPORT, name: "Students by balance range", prefix: <UserGroupIcon className="icon" />, view: 'students-balance-range' },
            { id: PERMISSIONS.REPORTS.OPENING_BALANCE_REPORT, name: 'Opening balance report', prefix: <ChartBarIcon className="icon" />, view: 'opening-balance-report' },
            { id: null, name: 'Income plan', prefix: <CalculatorIcon className="icon" />, view: 'income-plan' },
            { id: null, name: "Overall income plan", prefix: <CalculatorIcon className="icon" />, view: 'overall-income-plan' },
            { id: PERMISSIONS.REPORTS.DISCOUNTS_REPORT, name: 'Discount history', prefix: <ChartBarIcon className="icon" />, view: 'discount-history' },
            { id: null, name: "Payment discount report", prefix: <BanknotesIcon className="icon" />, view: 'payment-discount-report' },
            { id: PERMISSIONS.REPORTS.STAFF_DETAILS_REPORT, name: 'Staff details', prefix: <UserIcon className="icon" />, view: 'staff-details' },
            { id: null, name: "Invoices academic year mismatch", prefix: <ReceiptPercentIcon className="icon" />, view: 'invoices-academic-year-mismatch' },
            { id: null, name: "Ledgers academic year mismatch", prefix: <CalculatorIcon className="icon" />, view: 'ledgers-academic-year-mismatch' },
        ]
    },
    {
        section: "Setup",
        name: "School setup", view: "manage",
        prefix: <SquaresPlusIcon className="icon" />,
        submenu: [
            { id: PERMISSIONS.MANAGE.ACADEMIC_YEARS, name: "Academic year", prefix: <CalendarIcon className="icon" />, view: 'academic-year' },
            { id: null, name: "Academic calendar", prefix: <CalendarIcon className="icon" />, view: 'calendar-events' },
            { id: PERMISSIONS.MANAGE.CLASS_PERIODS, name: "Classes & periods", prefix: <AcademicCapIcon className="icon" />, view: 'classes' },
            { id: PERMISSIONS.MANAGE.SECTIONS, name: "Sections", prefix: <AcademicCapIcon className="icon" />, view: 'sections' },
            { id: PERMISSIONS.MANAGE.COURSES_SUBJECTS_PAGE, name: "Courses & subjects", prefix: <AcademicCapIcon className="icon" />, view: 'courses-subjects' },
            { id: PERMISSIONS.MANAGE.FEES, name: 'Fees', prefix: <CurrencyRupeeIcon className="icon" />, view: 'fees' },
            { id: PERMISSIONS.MANAGE.BUS_STATIONS, name: 'Bus stations', prefix: <TruckIcon className="icon" />, view: 'bus-stations' },
            { id: PERMISSIONS.MANAGE.EXTRA_ACTIVITIES, name: "Extra activities", prefix: <Cog6ToothIcon className="icon" />, view: 'extra-activities-setup' },
            { id: PERMISSIONS.MANAGE.BATCHES, name: 'Batches', prefix: <AcademicCapIcon className="icon" />, view: 'batches' },
            { id: null, name: "Users", prefix: <UserIcon className="icon" />, view: 'users' },
            { id: null, name: 'Academic year closing', prefix: <CalendarIcon className="icon" />, view: 'academic-year-closing' },
        ]
    },
    {
        section: "Help",
        name: "Help & support", view: 'support',
        prefix: <ChatBubbleLeftRightIcon className="icon" />,
        suffix: <Chip value="0" size="sm" variant="ghost" color="blue-gray" className="rounded-full m-0 p-0 bg-transparent" />
    },
    {
        section: "Help",
        name: "Guides", view: 'guides', prefix: <QuestionMarkCircleIcon className="icon" />
    },
    {
        section: "Help",
        name: "School profile", view: 'profile', prefix: <UserIcon className="icon" />
    },
    ...(
        process.env.NODE_ENV === 'development' ?
            [
                // DEV MENU HERE;
            ] :
            []
    )
];
// 
const superAdminMenu = [
    { section: "Overview", name: "Dashboard", view: 'dashboard', prefix: <ChartPieIcon className="icon" /> },
    {
        section: "Schools",
        name: "Setup", view: "setup",
        prefix: <Squares2X2Icon className="icon" />, submenu: [
            { name: "School/Admin", view: "client", prefix: <BuildingStorefrontIcon className="icon" /> },
            { name: "Economic Year", prefix: <CalendarDaysIcon className="icon" />, view: 'economic-year' },
            { name: "School Academic/Accounting Years", prefix: <CalendarIcon className="icon" />, view: 'school-fiscal-years' },
            { name: "Staff Roles", prefix: <UserCircleIcon className="icon" />, view: 'staff-roles' },
            { name: "RFID Devices", prefix: <CpuChipIcon className="icon" />, view: 'rfid-devices' },
            { name: "Splash Notice", view: 'splash', prefix: <MegaphoneIcon className="icon" /> },
            { name: "Education Levels", view: 'education-levels', prefix: <BookOpenIcon className="icon" /> },
            { name: "Grade sheet style", view: 'gradesheet-style', prefix: <SwatchIcon className="icon" /> },
            { name: "ID Card Design", view: 'idcard-design', prefix: <IdentificationIcon className="icon" /> },
            { name: "Shareholders", prefix: <UserGroupIcon className="icon" />, view: 'shareholders' },
            { name: "Library Access", prefix: <BuildingLibraryIcon className="icon" />, view: 'library-access' },
            { name: "Hostel Access", prefix: <HomeModernIcon className="icon" />, view: 'hostel-access' },
            { name: "Extra Billing Access", prefix: <BuildingStorefrontIcon className="icon" />, view: 'extra-billing-access' },
            { name: "Canteen Access", prefix: <ShoppingBagIcon className="icon" />, view: 'canteen-access' },
        ]
    },
    { section: "Schools", name: "Interface Theme", view: 'ui-theme', prefix: <PaintBrushIcon className="icon" /> },
    {
        section: "Schools",
        name: "ID Card", view: "cards",
        prefix: <IdentificationIcon className="icon" />,
        submenu: [
            { name: "Download", prefix: <ArrowDownTrayIcon className="icon" />, view: "download" }
        ]
    },
    {
        section: "Data",
        name: "Analysis", view: "analysis",
        prefix: <DocumentMagnifyingGlassIcon className="icon" />,
        submenu: [
            { name: "Statistics", prefix: <PresentationChartLineIcon className="icon" />, view: "statistics" },
            { name: 'Classwise old dues', prefix: <ReceiptPercentIcon className="icon" />, view: 'cw-old-dues' },
        ]
    },
    {
        section: "Data",
        name: "Database Backup", view: "database-backup",
        prefix: <ServerStackIcon className="icon" />
    },
    {
        section: "Data",
        name: "Manage", view: "manage",
        prefix: <Cog6ToothIcon className="icon" />, submenu: [
            { name: "Undo Academic Year Close", prefix: <ArrowUturnLeftIcon className="icon" />, view: 'undo-academic-year-close' },
            { name: "Undo Accounting Economic Year Close", prefix: <ArrowPathRoundedSquareIcon className="icon" />, view: 'undo-accounting-economic-year-close' },
            { name: "Clean Student Ledger posting", prefix: <SparklesIcon className="icon" />, view: 'clean-student-ledger-posting' },
        ]
    },
    { section: "Account", name: "My Password", view: 'my-password', prefix: <KeyIcon className="icon" /> },
    {
        section: "Account",
        name: "Help Centre", view: "help",
        prefix: <LifebuoyIcon className="icon" />, submenu: [
            { name: "Support Details", view: 'support', prefix: <ChatBubbleLeftRightIcon className="icon" /> },
            { name: "Guides", view: 'guides', prefix: <QuestionMarkCircleIcon className="icon" /> },
        ]
    },
    {
        section: "System",
        onlySuperuser: true,
        name: "Superuser", view: "superuser",
        prefix: <ShieldCheckIcon className="icon" />,
        submenu: [
            { name: "Setup Superadmin", view: "manage-superadmin", prefix: <UserPlusIcon className="icon" /> },
            { name: "Classes Academic Year Update", prefix: <DocumentDuplicateIcon className="icon" />, view: "classes-academic-year-update" },
            /**
             * manage superadmin;
             * see loggings;
             * and more;
             */
        ]
    },
];

/**
 * A CANTEEN USER's rail (`/canteen`): the canteen's pages laid out flat — they
 * have no other menu to file them under — each still addressed `canteen.<page>`,
 * so the same views open and the module gate (configs/moduleGates.js) still
 * covers them. Filtered by the user's own pages like a member of staff's.
 */
const canteenUserMenu = [
    ...canteenPages.map((page) => ({ ...page, view: `canteen.${page.view}` })),
    { name: "My Password", view: 'canteen.my-password', prefix: <KeyIcon className="icon" /> },
];

export { adminMenu, superAdminMenu, canteenUserMenu };
