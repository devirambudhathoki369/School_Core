import PreviousButton from "@/components/buttons/PreviousButton";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction, reprintAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { getCursor, getURL } from "@/methods/pagination";
import { __fetch, __search, __update } from "@/services/functions";
import { useEffect, useState } from "react";
import EntriesSection from "./EntriesSection";
import { useTempState } from "@/contexts/TempStateContext";
import { useRouter } from "next/router";
import { SelectInput, TextInput } from "@/components/inputs";
import { Button } from "@material-tailwind/react";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";
import { ENTRIES } from "./acc_constants";

// edit/delete on posted entries are permission-gated per voucher type
// (admin always passes via hasPermission). Types without an entry here
// (e.g. contra) keep edit/delete ungated, as before.
const ENTRY_EDIT_DELETE_PERMS = {
    [ENTRIES.INCOME.ID]: { edit: PERMISSIONS.ACCOUNTING.INCOME_ENTRIES_EDIT, del: PERMISSIONS.ACCOUNTING.INCOME_ENTRIES_DELETE },
    [ENTRIES.EXPENSE.ID]: { edit: PERMISSIONS.ACCOUNTING.EXPENSE_ENTRIES_EDIT, del: PERMISSIONS.ACCOUNTING.EXPENSE_ENTRIES_DELETE },
    [ENTRIES.JOURNAL.ID]: { edit: PERMISSIONS.ACCOUNTING.JOURNAL_ENTRIES_EDIT, del: PERMISSIONS.ACCOUNTING.JOURNAL_ENTRIES_DELETE },
};

const searchSchema = { school: '', economic_year: '', voucher_type: '', voucher_id: '', from_date: '', to_date: '' };
const APIPath = "/accounting/search/entries";

