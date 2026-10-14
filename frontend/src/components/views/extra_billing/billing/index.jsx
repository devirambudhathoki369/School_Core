import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import Loader from "@/components/Loader";
import monthOptions from "@/components/inputs/options/months";
import { getPostings, raiseBills, withdrawPosting } from "@/services/functions/extra_billing";
import { SetupNeeded, StatusPill, Tile, rs, useExtraBillingScope } from "../common";

/**
 * RAISING THE BILLS — this module's Ledger posting.
 *
 * Pick the months, tick the parties, post. Each party is charged their own
 * monthly rate times the months chosen, and the bill lands on their account the
 * moment it is posted.
 *
 * THE ONE MISTAKE THIS SCREEN MUST NOT MAKE IS BILLING A MONTH TWICE. It is
 * silent — nothing errors, the tenant simply owes double until somebody adds up
 * their own receipts. So a party already billed for a month in this fiscal year
 * is shown as such BEFORE posting, is skipped by the server if posted anyway,
 * and the result says who was skipped rather than leaving it to be discovered.
 */
function ExtraBillingRun() {
    const { user, school, parties, loading, reload, updateNotification } = useExtraBillingScope();

    const [months, setMonths] = useState([]);
    const [picked, setPicked] = useState([]);
    const [date, setDate] = useState(user?.today_npt || user?.today || "");
    const [remarks, setRemarks] = useState("");
    const [history, setHistory] = useState([]);
    const [alreadyPosted, setAlreadyPosted] = useState({});
    const [result, setResult] = useState(null);
    const [saving, setSaving] = useState(false);

    async function load() {
        if (!school) return;
        const { postings, already_posted } = await getPostings(school);
        setHistory(postings);
        setAlreadyPosted(already_posted);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    function toggleMonth(value) {
        setMonths((s) => s.includes(value) ? s.filter((m) => m !== value) : [...s, value]);
    }
    function toggleParty(id) {
        setPicked((s) => s.includes(id) ? s.filter((p) => p !== id) : [...s, id]);
    }
    /** Has this party already been billed for EVERY month currently chosen? */
    function isCovered(partyId) {
        if (months.length < 1) return false;
        const done = alreadyPosted[String(partyId)] || [];
        return months.every((m) => done.includes(m));
    }

    async function onPost(e) {
        e.preventDefault();
        if (months.length < 1) return updateNotification("", "Choose at least one month.");
        if (picked.length < 1) return updateNotification("", "Choose at least one party.");
        const billable = picked.filter((id) => !isCovered(id));
        const ok = await confirmAction({
            title: `Raise ${months.length} month(s) for ${picked.length} party(ies)?`,
            tone: "info",
            confirmText: "Raise bills",
            body: billable.length < picked.length
                ? `${picked.length - billable.length} of them are already billed for those months and will be skipped. `
                  + `The rest are charged their monthly rate × ${months.length} month(s).`
                : `Each is charged their monthly rate × ${months.length} month(s). `
                  + `A bill run can be withdrawn afterwards as long as nobody has paid against it.`,
        });
        if (!ok) return;
        setSaving(true);
        const [status, message, data] = await raiseBills({
            school, months, parties: picked, date: date || undefined, remarks: remarks || undefined,
        });
        setSaving(false);
        if (status === 200) {
            setResult(data);
            updateNotification(200, data?.message || message || "Posted!");
            setPicked([]); setMonths([]); load(); reload();
        } else updateNotification(400, message || "Failed.");
    }

    async function onWithdraw(run) {
        const ok = await confirmAction({
            title: `Withdraw the run of ${run.months_name}?`,
            tone: "warning",
            confirmText: "Withdraw",
            body: "The bills raised by this run stop counting towards what those parties owe. Nothing is deleted — "
                + "the run stays on the record. It is refused if any receipt has been issued since.",
        });
        if (!ok) return;
        const [status, message] = await withdrawPosting(school, run.id);
        if (status === 200) { updateNotification(200, message || "Withdrawn."); load(); reload(); }
        else updateNotification(400, message || "Could not withdraw.");
    }

    if (loading) return <Loader />;
    if (parties.length < 1) return <SetupNeeded what="parties" where="Extra Billing > Parties & Charges" />;

    const selectedTotal = picked
        .filter((id) => !isCovered(id))
        .reduce((sum, id) => {
            const p = parties.find((x) => String(x.id) === String(id));
            return sum + Number(p?.monthly || 0) * months.length;
        }, 0);

    return (
        <div className="flex flex-col gap-y-4">
            <form onSubmit={onPost}>
                <Section title="Raise bills"
                    description={
                        "Choose the months, then the parties. Each is charged their own monthly rate for every "
                        + "month chosen.\nA party already billed for those months is marked below and will be skipped."
                    }>
                    <div className="sm:col-span-12 flex flex-wrap gap-2">
                        {monthOptions.map((m) => (
                            <button type="button" key={m.value} onClick={() => toggleMonth(m.value)}
                                className={`rounded-full border px-3 py-1 text-sm font-semibold capitalize ${
                                    months.includes(m.value)
                                        ? "border-teal-500 bg-teal-50 text-teal-800"
                                        : "border-gray-200 bg-white text-gray-600"}`}>
                                {m.name}
                            </button>
                        ))}
                    </div>
                    <TextInput input={{ name: "date", label: "Bill date (BS)" }} value={date}
                        onChange={({ value }) => setDate(value)} />
                    <TextInput input={{ name: "remarks", label: "Remarks" }} value={remarks}
                        onChange={({ value }) => setRemarks(value)} />
                </Section>

                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2 w-10">
                                    <input type="checkbox" aria-label="Choose every party"
                                        checked={picked.length > 0 && picked.length === parties.length}
                                        onChange={(e) => setPicked(e.target.checked ? parties.map((p) => p.id) : [])} />
                                </th>
                                <th className="px-3 py-2">Party</th>
                                <th className="px-3 py-2">Property</th>
                                <th className="px-3 py-2 text-right">Per month</th>
                                <th className="px-3 py-2 text-right">This run</th>
                                <th className="px-3 py-2 text-right">Balance</th>
                                <th className="px-3 py-2">Already billed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parties.map((p) => {
                                const done = alreadyPosted[String(p.id)] || [];
                                const covered = isCovered(p.id);
                                return (
                                    <tr key={p.id} className={`border-t border-gray-100 ${covered ? "opacity-60" : ""}`}>
                                        <td className="px-3 py-2">
                                            <input type="checkbox" aria-label={`Choose ${p.name}`}
                                                checked={picked.includes(p.id)}
                                                onChange={() => toggleParty(p.id)} />
                                        </td>
                                        <td className="px-3 py-2 font-semibold">{p.name}</td>
                                        <td className="px-3 py-2">{p.property_name || "—"}</td>
                                        <td className="px-3 py-2 text-right">{rs(p.monthly)}</td>
                                        <td className="px-3 py-2 text-right">
                                            {covered ? "—" : rs(Number(p.monthly || 0) * months.length)}
                                        </td>
                                        <td className="px-3 py-2 text-right">{rs(p.balance)}</td>
                                        <td className="px-3 py-2">
                                            {done.length < 1 ? <span className="text-gray-400">—</span> : (
                                                <div className="flex flex-wrap gap-1">
                                                    {done.map((m) => (
                                                        <StatusPill key={m} tone={months.includes(m) ? "red" : "gray"}
                                                            text={monthOptions.find((o) => o.value === m)?.name || m} />
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <ButtonsSecion>
                    <span className="mr-auto text-sm font-semibold text-gray-700">
                        {picked.length} party(ies) · {months.length} month(s) · Rs. {rs(selectedTotal)}
                    </span>
                    <Button variant="outlined" type="submit" disabled={saving || picked.length < 1 || months.length < 1}>
                        {saving ? "Posting…" : "Raise bills"}
                    </Button>
                </ButtonsSecion>
            </form>

            {result && (
                <Section title="What this run did" description={result.message}>
                    <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Tile label="Billed" value={result.posted?.length || 0} tone="green"
                            hint={`Rs. ${rs(result.total)}`} />
                        <Tile label="Skipped (already billed)" value={result.skipped?.length || 0} tone="amber" />
                        <Tile label="No monthly charge set" value={result.without_rate?.length || 0} tone="gray" />
                    </div>
                    {(result.skipped?.length > 0 || result.without_rate?.length > 0) && (
                        <div className="sm:col-span-12 text-sm text-gray-600">
                            {result.skipped?.length > 0 && (
                                <p><span className="font-semibold">Skipped:</span>{" "}
                                    {result.skipped.map((s) => s.name).join(", ")}</p>
                            )}
                            {result.without_rate?.length > 0 && (
                                <p><span className="font-semibold">No rate set:</span>{" "}
                                    {result.without_rate.map((s) => s.name).join(", ")}</p>
                            )}
                        </div>
                    )}
                </Section>
            )}

            <Section title="Runs this fiscal year"
                description="Every bill run made in the current economic year, newest first.">
                <div className="sm:col-span-12">
                    {history.length < 1 ? (
                        <p className="text-sm text-gray-500">Nothing has been billed yet this year.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-table-header text-left">
                                    <tr>
                                        <th className="px-3 py-2">Date</th>
                                        <th className="px-3 py-2">Months</th>
                                        <th className="px-3 py-2 text-right">Parties</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2">Remarks</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((run) => (
                                        <tr key={run.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2">{run.date}</td>
                                            <td className="px-3 py-2 capitalize">{run.months_name}</td>
                                            <td className="px-3 py-2 text-right">{run.parties}</td>
                                            <td className="px-3 py-2 text-right font-semibold">{rs(run.total)}</td>
                                            <td className="px-3 py-2">{run.remarks || "—"}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex justify-end">
                                                    <button type="button" aria-label="Withdraw run"
                                                        onClick={() => onWithdraw(run)}
                                                        className="p-1.5 rounded bg-rose-50 text-rose-600">
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Section>
        </div>
    );
}

export default ExtraBillingRun;
