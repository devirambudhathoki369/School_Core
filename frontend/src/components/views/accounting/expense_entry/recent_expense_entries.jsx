import RecentEntriesView from "../RecentEntriesView";
import { ENTRIES } from "../acc_constants";
import { EXPENSE_ENTRIES_TCs } from "../tableColumnsConfig";

function RecentExpenseEntries() {
    return <RecentEntriesView id={ENTRIES.EXPENSE.ID} name={ENTRIES.EXPENSE.name}
        apiPath={ENTRIES.EXPENSE.apiPath} pagePath={ENTRIES.EXPENSE.pagePath}
        tableColumns={EXPENSE_ENTRIES_TCs} tag={ENTRIES.EXPENSE.tag} />
}

export default RecentExpenseEntries;