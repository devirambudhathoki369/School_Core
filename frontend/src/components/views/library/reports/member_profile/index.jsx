import { useEffect, useState } from "react";
import { Button, Card } from "@material-tailwind/react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

import { FilterSection } from "@/components/sections";
import { SelectInput } from "@/components/inputs";
import BasicTable from "@/components/tables/BasicTable";
import Loader from "@/components/Loader";
import StudentSearch from "@/components/searchbars/StudentSearch";
import StaffSearch from "@/components/searchbars/StaffSearch";
import { searchListViewOptions } from "@/components/searchbars/SearchListViews";
import { USER_TYPES, USER_TYPE_OPTIONS } from "@/components/views/library/book_transaction";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";
import { fetchGuestSchools } from "@/services/functions/library";

const VIEWS = { SEARCH: 'SEARCH', PROFILE: 'PROFILE' };

function MemberProfile() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [userType, setUserType] = useState(USER_TYPES.STUDENT);
    const [view, setView] = useState(VIEWS.SEARCH);
    const [member, setMember] = useState(null);
    const [profile, setProfile] = useState(null);
    // students of the schools this library serves are searchable here too, so
    // their borrowing history can be pulled up like any other member's.
    const [guestSchools, setGuestSchools] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();

    useEffect(() => {
        (async () => {
            const data = await fetchGuestSchools(schoolId);
            setGuestSchools(Array.isArray(data) ? data.map(g => g.guest_school) : []);
        })();
    }, [schoolId]);

    async function onSelect(action, userId, _ignored, selectedUser) {
        setMember(selectedUser);
        setView(VIEWS.PROFILE);
        statusHandler.toggleFetching();
        const params = userType === USER_TYPES.STUDENT ? { student: userId } : { staff: userId };
        const res = await libraryReport(schoolId, 'member-profile', params);
        setProfile(res || null);
        statusHandler.toggleFetching();
    }

    function backToSearch() {
        setView(VIEWS.SEARCH);
        setProfile(null);
        setMember(null);
    }

    return (
        <div className="w-full">
            {view === VIEWS.SEARCH &&
                <>
                    <FilterSection title={"User type"}>
                        <SelectInput input={{ name: 'user_type', label: "User type", options: USER_TYPE_OPTIONS }}
                            value={userType} onChange={({ value }) => setUserType(parseInt(value))} />
                    </FilterSection>
                    {userType === USER_TYPES.STUDENT &&
                        <StudentSearch includeClassname={true} onReset={() => null} onSelect={onSelect}
                            guestSchools={guestSchools}
                            searchListViewOption={searchListViewOptions.LIBRARY_PROFILE} />}
                    {userType === USER_TYPES.STAFF &&
                        <StaffSearch onReset={() => null} onSelect={onSelect}
                            searchListViewOption={searchListViewOptions.LIBRARY_PROFILE} />}
                </>
            }

            {view === VIEWS.PROFILE &&
                <div className="w-full">
                    <Button className="flex items-center bg-gray-300 w-max hide-from-print" variant="text" size="sm"
                        onClick={backToSearch}>
                        <ChevronLeftIcon className="w-5 h-5" /> Goto Search
                    </Button>

                    <Card className="flex flex-row flex-wrap gap-x-6 gap-y-1 p-4 my-2 font-semibold capitalize">
                        <span>Name : {member?.name}</span>
                        {member?.classname && <span>Class : {member.classname}</span>}
                        {member?.school_name && <span>School : {member.school_name}</span>}
                        {profile && <span>Currently held : {profile.currently_held ?? 0}</span>}
                        {profile && <span>Total issued : {profile.total_issued ?? 0}</span>}
                        {profile && <span>Total fine : {profile.total_fine ?? 0}</span>}
                    </Card>

                    {fetching ? <Loader /> : profile &&
                        <>
                            <BasicTable name={"Currently Held Books"} data={profile.held || []}
                                columns={HELD_COLUMNS} showSelected={false} print={true} />
                            <BasicTable name={"Full Book History"} data={profile.history || []}
                                columns={HISTORY_COLUMNS} showSelected={false} print={true} allowExport={true} />
                        </>
                    }
                </div>
            }
        </div>
    );
}

const HELD_COLUMNS = [
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['issued_date', "Issued Date"],
    ['due_date', "Due Date"],
];

const HISTORY_COLUMNS = [
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['issued_date', "Issued Date"],
    ['due_date', "Due Date"],
    ['returned_date', "Returned Date"],
    ['fine_amount', "Fine"],
];

export default MemberProfile;
