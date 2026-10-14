import StaffSearch from "@/components/searchbars/StaffSearch";
import { searchListViewOptions } from "@/components/searchbars/SearchListViews";

/**
 * Staff Details report — the staff/teacher counterpart to the student
 * "Enrollments History". Search staff and view every detail in a printable,
 * exportable table with toggleable columns.
 */
function StaffDetailsReport() {
    return (
        <div className="w-full">
            <StaffSearch
                onReset={() => null}
                onSelect={() => null}
                searchListViewOption={searchListViewOptions.HISTORY} />
        </div>
    );
}

export default StaffDetailsReport;
