import React, { useState } from "react";
import SearchProvider from "@/contexts/SearchContext";
import { useAppContext } from "@/contexts/AppContext";
import { Library_SearchListView, LibraryProfile_SearchListView, Manage_SearchListView, Staff_History_SearchListView, searchListViewOptions } from "./SearchListViews";
import { searchStaffs } from "@/services/functions/staffs";
import StaffSearchForm from "./StaffSearchForm";
import { Manage_StaffSearchListColumns } from "../views/reports/enrollments/students/table_columns";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "../Loader";
import NotFound from "../NotFound";
// 
const searchFormState = {
    first_name: '', middle_name: '', last_name: '', status: '1'
}
function StaffSearch({
    onSelect,
    onReset,
    searchListViewOption = null,
    allowManagement = false
}) {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    searchFormState['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...searchFormState }));
    const [staffs, setStaffs] = useState(null);
    const { fetching, statusHandler } = useRequestStatus();
    //
    function onChange({ name, value }) {
        if (value === form?.[name]) value = null;
        setForm(state => ({ ...state, [name]: value }));
    }
    function resetForm() {
        setForm({ ...searchFormState });
        setStaffs([]);
        onReset();
    }

    const isHistory = searchListViewOption === searchListViewOptions.HISTORY;
    async function onSearch() {
        statusHandler.toggleFetching();
        const [, , data] = await searchStaffs({
            ...form,
            // manage list shows the staff photo + position
            include_images: true,
            designation: true,
            // "view all details" report pulls the full field set.
            ...(isHistory ? {
                contact: true,
                address: true,
                id_cards: true, // birth_date + blood_group
                finance: true,  // salary/grade/allowance/.../joined_date
                // what each is still owed in the year the school is working
                // in, old dues included: the payment screen's own figure
                include_balance: true,
                economic_year: year?.economic_year,
            } : {}),
        });
        statusHandler.toggleFetching();
        setStaffs(data);
    }
    // 
    return (
        <>
            <SearchProvider value={{
                form,
                staffs,
                // `resetForm`, NOT the parent's `onReset`: the panel's Reset
                // button used to fire only the parent callback, so it cleared
                // the selection and left every filter field filled in.
                methods: { onChange, onReset: resetForm, onSearch },
            }}>
                {/* staff-search-form */}
                <StaffSearchForm useStatus={true} />
                {/* searched-staff-table */}
            </SearchProvider>
            {/* search-list */}
            <>
                {staffs?.length > 0 ?
                    <>
                        {
                            searchListViewOption === searchListViewOptions.MANAGE &&
                            <Manage_SearchListView name={"Staffs"} columns={Manage_StaffSearchListColumns} data={staffs} userClassInfos={{}}
                                allowManagement={allowManagement}
                                onSelect={onSelect} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.HISTORY &&
                            <Staff_History_SearchListView data={staffs} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.LIBRARY &&
                            <Library_SearchListView name={"Staffs"} data={staffs} onSelect={onSelect} />
                        }
                        {
                            searchListViewOption === searchListViewOptions.LIBRARY_PROFILE &&
                            <LibraryProfile_SearchListView name={"Staffs"} data={staffs} onSelect={onSelect} />
                        }
                    </> :
                    <>
                        {fetching ? <Loader /> : <NotFound />}
                    </>
                }
            </>
        </>
    )
};

export default React.memo(StaffSearch);