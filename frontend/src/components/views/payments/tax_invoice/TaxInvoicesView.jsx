import { getLedgers, getPostedMonths } from "@/services/functions/ledgers";
import { claimTaxInvoiceNo, postingSourceKey } from "@/services/functions/taxInvoice";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Button, Textarea } from "@material-tailwind/react";
import { ButtonsSecion, Section } from "@/components/sections";
import TaxInvoicePaper from "./TaxInvoicePaper";
import Loader from "@/components/Loader";
import { SearchInput, SelectInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import NotFound from "@/components/NotFound";
import { useAppContext } from "@/contexts/AppContext";
import { months as monthNames } from "@/components/inputs/options/months";
import { CARRY_FORWARD_OUT, OLD_DUES, OPENING_BALANCE, TITLE_NAMES_KEY, TRANSPORTATION, HOSTEL } from "@/configs/payment";
import safeDecimal from "@/methods/safeDecimal";

const extraInfoSchema = { note: '' };

/**
 * Rows that a TAX INVOICE must not carry.
 *
 * This document is a bill for what ONE posting charged. A carried-forward
 * balance — old dues, an opening balance, the carry-forward-out counter-entry —
 * was charged by an EARLIER posting and already has its own invoice against it,
 * so printing it here bills the same money a second time on a numbered tax
 * document. It got in because a month-less old-dues posting is filed with the
 * first posting group (LedgerViews.getReminderBils), which is correct for a
 * reminder bill — that paper states old dues deliberately, on their own line —
 * and wrong for this one.
 *
 * `__titles` is the title-name snapshot stored alongside the amounts, never a
 * fee; `discounts` was already excluded.
 */
const NOT_ON_A_TAX_INVOICE = new Set([
    OLD_DUES, OPENING_BALANCE, CARRY_FORWARD_OUT, TITLE_NAMES_KEY, "discounts",
]);

/**
 * The periods this class was posted for, newest first, as select options. Two
 * postings can carry the same months (a class-wide one and a later catch-up),
 * so they are collapsed to one entry — the backend resolves a repeated period
 * to the newest posting anyway.
 */
function postedMonthOptions(rows) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
        .filter(led => (led?.months || []).length > 0)
        .reverse()
        .reduce((acc, led) => {
            const key = [...led.months].sort((a, b) => a - b).join(',');
            if (seen.has(key)) return acc;
            seen.add(key);
            acc.push({
                name: `${led.months.map(m => monthNames?.[m] || m).join(', ')}${led?.date ? ` — posted ${led.date}` : ''}`,
                value: led.months.toString(),
            });
            return acc;
        }, []);
}

