import { searchListViewOptions } from "@/components/searchbars/SearchListViews";
import StudentSearch from "@/components/searchbars/StudentSearch";
import { useState } from "react";
import { Button, Card } from "@material-tailwind/react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { FilterSection } from "@/components/sections";
import { SelectInput } from "@/components/inputs";
import StaffSearch from "@/components/searchbars/StaffSearch";
import { issueBookAction, returnBookAction } from "@/components/tables/actions";
import BookIssueForm from "@/components/views/library/book_transaction/book_issue";
import BookReturnForm from "@/components/views/library/book_transaction/book_return";
import { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import { useAppContext } from "@/contexts/AppContext";
import switchAcademicYear from "@/methods/switchAcademicYear";
import GuestSchoolsNote from "@/components/views/library/book_transaction/GuestSchoolsNote";

const VIEWS = { SEARCH: 'SEARCH', ACTION: 'ACTION' };
export const USER_TYPES = { STUDENT: 1, STAFF: 2 },
    USER_TYPE_OPTIONS = [
        { name: 'student', value: [USER_TYPES.STUDENT] },
        { name: 'staff', value: [USER_TYPES.STAFF] }];

function BookTransactionView() {
    const { user: { user }, fiscalYear: { updateAcademicYear } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    // other schools this library serves — their students are searchable too.
    const [guestSchools, setGuestSchools] = useState([]);
    const [userType, setUserType] = useState(USER_TYPES.STUDENT);
    const [userId, setUserId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [action, setAction] = useState('');
    const [view, setView] = useState(VIEWS.SEARCH);

    const onSelect = (action, userId, _, user) => {
        // A guest school's student runs on their own school's calendar — never
        // switch this school's academic year context to it.
        const isGuest = user?.student_school && String(user.student_school) !== String(schoolId);
        if (isGuest) {
            // no academic-year switching.
        } else if (user?.class_academic_year) {
            updateAcademicYear(user.class_academic_year)
        } else if (user?.class_info) {
            const { name, value } = prepareNameValue(user);
            switchAcademicYear(name, value, user, updateAcademicYear);
        }
        // 
        setAction(action);
        setUserId(userId);
        setView(VIEWS.ACTION);
        setSelectedUser(user);
    };
    // 
    return (
        <div className="w-full">
            <>
                <div hidden={view != VIEWS.SEARCH}>
                    <FilterSection title={"User type"}>
                        <SelectInput input={{ name: 'user_type', label: "User type", options: USER_TYPE_OPTIONS }}
                            value={userType} onChange={({ name, value }) => {
                                value = parseInt(value);
                                setUserType(value);
                            }} />
                    </FilterSection>
                    {userType === USER_TYPES.STUDENT &&
                        <>
                            <GuestSchoolsNote schoolId={schoolId}
                                guestSchools={guestSchools} setGuestSchools={setGuestSchools} />
                            <StudentSearch includeClassname={true} onReset={() => {
                                setUserId(null);
                            }} onSelect={onSelect}
                                guestSchools={guestSchools.map(g => g.guest_school)}
                                searchListViewOption={searchListViewOptions.LIBRARY} />
                        </>
                    }
                    {
                        userType === USER_TYPES.STAFF &&
                        <StaffSearch onReset={() => {
                            setUserId(null);
                        }} onSelect={onSelect}
                            searchListViewOption={searchListViewOptions.LIBRARY} />
                    }
                </div>
            </>
            <>
                {view === VIEWS.ACTION &&
                    <>
                        <div className="student-action-view w-full">
                            <Button className="flex items-center bg-gray-300 w-max"
                                variant="text" size="sm"
                                onClick={() => {
                                    setView(VIEWS.SEARCH);
                                }}>
                                <ChevronLeftIcon className="w-5 h-5" />
                                Goto Search
                            </Button>
                            {/* Pinned: the issue form and a long list of loans
                                scroll beneath the name, so it is always plain
                                whose books these are. A direct child of the
                                view, or it has nowhere to travel. */}
                            <div className="app-idpin bg-main">
                                <Card className="flex flex-row flex-wrap gap-x-5 gap-y-1 p-4 font-semibold capitalize">
                                    <span>Name : {selectedUser?.name}</span>
                                    {selectedUser?.classname && <span>Class : {selectedUser.classname}</span>}
                                    {selectedUser?.school_name && <span>School : {selectedUser.school_name}</span>}
                                </Card>
                            </div>
                            <>
                                {action === issueBookAction.action &&
                                    <>
                                        <BookIssueForm userType={userType} selectedUser={selectedUser} />
                                    </>
                                }
                                {
                                    action === returnBookAction.action &&
                                    <>
                                        <BookReturnForm userType={userType} selectedUser={selectedUser} />
                                    </>
                                }
                            </>
                        </div>
                    </>
                }
            </>
        </div>
    )
}

export default BookTransactionView;