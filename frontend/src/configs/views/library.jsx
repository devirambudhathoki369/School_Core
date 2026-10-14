import dynamic from "next/dynamic";

const LibrarySetup = dynamic(() => import("@/components/views/library/lib_setup"));
const BooksView = dynamic(() => import(/* webpackChunkName: "library" */"@/components/views/library/books"));
const BarCodesPrintView = dynamic(() => import("@/components/views/library/bar_codes"));
const BookTransactionView = dynamic(() => import(/* webpackChunkName: "library" */"@/components/views/library/book_transaction"));
// reports
const DailyReport = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/daily"));
const IssuedByStudents = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/issued_by_students"));
const IssuedByTeachers = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/issued_by_teachers"));
const IssuedReturnedCount = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/issued_returned_count"));
const OverallLibraryReport = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/overall"));
const BookOperationReport = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/book_operation"));
const FineReport = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/fine"));
const MemberProfile = dynamic(() => import(/* webpackChunkName: "library-reports" */"@/components/views/library/reports/member_profile"));

const libraryViews = {
    'library.lib-setup': () => <LibrarySetup />,
    'library.books': () => <BooksView />,
    'library.bar-codes': () => <BarCodesPrintView />,
    'library.book-transaction': () => <BookTransactionView />,
    // reports
    'library.reports.daily': () => <DailyReport />,
    'library.reports.issued-by-students': () => <IssuedByStudents />,
    'library.reports.issued-by-teachers': () => <IssuedByTeachers />,
    'library.reports.issued-returned-count': () => <IssuedReturnedCount />,
    'library.reports.overall': () => <OverallLibraryReport />,
    'library.reports.book-operation': () => <BookOperationReport />,
    'library.reports.fine': () => <FineReport />,
    'library.reports.member-profile': () => <MemberProfile />,
};

export default libraryViews;
