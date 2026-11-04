import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Textarea, Typography } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import MonthPicker from "@/components/inputs/MonthPicker";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import AmountInput from "@/components/tables/AmountInput";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { MODES } from "@/configs/canteen";
import { getCanteenProfile, getOfficeReceipt, moveMoney } from "@/services/functions/canteen";
import OfficeReceipt from "../accounts/OfficeReceipt";
import TitleBill from "../../payments/student/TitleBill";
import { Note, paisa, sumMoney } from "../common";
import TrialBalance from "./TrialBalance";

const ADVANCE = "advance";
const noAllMonths = { pickedAllMonths: false, setPickedAllMonths: () => null };

function money(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The fee payment screen on the canteen's ledger, line for line: tick the titles,
 * split a lump sum if the guardian gave one, enter what is paid and any discount.
 * A line's amount is what it settles, its discount included, so the cash is
 * amount − discount, exactly as a fee receipt reads.
 *
 * Every total is worked out from the lines on each render, never kept as a
 * running counter: that is how the fee screen's totals once drifted from its
 * receipts. The server checks the lines again before anything is saved.
 */
function PayStudent({ person, school, today, updateNotification }) {
    const [profile, setProfile] = useState(null);
    const [selected, setSelected] = useState({});
    const [discounts, setDiscounts] = useState({});
    const [lumpSum, setLumpSum] = useState("");
    const [month, setMonth] = useState(null);
    const [info, setInfo] = useState({ date: today, mode: 1, remarks: "" });
    const [paying, setPaying] = useState(false);
    const [receipt, setReceipt] = useState(null);
    const receiptRef = useRef(null);
    const printReceipt = useReactToPrint({ content: () => receiptRef.current });

    async function load() {
        const res = await getCanteenProfile(school, person.buyer_type, person.id);
        setProfile(res?.summary ? res : { failed: res?.message || "This ledger could not be opened. Check the connection and try again." });
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [person.id, person.buyer_type]);
    useEffect(() => {
        if (!today) return;
        setInfo((s) => ({ ...s, date: s.date || today }));
        setMonth((m) => m || Number(today.slice(5, 7)) || null);
    }, [today]);

    const titles = useMemo(() => (profile?.items || []).filter((r) => Number(r.due) > 0), [profile]);
    const byId = useMemo(() => Object.fromEntries((profile?.items || []).map((r) => [r.item, r])), [profile]);
    const billOf = (id) => (id === ADVANCE ? 0 : Number(byId[id]?.due || 0));
    const nameOf = (id) => (id === ADVANCE ? "Advance" : byId[id]?.name || id);

    // Ledger order, oldest bill first, whichever title was ticked first.
    const ids = [...titles.map((r) => r.item), ADVANCE].filter((id) => id in selected);
    const settling = sumMoney(ids.filter((id) => id !== ADVANCE).map((id) => selected[id]));
    const discountTotal = sumMoney(ids.map((id) => discounts[id]));
    const payingTotal = sumMoney([...ids.map((id) => selected[id]), -discountTotal]);
    const remainingTotal = sumMoney([profile?.summary?.due, -settling]);
    const selectedTotal = sumMoney(ids.filter((id) => id !== ADVANCE).map(billOf));
    const toDistribute = lumpSum === "" ? "" : sumMoney([lumpSum, -payingTotal]);

    function onTitleSelect(id) {
        setSelected((state) => {
            const next = { ...state };
            if (id in next) delete next[id];
            else next[id] = id === ADVANCE ? "" : billOf(id);
            return next;
        });
        setDiscounts(({ [id]: _, ...rest }) => rest);
    }
    function split() {
        let left = paisa(lumpSum);
        if (left < 100) return updateNotification("", "Paying amount is invalid!");
        const lines = ids.filter((id) => id !== ADVANCE && billOf(id) !== 0);
        if (lines.length < 1) return updateNotification("", "No valid paying amount in any title to distribute!");
        const next = { ...selected };
        lines.forEach((id) => {
            const take = Math.min(paisa(billOf(id)), left);
            // A title the money did not reach leaves the form rather than sitting
            // there at zero, which the receipt could not carry.
            if (take > 0) next[id] = take / 100;
            else delete next[id];
            left -= take;
        });
        setSelected(next);
    }
    function reset() {
        setSelected({});
        setDiscounts({});
        setLumpSum("");
    }
    async function onSubmit(e) {
        e.preventDefault();
        if (paying) return;
        if (!info.date) return updateNotification("", "Payment date is required!");
        for (const id of ids) {
            if (!(Number(selected[id]) > 0)) return updateNotification("", `Invalid data at "${nameOf(id)}"!`);
            if (paisa(discounts[id]) > paisa(selected[id])) return updateNotification("", `${nameOf(id)}: the discount is more than the amount.`);
        }
        if (!(payingTotal > 0)) return updateNotification("", "Enter an amount to pay!");
        const details = {}, off = {};
        ids.filter((id) => id !== ADVANCE).forEach((id) => {
            const cash = sumMoney([selected[id], -Number(discounts[id] || 0)]);
            if (cash > 0) details[id] = cash;
            if (Number(discounts[id]) > 0) off[id] = Number(discounts[id]);
        });
        setPaying(true);
        const [status, message, data] = await moveMoney({
            school, action: "topup", account: profile?.account || undefined,
            buyer_type: person.buyer_type, buyer: person.id, amount: payingTotal, details, discounts: off,
            month: month || undefined, mode: Number(info.mode), date: info.date, remarks: info.remarks || undefined,
        });
        setPaying(false);
        if (status !== 200 || !data?.receipt_no) return updateNotification(400, message || "Failed to save the receipt!");
        updateNotification(200, data.message || "Saved.");
        reset();
        setInfo((s) => ({ ...s, remarks: "" }));
        await load();
        showReceipt(data.id);
    }
    async function showReceipt(txnId) {
        const data = await getOfficeReceipt(school, txnId);
        if (data?.receipt_no) setReceipt(data);
        else updateNotification(400, data?.message || "That receipt could not be opened.");
    }

    if (!profile) return <Loader />;
    if (profile.failed) return <div className="px-3 pt-3"><Note tone="red">{profile.failed}</Note></div>;

    const modeOptions = MODES;
    const cols = 6;
    return (
        <>
            <div className="px-3">
                <Section title="Student's Ledger" description="Select titles below to proceed with payment" grid={false}>
                    <div className="w-full flex flex-col items-start justify-between overflow-x-auto mb-3">
                        <HeaderCard grid={3}>
                            <span className="flex gap-x-2 pl-[1.85rem]">title</span>
                            <span>rate</span>
                            <span>bill amount</span>
                        </HeaderCard>
                        {titles.map((r) => (
                            <TitleBill key={r.item} title={r.name} isSelected={r.item in selected} onSelect={() => onTitleSelect(r.item)}
                                rate={r.rate ? Number(r.rate) : ""} billAmount={Number(r.due)} />
                        ))}
                        <TitleBill title="Advance (kept on the account)" isSelected={ADVANCE in selected} onSelect={() => onTitleSelect(ADVANCE)} billAmount="" />
                        <TitleBill title="TOTAL" billAmount={Number(profile.summary.due)} disableClick />
                        <TitleBill title="TOTAL SELECTED" billAmount={selectedTotal} disableClick />
                    </div>
                    {Number(profile.summary.advance) > 0 && (
                        <p className="text-sm text-gray-600">{money(profile.summary.advance)} advance is held on this account and meets the next bill.</p>
                    )}
                </Section>

                {ids.length > 0 && (
                    <>
                        <Section title="Guardian Paying Amount Distribution" description="Distributes guardian paying amount to the selected titles!">
                            <TextInput value={lumpSum} onChange={({ value }) => setLumpSum(value)}
                                input={{ name: "guardianPayingAmount", label: "Guardian Paying Amount", type: "number" }} />
                            <TextInput value={toDistribute} onChange={() => null}
                                input={{ name: "remaining", label: "Remaining to distribute", readOnly: true }} />
                        </Section>
                        <ButtonsSecion>
                            <Button variant="outlined" type="button" onClick={split}>Split</Button>
                        </ButtonsSecion>
                        <Section title="Payment Form" grid={false}>
                            <form className="w-full flex flex-col items-end" onSubmit={onSubmit}>
                                <div className="w-full overflow-x-auto">
                                    <div className="min-w-[600px] w-full flex flex-col">
                                        <HeaderCard grid={cols}>
                                            <span className="font-semibold flex gap-x-2">title</span>
                                            <span className="font-semibold">rate</span>
                                            <span className="text-left font-semibold">paying amount</span>
                                            <span className="text-left font-semibold">discount amount</span>
                                            <span className="text-left font-semibold">due</span>
                                            <span className="text-left font-semibold">total</span>
                                        </HeaderCard>
                                        {ids.map((id) => {
                                            const due = id === ADVANCE ? 0 : sumMoney([billOf(id), -Number(selected[id] || 0)]);
                                            return (
                                                <RowCard key={id} grid={cols}>
                                                    <span className="capitalize font-semibold">{nameOf(id)}</span>
                                                    <span>{id === ADVANCE ? "" : (byId[id]?.rate ? Number(byId[id].rate) : "")}</span>
                                                    <AmountInput id={id} value={selected[id]} onChange={(key, value) => setSelected((s) => ({ ...s, [key]: value }))} />
                                                    {id === ADVANCE ? <span /> : (
                                                        <AmountInput id={id} value={discounts[id] || ""} onChange={(key, value) => setDiscounts((s) => ({ ...s, [key]: value }))} />
                                                    )}
                                                    <span className="capitalize font-semibold">{due || ""}</span>
                                                    <span className="capitalize font-semibold">{sumMoney([selected[id], -Number(discounts[id] || 0)])}</span>
                                                </RowCard>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="w-full mt-3 flex justify-end">
                                    <div className="w-full sm:w-96 rounded-xl border border-blue-gray-100 bg-white shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2 text-sm">
                                            <span className="text-blue-gray-600">Total paying</span>
                                            <span className="font-semibold text-blue-gray-900">{money(payingTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-2 text-sm border-t border-blue-gray-50">
                                            <span className="text-blue-gray-600">Total discount</span>
                                            <span className="font-semibold text-emerald-700">{money(discountTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-2 text-sm border-t border-blue-gray-50">
                                            <span className="text-blue-gray-600">Total remaining (due)</span>
                                            <span className={`font-semibold ${remainingTotal < 0 ? "text-red-600" : "text-blue-gray-900"}`}>{money(remainingTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-3 border-t-2 border-blue-gray-200 bg-blue-gray-900 text-white">
                                            <span className="font-semibold uppercase tracking-wide text-xs">Grand total to collect</span>
                                            <span className="font-bold text-lg whitespace-nowrap">{money(payingTotal)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col my-2 w-full">
                                    <Typography variant="h6">Upto the month</Typography>
                                    <MonthPicker data={month ? [month] : []} previousData={[]} allMonths={noAllMonths} onSelectAll={() => null}
                                        allowAllMonthSelectAtOnce={false}
                                        onSelect={({ value }) => setMonth(value.filter((m) => m !== month).pop() ?? null)} />
                                </div>
                                <div className="flex flex-col sm:flex-row justify-end items-stretch sm:items-end w-full gap-2">
                                    <TextInput value={info.date} onChange={({ value }) => setInfo((s) => ({ ...s, date: value }))}
                                        input={{ name: "date", label: "Payment Date (BS)", mask: "date" }} />
                                    <SelectInput value={info.mode} onChange={({ value }) => setInfo((s) => ({ ...s, mode: value }))}
                                        input={{ name: "mode", label: "Payment mode", options: modeOptions }} />
                                    <Textarea value={info.remarks} name="remarks" label="Remarks"
                                        onChange={(e) => setInfo((s) => ({ ...s, remarks: e.target.value }))} />
                                </div>
                                <FormSaveButton disabled={!month || !info.date || paying || !(payingTotal > 0)} custom={[paying, "Pay", "Paying"]} />
                            </form>
                        </Section>
                    </>
                )}
            </div>

            <TrialBalance profile={profile} person={person} school={school} updateNotification={updateNotification}
                onChanged={load} onReprint={showReceipt} />

            {receipt && (
                <div className="px-3 mt-2 flex flex-col gap-y-2 w-full">
                    <div className="max-w-full overflow-x-auto">
                        <div ref={receiptRef}><OfficeReceipt receipt={receipt} /></div>
                    </div>
                    <ButtonsSecion>
                        <Button onClick={printReceipt} variant="outlined">Print Bill!</Button>
                        <Button onClick={() => setReceipt(null)} variant="outlined">Close</Button>
                    </ButtonsSecion>
                </div>
            )}
        </>
    );
}

export default PayStudent;
