import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import TableHeaderFooter from "@/components/tables/TableHeaderFooter";
import { reprintAction } from "@/components/tables/actions";
import Warning from "@/components/Warning";
import CollectionSummary from "../../payments/CollectionSummary";
import { MODES, TXN_REFUND, TXN_TOPUP } from "@/configs/canteen";
import { collectionByMode, paymentModeLabel } from "@/methods/payment/collection";
import { getCanteenReport, getClasses, getOfficeReceipt } from "@/services/functions/canteen";
import OfficeReceipt from "../accounts/OfficeReceipt";
import { paisa, rs, sumMoney, useCanteenScope } from "../common";
import { useReactToPrint } from "react-to-print";

const VIEWS = { DETAILED: 1, INTERMEDIATE: 2, TITLEWISE: 3, MODEWISE: 4 };
const VIEW_OPTIONS = [
    { name: "Detailed", value: VIEWS.DETAILED },
    { name: "Intermediate", value: VIEWS.INTERMEDIATE },
    { name: "Overall titlewise", value: VIEWS.TITLEWISE },
    { name: "Payment mode totals", value: VIEWS.MODEWISE },
];
const SORT_OPTIONS = [{ name: "Date", value: 1 }, { name: "Receipt No", value: 2 }];
const KIND_OPTIONS = [
    { value: "payment", name: "Payments" },
    { value: "refund", name: "Refunds" },
    { value: "discount", name: "Discounts" },
    { value: "bill", name: "Bills (monthly and counter on account)" },
    { value: "all", name: "All" },
];

const positive = (value) => Math.abs(Number(value || 0));
const receiptOf = (row) => Number(`${row.reference || ""}`.replace("C-", "")) || 0;

function sortRows(rows, sort) {
    return [...rows].sort((a, b) => (sort === 2
        ? receiptOf(a) - receiptOf(b)
        : `${a.date}`.localeCompare(`${b.date}`) || a.id - b.id));
}
function baseColumns(withKind) {
    return [
        ["date"], ["reference", "receipt no"], ["detail", "class"], ["name"],
        ...(withKind ? [["kind_name", "type"]] : []),
        ["mode_label", "Payment mode"], ["months_label", "months"],
    ];
}
const tail = [["total"], ["entered_by", "entered by"], ["remarks"]];

/** The fee side's three views of a list of receipts, over the canteen's ledger. */
function shape(view, rows, sort, withKind) {
    if (view === VIEWS.MODEWISE) {
        return [
            [["payment_mode", "Payment mode"], ["total", "Collected amount"]],
            collectionByMode(rows.filter((r) => r.kind === TXN_TOPUP || r.kind === TXN_REFUND), (r) => Number(r.amount)),
        ];
    }
    if (view === VIEWS.TITLEWISE) {
        const byTitle = new Map();
        rows.forEach((r) => (r.lines || []).forEach((l) => {
            byTitle.set(l.name, (byTitle.get(l.name) || 0) + paisa(positive(l.amount)));
        }));
        return [
            [["particular"], ["total"]],
            [...byTitle.entries()].map(([particular, total], i) => ({ id: i + 1, particular, total: total / 100 })),
        ];
    }
    const common = (r) => ({
        ...r,
        mode_label: r.kind === TXN_TOPUP || r.kind === TXN_REFUND ? paymentModeLabel(r.mode) : "—",
        months_label: (r.months || []).join(", "),
        remarks: r.void_reason ? `${r.remarks ? `${r.remarks} · ` : ""}Voided: ${r.void_reason}` : r.remarks,
    });
    if (view === VIEWS.DETAILED) {
        const lines = sortRows(rows, sort).flatMap((r) => (r.lines || []).map((l, i) => ({
            ...common(r), id: `${r.id}-${i}`, particular: `${l.name}${l.qty > 1 ? ` x${l.qty}` : ""}`, total: positive(l.amount),
        })));
        const cols = baseColumns(withKind);
        cols.splice(2, 0, ["particular"]);
        return [[...cols, ...tail], lines];
    }
    return [
        [...baseColumns(withKind), ["discount"], ...tail],
        sortRows(rows, sort).map((r) => ({ ...common(r), discount: Number(r.discount || 0), total: positive(r.amount) })),
    ];
}

