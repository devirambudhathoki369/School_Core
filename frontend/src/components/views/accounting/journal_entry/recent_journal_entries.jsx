import RecentEntriesView from "../RecentEntriesView";
import { ENTRIES } from "../acc_constants";
import { JOURNAL_ENTRIES_TCs } from "../tableColumnsConfig";

function RecentJournalEntries() {
    return <RecentEntriesView id={ENTRIES.JOURNAL.ID} name={ENTRIES.JOURNAL.name}
        apiPath={ENTRIES.JOURNAL.apiPath} pagePath={ENTRIES.JOURNAL.pagePath}
        tableColumns={JOURNAL_ENTRIES_TCs} tag={ENTRIES.JOURNAL.tag} />
}

export default RecentJournalEntries;