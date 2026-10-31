from django.urls import path

#
from ..views.search.FeeSearchView import FeeSearchView
from ..views.search.LedgerPostingSearchView import LedgerPostingSearchView
from ..views.search.StudentSearchView import StudentSearchView
from ..views.search.OverallStudentLedgersSearchView import (
    OverallStudentLedgersSearchView,
)
from ..views.search.TransactionsSearchView import TransactionsSearchView
from ..views.search.StaffSearchView import StaffSearchView
from ..views.search.InvoicesAcademicYearMismatchSearchView import (
    InvoicesAcademicYearMismatchView,
)
from ..views.search.LedgersAcademicYearMismatchSearchView import (
    LedgersAcademicYearMismatchView,
)
from ..views.search.CertificateSearchView import CharacterCertificateSearchView

#
from ..views.school.SchoolDashView import SchoolDashView, SchoolAttendanceTodayView
from ..views.school.ClasswiseStudentStatisticsView import ClasswiseStudentStatisticsView
from ..views.school.EthnicGroupReportView import EthnicGroupReportView
from ..views.school.UpcomingBirthdaysView import UpcomingBirthdaysView
from ..views.school.BirthdayTemplateView import (
    BirthdayTemplateView,
    BirthdayTemplateBackgroundView,
)
from ..views.school.SchoolsView import SchoolsView, SchoolImageView
from ..views.school.PublicProfileViews import DigitalIdCodeView, PublicProfileView
from ..views.school.SchoolAdminView import SchoolAdminView
from ..views.StudentViews import StudentsView, StudentDiscountView
from ..views.StaffViews import StaffRoleView, StaffView
from ..views.StudentTransportationView import StudentTransportationView
from ..views.StudentMedicalInfoView import StudentMedicalInfoView
from ..views.StudentBulkPhotoView import StudentBulkPhotoView
from ..views.PendingStudentPhotoView import PendingStudentPhotoView

#
from ..views.FeeViews import FeeTitleView, FeeView
from ..views.LedgerViews import LedgerView
from ..views.TaxInvoiceViews import TaxInvoiceView
from ..views.search.LedgerPostingHistoryView import LedgerPostingHistoryView
from ..views.superadmin.LedgersManageViews import LedgerManageView
from ..views.LedgerViewsStaff import StaffLedgerView
from ..views.InvoiceViews import InvoiceViews
from ..views.InvoiceViewsStaff import StaffInvoiceView
from ..views.school.RemainingDuesView import RemainingDuesView
from ..views.reports.PaymentDiscountReportView import PaymentDiscountReportView
from ..views.reports.OverallIncomePlanView import OverallIncomePlanView
from ..views.reports.HomeworkReportView import HomeworkReportView

#
from ..views.BusStationViews import BusStationView
from ..views.BusTrackingView import BusTrackingView, BusTrackingHistoryView
from ..views.ClassViews import ClassViews
from ..views.ClassPeriodViews import ClassPeriodView
from ..views.SectionViews import SectionView
from ..views.CourseViews import CourseView
from ..views.BatchViews import BatchView
from ..views.SubjectViews import SubjectView
from ..views.FiscalYearViews import (
    EconomicYearView,
    AcademicYearView,
    AcademicYearMappingView,
)
from ..views.closing.AcademicYearCloseView import AcademicYearCloseView
from ..views.closing.UndoAcademicYearClosingView import UndoAcademicYearClosingView
from ..views.closing.PayrollYearCloseView import PayrollYearCloseView

#
from ..views.AttendanceViews import ClassAttendanceView
from ..views.StaffAttendanceView import StaffAttendanceView
from ..views.MyAttendanceView import MyAttendanceReportView
from ..views.AttendanceHistoryView import AttendanceHistoryView
from ..views.AttendanceTimeSetView import AttendanceTimeSetView
from ..views.search.AttendanceSearchView import (
    AttendanceSearchView,
    StaffAttendanceSearchView,
)
from ..views.NoticeViews import NoticeView
from ..views.NewsEventViews import NewsEventView
from ..views.CalendarEventViews import CalendarEventView
from ..views.reports.ClasswiseOldDues import ClasswiseOldDuesView
from ..views.HomeworkViews import HomeworkView, HomeworkSubmissionView

