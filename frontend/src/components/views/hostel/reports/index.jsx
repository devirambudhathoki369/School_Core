import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import BasicTable from "@/components/tables/BasicTable";
import { getHostelReport } from "@/services/functions/hostel";
import { HostelPicker, SetupNeeded, useHostelScope } from "../common";

/**
 * HOSTEL REPORTS.
 *
 * One page, one picker, nine registers — rather than nine menu rows that each
 * open a near-identical screen. Every one goes through BasicTable, so they all
 * inherit search, column sort, column show/hide, print and CSV export without
 * this file knowing anything about any of that.
 *
 * `needsRange` is what decides whether the date boxes are even shown: asking for
 * a date range on "who currently lives here" is a question with no meaningful
 * answer, and a disabled-looking field is worse than an absent one.
 */
const REPORTS = [
    {
        value: "residents", name: "Resident register",
        blurb: "Every current resident with their room, bed, class, fee and emergency contact.",
        columns: [
            ["student_name", "student"], ["roll_no", "roll"], ["hostel_name", "hostel"],
            ["block_name", "block"], ["room_no", "room"], ["bed_no", "bed"],
            ["room_type_name", "room type"], ["check_in_date", "checked in"],
            ["monthly_fee", "monthly"], ["guardian_contact", "guardian"],
            ["emergency_contact_name", "emergency contact"], ["emergency_contact", "emergency no."],
        ],
    },
    {
        value: "occupancy", name: "Room occupancy",
        blurb: "Room by room: capacity, who is in it, what is free.",
        columns: [
            ["hostel_name", "hostel"], ["block_name", "block"], ["room_no", "room"],
            ["floor", "floor"], ["room_type_name", "type"], ["capacity", "beds"],
            ["occupied", "occupied"], ["vacant", "vacant"], ["status_name", "status"],
            ["residents", "residents"],
        ],
    },
    {
        value: "vacancy", name: "Vacancy list",
        blurb: "Only what is free right now — for the admissions desk.",
        columns: [
            ["hostel_name", "hostel"], ["block_name", "block"], ["room_no", "room"],
            ["room_type_name", "type"], ["capacity", "beds"], ["occupied", "occupied"],
            ["vacant", "vacant"],
        ],
    },
    {
        value: "movement", name: "Check-in / check-out",
        blurb: "Every admission, transfer and departure in a date range.",
        needsRange: true,
        columns: [
            ["date", "date"], ["event", "event"], ["student_name", "student"],
            ["hostel_name", "hostel"], ["room_no", "room"],
        ],
    },
    {
        value: "attendance", name: "Roll-call summary",
        blurb: "Present, absent and leave counts per resident, lowest attendance first.",
        needsRange: true,
        columns: [
            ["student_name", "student"], ["days", "nights"], ["present", "present"],
            ["late", "late"], ["absent", "absent"], ["on_leave", "on leave"],
            ["present_pct", "present %"],
        ],
    },
    {
        value: "leaves", name: "Gate passes",
        blurb: "Passes in a date range, with the overdue returns flagged.",
        needsRange: true,
        columns: [
            ["from_date", "from"], ["to_date", "to"], ["student_name", "student"],
            ["leave_type_name", "type"], ["reason", "reason"],
            ["contact_during_leave", "contact"], ["status_name", "status"],
            ["actual_return_date", "returned"],
        ],
    },
    {
        value: "visitors", name: "Visitor register",
        blurb: "The gate register over a date range.",
        needsRange: true,
        columns: [
            ["visit_date", "date"], ["name", "visitor"], ["relation", "relation"],
            ["student_name", "visiting"], ["persons", "people"], ["contact", "contact"],
            ["id_proof", "id"], ["in_time", "in"], ["out_time", "out"], ["purpose", "purpose"],
        ],
    },
    {
        value: "complaints", name: "Complaint register",
        blurb: "What was raised, who owned it, and when it closed.",
        needsRange: true,
        columns: [
            ["reported_date", "reported"], ["title", "complaint"], ["category_name", "category"],
            ["room_no", "room"], ["student_name", "raised by"], ["assigned_to_name", "assigned"],
            ["status_name", "status"], ["resolved_date", "resolved"], ["resolution", "resolution"],
        ],
    },
    {
        value: "dues", name: "Hostel dues & collection",
        blurb: "What each resident has been BILLED and what has been COLLECTED, biggest debtor first. "
            + "Read from the school's real ledgers and receipts — not from a second set of books — so it can never "
            + "disagree with the fee counter. Deposits are shown apart from fees because a deposit is money held, not earned.",
        columns: [
            ["student_name", "student"], ["room_no", "room"], ["hostel_name", "hostel"],
            ["monthly_fee", "rate"], ["billed_monthly", "billed"], ["paid_monthly", "paid"],
            ["due_monthly", "due"], ["billed_admission", "admission billed"],
            ["paid_admission", "admission paid"], ["billed_deposit", "deposit billed"],
            ["paid_deposit", "deposit paid"], ["total_billed", "total billed"],
            ["total_paid", "total paid"], ["total_due", "TOTAL DUE"],
            ["guardian_contact", "guardian"],
        ],
    },
    {
        value: "fee", name: "Hostel fee register",
        blurb: "What each resident is billed a month, plus admission fees and deposits. "
            + "This is the same figure the student's ledger charges as the 'hostel' title — one number, read twice.",
        columns: [
            ["student_name", "student"], ["hostel_name", "hostel"], ["room_no", "room"],
            ["room_type_name", "type"], ["check_in_date", "since"], ["monthly_fee", "monthly"],
            ["admission_fee", "admission"], ["security_deposit", "deposit"],
            ["deposit_paid", "deposit paid"], ["deposit_refunded", "refunded"],
        ],
    },
];