function TaxInvoicesView({ selectedClass, schoolProfile, academicYear, students }) {
    const [selectedStudent, setSelectedStudent] = useState('');
    const [selectedMonths, setSelectedMonths] = useState('');
    const [monthOptions, setMonthOptions] = useState([]);
    const [bills, setBills] = useState({});
    const [extraInfo, setExtraInfo] = useState({ ...extraInfoSchema });
    const [orientation, setOrientation] = useState('portrait');
    const [cols, setCols] = useState(3);
    const [issuing, setIssuing] = useState(false);
    const { notification: { updateNotification } } = useAppContext();
    const { searching, statusHandler } = useRequestStatus();
    const billRef = useRef(null);
    const classId = selectedClass?.class_info?.id;
    //
    // Which periods this class has been billed for. Reloaded per class; a failed
    // lookup leaves the picker empty, which still leaves the default (newest
    // posting) reachable.
    useEffect(() => {
        if (!classId || !schoolProfile?.id) return;
        let stale = false;
        (async () => {
            const rows = await getPostedMonths(schoolProfile.id, classId, academicYear);
            if (!stale) setMonthOptions(postedMonthOptions(rows));
        })();
        setSelectedMonths('');
        return () => { stale = true; };
    }, [classId, schoolProfile?.id, academicYear]);
    //
    function onExtraInfoChange({ name, value }) {
        setExtraInfo(state => ({ ...state, [name]: value }));
    }
    const printTaxInvoices = useReactToPrint({
        content: () => billRef.current,
        pageStyle: `@page { size: ${orientation}; margin: 8mm 10mm; }`,
    });

    function prepareParticulars(details, titles, rates) {
        const particulars = Array.from(new Set([...Object.keys(details)]));
        while (particulars.length < 15) particulars.push(['', '', '', '', '']);
        return particulars.reduce((acc, titleId) => {
            if (!NOT_ON_A_TAX_INVOICE.has(titleId)) {
                const titleData = [titles?.[titleId], rates?.[titleId]];
                if (details?.[titleId]) {
                    const due = details?.[titleId] || '';
                    acc.push([...titleData, due, due || 0]);
                } else {
                    acc.push([...titleData, '', '']);
                }
            }
            return acc;
        }, []);
    }

    function prepareTaxInvoices(data) {
        return data?.student_details
            ?.reduce((acc, std) => {
                const bill = {};
                bill["studentId"] = std.id;
                bill["studentName"] = std.name;
                bill["date"] = data.date;
                // The posting's own date is what this paper is dated by.
                bill["postedDate"] = data.data[std.id]?.posted_date || data.posted_date || data.date;
                bill["class"] = data.classname;
                bill["guardianName"] = std.guardian_name;
                bill["months"] = data.months;
                const particulars = prepareParticulars(
                    data.data[std.id]?.mergedLedgers || [],
                    data.titles,
                    { ...data.rates, [TRANSPORTATION]: std?.transportation_rate, [HOSTEL]: std?.hostel_rate }
                );
                bill["particulars"] = particulars;
                // A tax invoice states only what this posting charged — the
                // payments/old-dues reconciliation belongs on a reminder bill.
                //
                // The total is summed from the rows that are actually PRINTED.
                // It used to be the backend's `total`, which counts the
                // old-dues row this paper no longer lists — so the document
                // showed a total larger than its own particulars added up to,
                // and stated that figure as the taxable amount in words.
                bill['due'] = safeDecimal(particulars.reduce(
                    (sum, row) => sum + (Number(row?.[2]) || 0), 0));
                bill["remarks"] = '';
                bill["taxInvoiceNo"] = null;
                acc.push(bill);
                return acc;
            }, []);
    }

    // Claims the number for every invoice that does not have one yet. The number
    // belongs to the posting from then on, so a reprint (or a re-search) hands
    // back the same one rather than burning a new number.
    async function numberInvoices(list) {
        const pending = list.filter(b => !b.taxInvoiceNo);
        if (!pending.length) return list;
        const claimed = await Promise.all(pending.map(b =>
            claimTaxInvoiceNo({
                school: schoolProfile?.id,
                source_key: postingSourceKey(b.studentId, academicYear, b.months),
                student: b.studentId,
                date: b.postedDate,
            })
        ));
        const numbers = new Map(pending.map((b, i) => [b.studentId, claimed[i]]));
        return list.map(b => b.taxInvoiceNo ? b : { ...b, taxInvoiceNo: numbers.get(b.studentId) });
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        let data = await getLedgers(schoolProfile?.id, null, selectedClass.class_info.id, academicYear, true, '', selectedStudent, selectedMonths);
        data = prepareTaxInvoices(data);
        // Number them up front so the invoice no. is on the paper as soon as it
        // is on screen — an invoice that only gets its number at the printer
        // reads as unnumbered right when the user is checking it.
        data = await numberInvoices(data);
        setBills(state => ({ ...state, [selectedClass.class_info.id]: data }));
        statusHandler.toggleSearching();
    }

    // Safety net: anything still unnumbered (a claim that failed when the
    // invoices loaded) gets its number before the papers reach the printer. A
    // paper must never go out blank, so a failed claim aborts the print.
    async function onPrint() {
        const classId = selectedClass.class_info.id;
        const current = bills?.[classId] || [];
        if (current.some(b => !b.taxInvoiceNo)) {
            setIssuing(true);
            const numbered = await numberInvoices(current);
            setIssuing(false);
            if (numbered.some(b => !b.taxInvoiceNo)) {
                updateNotification(400, "Could not issue tax invoice numbers!");
                return;
            }
            setBills(state => ({ ...state, [classId]: numbered }));
            // Let the numbered papers render before the print dialog opens.
            setTimeout(printTaxInvoices, 0);
            return;
        }
        printTaxInvoices();
    }
    //
    return (
        <div className="my-5 flex flex-col">
            <form onSubmit={onSearch}>
                <Section>
                    <SearchInput input={{ name: 'student', label: "Student", options: students }}
                        value={selectedStudent} onChange={({ name, value }) => {
                            setSelectedStudent(value);
                        }} />
                    {/* Which posting to invoice. Left alone it stays on the
                        newest one — the only thing this page could show before. */}
                    <SelectInput input={{
                        name: 'months', label: "Posted Month",
                        placeholder: "month (latest by default)", options: monthOptions,
                    }} value={selectedMonths} onChange={({ value }) => setSelectedMonths(value)} />
                    <div className="sm:col-span-8">
                        <Textarea value={extraInfo?.note} className="!text-base" name="note" label="Note"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                onExtraInfoChange({ name, value });
                            }} />
                    </div>
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <>
                <div className="flex flex-col gap-y-2 w-full">
                    {
                        searching ? <Loader /> :
                            <>
                                {
                                    bills?.[selectedClass.class_info.id] ?
                                        <>
                                            {/* Print-layout controls (not printed) */}
                                            <div className="hide-from-print flex flex-wrap items-center gap-2 my-2">
                                                <span className="text-sm font-semibold">Orientation:</span>
                                                {['portrait', 'landscape'].map(o => (
                                                    <Button key={o} size="sm" className="capitalize"
                                                        variant={orientation === o ? 'filled' : 'outlined'}
                                                        onClick={() => setOrientation(o)}>{o}</Button>
                                                ))}
                                                <span className="text-sm font-semibold ml-4">Invoices per row:</span>
                                                {[1, 2, 3, 4].map(n => (
                                                    <Button key={n} size="sm"
                                                        variant={cols === n ? 'filled' : 'outlined'}
                                                        onClick={() => setCols(n)}>{n}</Button>
                                                ))}
                                                <Button onClick={onPrint} size="sm" disabled={issuing}
                                                    className="ml-auto flex items-center gap-2 bg-teal-400 text-gray-900 normal-case">
                                                    {issuing ? 'Issuing numbers…' : 'Print'}
                                                </Button>
                                            </div>
                                            <div ref={billRef} className="w-full flex justify-start items-start">
                                                <div id="tax-invoices-list-view" className="grid gap-4 p-1 w-full"
                                                    style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                                                    {
                                                        bills[selectedClass.class_info.id].map((bill, bi) => (
                                                            <TaxInvoicePaper bill={bill} key={bi} schoolProfile={schoolProfile} extraInfo={extraInfo} />
                                                        ))
                                                    }
                                                </div>
                                            </div>
                                        </> :
                                        <NotFound />
                                }
                            </>
                    }
                </div>
            </>
        </div>
    )
}

export default TaxInvoicesView;
