import { useReactToPrint } from "react-to-print";
import ExtraBillingReceipt from "@/components/views/extra_billing/Receipt";
import { getReceipt } from "@/services/functions/extra_billing";
import { Button } from "@material-tailwind/react";
import classPickerSchema from "@/schemas/class-picker";
import ClassPicker from "@/components/inputs/ClassPicker";
import { useEffect, useRef, useState } from "react";
import { OPTION_NONE, OPTION_TRANSPORTATION, hostelTitleOptions, OPTION_OLDDUES, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { useAppContext } from "@/contexts/AppContext";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { __search } from "@/services/functions";
import BasicTable from "@/components/tables/BasicTable";
import VIEW_FORMATTER, { toNum, round2 } from "./formatter";
import { fetchFeeTitles } from "@/services/functions/feeTitles";
import TableHeaderFooter from "@/components/tables/TableHeaderFooter";
import cleanClassInfo from "@/methods/cleanClassInfo";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import Checkbox from "@/components/inputs/Checkbox";
import { reprintAction } from "@/components/tables/actions";
import { fetchInvoice } from "@/services/functions/payments";
import { generateInvoice } from "@/methods/payment/invoice";
import BillsSection from "@/components/views/payments/student/BillsSection";
import Warning from "@/components/Warning";
import { fetchStaffs } from "@/services/functions/staffs";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import { PAYMENT_MODES } from "@/configs/payment";
import { collectionByMode } from "@/methods/payment/collection";
import CollectionSummary from "@/components/views/payments/CollectionSummary";
// 
const VIEWS = {
    DETAILED: 1,
    INTERMEDIATE: 2,
    TITLEWISE: 3,
    MODEWISE: 4
};
const VIEW_OPTIONS = [
    { name: 'Detailed', value: VIEWS.DETAILED },
    { name: 'Intermediate', value: VIEWS.INTERMEDIATE },
    { name: 'Overall titlewise', value: VIEWS.TITLEWISE },
    { name: 'Payment mode totals', value: VIEWS.MODEWISE }
];
const SORT_OPTIONS = [{ name: 'Date', value: 1 }, { name: 'Receipt No', value: 2 }];
const INVOICE_TYPES = {
    INVOICE: false,
    CASH_RECEIPT: true
};
// 
const extraSearchSchema = { isCashReceipt: "", from: '', to: '', title: '', mode: '', is_active: "true" };
const searchSchema = { ...classPickerSchema, ...extraSearchSchema, school: '' };
const uploadSchema = { class_info: { ...classPickerSchema }, ...extraSearchSchema };
const filterSchema = {
    student: '', title: '',
    view: VIEWS.INTERMEDIATE,
    sort: SORT_OPTIONS[0].value
};
// 
function TransactionsHistory() {
    const { user: { user },
        fiscalYear: { year, getAcademicYearObject },
        notification: { updateNotification } } = useAppContext();
    //
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    // Default both From and To to today's date (editable). The user can
    // widen the window by editing either field; cleanedSearchInput() still
    // backfills a blank From with the academic-year start as a safety net.
    searchSchema["from"] = user?.today || '';
    searchSchema["to"] = user?.today || '';
    const [input, setInput] = useState({ ...searchSchema });
    const [columns, setColumns] = useState([]);
    const [data, setData] = useState([]);
    const [working, setWorking] = useState(false);
    const [backup, setBackup] = useState({});
    const [total, setTotal] = useState(0);
    const [titles, setTitles] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const [actions, setActions] = useState(null);
    const [invoices, setInvoices] = useState({}); // generated invoices.
    const [selectedInvoice, setSelectedInvoice] = useState('');
    const [extraReceipt, setExtraReceipt] = useState(null);
    const extraReceiptRef = useRef(null);
    const printExtraReceipt = useReactToPrint({ content: () => extraReceiptRef.current });
    useEffect(() => {
        if (extraReceipt) printExtraReceipt();
    }, [extraReceipt]);
    // 
    const [filter, setFilter] = useState({ ...filterSchema }); //
    // Column keys the user has hidden (applies to on-screen table AND print).
    const [hiddenCols, setHiddenCols] = useState({});
    const { uploading, statusHandler } = useRequestStatus();
    const { closedAcademicYear, onClosedAcademicYearSelect } = useClosedAcademicYear();
    // 
    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onFilterChange({ name, value }) {
        try {
            value = parseInt(value) || value;
        } catch (e) { }
        setFilter(state => ({ ...state, [name]: value }));
    }
    function onReset() {
        setInput({ ...searchSchema });
    }
    function cleanedSearchInput() {
        const inp = { ...cleanClassInfo(input) };
        // pick year at the moment of submit: closed-year override > current fiscal year
        const ay = closedAcademicYear || year?.academic_year;
        inp['academic_year'] = ay;
        // Fall back to a sensible date window when the user leaves either
        // bound blank: from = academic-year start, to = today.
        const ayStart = getAcademicYearObject(ay)?.start_date || '';
        const fromDate = inp?.from || ayStart;
        const toDate = inp?.to || user?.today || '';
        if (fromDate && toDate) {
            inp['date_range'] = [fromDate, toDate];
        }
        inp['from'] = '';
        inp['to'] = '';
        inp["is_active"] = inp?.is_active === "true" ? true : false; // stored as string;
        if (inp?.isCashReceipt) inp["isCashReceipt"] = inp.isCashReceipt === "true" ? true : false; // stored as string;
        return cleanEmptyFields(inp, ["is_active"]);
    }
    function handleView(key = null, data = null, titles = null) {
        setActions(null);
        key = key || backup?.key;
        key = [key, filter.sort].join("__");
        if (filter?.view === VIEWS.DETAILED)
            return VIEW_FORMATTER.detailed(key, data, titles, filter.sort);
        else if (filter?.view === VIEWS.INTERMEDIATE) {
            setActions([reprintAction]);
            return VIEW_FORMATTER.intermediate(key, data, filter.sort);
        }
        else if (filter?.view === VIEWS.TITLEWISE)
            return VIEW_FORMATTER.overall_titlewise(key, data, titles);
        else if (filter?.view === VIEWS.MODEWISE)
            return VIEW_FORMATTER.modewise(data);
    }
    async function reprintInvoice(invoice_id, student_id) {
        const _inv = await fetchInvoice(invoice_id, student_id, user?.profile?.school || user?.profile?.id);
        if (_inv && _inv?.invoice) {
            setInvoices(state => ({
                ...state,
                [invoice_id]: generateInvoice(_inv.invoice, user?.profile, { reprint: true })
            }));
        }
        else updateNotification(400, "Something went wrong!");
    }
    async function onActionClick(action, id, invoice) {
        if (action === reprintAction.action) {
            if (invoice?.source === "extra_billing") {
                const receipt = await getReceipt(user?.profile?.school || user?.profile?.id, invoice.extra_invoice_id);
                if (receipt?.id) setExtraReceipt(receipt);
                else updateNotification(400, "Could not load the extra billing receipt.");
                return;
            }
            if (invoice?.id)
                setSelectedInvoice(invoice.id);
            if (!invoices?.[invoice.id]) await reprintInvoice(invoice.id, invoice.student);
        } else {
            updateNotification(500, "Something went wrong!");
        }
    }
    async function onSubmit(e) {
        e.preventDefault();
        const searchInput = cleanedSearchInput();
        if (Object.keys(searchInput).length < 1) {
            updateNotification('', "Invalid input!");
            return null;
        }
        // 
        statusHandler.toggleUploading();
        let [status, message, _data] = await __search('/api/search/transactions', searchInput),
            columns = [];
        let { data, titles, info } = _data || {};
        // console.log({ data, titles });
        updateNotification(status, message);
        if (status === 200 && data?.length > 0) {
            setSelectedInvoice(null);
            const timestamp = Date.now();
            setBackup({ data, titles, info, key: timestamp, isActive: searchInput.is_active });
            [columns, data] = handleView(timestamp, data, titles);
            // console.log(columns, data);
            setData(data);
            setColumns(columns);
            setTotal(data.reduce((acc, item) => {
                acc += item?.total || 0;
                return acc;
            }, 0));
        } else {
            // clear prior results so the user sees the new (empty) result, not stale rows
            setData([]);
            setColumns([]);
            setBackup({});
            setTotal(0);
            setActions(null);
            updateNotification('', "No data found!");
        }
        statusHandler.toggleUploading();
    }
    // 
    useEffect(() => {
        if (backup?.titles && backup?.data) {
            setWorking(true);
            const [columns, data] = handleView(backup.key, backup.data, backup.titles);
            setColumns(columns);
            setData(data);
            setWorking(false);
        }
    }, [filter]);
    useEffect(() => {
        if (user?.profile) {
            (async () => {
                const schoolId = user?.profile?.school || user?.profile?.id;
                const _titles = await fetchFeeTitles(schoolId, true);
                const _staffs = await fetchStaffs(schoolId, '', true);
                // Hostel is a fee title like any other on a receipt, so a school
                // that HAS the module can filter by it — otherwise they could
                // never pull "all hostel payments in Mangsir". Empty for
                // everyone else, so no other school's filter list changes.
                setTitles([..._titles, OPTION_TRANSPORTATION,
                    ...hostelTitleOptions(user?.profile), OPTION_OLDDUES]);
                setStaffs([..._staffs].reduce((acc, val) => {
                    acc.push({ value: val.account, name: val.name });
                    return acc;
                }, []));
            })();
        }
    }, [user]);
    // When the column set changes (new search / different view), show all columns.
    const columnKeys = columns.map((c) => c[0]).join(",");
    useEffect(() => {
        setHiddenCols({});
    }, [columnKeys]);
    // Columns actually rendered (and printed) after the user's show/hide choices.
    const visibleColumns = columns.filter((c) => !hiddenCols[c[0]]);
    const modeTotals = collectionByMode(backup?.data, invoice => VIEW_FORMATTER.sum(invoice.details));
    // Column-wise totals, shown as a row aligned under the columns themselves.
    // Only the money columns get summed; the rest stay blank.
    const SUM_COLS = ['total', 'tax', 'grand_total', 'discount'];
    const columnTotals = SUM_COLS.reduce((acc, key) => {
        acc[key] = round2(data.reduce((sum, row) => sum + toNum(row?.[key]), 0));
        return acc;
    }, {});
    // Rendered inside <tbody>, so the figures line up under their own columns
    // (the Total bars above/below the table span the full width and can't).
    const totalsRow = (data?.length > 0 && visibleColumns.length > 0) ? (
        <tr className="bg-teal-50 border-t-2 border-teal-500 font-bold">
            <td className="py-2.5"></td>{/* S.N */}
            {visibleColumns.map((c, i) => (
                <td key={c[0]} className="py-2.5 px-2 text-blue-gray-900">
                    {i === 0
                        ? 'Total'
                        : (SUM_COLS.includes(c[0]) ? columnTotals[c[0]] : '')}
                </td>
            ))}
            {actions ? <td className="hide-from-print"></td> : null}
        </tr>
    ) : null;
    //
    return (
        <>
            <div className="hidden">
                <div ref={extraReceiptRef}>
                    <ExtraBillingReceipt receipt={extraReceipt} />
                </div>
            </div>
            <>
                <form onSubmit={onSubmit}>
                    <Section>
                        <ClassPicker data={input} onChange={onChange} classwise={true} />
                        <FilterSection title={"Filters"}>
                            <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1 gap-y-2">
                                <SelectInput value={input?.isCashReceipt} onChange={onChange}
                                    input={{
                                        name: 'isCashReceipt', label: 'Invoice type',
                                        options: [
                                            { value: "", name: "All" },
                                            { value: INVOICE_TYPES.INVOICE, name: 'Invoice' },
                                            { value: INVOICE_TYPES.CASH_RECEIPT, name: 'Cash Receipt' },
                                        ]
                                    }} />
                                <SelectInput value={input?.is_active} onChange={onChange}
                                    input={{
                                        name: 'is_active', label: 'Active status',
                                        options: [
                                            { value: true, name: 'Active' },
                                            { value: false, name: 'Deleted' },
                                        ]
                                    }} />
                                <SelectInput value={input?.mode} onChange={onChange}
                                    input={{ name: 'mode', label: 'Payment mode', options: [
                                        { value: '', name: 'All methods' }, ...PAYMENT_MODES
                                    ] }} />
                                {(input?.isCashReceipt === INVOICE_TYPES.INVOICE.toString()) ?
                                    <SearchInput value={input?.title} onChange={onChange} input={{
                                        name: 'title', label: 'Fee title', options: [OPTION_NONE, ...titles],
                                    }} /> :
                                    <div className="sm:col-span-4"></div>
                                }
                                <SearchInput value={input?.user} onChange={onChange} input={{
                                    name: 'user', label: "Staff", options: [OPTION_NONE, ...staffs]
                                }} />
                            </div>
                        </FilterSection>
                        {/* Date range + academic year — pulled into its own
                            visually-distinct row per user request so report
                            scoping (the "when") is faster to spot/edit than
                            when it was buried alongside the other filters. */}
                        <FilterSection title={"Date / Academic year"}>
                            <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1 gap-y-2">
                                <TextInput value={input?.from} onChange={onChange} input={{
                                    name: 'from', label: 'From (BS)', mask: 'date', placeholder: 'YYYY-MM-DD'
                                }} />
                                <TextInput value={input?.to} onChange={onChange} input={{
                                    name: 'to', label: 'To (BS)', mask: 'date', placeholder: 'YYYY-MM-DD'
                                }} />
                                <ClosedAcademicYearSelectInput
                                    value={closedAcademicYear}
                                    onChange={onClosedAcademicYearSelect}
                                    showRunning={true} />
                            </div>
                        </FilterSection>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={onReset}>Reset</Button>
                        <FormSaveButton isUpdate={false} isSearch={true} searching={uploading} />
                    </ButtonsSecion>
                </form>
                <div className="my-3">
                    <Warning warning={"An invoice can be reprinted in the Intermediate view!"} />
                </div>
                {
                    data?.length > 0 &&
                    <FilterSection title={"Filter / Summarize / Sort"}>
                        <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                            <SearchInput value={filter?.title} onChange={onFilterChange} input={{
                                name: 'title', label: 'Fee title', options: []
                            }} />
                            <SelectInput value={filter?.view} onChange={onFilterChange} input={{
                                name: 'view', label: 'View', options: VIEW_OPTIONS
                            }} />
                            <SelectInput value={filter?.sort} onChange={onFilterChange} input={{
                                name: 'sort', label: 'Sort', options: SORT_OPTIONS
                            }} />
                        </div>
                    </FilterSection>
                }
                {
                    data?.length > 0 && columns?.length > 0 &&
                    <FilterSection title={"Show / hide columns (applies to print too)"}>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                            {columns.map((c) => (
                                <Checkbox key={c[0]} name={c[0]} text={c[1] || c[0]} inline
                                    checked={!hiddenCols[c[0]]}
                                    onClick={() => setHiddenCols(s => ({ ...s, [c[0]]: !s[c[0]] }))} />
                            ))}
                        </div>
                    </FilterSection>
                }
            </>
            <>
                {invoices?.[selectedInvoice] ?
                    <div className="mt-4">
                        <BillsSection invoice={invoices[selectedInvoice]} onClose={() => {
                            setSelectedInvoice('');
                        }} />
                    </div>
                    :
                    // ---------------------->
                    <>
                        {data?.length > 0 &&
                            <div className="mt-5">
                                <BasicTable name={"Transactions"} data={data} columns={visibleColumns} showSelected={false} print allowExport columnToggle={false}
                                    extendedRows={totalsRow ? [totalsRow] : []}
                                    header={
                                        <>
                                            {
                                                (backup?.info?.date?.from && backup?.info?.invoice_no?.to) &&
                                                <span className="m-1">
                                                    <span className="font-semibold">From</span> : {backup.info.date.from}
                                                    &nbsp;
                                                    <span className="font-semibold">To</span> : {backup.info.date.to}
                                                    &nbsp; AND &nbsp;
                                                    <span className="font-semibold">Receipt No</span> : {backup.info.invoice_no.from} - {backup.info.invoice_no.to}
                                                </span>
                                            }
                                            <TableHeaderFooter label={"Total"} value={`Rs. ${total}`} />
                                            <CollectionSummary totals={modeTotals} label={backup.isActive === false
                                                ? 'Deleted receipt amounts by payment mode'
                                                : 'Collected by payment mode — matching receipts'} />
                                        </>
                                    }
                                    footer={<TableHeaderFooter label={"Total"} value={`Rs. ${total}`} />}
                                    loading={working} actions={actions ? actions : false} onSelect={onActionClick}
                                />
                            </div>
                        }
                    </>
                }
            </>
        </>
    )
}

/*
--COLUMNS--
- BACKEND -> [invoice_date, invoice_id, feetitle, class, student_name, amount]
- VIEW::Overall-title-wise -> [feetitle, amount.]
- VIEW::Detailed -> [Same of BACKEND]
- VIEW::Intermediate -> [Same of BACKEND except feetitle]
*/

export default TransactionsHistory;
