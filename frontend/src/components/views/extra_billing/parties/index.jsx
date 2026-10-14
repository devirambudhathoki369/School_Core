import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { SearchInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction, viewAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import { PARTY_TYPES, nameOf } from "@/configs/extra_billing";
import {
    deleteParty, deleteTitle, getPartyCharges, getTitles,
    savePartyCharges, saveTitle,
} from "@/services/functions/extra_billing";
import { SetupNeeded, StatusPill, rs, useExtraBillingScope } from "../common";
import PartyDetailsDialog from "./PartyDetailsDialog";
import PartyFormDialog from "./PartyFormDialog";

const emptyTitle = () => ({ title: "", order: 0, remarks: "" });

// The party as one cell: who they are, what kind of payer, and where — what
// tells two tenants of the same name apart. Below lg the Balance column has no
// room beside the row's buttons, so what they owe is said here instead.
function PartyCell({ item }) {
    const about = [item?.party_type_name, item?.address].filter(Boolean).join(" · ");
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block min-w-0 break-words text-blue-gray-900 !font-semibold leading-relaxed">
                {item?.name}
            </span>
            {about && <span className="block break-words text-meta text-[var(--ink-500)]">{about}</span>}
            <span className="mt-1 block lg:hidden">
                <StatusPill text={`Balance ${rs(item?.balance)}`} tone={Number(item?.balance) > 0 ? "amber" : "green"} />
            </span>
        </div>
    );
}

// A value that may be missing: a dash, so an empty cell reads as "not entered"
// rather than as a gap in the table.
function Plain({ data }) {
    const empty = data === undefined || data === null || `${data}`.trim() === "";
    return (
        <span className={`app-cell-text block px-2 leading-relaxed break-words ${empty ? "!text-[var(--ink-400)]" : "text-blue-gray-900"}`}>
            {empty ? "—" : data}
        </span>
    );
}

// Rupees, on one line. A zero is dimmed: in a register of 350 the amounts that
// are there are what the eye is looking for.
function Money({ data }) {
    return (
        <span className={`app-cell-text block px-2 leading-relaxed whitespace-nowrap tabular-nums ${Number(data) ? "text-blue-gray-900" : "!text-[var(--ink-400)]"}`}>
            {rs(data)}
        </span>
    );
}

function Balance({ data }) {
    return (
        <span className="block px-2">
            <StatusPill text={rs(data)} tone={Number(data) > 0 ? "amber" : "green"} />
        </span>
    );
}

// Every field of a party. All of them are searched and exported; the grid
// draws what finds a party and says what they owe, and leaves the rest to the
// row's View, so the table fits its card instead of scrolling sideways.
const PARTY_COLUMNS = [
    ["name", "party", null, false, null, PartyCell],
    ["property_name", "property", null, false, null, Plain],
    ["contact", "contact", null, false, null, Plain],
    ["opening_due", "old dues", null, false, null, Money],
    ["monthly", "per month", null, false, null, Money],
    ["charged", "charged", null, false, null, Money],
    ["paid", "paid", null, false, null, Money],
    ["balance", "balance", null, false, null, Balance],
    ["party_type_name", "type"],
    ["address", "address"],
    ["agreement_start", "agreement from"],
    ["agreement_end", "agreement to"],
    ["remarks", "remarks"],
];
const PARTY_DETAIL_COLUMNS = ["party_type_name", "address", "agreement_start", "agreement_end", "remarks"];
const PARTY_ACTIONS = [viewAction, editAction, deleteAction];

/**
 * WHO THE SCHOOL BILLS BESIDES ITS STUDENTS, AND WHAT THEY PAY.
 *
 * Three things live on this page because they are set up once, together, and
 * are meaningless apart: the charge heads (Rent, Water…), the parties, and each
 * party's monthly rate card.
 *
 * The parties are a register of hundreds, corrected one at a time (a phone
 * number, an old due), so they are a table that is searched, and the form
 * opens over it: the party is edited where it was found.
 *
 * The rate card is a RATE, not a bill. Editing it never changes a bill already
 * raised — the amount is copied onto the ledger row when a month is posted, the
 * same way a hostel rate is copied onto a resident's allocation. The note under
 * the form says so, because that is exactly the assumption that otherwise costs
 * a school a month of wrong bills.
 */