// top-of-table status filter: All (default) / Active / Deleted
const STATUS_FILTER_OPTIONS = [
    { name: "Not Deleted", value: "active" },
    { name: "Deleted", value: "deleted" },
];
function filterRowsByStatus(rows, statusFilter) {
    if (!statusFilter || !Array.isArray(rows)) return rows || [];
    const wantActive = statusFilter === "active";
    return rows.filter(row => (row?.is_active !== false) === wantActive);
}
// deleted (soft-deleted) vouchers now come back in the list/search with
// is_active=false — badge them and paint the row red so they're unmissable.
function decorateEntryRows(rows) {
    if (!Array.isArray(rows)) return rows || [];
    return rows.map(row => (
        row?.is_active === false
            ? { ...row, status: "Deleted", color: "#dc2626" }
            : { ...row, status: "Active" }
    ));
}
function RecentEntriesView({ id, name, apiPath, pagePath, tableColumns, tag = "KEY", economicYear, hideYearSelector = false }) {
    const { user: { user },
        fiscalYear: { year, years, isAccountingYearClosed },
        notification: { updateNotification }, prompt: { toggleConfirmationPrompt } } = useAppContext();
    const [entries, setEntries] = useState({});
    const [entry, setEntry] = useState(null);
    const { saveTempState } = useTempState();
    // Which fiscal (accounting economic) year's vouchers to list. Defaults to
    // the current year; a past/closed year can be picked to VIEW its vouchers
    // (read-only — edit/delete are hidden and the backend rejects them too).
    const [selectedYear, setSelectedYear] = useState(economicYear || year?.accounting_economic_year || '');
    const yearClosed = isAccountingYearClosed?.(selectedYear);
    // SEARCH;
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    searchSchema['economic_year'] = selectedYear;
    searchSchema['voucher_type'] = id;
    searchSchema['voucher_id'] = `${tag}-`;
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [statusFilter, setStatusFilter] = useState('');
    const { fetching, searching, statusHandler } = useRequestStatus();

    // keep the selected year in sync when the parent-provided / current year resolves
    useEffect(() => {
        const next = economicYear || year?.accounting_economic_year || '';
        if (next && next !== selectedYear) setSelectedYear(next);
    }, [economicYear, year?.accounting_economic_year]);

    function onYearChange({ value }) {
        setSelectedYear(value);
        setPage(1);
        setEntries({}); // drop cached pages/search so the list refetches for the new year
        setSearchInput(state => ({ ...state, economic_year: value }));
    }

    function onStatusFilterChange({ value }) {
        setStatusFilter(value);
        setPage(1);
        // drop cached pages so the list refetches with the new filter;
        // search results stay and are filtered client-side
        setEntries(state => (state?.search ? { search: state.search } : {}));
    }

    function onSearchInputChange({ name, value }) {
        if (name === "voucher_id") {
            if (!value.startsWith(tag)) updateNotification(400, "Invalid Input");
        }
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const payload = { ...searchInput };
        if (statusFilter) payload.status = statusFilter === "active";
        const [status, msg, data] = await __search(APIPath, payload);
        updateNotification(status, msg);
        if (status === 200) {
            setEntries(state => ({ ...state, "search": data }));
        } else {
            setEntries(state => ({ ...state, "search": null }));
        }
        statusHandler.toggleSearching();
    }
    function onSearchFormReset() {
        setSearchInput({ ...searchSchema });
        setEntries(state => ({ ...state, "search": null }));
    }

    const router = useRouter();

    // PAGINATION;
    const ITEMS_PER_PAGE = 10;
    const [page, setPage] = useState(1);

    async function getData() {
        statusHandler.toggleFetching();
        const nextURL = getURL(entries, page - 1, 'next');
        if (!nextURL && getURL(entries, page - 1, 'previous')) {
            setPage(state => state - 1);
            statusHandler.toggleFetching();
            return null;
        }
        const cursor = getCursor(nextURL);
        //  
        const schoolId = user?.profile?.school || user?.profile?.id;
        const res = await __fetch(apiPath, {
            school: schoolId, page, cursor,
            ...(selectedYear ? { economic_year: selectedYear } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
        });
        if (res) {
            setEntries(state => ({ ...state, [page]: res }));
        }
        statusHandler.toggleFetching();
    }

    async function reprintVoucher(voucher_id, show = true) {
        if (!voucher_id) {
            updateNotification(400, "Voucher not found!");
            return;
        }
        const schoolId = user?.profile?.school || user?.profile?.id;
        const data = await __fetch(apiPath, { school: schoolId, entry: voucher_id });
        if (data) {
            if (!show) return data;
            setEntry(data);
        } else {
            setEntry(null);
        }
    }

    async function deleteVoucher(voucher_id, school_id, delete_reason) {
        return __update(apiPath, { school: school_id, entry: voucher_id, delete_reason }, false);
    }

    function onDeletePostEvent(voucher_id) {
        // deleted vouchers stay in the list, flagged so decorateEntryRows
        // badges them as Deleted
        const markDeleted = (rows) => (rows || []).map(e =>
            e.id == voucher_id ? { ...e, is_active: false } : e);
        setEntries(state => ({
            ...state,
            ...(state[page] ? { [page]: { ...state[page], "results": markDeleted(state[page].results) } } : {}),
            ...(state.search ? { "search": markDeleted(state.search) } : {}),
        }));
        if (entry?.id === voucher_id) setEntry(null);
    }

    async function onDelete(voucher_id) {
        const schoolID = user?.profile?.school || user?.profile?.id;
        const promptData = { ask_reason: true };
        promptData['header'] = "Are you sure to delete this voucher?";
        promptData['onConfirm'] = async (delete_reason) => {
            let status, message;
            [status, message,] = await deleteVoucher(voucher_id, schoolID, delete_reason);
            if (status) {
                updateNotification(status, message);
                if (status === 200) {
                    onDeletePostEvent(voucher_id);
                }
            }
        }
        toggleConfirmationPrompt(promptData);
    }

    async function onVoucherSelect(action, id, item) {
        // deleted vouchers can only be viewed/reprinted — never edited or
        // deleted again (backend enforces this too)
        if (item?.is_active === false && action !== reprintAction.action) {
            updateNotification(400, "This voucher is deleted! It can only be viewed/reprinted.");
            return;
        }
        // closed fiscal year: view/reprint only (backend enforces this too)
        if (yearClosed && action !== reprintAction.action) {
            updateNotification(400, "This fiscal year is closed! Vouchers can only be viewed/reprinted.");
            return;
        }
        if (action === reprintAction.action) {
            await reprintVoucher(id);
        } else if (action === deleteAction.action) {
            await onDelete(id);
        } else if (action === editAction.action) {
            const _tempStateKey = `${name}__edit`;
            const _entry = await reprintVoucher(id, false);
            if (_entry) {
                saveTempState(_tempStateKey, _entry);
                router.push(pagePath);
            }
        }
    }
    function onClose() {
        setEntry(null);
    }
    // gate edit/delete row-actions by permission (reprint always available).
    // closed fiscal years are read-only: no edit/delete regardless of permission.
    const _edPerms = ENTRY_EDIT_DELETE_PERMS[id];
    const canEdit = !yearClosed && (_edPerms ? hasPermission(user, _edPerms.edit) : true);
    const canDelete = !yearClosed && (_edPerms ? hasPermission(user, _edPerms.del) : true);
    const rowActions = [
        reprintAction,
        ...(canEdit ? [editAction] : []),
        ...(canDelete ? [deleteAction] : []),
    ];
    //
    useEffect(() => {
        (async () => {
            if (!entries?.[page]) await getData();
        })();
    }, [page, statusFilter, selectedYear]);

    return (
        <>
            <ButtonsSecion className={"!justify-start"}>
                <PreviousButton />
            </ButtonsSecion>
            <>
                <BasicTable name={`Recent ${name}s`} columns={[...tableColumns, ["status", "Status"]]}
                    data={decorateEntryRows(filterRowsByStatus(entries?.search || entries?.[page]?.results || [], statusFilter))} loading={fetching}
                    showSelected={false} onSelect={onVoucherSelect}
                    page={page} itemsPerPage={ITEMS_PER_PAGE}
                    actions={rowActions}
                    header={
                        <>
                            <Section>
                                <SelectInput input={{ name: "status", label: "Status", placeholder: "Status (All)", options: STATUS_FILTER_OPTIONS }}
                                    value={statusFilter} onChange={onStatusFilterChange} />
                            </Section>
                            {yearClosed &&
                                <p className="px-2 py-1 text-sm font-semibold text-amber-700">
                                    Viewing a closed fiscal year — vouchers are read-only (view/reprint only).
                                </p>
                            }
                            <SearchForm tag={tag} data={searchInput}
                                onChange={onSearchInputChange} onReset={onSearchFormReset}
                                onSearch={onSearch} searching={searching}
                                years={years} selectedYear={selectedYear}
                                onYearChange={onYearChange} hideYearSelector={hideYearSelector} />
                        </>
                    } />
                <PaginationSection page={page} setPage={setPage}
                    nextPage={getURL(entries, page, 'next')} />
            </>
            {
                entry &&
                <EntriesSection id={id} name={name} entry={entry} onClose={onClose} />
            }
        </>
    )
}

function SearchForm({ tag, data, onChange, onSearch, onReset, searching, years, selectedYear, onYearChange, hideYearSelector }) {
    return (
        <form onSubmit={onSearch} className="mb-2">
            <Section>
                {!hideYearSelector &&
                    <SelectInput input={{ name: "economic_year", label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                        value={selectedYear} onChange={onYearChange} />
                }
                <TextInput input={{ name: "voucher_id", label: `Voucher ID`, placeholder: `${tag}-xxxx` }}
                    value={data?.voucher_id} onChange={onChange} />
                <TextInput input={{ name: "from_date", label: `Date (From)` }}
                    value={data?.from_date} onChange={onChange} />
                <TextInput input={{ name: "to_date", label: `Date (To)` }}
                    value={data?.to_date} onChange={onChange} />
            </Section>
            <ButtonsSecion>
                <Button type="button" variant="outlined" onClick={onReset}>Reset</Button>
                <FormSaveButton isSearch={true} searching={searching} />
            </ButtonsSecion>
        </form>
    )
}

export default RecentEntriesView;