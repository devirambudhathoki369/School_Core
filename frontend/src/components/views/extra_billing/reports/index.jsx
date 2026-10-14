import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import Loader from "@/components/Loader";
import { getExtraReport } from "@/services/functions/extra_billing";
import { SetupNeeded, StatusPill, Tile, rs, useExtraBillingScope } from "../common";

const REPORTS = [
    { value: "dues", name: "Remaining dues" },
    { value: "statement", name: "Party statement (ledger)" },
    { value: "collection", name: "Collection (receipts)" },
    { value: "charges", name: "Bills raised" },
];

/**
 * A date is one token. A cell folds its text wherever it may, and a hyphen is
 * such a place, so in a narrow column 2083-06-01 came out as "2083-" over
 * "06-01". This cell keeps it on its line.
 */
function OneLine({ data }) {
    return (
        <span className="app-cell-text block text-blue-gray-900 leading-relaxed antialiased font-normal whitespace-nowrap">
            {data}
        </span>
    );
}
const dateColumn = (key, label) => [key, label, undefined, false, undefined, OneLine];

/**
 * The party's own record, carried onto every register that names a party: where
 * they are, how long their agreement runs, what their rate card bills a month,
 * and what they already owed on the day the school entered them. A receipt or a
 * bill read on its own says who paid and how much; with these beside it the same
 * sheet is the tenants' register a school keeps on paper.
 */
const PARTY_COLUMNS = [
    ["address", "address"], dateColumn("agreement_start", "agreement from"),
    dateColumn("agreement_end", "agreement to"), ["monthly", "monthly rate"], ["opening", "old dues"],
];
const partyMoney = (row) => ({ monthly: rs(row.monthly), opening: rs(row.opening) });

/** One fact of a party's record: a label over its value, a dash when blank. */
function Fact({ label, value }) {
    const empty = value === undefined || value === null || `${value}`.trim() === "";
    return (
        <div className="app-record-item">
            <dt className="app-record-label">{label}</dt>
            <dd className={`app-record-value ${empty ? "is-empty" : ""}`}>{empty ? "—" : value}</dd>
        </div>
    );
}

/**
 * THE RECORDS. One page, one picker, four registers — rather than four menu
 * rows that each open a near-identical screen (the hostel module settled on the
 * same shape). Every register goes through BasicTable, so they all inherit
 * search, column sort, show/hide, print and CSV export.
 *
 * Every figure here is read through the server's `methods/balances`, the same
 * code the payment screen collects against, so a dues report and a party's
 * ledger cannot disagree about what is owed.
 */
