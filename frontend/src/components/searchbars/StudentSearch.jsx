import React, { useEffect, useRef, useState } from "react";
import SearchProvider from "@/contexts/SearchContext";
import { useAppContext } from "@/contexts/AppContext";
import { searchStudents } from "@/services/functions/students";
import StudentSearchForm from "./StudentSearchForm";
import { History_SearchListView, Library_SearchListView, LibraryProfile_SearchListView, Manage_SearchListView, Payment_SearchListView, searchListViewOptions } from "./SearchListViews";
import { Manage_SearchListColumns } from "../views/reports/enrollments/students/table_columns";
import NotFound from "../NotFound";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "../Loader";
import { TESTED_PERMISSIONS } from "@/configs/permissions";
import cleanClassInfo from "@/methods/cleanClassInfo";

// 
const studentSearchFormState = {
    student_id: '',
    first_name: '', middle_name: '', last_name: '', status: '',
    class_info: '', // class_info_id
    education_level: null, grade: null, faculty: '', year: null, semester: null, course: null, school: '',
    academic_year: '',
}
function StudentSearch({
    onSelect,
    onReset,
    searchListViewOption = null,
    detailed = false,
    includeBalance = false,
    includeClassname = false,
    includeContactInfo = false,
    allowStudentManagement = false,
    useAcademicYear = false,
    // Bumped by the parent (e.g. StudentPayment) when it wants the form
    // inputs cleared but the previously-fetched result list kept intact —
    // used on "back from make payment" so the user lands on their results
    // again without their old query lingering in the inputs.
    clearFormSignal = 0,
    // School ids of other schools whose students should also be searched
    // (library: schools this library lends books to). Validated server-side.
    guestSchools = [],
    // A page searching other data with this same form (Canteen > Payment):
    // `searchFn(filters)` answers [status, message, rows], `classPickerProps` go
    // to the class picker, and the list is read afresh on coming back, because
    // what was done there changes the balances it shows.
    searchFn = null,
    classPickerProps = null,
}) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    studentSearchFormState['school'] = user?.profile?.school || user?.profile?.id;
    const [studentSearch, setStudentSearch] = useState(() => ({ ...studentSearchFormState }));
    const [students, setStudents] = useState(null);
    const [studentClasses, setStudentClasses] = useState({});
    const { fetching, statusHandler } = useRequestStatus();
    const lastSearch = useRef(null);

    // Clear-form-only: reset the search-input fields but keep `students`
    // and `studentClasses`, so the table the user was just looking at is
    // still on screen when they come back.
    useEffect(() => {
        if (clearFormSignal > 0) {
            setStudentSearch({
                ...studentSearchFormState,
                school: user?.profile?.school || user?.profile?.id,
            });
            if (searchFn && lastSearch.current) runSearchFn(lastSearch.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearFormSignal]);
    async function runSearchFn(filters) {
        lastSearch.current = filters;
        statusHandler.toggleFetching();
        const [, , data] = await searchFn(cleanClassInfo({ ...filters }));
        statusHandler.toggleFetching();
        setStudents(data);
    }
    //
    function onChange({ name, value }) {
        if (value === studentSearch?.[name]) value = null;
        setStudentSearch(state => ({ ...state, [name]: value }));
    }
    function onSeachFormReset() {
        setStudentSearch({ ...studentSearchFormState });
        setStudents(null);
        onReset();
    }

    async function onSearch() {
        // An ID identifies one student outright, so it stands on its own —
        // the librarian shouldn't have to pick a class to use it.
        if (!studentSearch?.student_id && !studentSearch?.first_name && !studentSearch?.education_level) {
            updateNotification(400, "Student ID, Name or Education Level is required!");
            return;
        }
        if (searchFn) return runSearchFn(studentSearch);
        statusHandler.toggleFetching();
        const [, , data] = await searchStudents({
            ...cleanClassInfo(studentSearch),
            detailed,
            include_balance: includeBalance,
            include_classinfo: true,
            include_classname: includeClassname,
            include_father_name: includeContactInfo,
            include_contact: includeContactInfo,
            include_images: true,
            guest_schools: guestSchools?.length ? guestSchools : undefined,
            // academic_year: studentSearch?.education_level ? year?.academic_year : '',
        });
        const classes = {};
        data?.map(std => {
            classes[std['id']] = std['class_info'];
        });
        statusHandler.toggleFetching();
        setStudentClasses(classes);
        setStudents(data);
    }
    // 
    return (
        <>
            <SearchProvider value={{
                studentSearch,
                students, studentClasses,
                methods: { onChange, onSeachFormReset, onSearch },
            }}>
                {/* student-search-form */}
                <StudentSearchForm
                    useStatus={true}
                    useAcademicYear={useAcademicYear}
                    classPickerProps={classPickerProps} />
                {/* searched-student-table */}
            </SearchProvider>
            {/* search-list */}
            <>
                {students?.length > 0 ?
                    <>
                        {
                            searchListViewOption === searchListViewOptions.PAYMENT &&
                            <Payment_SearchListView data={students} studentClasses={studentClasses}
                                allowStudentManagement={allowStudentManagement}
                                onSelect={onSelect}
                                permissions={user?.role === "staff" && !searchFn ? user?.profile?.permissions : null}
                            // permissions={TESTED_PERMISSIONS} // testing
                            />
                        }
                        {
                            searchListViewOption === searchListViewOptions.HISTORY &&
                            <History_SearchListView data={students} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.MANAGE &&
                            <Manage_SearchListView name={"Students"} columns={Manage_SearchListColumns} data={students}
                                userClassInfos={studentClasses}
                                allowManagement={allowStudentManagement}
                                onSelect={onSelect} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.LIBRARY &&
                            <Library_SearchListView name={"Students"} data={students} onSelect={onSelect} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.LIBRARY_PROFILE &&
                            <LibraryProfile_SearchListView name={"Students"} data={students} onSelect={onSelect} />
                        }
                    </> :
                    <>
                        {
                            fetching ? <Loader /> : <NotFound />
                        }
                    </>
                }
            </>
        </>
    )
};

export default React.memo(StudentSearch);