#
from ..views.alerts.BusAlertViews import BusAlertSettingsPostView
from ..views.notifications.SendNotificationView import (
    SendNotificationView,
    NotificationHistoryView,
)
from ..views.notifications.MyNotificationsView import MyNotificationsView

#
from ..views.exams.ExamViews import ExamView
from ..views.exams.ScheduleViews import ExamScheduleView
from ..views.exams.ResultViews import ResultView
from ..views.exams.GradingRulesViews import GradingRulesView
from ..views.exams.OptionalSubjectAssignmentViews import OptionalSubjectAssignmentView
from ..views.exams.ExtraActivityViews import ExtraActivityView, ExtraActivityEntryView
from ..views.exams.CertificateViews import CharacterCertificateView
from ..views.exams.SeatPlanView import (
    SeatPlanView,
    SeatPlanGenerateView,
    SeatPlanListView,
    SeatPlanCopyView,
    SeatPlanClearView,
    SeatPlanRoomsView,
    SeatPlanRoomSidesView,
    SeatPlanSeatingView,
)
from ..views.inventory.InventoryViews import (
    InventoryCategoryView,
    InventoryItemView,
    InventoryTransactionView,
    InventoryReportView,
)

#
from ..views.sms.SMSViews import SMSView
from ..views.sms.SMSTemplateViews import SMSTemplateViews
from ..views.sms.SendBulkSMSView import SendBulkSMSView
from ..views.sms.SendStaffSMSView import SendStaffSMSView
from ..views.sms.SendDuesSMSView import SendDuesSMSView
from ..views.sms.SendAbsentSMSView import AbsentSMSView
from ..views.sms.SMSReportView import SMSReportView

#
from ..views.superadmin.MessagesFromOrgView import MessagesFromOrgView
from ..views.superadmin.SplashNoticeView import SplashNoticeView, ActiveSplashView
from ..views.superadmin.ShareholderView import ShareholderView
from ..views.superadmin.HelpContentView import (
    PublicSupportInfoView,
    SupportInfoView,
    GuideCategoryView,
    GuideView,
)
from ..views.AppListingViews import PublicAppListingView, AppListingView
from ..views.superadmin.IDCardTemplateView import (
    IDCardTemplateView,
    ManageIDCardTemplatesView,
    IDCardTemplateBackgroundView,
)
from ..views.superadmin.DocumentStyleView import (
    DocumentStyleView,
    ManageDocumentStylesView,
    CopyDocumentStyleView,
)
from ..views.superadmin.UiThemeView import ManageUiThemesView
from ..views.superadmin.SchoolEducationLevelView import (
    SchoolHiddenEducationLevelsView,
    ManageSchoolEducationLevelsView,
)
from ..views.superadmin.DatabaseBackupView import DatabaseBackupView