function HostelReports() {
    const { user: { user } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [report, setReport] = useState("residents");
    const [range, setRange] = useState({ from: "", to: "" });
    const [rows, setRows] = useState([]);
    const [fetching, setFetching] = useState(false);
    const [ran, setRan] = useState(false);

    const definition = REPORTS.find((r) => r.value === report) || REPORTS[0];

    async function run() {
        if (!school) return;
        setFetching(true);
        const data = await getHostelReport(school, report, {
            hostel: hostel || undefined,
            from: definition.needsRange ? (range.from || undefined) : undefined,
            to: definition.needsRange ? (range.to || undefined) : undefined,
        });
        setRows(data);
        setRan(true);
        setFetching(false);
    }
    // Re-run whenever the question changes. A report screen that needs a button
    // press after every change of picker is a screen people stop trusting the
    // contents of.
    useEffect(() => { run(); /* eslint-disable-next-line */ }, [school, hostel, report]);

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Hostel reports" description={definition.blurb}>
                <SelectInput input={{ name: "report", label: "Report", options: REPORTS }}
                    value={report} onChange={({ value }) => { setReport(value); setRan(false); }} />
                {options.length > 1 && (
                    <SelectInput input={{ name: "hostel", label: "Hostel", options: [{ value: "", name: "All hostels" }, ...options] }}
                        value={hostel} onChange={({ value }) => setHostel(value)} />
                )}
                {definition.needsRange && (
                    <>
                        <TextInput input={{ name: "from", label: "From (BS)" }} value={range.from}
                            onChange={({ value }) => setRange((s) => ({ ...s, from: value }))} />
                        <TextInput input={{ name: "to", label: "To (BS)" }} value={range.to}
                            onChange={({ value }) => setRange((s) => ({ ...s, to: value }))} />
                    </>
                )}
            </Section>
            {definition.needsRange && (
                <ButtonsSecion>
                    <Button variant="outlined" onClick={run} disabled={fetching}>
                        {fetching ? "Loading…" : "Apply date range"}
                    </Button>
                </ButtonsSecion>
            )}

            {fetching ? <Loader />
                : rows.length < 1
                    ? (ran ? <NotFound error="Nothing to show for this selection." /> : <Loader />)
                    : <BasicTable name={`${definition.name} — ${user?.profile?.name || ""}`}
                        columns={definition.columns} data={rows} />}
        </div>
    );
}

export default HostelReports;
