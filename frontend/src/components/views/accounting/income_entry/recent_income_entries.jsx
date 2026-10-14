import RecentEntriesView from "../RecentEntriesView";
import { ENTRIES } from "../acc_constants";
import { INCOME_ENTRIES_TCs } from "../tableColumnsConfig";

function RecentIncomeEntries() {
    return <RecentEntriesView id={ENTRIES.INCOME.ID} name={ENTRIES.INCOME.name}
        apiPath={ENTRIES.INCOME.apiPath} pagePath={ENTRIES.INCOME.pagePath}
        tableColumns={INCOME_ENTRIES_TCs} tag={ENTRIES.INCOME.tag} />
}

export default RecentIncomeEntries;