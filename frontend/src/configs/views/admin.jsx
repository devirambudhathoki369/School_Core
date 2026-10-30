import dynamic from 'next/dynamic';
// 
import SchoolSummary from "@/components/views/reports/dashboards/school/summary";
import ClasswiseStudentStatistics from "@/components/views/reports/dashboards/class/classwise_student_statistics";
// 
import StudentEnrollment from "@/components/views/enrollments/student";
const StaffEnrollment = dynamic(() => import("@/components/views/enrollments/staff"));
const ClassPromotion = dynamic(() => import("@/components/views/enrollments/class_promotion"));
import BulkStudentEnrollment from "@/components/views/enrollments/bulk/student_enroll";
import BulkStudentUpdate from "@/components/views/enrollments/bulk/student_update";
const BulkStudentPhotos = dynamic(() => import("@/components/views/enrollments/bulk/student_photos"));
// 
import StudentPayment from "@/components/views/payments/student";
const LedgerPosting = dynamic(() => import("@/components/views/payments/ledger_posting"));
const DuesPosting = dynamic(() => import("@/components/views/payments/dues_posting"));
const ReminderBills = dynamic(() => import("@/components/views/payments/reminder_bills"));
const TaxInvoices = dynamic(() => import("@/components/views/payments/tax_invoice"));
import FastCashReceipt from "@/components/views/payments/fast_cash_receipt";
// 
import ManageUsers from "@/components/views/managements/users";
import ManageTeachers from "@/components/views/managements/Teachers";
const AcademicYearManagementView = dynamic(() => import(/* webpackChunkName: "academic_year" */"@/components/views/managements/academic_year/AcademicYear"));
const AcademicYearClosing = dynamic(() => import(/* webpackChunkName: "academic_year" */"@/components/views/managements/academic_year/AcademicYearClosing"));
const AcademicYearReviewOrClose = dynamic(() => import(/* webpackChunkName: "academic_year" */"@/components/views/managements/academic_year/AcademicYearReviewOrClose"));
const AcademicCalendar = dynamic(() => import("@/components/views/managements/academic_year/AcademicCalendar"));
const Calendar = dynamic(() => import("@/components/calendar"));
const ManageSections = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/Sections"));
const ManageCoursesSubjects = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/courses_subjects"));
const ManageClasses = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/classes"));
const ManageFees = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/fees"));
const ManageBusStations = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/BusStations"));
const ManageExtraActivities = dynamic(() => import("@/components/views/managements/extra_activities"));
const ManageBatches = dynamic(() => import(/* webpackChunkName: "manage" */"@/components/views/managements/batches"));
// 
const RecentEnrollments = dynamic(() => import("@/components/views/reports/enrollments/students/recent_enrollments"));
const RecentTransactions = dynamic(() => import("@/components/views/reports/transactions/recent_transactions"));
const RecentPostings = dynamic(() => import("@/components/views/reports/recent_postings"));
const OverallIncomePlan = dynamic(() => import("@/components/views/reports/income_plan"));
const OpeningBalanceReport = dynamic(() => import("@/components/views/reports/opening_balance_report"));
const OverallRemainingDues = dynamic(() => import("@/components/views/reports/remaining_dues/OverallRemainingDues"));
const OverallStudentLedgers = dynamic(() => import("@/components/views/reports/overall_student_ledgers"));
const LedgerPostingHistoryView = dynamic(() => import("@/components/views/reports/recent_postings/history"));
const TransactionsHistory = dynamic(() => import("@/components/views/reports/transactions/transactions_history"));
const EnrollmentsHistory = dynamic(() => import("@/components/views/reports/enrollments/students/enrollments_history"));
const StaffDetailsReport = dynamic(() => import("@/components/views/reports/enrollments/staffs/staff_details"));
const NewAdmissionsReport = dynamic(() => import("@/components/views/reports/enrollments/students/new_admissions"));
const StudentsProfilePrint = dynamic(() => import("@/components/views/reports/enrollments/students/profile_print"));
const EthnicGroupReport = dynamic(() => import("@/components/views/reports/enrollments/students/ethnic_groups"));
const StudentsBalanceRange = dynamic(() => import("@/components/views/reports/students_balance_range"));
const TransportationHistory = dynamic(() => import("@/components/views/reports/transportation/history"));
const DiscountsHistory = dynamic(() => import("@/components/views/reports/discounts/history"));
const PaymentDiscountReport = dynamic(() => import("@/components/views/reports/discounts/payment_discount_report"));
const HomeworkReport = dynamic(() => import("@/components/views/reports/homework"));
const InvoicesAcademicYearMismatch = dynamic(() => import("@/components/views/reports/invoices_academic_year_mismatch"));
const LedgersAcademicYearMismatch = dynamic(() => import("@/components/views/reports/ledgers_academic_year_mismatch"));
// 
const StaffPayment = dynamic(() => import(/* webpackChunkName: "payroll" */"@/components/views/payments/staff"));
const SalaryPosting = dynamic(() => import(/* webpackChunkName: "payroll" */"@/components/views/payments/salary_posting"));
const RecentSlips = dynamic(() => import(/* webpackChunkName: "payroll" */"@/components/views/payments/staff/recent_slips"));
const StaffLedgerPage = dynamic(() => import(/* webpackChunkName: "payroll" */"@/components/views/payments/staff/staff_ledger"));
const SalarySheet = dynamic(() => import(/* webpackChunkName: "payroll" */"@/components/views/payments/staff/salary_sheet"));
// 
const AttendanceEntry = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance/entry"));
const AttendanceManagement = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance/manage"));
const AttendanceReport = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance_report"));
const OverallAttendance = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance_report/overall"));
const AttendanceHistory = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance_history"));
const StaffAttendanceHistory = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance_history/staff"));
const StaffAttendanceEntry = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance/staff_entry"));
const StaffAttendanceManagement = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance/staff_manage"));
const StaffAttendanceReport = dynamic(() => import(/* webpackChunkName: "attendance" */"@/components/views/app/attendance_report/staff"));
// 
const RFIDUsersSetup = dynamic(() => import("@/components/views/rfid/users"));
const RFIDAttdUsersSearchView = dynamic(() => import("@/components/views/rfid/users/search"));
const RFIDAttendanceLogsView = dynamic(() => import("@/components/views/rfid/logs"));
const RFIDTimeSetView = dynamic(() => import("@/components/views/rfid/time_set"));
// 
const NoticePage = dynamic(() => import("@/components/views/app/notice"));
const NoticeListView = dynamic(() => import("@/components/views/app/notice/list_view"));
const NewsEvents = dynamic(() => import("@/components/views/app/news_events"));
const NewsEventsListView = dynamic(() => import("@/components/views/app/news_events/list_view"));
const SlideShowImages = dynamic(() => import("@/components/views/app/slide_show_images"));
// 
const SMSSettings = dynamic(() => import("@/components/views/communication/sms/settings"));
const SMSTemplate = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/templates"));
const SendBulkSMS = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/bulk_sms"));
const SendStaffSMS = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/staff_sms"));
const SMSDuesReminder = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/dues_reminder"));
const SendMessages = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/send_messages"));
const SMSReport = dynamic(() => import(/* webpackChunkName: "sms" */"@/components/views/communication/sms/report"));
const LetterToStudents = dynamic(() => import("@/components/views/communication/letter_to_students"));
const BirthdayCards = dynamic(() => import("@/components/views/communication/birthday_cards"));
const SendNotification = dynamic(() => import(/* webpackChunkName: "notifications" */"@/components/views/communication/notifications"));
// 
import examViews from "./exam";
import accountingViews from "./accounting";
import inventoryViews from "./inventory";
import libraryViews from "./library";
import hostelViews from "./hostel";
import extraBillingViews from "./extra_billing";
import canteenViews from "./canteen";
// 
const Support = dynamic(() => import("@/components/views/support"));
const Guides = dynamic(() => import("@/components/views/guides"));
const SchoolProfile = dynamic(() => import("@/components/views/profiles/school"));