function ExtraBillingReports() {
    const { user, school, parties, party, setParty, options, loading } =
        useExtraBillingScope({ autoSelect: true });

    const [report, setReport] = useState("dues");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState(user?.today_npt || user?.today || "");
    const [data, setData] = useState(null);
    const [fetching, setFetching] = useState(false);

    async function load() {
        if (!school) return;
        if (report === "statement" && !party) { setData(null); return; }
        setFetching(true);
        const params = report === "statement"
            ? { party }
            : (report === "dues" ? {} : { from: from || undefined, to: to || undefined });
        setData(await getExtraReport(school, report, params));
        setFetching(false);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school, report, party]);

    if (loading) return <Loader />;
    if (parties.length < 1) return <SetupNeeded what="parties" where="Extra Billing > Parties & Charges" />;

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Extra billing records"
                description="What every party was charged, what they paid, and what is still outstanding.">
                <SelectInput input={{ name: "report", label: "Report", options: REPORTS }} value={report}
                    onChange={({ value }) => setReport(value)} />
                {report === "statement" && (
                    <SearchInput input={{ name: "party", label: "Party", options }} value={party}
                        onChange={({ value }) => setParty(value)} />
                )}
                {(report === "collection" || report === "charges") && (
                    <>
                        <TextInput input={{ name: "from", label: "From (BS)" }} value={from}
                            onChange={({ value }) => setFrom(value)} />
                        <TextInput input={{ name: "to", label: "To (BS)" }} value={to}
                            onChange={({ value }) => setTo(value)} />
                    </>
                )}
            </Section>
            {(report === "collection" || report === "charges") && (
                <ButtonsSecion>
                    <Button variant="outlined" onClick={load} disabled={fetching}>
                        {fetching ? "Loading…" : "Show"}
                    </Button>
                </ButtonsSecion>
            )}

            {fetching && <Loader />}

            {!fetching && report === "dues" && data && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Tile label="Charged" value={`Rs. ${rs(data.total_charged)}`} tone="blue" />
                        <Tile label="Collected" value={`Rs. ${rs(data.total_paid)}`} tone="green" />
                        <Tile label="Outstanding" value={`Rs. ${rs(data.total_due)}`}
                            tone={Number(data.total_due) > 0 ? "amber" : "green"} />
                    </div>
                    <BasicTable name="Extra billing — remaining dues" dense showSelected={false}
                        columns={[
                            ["name", "party"], ["party_type_name", "type"], ["property_name", "property"],
                            ["contact", "contact"], ...PARTY_COLUMNS, ["charged", "charged"],
                            ["paid", "paid"], ["balance", "balance"], ["remarks", "remarks"],
                        ]}
                        data={(data.rows || []).map((r) => ({
                            ...r, ...partyMoney(r),
                            charged: rs(r.charged), paid: rs(r.paid), balance: rs(r.balance),
                        }))} />
                </>
            )}

            {!fetching && report === "statement" && data?.party && (
                <>
                    <Section title={`${data.party.name}${data.party.property_name ? ` — ${data.party.property_name}` : ""}`}
                        description={
                            `${data.party.party_type_name}`
                            + (data.party.contact ? ` · ${data.party.contact}` : "")
                        }>
                        <dl className="sm:col-span-12 app-record-grid">
                            <Fact label="Address" value={data.party.address} />
                            <Fact label="Agreement from" value={data.party.agreement_start} />
                            <Fact label="Agreement to" value={data.party.agreement_end} />
                            <Fact label="Monthly rate" value={`Rs. ${rs(data.party.monthly)}`} />
                            <Fact label="Old dues" value={`Rs. ${rs(data.party.opening_due)}`} />
                            <Fact label="Remarks" value={data.party.remarks} />
                        </dl>
                        <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
                            <StatusPill tone={Number(data.balance) > 0 ? "amber" : "green"}
                                text={`Balance Rs. ${rs(data.balance)}`} />
                            {(data.outstanding || []).filter((o) => Number(o.due) > 0).map((o) => (
                                <StatusPill key={o.title} tone="gray" text={`${o.name}: ${rs(o.due)}`} />
                            ))}
                        </div>
                    </Section>
                    <BasicTable name={`Statement — ${data.party.name}`} showSelected={false}
                        columns={[
                            dateColumn("date", "date"), ["particular", "particular"], ["charge", "charge"],
                            ["payment", "payment"], ["balance", "balance"], ["remarks", "remarks"],
                            ["status", "status"],
                        ]}
                        data={(data.entries || []).map((e) => ({
                            ...e,
                            charge: Number(e.charge) ? rs(e.charge) : "",
                            payment: Number(e.payment) ? rs(e.payment) : "",
                            balance: rs(e.balance),
                            status: e.is_active ? "" : "voided",
                        }))} />
                </>
            )}

            {!fetching && report === "collection" && data && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Tile label="Collected" value={`Rs. ${rs(data.total)}`} tone="green"
                            hint={`${(data.rows || []).length} receipt(s)`} />
                        {(data.by_mode || []).slice(0, 2).map((m) => (
                            <Tile key={m.name} label={m.name} value={`Rs. ${rs(m.total)}`} tone="blue" />
                        ))}
                    </div>
                    <BasicTable name="Extra billing — collection" dense showSelected={false}
                        columns={[
                            ["invoice_id", "receipt no."], dateColumn("date", "date"), ["name", "party"],
                            ["property_name", "property"], ...PARTY_COLUMNS, ["mode_name", "mode"],
                            ["total_paid", "paid"], ["remarks", "remarks"], ["party_remarks", "party remarks"],
                        ]}
                        data={(data.rows || []).map((r) => ({
                            ...r, ...partyMoney(r), total_paid: rs(r.total_paid),
                        }))} />
                    {(data.by_title || []).length > 0 && (
                        <BasicTable name="Collection by title" showSelected={false}
                            columns={[["name", "title"], ["total", "collected"]]}
                            data={data.by_title.map((t) => ({ ...t, total: rs(t.total) }))} />
                    )}
                </>
            )}

            {!fetching && report === "charges" && data && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Tile label="Billed" value={`Rs. ${rs(data.total)}`} tone="blue"
                            hint={`${(data.rows || []).length} bill(s)`} />
                    </div>
                    <BasicTable name="Extra billing — bills raised" dense showSelected={false}
                        columns={[
                            dateColumn("date", "date"), ["name", "party"], ["property_name", "property"],
                            ...PARTY_COLUMNS, ["months_name", "months"], ["total", "amount"],
                            ["remarks", "remarks"], ["party_remarks", "party remarks"],
                        ]}
                        data={(data.rows || []).map((r) => ({
                            ...r, ...partyMoney(r), total: rs(r.total),
                        }))} />
                    {(data.by_title || []).length > 0 && (
                        <BasicTable name="Billed by title" showSelected={false}
                            columns={[["name", "title"], ["total", "billed"]]}
                            data={data.by_title.map((t) => ({ ...t, total: rs(t.total) }))} />
                    )}
                </>
            )}
        </div>
    );
}

export default ExtraBillingReports;