/**
 * TRANSACTION HISTORY — Reports > Transactions history, on the canteen's ledger.
 *
 * Search by class, type, status, mode and dates; then read it Detailed (a row per
 * title), Intermediate (a row per receipt, reprintable), Overall titlewise, or as
 * Payment mode totals. Columns can be shown or hidden, for print too.
 */
function TransactionHistory() {
    const { school, today, updateNotification } = useCanteenScope();
    const blank = { class_key: "", kind: "payment", is_active: "true", mode: "", entered_by: "", from: today, to: today };
    const [input, setInput] = useState(blank);
    const [classes, setClasses] = useState([]);
    const [result, setResult] = useState(null);
    const [searching, setSearching] = useState(false);
    const [view, setView] = useState(VIEWS.INTERMEDIATE);
    const [sort, setSort] = useState(1);
    const [hidden, setHidden] = useState({});
    const [receipt, setReceipt] = useState(null);
    const receiptRef = useRef(null);
    const printReceipt = useReactToPrint({ content: () => receiptRef.current });

    useEffect(() => { if (school) getClasses(school).then(setClasses); }, [school]);
    useEffect(() => {
        if (today) setInput((s) => ({ ...s, from: s.from || today, to: s.to || today }));
    }, [today]);

    function onChange({ name, value }) {
        setInput((s) => ({ ...s, [name]: value }));
    }
    async function onSubmit(e) {
        e.preventDefault();
        if (!school || searching) return;
        setSearching(true);
        const res = await getCanteenReport(school, "transactions", {
            from: input.from || undefined, to: input.to || undefined, kind: input.kind, is_active: input.is_active,
            mode: input.mode || undefined, class_key: input.class_key || undefined, entered_by: input.entered_by || undefined,
        });
        setSearching(false);
        if (!Array.isArray(res?.rows)) {
            setResult(null);
            return updateNotification(400, res?.message || "The report could not be read. Please try again.");
        }
        setReceipt(null);
        setResult({ ...res, kind: input.kind, isActive: input.is_active === "true" });
        if (res.rows.length < 1) updateNotification("", "No data found!");
    }

    const withKind = result?.kind === "all" || result?.kind === "bill";
    const [columns, rows] = useMemo(
        () => (result ? shape(view, result.rows, sort, withKind) : [[], []]),
        [result, view, sort, withKind]
    );
    const columnKeys = columns.map((c) => c[0]).join(",");
    useEffect(() => { setHidden({}); }, [columnKeys]);
    const visible = columns.filter((c) => !hidden[c[0]]);

    // "All" adds money going opposite ways, so a single total would mean nothing.
    const showTotals = result?.kind !== "all";
    const total = sumMoney(rows.map((r) => r.total));
    const discountTotal = sumMoney(rows.map((r) => r.discount));
    const totalsRow = rows.length > 0 && visible.length > 0 && showTotals ? (
        <tr className="bg-teal-50 border-t-2 border-teal-500 font-bold">
            <td className="py-2.5"></td>
            {visible.map((c, i) => (
                <td key={c[0]} className="py-2.5 px-2 text-blue-gray-900">
                    {i === 0 ? "Total" : c[0] === "total" ? total : c[0] === "discount" ? discountTotal : ""}
                </td>
            ))}
            {view === VIEWS.INTERMEDIATE && canReprint(result) ? <td className="hide-from-print"></td> : null}
        </tr>
    ) : null;
    const modeTotals = useMemo(
        () => collectionByMode((result?.rows || []).filter((r) => r.kind === TXN_TOPUP || r.kind === TXN_REFUND), (r) => Number(r.amount)),
        [result]
    );

    async function onAction(action, id, row) {
        if (action !== reprintAction.action) return;
        const data = await getOfficeReceipt(school, row.id);
        if (data?.receipt_no) setReceipt(data);
        else updateNotification(400, data?.message || "That receipt could not be opened.");
    }

    const classOptions = [{ value: "", name: "Every class" }, ...classes.map((c) => ({ value: c.key, name: c.label }))];
    const whoOptions = [{ value: "", name: "Everyone" }, ...(result?.entered_by || []).map((name) => ({ value: name, name }))];

    return (
        <>
            <form onSubmit={onSubmit}>
                <Section>
                    <FilterSection title="Filters">
                        <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1 gap-y-2">
                            <SelectInput value={input.class_key} onChange={onChange} input={{ name: "class_key", label: "Class", options: classOptions }} />
                            <SelectInput value={input.kind} onChange={onChange} input={{ name: "kind", label: "Type", options: KIND_OPTIONS }} />
                            <SelectInput value={input.is_active} onChange={onChange} input={{
                                name: "is_active", label: "Active status",
                                options: [{ value: "true", name: "Active" }, { value: "false", name: "Voided" }],
                            }} />
                            <SelectInput value={input.mode} onChange={onChange} input={{
                                name: "mode", label: "Payment mode", options: [{ value: "", name: "All methods" }, ...MODES],
                            }} />
                            <SelectInput value={input.entered_by} onChange={onChange} input={{ name: "entered_by", label: "Entered by", options: whoOptions }} />
                        </div>
                    </FilterSection>
                    <FilterSection title="Date">
                        <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1 gap-y-2">
                            <TextInput value={input.from} onChange={onChange} input={{ name: "from", label: "From (BS)", mask: "date", placeholder: "YYYY-MM-DD" }} />
                            <TextInput value={input.to} onChange={onChange} input={{ name: "to", label: "To (BS)", mask: "date", placeholder: "YYYY-MM-DD" }} />
                        </div>
                    </FilterSection>
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" type="button" onClick={() => { setInput(blank); setResult(null); }}>Reset</Button>
                    <FormSaveButton isUpdate={false} isSearch searching={searching} />
                </ButtonsSecion>
            </form>
            <div className="my-3">
                <Warning warning="A receipt can be reprinted in the Intermediate view!" />
            </div>
            {result?.truncated && <div className="my-3"><Warning warning="Only the first 5,000 rows are shown. Narrow the dates to see the rest." /></div>}
            {rows.length > 0 && (
                <FilterSection title="Summarize / Sort">
                    <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                        <SelectInput value={view} onChange={({ value }) => setView(Number(value))} input={{ name: "view", label: "View", options: VIEW_OPTIONS }} />
                        <SelectInput value={sort} onChange={({ value }) => setSort(Number(value))} input={{ name: "sort", label: "Sort", options: SORT_OPTIONS }} />
                    </div>
                </FilterSection>
            )}
            {rows.length > 0 && columns.length > 0 && (
                <FilterSection title="Show / hide columns (applies to print too)">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                        {columns.map((c) => (
                            <Checkbox key={c[0]} name={c[0]} text={c[1] || c[0]} inline checked={!hidden[c[0]]}
                                onClick={() => setHidden((s) => ({ ...s, [c[0]]: !s[c[0]] }))} />
                        ))}
                    </div>
                </FilterSection>
            )}
            {receipt ? (
                <div className="mt-4 flex flex-col gap-y-2 w-full">
                    <div className="max-w-full overflow-x-auto">
                        <div ref={receiptRef}><OfficeReceipt receipt={receipt} /></div>
                    </div>
                    <ButtonsSecion>
                        <Button onClick={printReceipt} variant="outlined">Print Bill!</Button>
                        <Button onClick={() => setReceipt(null)} variant="outlined">Close</Button>
                    </ButtonsSecion>
                </div>
            ) : rows.length > 0 && (
                <div className="mt-5">
                    <BasicTable name="Canteen transactions" data={rows} columns={visible} showSelected={false} print allowExport columnToggle={false}
                        extendedRows={totalsRow ? [totalsRow] : []}
                        header={
                            <>
                                <span className="m-1">
                                    <span className="font-semibold">From</span> : {result.from} &nbsp;
                                    <span className="font-semibold">To</span> : {result.to}
                                </span>
                                {showTotals && <TableHeaderFooter label="Total" value={`Rs. ${rs(total)}`} />}
                                {(result.kind === "payment" || result.kind === "all") && (
                                    <CollectionSummary totals={modeTotals} label={result.isActive
                                        ? "Collected by payment mode, less refunds"
                                        : "Voided receipt amounts by payment mode"} />
                                )}
                            </>
                        }
                        footer={showTotals ? <TableHeaderFooter label="Total" value={`Rs. ${rs(total)}`} /> : null}
                        actions={view === VIEWS.INTERMEDIATE && canReprint(result) ? [reprintAction] : false} onSelect={onAction} />
                </div>
            )}
        </>
    );
}

function canReprint(result) {
    return result?.kind === "payment" || result?.kind === "refund";
}

export default TransactionHistory;
