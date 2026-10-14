import { searchListViewOptions } from "@/components/searchbars/SearchListViews";
import StudentSearch from "@/components/searchbars/StudentSearch";
import { useState } from "react";
import { Button, Card } from "@material-tailwind/react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { FilterSection } from "@/components/sections";
import { SelectInput } from "@/components/inputs";
import StaffSearch from "@/components/searchbars/StaffSearch";
import StudentProfileProvider from "@/contexts/StudentProfile";
import StudentProfile from "../../profiles/student";
import StaffProfileProvider from "@/contexts/StaffProfile";
import StaffProfile from "../../profiles/staff";
import { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import switchAcademicYear from "@/methods/switchAcademicYear";
import { useAppContext } from "@/contexts/AppContext";

const VIEWS = { SEARCH: 'SEARCH', ACTION: 'ACTION' };

const USER_TYPES = { STUDENT: 1, STAFF: 2 },
    USER_TYPE_OPTIONS = [
        { name: 'student', value: [USER_TYPES.STUDENT] },
        { name: 'staff', value: [USER_TYPES.STAFF] }];
// 
function ManageUsers() {
    const { fiscalYear: { updateAcademicYear } } = useAppContext();
    const [userType, setUserType] = useState(USER_TYPES.STAFF);
    const [userId, setUserId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [action, setAction] = useState('');
    const [view, setView] = useState(VIEWS.SEARCH);
    const onSelect = (action, userId, _, user) => {
        if (user?.class_academic_year) {
            updateAcademicYear(user.class_academic_year)
        } else if (user?.class_info) {
            const { name, value } = prepareNameValue(user);
            switchAcademicYear(name, value, user, updateAcademicYear);
        }
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
                        <StudentSearch includeClassname={true} onReset={() => {
                            setUserId(null);
                        }} onSelect={onSelect}
                            searchListViewOption={searchListViewOptions.MANAGE} />
                    }
                    {
                        userType === USER_TYPES.STAFF &&
                        <StaffSearch onReset={() => {
                            setUserId(null);
                        }} onSelect={onSelect}
                            searchListViewOption={searchListViewOptions.MANAGE} />
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
                            {/* The student profile names the student on its
                                own identity card; the staff profile does not,
                                so this strip stays for staff — pinned, so the
                                name is still there at the foot of a long
                                profile. A direct child of the view, or it has
                                nowhere to travel. */}
                            {userType !== USER_TYPES.STUDENT &&
                                <div className="app-idpin bg-main">
                                    <Card className="flex flex-row flex-wrap gap-x-5 gap-y-1 p-4 font-semibold capitalize">
                                        <span>Name : {selectedUser?.name}</span>
                                        {selectedUser?.classname && <span>Class : {selectedUser.classname}</span>}
                                    </Card>
                                </div>
                            }
                            {action === 'profile' &&
                                <>
                                    {
                                        userType === USER_TYPES.STUDENT &&
                                        <StudentProfileProvider studentId={userId}>
                                            <StudentProfile />
                                        </StudentProfileProvider>
                                    }
                                    {
                                        userType === USER_TYPES.STAFF &&
                                        <StaffProfileProvider staffId={userId}>
                                            <StaffProfile />
                                        </StaffProfileProvider>
                                    }
                                </>
                            }
                        </div>
                    </>
                }
            </>
        </div>
    )
}

export default ManageUsers;