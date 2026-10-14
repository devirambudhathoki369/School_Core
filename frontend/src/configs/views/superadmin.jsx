import dynamic from "next/dynamic";
const DatabaseBackup = dynamic(() => import("@/components/views/superadmin/database_backup"));

import AdminManagementView from "@/components/views/enrollments/admin";
const EconomicYear = dynamic(() => import("@/components/views/managements/EconomicYear"));
import ManageStaffRoles from "@/components/views/managements/staff_roles";
import RFIDDeviceSetup from "@/components/views/rfid/devices/setup";
const Shareholders = dynamic(() => import("@/components/views/superadmin/shareholders"));
const UndoAcademicYearClosing = dynamic(() => import("@/components/views/managements/academic_year/undo_closing"));
const UndoAccountingEconomicYearClosing = dynamic(() => import("@/components/views/accounting/accounting_economic_year/closing/sa_undo"));
const CleanStudentLedgerPosting = dynamic(() => import("@/components/views/payments/ledger_posting/sa_clean_ledger_posting"));
const DownloadCards = dynamic(() => import("@/components/views/idcards/DownloadCards"));
const SchoolStatistics = dynamic(() => import("@/components/views/reports/superadmin/statistics"));
const ClasswiseOldDues = dynamic(() => import("@/components/views/reports/superadmin/classwise_old_dues"));
// 
const SuperAdminManagementView = dynamic(() => import("@/components/views/enrollments/superadmin"));
const ClassesAcademicYearManagement = dynamic(() => import("@/components/views/managements/academic_year/superadmin/classes_academic_year"));
const SplashManagement = dynamic(() => import("@/components/views/superadmin/splash"));
const EducationLevelVisibility = dynamic(() => import("@/components/views/superadmin/education_levels"));
const GradesheetStyles = dynamic(() => import("@/components/views/superadmin/document_styles"));
const IDCardDesigns = dynamic(() => import("@/components/views/superadmin/idcard_templates"));
const InterfaceTheme = dynamic(() => import("@/components/views/superadmin/ui_theme"));
const LibraryAccess = dynamic(() => import("@/components/views/superadmin/library_access"));
const ExtraBillingAccess = dynamic(() => import("@/components/views/superadmin/extra_billing_access"));
const HostelAccess = dynamic(() => import("@/components/views/superadmin/hostel_access"));
const SchoolFiscalYears = dynamic(() => import("@/components/views/superadmin/fiscal_years"));
const SupportDetails = dynamic(() => import("@/components/views/superadmin/support"));
const GuidesManagement = dynamic(() => import("@/components/views/superadmin/guides"));
const SuperAdminDashboard = dynamic(() => import("@/components/views/superadmin/dashboard"));
const MyPassword = dynamic(() => import("@/components/views/superadmin/my_password"));

const superAdminViews = {
    'database-backup': <DatabaseBackup />,
    'dashboard': <SuperAdminDashboard />,
    'setup.client': <AdminManagementView />,
    'setup.economic-year': <EconomicYear />,
    // per-school academic + accounting years (schools can only CLOSE their own)
    'setup.school-fiscal-years': <SchoolFiscalYears />,
    'setup.staff-roles': <ManageStaffRoles />,
    'setup.rfid-devices': <RFIDDeviceSetup />,
    'setup.shareholders': <Shareholders />,
    'setup.library-access': <LibraryAccess />,
    // which schools have the hostel module at all
    'setup.hostel-access': <HostelAccess />,
    'setup.extra-billing-access': <ExtraBillingAccess />,
    //
    'manage.undo-academic-year-close': <UndoAcademicYearClosing />,
    'manage.undo-accounting-economic-year-close': <UndoAccountingEconomicYearClosing />,
    'manage.clean-student-ledger-posting': <CleanStudentLedgerPosting />,
    // 
    'cards.download': <DownloadCards />,
    'analysis.statistics': <SchoolStatistics />,
    'analysis.cw-old-dues': <ClasswiseOldDues />,
    // superuser
    'superuser.manage-superadmin': <SuperAdminManagementView />,
    'superuser.classes-academic-year-update': <ClassesAcademicYearManagement />,
    // setup
    'setup.splash': <SplashManagement />,
    'setup.education-levels': <EducationLevelVisibility />,
    'setup.gradesheet-style': <GradesheetStyles />,
    'setup.idcard-design': <IDCardDesigns />,
    'ui-theme': <InterfaceTheme />,
    // the signed-in superadmin's own password
    'my-password': <MyPassword />,
    // help centre content, read by every school
    'help.support': <SupportDetails />,
    'help.guides': <GuidesManagement />,
};
export default superAdminViews;