function ExtraBillingParties() {
    const { school, parties, party, setParty, options, loading, reload, updateNotification } =
        useExtraBillingScope();

    const [titles, setTitles] = useState([]);
    const [titleForm, setTitleForm] = useState(emptyTitle());
    const [editingTitle, setEditingTitle] = useState(null);
    // `party` stays as it was on closing: the form still shows it as it fades.
    const [partyForm, setPartyForm] = useState({ open: false, party: null });
    const [viewedParty, setViewedParty] = useState(null);
    const [charges, setCharges] = useState([]);
    const [saving, setSaving] = useState(false);
    const chargesRef = useRef(null);

    // Amounts as numbers: the columns then sort by value and reach Excel as
    // figures, and the cells set them out as rupees.
    const partyRows = useMemo(() => parties.map((p) => ({
        ...p,
        party_type_name: p.party_type_name || nameOf(PARTY_TYPES, p.party_type),
        opening_due: Number(p.opening_due || 0), monthly: Number(p.monthly || 0),
        charged: Number(p.charged || 0), paid: Number(p.paid || 0), balance: Number(p.balance || 0),
    })), [parties]);

    async function loadTitles() {
        if (!school) return;
        setTitles(await getTitles(school));
    }
    useEffect(() => { loadTitles(); /* eslint-disable-next-line */ }, [school]);

    async function loadCharges() {
        if (!party) { setCharges([]); return; }
        setCharges(await getPartyCharges(school, party));
    }
    useEffect(() => { loadCharges(); /* eslint-disable-next-line */ }, [party, titles.length]);

    /* --------------------------------------------------------------- titles */
    async function onSaveTitle(e) {
        e.preventDefault();
        if (!titleForm.title.trim()) return updateNotification("", "A title is required.");
        setSaving(true);
        const [status, message] = await saveTitle({
            ...titleForm, id: editingTitle || undefined, school, title: titleForm.title.trim(),
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, editingTitle ? "Title updated!" : "Title added!");
            setTitleForm(emptyTitle()); setEditingTitle(null); loadTitles();
        } else updateNotification(400, message || "Failed.");
    }
    async function onDeleteTitle(t) {
        if (!await confirmAction({
            title: `Remove ${t.title}?`,
            confirmText: "Remove",
            body: "A title that has already been billed cannot be removed — old bills and receipts have to keep "
                + "meaning what they said. Rename it instead if it is wrong.",
        })) return;
        const [status, message] = await deleteTitle(school, t.id);
        if (status === 200) { updateNotification(200, "Title removed!"); loadTitles(); }
        else updateNotification(400, message || "In use.");
    }

    /* -------------------------------------------------------------- parties */
    function openPartyForm(p = null) {
        setViewedParty(null);
        setPartyForm({ open: true, party: p });
    }
    function closePartyForm() {
        setPartyForm((state) => ({ ...state, open: false }));
    }
    async function onPartySaved(sent, wasEdit) {
        closePartyForm();
        const list = await reload();
        // Old dues are history once the party has a bill or a receipt: the
        // server keeps the figure it has. Said, rather than left to be found.
        const kept = wasEdit ? (list || []).find((p) => String(p.id) === String(sent.id)) : null;
        if (kept && Number(kept.opening_due || 0) !== Number(sent.opening_due || 0)) {
            updateNotification("", `Saved, but old dues stay at Rs. ${rs(kept.opening_due)}: `
                + "this party already has a bill or a receipt.");
        } else updateNotification(200, wasEdit ? "Party updated!" : "Party added!");
    }
    async function onDeleteParty(p) {
        if (!await confirmAction({
            title: `Remove ${p.name}?`,
            confirmText: "Remove",
            body: "A party who has ever been billed or has paid cannot be removed — that record has to stay. "
                + "Only one entered by mistake, with no money against them, can be deleted.",
        })) return;
        const [status, message] = await deleteParty(school, p.id);
        if (status === 200) { updateNotification(200, "Party removed!"); reload(); }
        else updateNotification(400, message || "In use.");
    }
    function onPartyAction(action, id, item) {
        if (action === "view") setViewedParty(item);
        else if (action === "edit") openPartyForm(item);
        else if (action === "delete") onDeleteParty(item);
    }
    // From a party's record straight to what they pay a month: the rate card
    // below takes that party, and the page goes to it.
    function showCharges(p) {
        setViewedParty(null);
        setParty(p.id);
        setTimeout(() => chargesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    }

    /* ------------------------------------------------------------ rate card */
    async function onSaveCharges(e) {
        e.preventDefault();
        if (!party) return;
        setSaving(true);
        const [status, message, data] = await savePartyCharges(
            school, party, charges.map((c) => ({ title: c.id, amount: c.amount || 0 }))
        );
        setSaving(false);
        if (status === 200) {
            updateNotification(200, `Saved — Rs. ${rs(data?.monthly || 0)} per month.`);
            reload(); loadCharges();
        } else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;

    const monthly = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    return (
        <div className="flex flex-col gap-y-4">
            {/* ---------------------------------------------------- charge heads */}
            <form onSubmit={onSaveTitle}>
                <Section title={editingTitle ? "Edit charge head" : "Charge heads"}
                    description={
                        "What the school raises money under: Rent, Water, Electricity, Service charge.\n"
                        + "One list for the whole school — every report groups money by these, so the same rupees "
                        + "always land in the same row."
                    }>
                    <TextInput input={{ name: "title", label: "Title (e.g. Rent)", required: true }}
                        value={titleForm.title}
                        onChange={({ value }) => setTitleForm((s) => ({ ...s, title: value }))} />
                    <TextInput input={{ name: "order", label: "Order on the bill", type: "number" }}
                        value={titleForm.order}
                        onChange={({ value }) => setTitleForm((s) => ({ ...s, order: value }))} />
                    <TextInput input={{ name: "remarks", label: "Remarks" }} value={titleForm.remarks}
                        onChange={({ value }) => setTitleForm((s) => ({ ...s, remarks: value }))} />
                </Section>
                <ButtonsSecion>
                    {editingTitle && <Button variant="text" type="button"
                        onClick={() => { setTitleForm(emptyTitle()); setEditingTitle(null); }}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={saving}>
                        {saving ? "Saving…" : editingTitle ? "Update title" : "Add title"}
                    </Button>
                </ButtonsSecion>
            </form>

            {titles.length < 1 ? <SetupNeeded what="charge heads" where="the form above" /> : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Title</th>
                                <th className="px-3 py-2 text-right">Order</th>
                                <th className="px-3 py-2 text-right">Parties billed</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {titles.map((t) => (
                                <tr key={t.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2 font-semibold">{t.title}</td>
                                    <td className="px-3 py-2 text-right">{t.order}</td>
                                    <td className="px-3 py-2 text-right">{t.parties}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            <button type="button" aria-label="Edit"
                                                onClick={() => { setTitleForm({ title: t.title, order: t.order, remarks: t.remarks || "" }); setEditingTitle(t.id); }}
                                                className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                            <button type="button" aria-label="Remove" onClick={() => onDeleteTitle(t)}
                                                className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --------------------------------------------------------- party */}
            <BasicTable name="Parties" columns={PARTY_COLUMNS} detailColumns={PARTY_DETAIL_COLUMNS}
                // the row's own View opens the whole record, on every screen
                rowView={false} mobileColumns={["name"]}
                wideColumns={["monthly", "charged", "paid"]}
                data={partyRows} showSelected={false} dense
                actions={PARTY_ACTIONS} onSelect={onPartyAction}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => openPartyForm()}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add party
                    </Button>
                } />

            {/* ----------------------------------------------------- rate card */}
            {parties.length > 0 && titles.length > 0 && (
                <form onSubmit={onSaveCharges} ref={chargesRef} className="scroll-mt-3">
                    <Section title="Monthly charges"
                        description={
                            "What this party owes every month, title by title. Leave a title at 0 and it is simply "
                            + "not billed to them.\n"
                            + "This is the RATE, not the bill: changing it never touches a bill already raised — "
                            + "the amount is copied onto the bill when the month is posted."
                        }>
                        <SearchInput input={{ name: "party", label: "Party", options }} value={party}
                            onChange={({ value }) => setParty(value)} />
                    </Section>
                    {party && (
                        <>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left">
                                        <tr>
                                            <th className="px-3 py-2">Title</th>
                                            <th className="px-3 py-2 text-right w-48">Amount per month (Rs.)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {charges.map((c, i) => (
                                            <tr key={c.id} className="border-t border-gray-100">
                                                <td className="px-3 py-2 font-semibold">{c.title}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <input type="number" step="0.01" min="0" value={c.amount ?? ""}
                                                        className="w-40 rounded border border-gray-300 px-2 py-1 text-right"
                                                        onChange={(e) => setCharges((s) => s.map((row, idx) =>
                                                            idx === i ? { ...row, amount: e.target.value } : row))} />
                                                </td>
                                            </tr>
                                        ))}
                                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                                            <td className="px-3 py-2 font-bold text-right">Per month</td>
                                            <td className="px-3 py-2 font-bold text-right">{rs(monthly)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <ButtonsSecion>
                                <Button variant="outlined" type="submit" disabled={saving}>
                                    {saving ? "Saving…" : "Save monthly charges"}
                                </Button>
                            </ButtonsSecion>
                        </>
                    )}
                </form>
            )}

            <PartyFormDialog open={partyForm.open} party={partyForm.party} school={school}
                onClose={closePartyForm} onSaved={onPartySaved} />
            <PartyDetailsDialog party={viewedParty} onClose={() => setViewedParty(null)}
                onEdit={openPartyForm} onCharges={titles.length > 0 ? showCharges : null} />
        </div>
    );
}

export default ExtraBillingParties;