# /api + ...
urlpatterns = [
    # fiscal years : economic-year, academic-year
    path("academic_year", AcademicYearView.as_view(), name="school academic years"),
    path(
        "assign/academic_year",
        AcademicYearMappingView.as_view(),
        name="assign faculty wise academic year",
    ),
    path(
        "academic_year/closing",
        AcademicYearCloseView.as_view(),
        name="school's academic year closing",
    ),
    path(
        "academic_year/closing/undo",
        UndoAcademicYearClosingView.as_view(),
        name="undo academic year closing",
    ),
    path("economic_year", EconomicYearView.as_view(), name="economic years"),
    path("dashboard", SchoolDashView.as_view(), name="school dashboard"),
    path(
        "dashboard/attendance-today",
        SchoolAttendanceTodayView.as_view(),
        name="school attendance today",
    ),
    path(
        "classwise_student_statistics",
        ClasswiseStudentStatisticsView.as_view(),
        name="classwise student statistics",
    ),
    path(
        "ethnic_group_report",
        EthnicGroupReportView.as_view(),
        name="ethnic group report",
    ),
    path(
        "<str:role>/upcoming_birthdays",
        UpcomingBirthdaysView.as_view(),
        name="get upcoming birthdays",
    ),
    path("admins", SchoolAdminView.as_view(), name="school admins"),
    path("schools", SchoolsView.as_view(), name="schools"),
    path("digital_id_codes", DigitalIdCodeView.as_view(), name="the codes on digital id links"),
    path(
        "public_profile",
        PublicProfileView.as_view(),
        name="school public profile for qr",
    ),
    path("school/images", SchoolImageView.as_view(), name="school images"),
    path("students", StudentsView.as_view(), name="students"),
    path(
        "students/transportations",
        StudentTransportationView.as_view(),
        name="student transportations",
    ),
    path("students/discounts", StudentDiscountView.as_view(), name="student discounts"),
    path(
        "students/medical",
        StudentMedicalInfoView.as_view(),
        name="student medical info",
    ),
    path(
        "students/bulk-photos",
        StudentBulkPhotoView.as_view(),
        name="student bulk photos",
    ),
    path(
        "students/pending-photos",
        PendingStudentPhotoView.as_view(),
        name="student pending photos pool",
    ),
    path("classes", ClassViews.as_view(), name="classes"),
    path("classes/periods", ClassPeriodView.as_view(), name="class details"),
    # staffs
    path("staffs/roles", StaffRoleView.as_view(), name="staff roles"),
    path("staffs", StaffView.as_view(), name="staffs"),
    # others
    path("sections", SectionView.as_view(), name="sections"),
    path("courses", CourseView.as_view(), name="courses"),
    path("batches", BatchView.as_view(), name="batches"),
    path("subjects", SubjectView.as_view(), name="subjects"),
    path("stations", BusStationView.as_view(), name="bus stations"),
    path("bus-tracking", BusTrackingView.as_view(), name="web bus tracking"),
    path("bus-tracking/history", BusTrackingHistoryView.as_view(), name="school bus history"),
    path("attendance", ClassAttendanceView.as_view(), name="attendance"),
    path("attendance/staff", StaffAttendanceView.as_view(), name="staff attendance"),
    path(
        "attendance/me",
        MyAttendanceReportView.as_view(),
        name="my attendance report",
    ),
    path(
        "attendance/time-set",
        AttendanceTimeSetView.as_view(),
        name="attendance time set",
    ),
    path(
        "attendance/history",
        AttendanceHistoryView.as_view(),
        name="attendance history",
    ),
    path(
        "search/attendance/staff",
        StaffAttendanceSearchView.as_view(),
        name="staff attendance search",
    ),
    path("search/attendance", AttendanceSearchView.as_view(), name="attendance search"),
    path("notices", NoticeView.as_view(), name="notice"),
    path("news_events", NewsEventView.as_view(), name="news events"),
    path("calendar_events", CalendarEventView.as_view(), name="calendar events"),
    path("homeworks", HomeworkView.as_view(), name="homework"),
    path(
        "homeworks/submission",
        HomeworkSubmissionView.as_view(),
        name="homework submissions",
    ),
    path(
        "classwiseolddues", ClasswiseOldDuesView.as_view(), name="class wise old dues"
    ),
    # fees
    path("fees", FeeView.as_view(), name="fees"),
    path("fees/titles", FeeTitleView.as_view(), name="fees"),
    # ledgers
    path("ledgers", LedgerView.as_view(), name="ledgers"),
    path(
        "ledgers/history",
        LedgerPostingHistoryView.as_view(),
        name="ledger posting history",
    ),
    path("staff_ledgers", StaffLedgerView.as_view(), name="staff-ledgers"),
    path("ledgers/manage", LedgerManageView.as_view(), name="student ledger manage"),
    # tax invoices (numbering minted on first print)
    path("tax_invoice", TaxInvoiceView.as_view(), name="tax invoice"),
    # payments
    path("payments", InvoiceViews.as_view(), name="invoices plus payments"),
    path("staff_payments", StaffInvoiceView.as_view(), name="staff invoices"),
    path(
        "payroll/year_close",
        PayrollYearCloseView.as_view(),
        name="payroll year close",
    ),
    path("dues", RemainingDuesView.as_view(), name="remaining dues"),
    path(
        "payment_discount_report",
        PaymentDiscountReportView.as_view(),
        name="payment discounts report",
    ),
    path(
        "overall_income_plan_report",
        OverallIncomePlanView.as_view(),
        name="overall income plan report",
    ),
    path(
        "homework_report",
        HomeworkReportView.as_view(),
        name="homework report",
    ),
    # search
    path("search/students", StudentSearchView.as_view(), name="student search"),
    path("search/staffs", StaffSearchView.as_view(), name="staff search"),
    path("search/fees", FeeSearchView.as_view(), name="fee search by grade details"),
    path(
        "search/postings",
        LedgerPostingSearchView.as_view(),
        name="search posted ledger for class",
    ),
    path(
        "search/overall_student_ledgers",
        OverallStudentLedgersSearchView.as_view(),
        name="overall student ledgers",
    ),
    path(
        "search/transactions",
        TransactionsSearchView.as_view(),
        name="search transactions",
    ),
    path(
        "search/invoices_academic_year_mismatch",
        InvoicesAcademicYearMismatchView.as_view(),
        name="invoices academic year mismatch",
    ),
    path(
        "search/ledgers_academic_year_mismatch",
        LedgersAcademicYearMismatchView.as_view(),
        name="ledgers academic year mismatch",
    ),
    path(
        "search/certificates",
        CharacterCertificateSearchView.as_view(),
        name="character certificates search",
    ),
    # exams
    path(
        "subjects/optional",
        OptionalSubjectAssignmentView.as_view(),
        name="optional subject assignment",
    ),
    path(
        "bus_alert_settings",
        BusAlertSettingsPostView.as_view(),
        name="bus alert settings",
    ),
    path(
        "notifications/send",
        SendNotificationView.as_view(),
        name="send notification",
    ),
    path(
        "notifications/history",
        NotificationHistoryView.as_view(),
        name="notification history",
    ),
    path(
        "me/notifications",
        MyNotificationsView.as_view(),
        name="my notifications",
    ),
    path("inventory/categories", InventoryCategoryView.as_view(), name="inventory categories"),
    path("inventory/items", InventoryItemView.as_view(), name="inventory items"),
    path("inventory/transactions", InventoryTransactionView.as_view(), name="inventory transactions"),
    path("inventory/report", InventoryReportView.as_view(), name="inventory report"),
    path("exams", ExamView.as_view(), name="exams"),
    path("exams/seat-plan", SeatPlanView.as_view(), name="exam seat plan"),
    path(
        "exams/seat-plan/generate",
        SeatPlanGenerateView.as_view(),
        name="exam seat plan generate",
    ),
    path("exams/seat-plan/plans", SeatPlanListView.as_view(), name="exam seat plans"),
    path("exams/seat-plan/copy", SeatPlanCopyView.as_view(), name="exam seat plan copy"),
    path("exams/seat-plan/clear", SeatPlanClearView.as_view(), name="exam seat plan clear"),
    path("exams/seat-plan/rooms", SeatPlanRoomsView.as_view(), name="exam seat plan rooms"),
    path("exams/seat-plan/sides", SeatPlanRoomSidesView.as_view(), name="exam seat plan room sides"),
    path("exams/seat-plan/seating", SeatPlanSeatingView.as_view(), name="exam seat plan seating"),
    path("exams/schedule", ExamScheduleView.as_view(), name="exam schedule"),
    path("exams/results", ResultView.as_view(), name="exam results"),
    path(
        "exams/grading_rules",
        GradingRulesView.as_view(),
        name="exam results grading rules",
    ),
    path("extra_activities", ExtraActivityView.as_view(), name="extra-activities"),
    path(
        "extra_activities_entry",
        ExtraActivityEntryView.as_view(),
        name="extra-activities-entry",
    ),
    path(
        "character_certificate",
        CharacterCertificateView.as_view(),
        name="character-certificate",
    ),
    # sms
    path("sms", SMSView.as_view(), name="sms"),
    path("sms/templates", SMSTemplateViews.as_view(), name="sms-templates"),
    path("sms/send_bulk_sms", SendBulkSMSView.as_view(), name="send-bulk-sms"),
    path("sms/send_staff_sms", SendStaffSMSView.as_view(), name="send-staff-sms"),
    path("sms/send_dues_sms", SendDuesSMSView.as_view(), name="send-dues-sms"),
    path("sms/absent", AbsentSMSView.as_view(), name="send-absent-sms"),
    path("sms/report", SMSReportView.as_view(), name="sms-report"),
    path("notices_sa", MessagesFromOrgView.as_view(), name="messages from ceo"),
    path("splash/active", ActiveSplashView.as_view(), name="active splash"),
    path("splash", SplashNoticeView.as_view(), name="splash notices"),
    path("shareholders", ShareholderView.as_view(), name="shareholders"),
    # support & guides content (superadmin-authored)
    path("help/support/public", PublicSupportInfoView.as_view(), name="support info public"),
    path("help/support", SupportInfoView.as_view(), name="support info"),
    # per-school mobile app identity, read by the public privacy policy page
    path("app/listing/public", PublicAppListingView.as_view(), name="app listing public"),
    path("app/listing", AppListingView.as_view(), name="app listing"),
    path("help/categories", GuideCategoryView.as_view(), name="guide categories"),
    path("help/guides", GuideView.as_view(), name="guides"),
    path(
        "school-education-levels",
        SchoolHiddenEducationLevelsView.as_view(),
        name="school hidden education levels",
    ),
    path(
        "manage/school-education-levels",
        ManageSchoolEducationLevelsView.as_view(),
        name="manage school education levels",
    ),
    path("document-styles", DocumentStyleView.as_view(), name="document style"),
    path("idcard-templates", IDCardTemplateView.as_view(), name="idcard template"),
    path(
        "manage/idcard-templates",
        ManageIDCardTemplatesView.as_view(),
        name="manage idcard templates",
    ),
    path(
        "manage/idcard-templates/background",
        IDCardTemplateBackgroundView.as_view(),
        name="idcard template background",
    ),
    path(
        "birthday-templates",
        BirthdayTemplateView.as_view(),
        name="birthday templates",
    ),
    path(
        "birthday-templates/background",
        BirthdayTemplateBackgroundView.as_view(),
        name="birthday template background",
    ),
    path(
        "manage/document-styles",
        ManageDocumentStylesView.as_view(),
        name="manage document styles",
    ),
    path(
        "manage/document-styles/copy",
        CopyDocumentStyleView.as_view(),
        name="copy document style",
    ),
    path(
        "manage/ui-themes",
        ManageUiThemesView.as_view(),
        name="manage ui themes",
    ),
    path("backup", DatabaseBackupView.as_view(), name="database backup"),
]

# --- API DOCS ---
from docs.api_docs import schema_view

urlpatterns += [
    path(
        "docs/",
        schema_view.with_ui("swagger", cache_timeout=0),
        name="swagger-ui-api-docs",
    ),
    path("redoc/", schema_view.with_ui("redoc", cache_timeout=0), name="schema-redoc"),
]