const BusTracking = dynamic(() => import("@/components/views/bus_tracking"));

const adminViews = {
    'view-bus-tracking': () => <BusTracking />,
    // dashboard
    'dashboard': () => <SchoolSummary />,
    /*
    The two addresses these pages used to answer to. Bookmarks, the browser's
    history and any link mailed out before this reshuffle carry
    `#dashboard.summary` / `#dashboard.classwise-student-statistics`; without
    these they would land on "That page isn't here". They are views only — no
    menu row points at them.
    */
    'dashboard.summary': () => <SchoolSummary />,
    'dashboard.classwise-student-statistics': () => <ClasswiseStudentStatistics />,
    // enrollment
    'enrollment.student': () => <StudentEnrollment />,
    'enrollment.classwise-student-statistics': () => <ClasswiseStudentStatistics />,
    'enrollment.staff': () => <StaffEnrollment />,
    'enrollment.transfer': null,
    'enrollment.class-promotion': () => <ClassPromotion />,
    // enrollment.bulk
    'enrollment.bulk.student-enrollments': () => <BulkStudentEnrollment />,
    'enrollment.bulk.student-updates': () => <BulkStudentUpdate />,
    // top-level photo matching (always visible — staff don't need a permission)
    'student-photos': () => <BulkStudentPhotos />,
    // payment
    'payment.student': () => <StudentPayment />,
    'payment.ledger-posting': () => <LedgerPosting key={'payment.ledger-posting'} />,
    'payment.old-dues-posting': () => <DuesPosting />,
    'payment.reminder-bills': () => <ReminderBills />,
    'payment.tax-invoice': () => <TaxInvoices />,
    'payment.fast-cash-receipt': () => <FastCashReceipt />,
    // 
    'payroll.staff': () => <StaffPayment />,
    'payroll.salary-posting': () => <SalaryPosting />,
    'payroll.staff-ledger': () => <StaffLedgerPage />,
    'payroll.pay-slips': () => <RecentSlips />,
    'payroll.salary-sheet': () => <SalarySheet />,
    // management
    'manage.users': () => <ManageUsers />,
    'manage.academic-year': () => <AcademicYearManagementView />,
    'manage.academic-year-closing': () => <AcademicYearClosing />,
    'manage.academic-year-review': () => <AcademicYearReviewOrClose />,
    'manage.calendar-events': () => <AcademicCalendar />,
    'academic-calendar': () => <Calendar />,
    'manage.classes': () => <ManageClasses />,
    'manage.sections': () => <ManageSections />,
    'manage.teachers': () => <ManageTeachers />,
    'manage.courses-subjects': () => <ManageCoursesSubjects />,
    'manage.students': null,
    'manage.fees': () => <ManageFees />,
    'manage.exams': null,
    'manage.roles': null,
    'manage.staffs': null,
    'manage.results': null,
    'manage.vehicles': null,
    'manage.bus-stations': () => <ManageBusStations />,
    'manage.notices': null,
    'manage.applications': null,
    'manage.extra-activities-setup': () => <ManageExtraActivities />,
    'manage.batches': () => <ManageBatches />,
    // exam and result
    ...examViews,
    // reports
    'reports.enrollments': () => <RecentEnrollments />,
    'reports.recent-transactions': () => <RecentTransactions />,
    'reports.recent-postings': () => <RecentPostings />,
    'reports.income-plan': () => <LedgerPosting key={'reports.income-plan'} allowPost={false} />,
    'reports.overall-income-plan': () => <OverallIncomePlan />,
    'reports.opening-balance-report': () => <OpeningBalanceReport />,
    'reports.overall-remaining-dues': () => <OverallRemainingDues />,
    'reports.overall-student-ledgers': () => <OverallStudentLedgers />,
    'reports.ledger-posting-history': () => <LedgerPostingHistoryView />,
    'reports.transactions-history': () => <TransactionsHistory />,
    'reports.enrollments-history': () => <EnrollmentsHistory />,
    'reports.staff-details': () => <StaffDetailsReport />,
    'reports.new-admissions-report': () => <NewAdmissionsReport />,
    'reports.students-profile-print': () => <StudentsProfilePrint />,
    'reports.ethnic-group-report': () => <EthnicGroupReport />,
    'reports.students-balance-range': () => <StudentsBalanceRange />,
    'reports.transportation-history': () => <TransportationHistory />,
    'reports.discount-history': () => <DiscountsHistory />,
    'reports.payment-discount-report': () => <PaymentDiscountReport />,
    'reports.homework-report': () => <HomeworkReport />,
    'reports.invoices-academic-year-mismatch': () => <InvoicesAcademicYearMismatch />,
    'reports.ledgers-academic-year-mismatch': () => <LedgersAcademicYearMismatch />,
    // accounting
    ...accountingViews,
    // inventory
    ...inventoryViews,
    // library
    ...libraryViews,
    // hostel (per-school module — see configs/moduleGates.js)
    ...hostelViews,
    // extra billing — people who are not students (per-school module)
    ...extraBillingViews,
    // canteen (per-school module — see configs/moduleGates.js)
    ...canteenViews,
    // 
    'app.attendance.entry': () => <AttendanceEntry />,
    'app.attendance.management': () => <AttendanceManagement />,
    'app.attendance.report': () => <AttendanceReport />,
    'app.attendance.overall': () => <OverallAttendance />,
    'app.attendance.history': () => <AttendanceHistory />,
    'app.attendance.staff-entry': () => <StaffAttendanceEntry />,
    'app.attendance.staff-management': () => <StaffAttendanceManagement />,
    'app.attendance.staff-report': () => <StaffAttendanceReport />,
    'app.attendance.staff-history': () => <StaffAttendanceHistory />,
    'app.rfid.users-setup': () => <RFIDUsersSetup />,
    'app.rfid.registered-users': () => <RFIDAttdUsersSearchView />,
    'app.rfid.attd-logs': () => <RFIDAttendanceLogsView />,
    'app.rfid.time-set': () => <RFIDTimeSetView />,
    'app.notice': () => <NoticePage />,
    'app.notices': () => <NoticeListView />,
    'app.news-events': () => <NewsEvents />,
    'app.news-events-view': () => <NewsEventsListView />,
    'app.slide-show-images': () => <SlideShowImages />,
    // 
    'communication.birthday-cards': () => <BirthdayCards />,
    'communication.sms.settings': () => <SMSSettings />,
    'communication.sms.templates': () => <SMSTemplate />,
    'communication.sms.bulk-sms': () => <SendBulkSMS />,
    'communication.sms.staff-sms': () => <SendStaffSMS />,
    'communication.sms.dues-reminder': () => <SMSDuesReminder />,
    'communication.notifications': () => <SendNotification />,
    'communication.sms.send-messages': () => <SendMessages />,
    'communication.sms.report': () => <SMSReport />,
    // also surfaced as a top-level "Send SMS for absent students" menu
    'send-sms-absent': () => <SendMessages />,
    'communication.letter-to-students': () => <LetterToStudents />,
    //
    'support': () => <Support />,
    'guides': () => <Guides />,
    'profile': () => <SchoolProfile />
};
export default adminViews;
