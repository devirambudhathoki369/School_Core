import RecentEntriesView from "../RecentEntriesView";
import { ENTRIES } from "../acc_constants";
import { CONTRA_ENTRIES_TCs } from "../tableColumnsConfig";

function RecentContraEntries() {
    return <RecentEntriesView id={ENTRIES.CONTRA.ID} name={ENTRIES.CONTRA.name}
        apiPath={ENTRIES.CONTRA.apiPath} pagePath={ENTRIES.CONTRA.pagePath}
        tableColumns={CONTRA_ENTRIES_TCs} />
}

export default RecentContraEntries;