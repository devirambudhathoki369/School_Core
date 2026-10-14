import { useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { formatImagePath } from "@/methods/formatMediaPath";
import {
    MagnifyingGlassIcon, ChevronLeftIcon, IdentificationIcon, PlusIcon,
    CheckCircleIcon, TrashIcon, DocumentDuplicateIcon, PhotoIcon,
    ArrowUturnLeftIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import CardDesigner from "@/components/designer/CardDesigner";
import {
    getAllIDCardTemplates, createIDCardTemplate, saveIDCardTemplate,
    deleteIDCardTemplate, saveIDCardBackground,
} from "@/services/functions/idcardTemplates";

/**
 * The superadmin's ID-card designer.
 *
 * A school's cards were, until now, one hardcoded 300x450 component with a
 * handful of `showBloodGroup`-style booleans chosen at print time. Every school
 * therefore printed the same card in the same order in the same font, and a
 * school with its own artwork could not use it at all.
 *
 * NOTHING HERE CHANGES A SCHOOL'S CARDS UNTIL SOMEONE ACTIVATES A DESIGN. The
 * table starts empty; `IDCard` falls back to the layout it has always drawn
 * when a school has no ACTIVE template. That is the property that makes this
 * safe to ship to a hundred live schools at once — and it is why "duplicate"
 * never produces an active design, and why deleting the active one says out
 * loud that the school just went back to the built-in card.
 */

// What the canvas is populated with while designing. Real-looking, and
// deliberately LONG in the fields that overflow — a card designed against
// "Ram" and printed for "Shailendra Bahadur Bishwakarma" is the commonest way
// a layout turns out wrong only after a thousand of them are printed.
const SAMPLE = {
    student: {
        name: "Shailendra Bahadur Bishwakarma",
        classname: "Class Nine 'B'",
        section: "B",
        roll_no: "24",
        symbol_no: "7801234",
        guardian_name: "Kamala Devi Bishwakarma",
        birth_date: "2065-04-12",
        blood_group: "B+",
        address: "Tulsipur-06, Dang, Lumbini",
        contact: "9801234567",
        emis: "220140087",
        bus_station: "Ghorahi Bus Park",
        admission_no: "A-2081-0142",
        validity: "2082-03-31",
        school_name: "Shree Janata Secondary School",
        school_address: "Tulsipur, Dang",
        school_contact: "082-520123",
        qr_value: "https://example.org/profiles?org=1&user=1",
        barcode_value: "10024",
    },
    staff: {
        name: "Sarita Kumari Adhikari",
        designation: "Senior Mathematics Teacher",
        staff_role: "Teacher",
        citizenship_no: "27-01-70-01234",
        birth_date: "2045-09-03",
        blood_group: "O+",
        address: "Ghorahi-15, Dang",
        contact: "9857012345",
        email: "sarita@example.org",
        joined_date: "2072-04-01",
        validity: "2082-03-31",
        school_name: "Shree Janata Secondary School",
        school_address: "Tulsipur, Dang",
        school_contact: "082-520123",
        qr_value: "https://example.org/profiles?org=1&user=2&role=staff",
    },
};

// ---- the landing grid -------------------------------------------------------
function SchoolsGrid({ schools, onPick }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");

    const designedCount = schools.filter(s => (s.templates || []).some(t => t.is_active)).length;
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return schools.filter((s) => {
            if (q && !(s.name || "").toLowerCase().includes(q)) return false;
            const designed = (s.templates || []).some(t => t.is_active);
            if (filter === "designed") return designed;
            if (filter === "builtin") return !designed;
            return true;
        });
    }, [schools, query, filter]);

    const chips = [
        { key: "all", label: `All (${schools.length})` },
        { key: "designed", label: `Designed (${designedCount})` },
        { key: "builtin", label: `Built-in card (${schools.length - designedCount})` },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-blue-gray-800">ID card designs</h2>
                    <p className="text-[0.85rem] text-blue-gray-500">
                        Pick a school to design the cards it prints. A school with no active
                        design keeps the built-in card.
                    </p>
                </div>
                <div className="flex items-center gap-2 rounded-full border border-blue-gray-200 bg-white px-3 py-2 shadow-sm sm:w-72">
                    <MagnifyingGlassIcon className="h-4 w-4 shrink-0 text-teal-700" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search schools"
                        className="w-full bg-transparent text-sm focus:outline-none" />
                </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1.5">
                {chips.map(c => (
                    <button key={c.key} type="button" onClick={() => setFilter(c.key)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${filter === c.key
                            ? "border-teal-500 bg-teal-600 text-white"
                            : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                        {c.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((school) => {
                    const active = (school.templates || []).filter(t => t.is_active);
                    return (
                        <button key={school.id} type="button" onClick={() => onPick(school)}
                            className="group rounded-xl border border-blue-gray-100 bg-white p-4 text-left shadow-sm transition-all duration-150 hover:border-teal-300 hover:shadow-md">
                            <div className="flex min-w-0 items-center gap-3">
                                {school.profile?.logo
                                    ? <img src={formatImagePath(school.profile.logo)} alt=""
                                        className="h-12 w-12 shrink-0 rounded-lg bg-blue-gray-50 object-contain ring-1 ring-blue-gray-100" />
                                    : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-gray-100 font-bold text-blue-gray-300">
                                        {(school.name || "?").charAt(0)}</span>}
                                <div className="min-w-0 flex-1">
                                    <span className="block truncate font-bold text-blue-gray-800">{school.name}</span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                        {active.length > 0
                                            ? active.map(t => (
                                                <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[0.72rem] font-semibold capitalize text-teal-700">
                                                    <CheckCircleIcon className="h-3 w-3" />{t.card_type}
                                                </span>))
                                            : <span className="rounded-full bg-blue-gray-50 px-2 py-0.5 text-[0.72rem] font-semibold text-blue-gray-500">
                                                Built-in card</span>}
                                        {(school.templates || []).length > 0 &&
                                            <span className="text-[0.72rem] text-blue-gray-500">
                                                {school.templates.length} design{school.templates.length === 1 ? "" : "s"}
                                            </span>}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-end text-sm font-semibold text-teal-700 opacity-70 group-hover:opacity-100">
                                <IdentificationIcon className="mr-1 h-4 w-4" /> Design cards
                            </div>
                        </button>
                    );
                })}
                {filtered.length === 0 &&
                    <p className="col-span-full py-10 text-center text-blue-gray-400">No school matches.</p>}
            </div>
        </div>
    );
}

// ---- the editor -------------------------------------------------------------
function Editor({ school, options, onBack, onChanged }) {
    const { notification: { updateNotification } } = useAppContext();
    const [cardType, setCardType] = useState("student");
    const [templates, setTemplates] = useState(school.templates || []);
    const [currentId, setCurrentId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    const mine = useMemo(
        () => templates.filter(t => t.card_type === cardType),
        [templates, cardType]
    );
    const current = useMemo(
        () => mine.find(t => t.id === currentId) || null,
        [mine, currentId]
    );

    // Opening a card type lands on its active design — the one that is actually
    // being printed is what someone came here to look at.
    useEffect(() => {
        if (current) return;
        const next = mine.find(t => t.is_active) || mine[0];
        setCurrentId(next?.id ?? null);
    }, [mine, current]);

    // The draft is a working copy. Editing `templates` directly would mean a
    // half-finished layout is what the list, the "active" badge and the school
    // grid all read from — and abandoning an edit would be impossible.
    useEffect(() => {
        setDraft(current ? { ...current, layout: [...(current.layout || [])] } : null);
    }, [currentId, current?.updated_at]);

    const size = draft
        ? (options?.sizes?.[draft.orientation] || { width: 300, height: 450 })
        : { width: 300, height: 450 };
    const fields = options?.fields?.[cardType] || [];

    function patch(changes) {
        setDraft(d => (d ? { ...d, ...changes } : d));
    }

    function absorb(template) {
        setTemplates(list => {
            const without = list.filter(t => t.id !== template.id);
            // Activating one design stands the others down; the list has to show
            // that immediately or two would read as active until a refresh.
            const reset = template.is_active
                ? without.map(t => (t.card_type === template.card_type ? { ...t, is_active: false } : t))
                : without;
            return [...reset, template];
        });
        setCurrentId(template.id);
        onChanged?.(template);
    }

    async function create(preset = "classic") {
        setSaving(true);
        const [status, message, data] = await createIDCardTemplate({
            school: school.id, card_type: cardType, preset,
            name: `${preset === "classic" ? "Classic" : "Modern"} ${cardType} card`,
        });
        updateNotification(status, message);
        if (data?.template) absorb(data.template);
        setSaving(false);
    }

    async function duplicate() {
        if (!draft) return;
        setSaving(true);
        const [status, message, data] = await createIDCardTemplate({
            school: school.id, card_type: cardType, duplicate: draft.id,
        });
        updateNotification(status, message);
        if (data?.template) absorb(data.template);
        setSaving(false);
    }

    async function save(extra = {}) {
        if (!draft) return;
        setSaving(true);
        const [status, message, data] = await saveIDCardTemplate({
            id: draft.id,
            school: school.id,
            name: draft.name,
            card_type: draft.card_type,
            orientation: draft.orientation,
            background_color: draft.background_color,
            layout: draft.layout,
            ...extra,
        });
        updateNotification(status, message);
        if (data?.template) absorb(data.template);
        setSaving(false);
    }

    async function remove() {
        if (!draft) return;
        const [status, message, data] = await deleteIDCardTemplate(draft.id, school.id);
        if (!status) return;                      // the confirm dialog was declined
        updateNotification(status, message);
        if (status === 200) {
            setTemplates(list => list.filter(t => t.id !== draft.id));
            setCurrentId(null);
            if (data?.reverted_to_builtin) {
                updateNotification("", "That was the active design — this school is back on the built-in card.");
            }
            onChanged?.(null);
        }
    }

    async function uploadBackground(file) {
        if (!draft) return;
        setSaving(true);
        const [status, message, data] = await saveIDCardBackground(draft.id, file);
        updateNotification(status, message);
        if (data?.template) absorb(data.template);
        setSaving(false);
    }

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={onBack}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-gray-600 hover:text-teal-700">
                    <ChevronLeftIcon className="h-4 w-4" /> All schools
                </button>
                <h2 className="text-lg font-bold text-blue-gray-800">{school.name}</h2>
            </div>

            {/* card type */}
            <div className="mb-3 flex flex-wrap gap-1.5">
                {(options?.card_types || []).map(t => (
                    <button key={t.value} type="button"
                        onClick={() => { setCardType(t.value); setCurrentId(null); }}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${cardType === t.value
                            ? "border-teal-500 bg-teal-600 text-white"
                            : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* the school's designs for this card type */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {mine.map(t => (
                    <button key={t.id} type="button" onClick={() => setCurrentId(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${currentId === t.id
                            ? "border-teal-400 bg-teal-50 font-semibold text-teal-800"
                            : "border-blue-gray-200 bg-white text-blue-gray-700 hover:bg-blue-gray-50"}`}>
                        {t.is_active && <CheckCircleIcon className="h-4 w-4 text-teal-600" />}
                        {t.name}
                    </button>
                ))}
                {(options?.presets || []).map(p => (
                    <button key={p.value} type="button" disabled={saving}
                        onClick={() => create(p.value)}
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-blue-gray-300 px-3 py-1.5 text-sm text-blue-gray-600 transition hover:border-teal-400 hover:text-teal-700 disabled:opacity-50">
                        <PlusIcon className="h-4 w-4" /> {p.label.split("—")[0].trim()}
                    </button>
                ))}
            </div>

            {!draft &&
                <p className="rounded-xl border border-dashed border-blue-gray-200 p-8 text-center text-blue-gray-500">
                    This school has no {cardType} card design yet. Start from a preset above —
                    until one is activated it keeps printing the built-in card.
                </p>
            }

            {draft &&
                <>
                    {/* template-level settings */}
                    <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-blue-gray-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
                        <label className="block">
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Design name</span>
                            <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-meta focus:border-teal-400 focus:outline-none"
                                value={draft.name || ""} onChange={(e) => patch({ name: e.target.value })} />
                        </label>
                        <label className="block">
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Orientation</span>
                            <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-meta focus:border-teal-400 focus:outline-none"
                                value={draft.orientation} onChange={(e) => patch({ orientation: e.target.value })}>
                                {(options?.orientations || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Card colour</span>
                            <input type="color" className="mt-1 h-[34px] w-full rounded-lg border border-slate-200"
                                value={draft.background_color || "#ffffff"}
                                onChange={(e) => patch({ background_color: e.target.value })} />
                        </label>
                        <div>
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Background artwork</span>
                            <div className="mt-1 flex gap-1">
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-meta font-semibold text-slate-700 hover:bg-slate-50">
                                    <PhotoIcon className="h-4 w-4" /> {draft.background ? "Replace" : "Upload"}
                                </button>
                                {draft.background &&
                                    <button type="button" onClick={() => uploadBackground(null)} title="Remove artwork"
                                        className="rounded-lg border border-slate-200 px-2 py-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600">
                                        <XMarkIcon className="h-4 w-4" />
                                    </button>}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadBackground(file);
                                    e.target.value = "";
                                }} />
                        </div>
                        <div className="flex items-end">
                            <label className="inline-flex cursor-pointer items-center gap-2 text-meta font-semibold text-slate-700">
                                <input type="checkbox" checked={Boolean(draft.is_active)}
                                    onChange={(e) => save({ is_active: e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-teal-600" />
                                Use this design
                            </label>
                        </div>
                    </div>

                    <CardDesigner
                        layout={draft.layout || []}
                        onChange={(layout) => patch({ layout })}
                        options={options}
                        fields={fields}
                        sample={SAMPLE[cardType] || SAMPLE.student}
                        width={size.width}
                        height={size.height}
                        scale={1}
                        background={draft.background}
                        backgroundColor={draft.background_color}
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => save()} disabled={saving}
                            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60">
                            {saving ? "Saving…" : "Save design"}
                        </button>
                        <button type="button" onClick={duplicate} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-gray-200 bg-white px-4 py-2 text-sm font-semibold text-blue-gray-700 hover:bg-blue-gray-50 disabled:opacity-60">
                            <DocumentDuplicateIcon className="h-4 w-4" /> Duplicate
                        </button>
                        <button type="button" onClick={remove} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
                            <TrashIcon className="h-4 w-4" /> Delete
                        </button>
                        {/* Reset drops the working copy, not the saved design. */}
                        <button type="button"
                            onClick={() => setDraft({ ...current, layout: [...(current.layout || [])] })}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-blue-gray-500 hover:text-blue-gray-800">
                            <ArrowUturnLeftIcon className="h-4 w-4" /> Discard changes
                        </button>
                    </div>
                </>
            }
        </div>
    );
}

// ---- screen -----------------------------------------------------------------
function IDCardTemplates() {
    const { fetching, statusHandler } = useRequestStatus();
    const [schools, setSchools] = useState([]);
    const [options, setOptions] = useState({});
    const [picked, setPicked] = useState(null);

    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching(true);
            const data = await getAllIDCardTemplates();
            setSchools(data.schools);
            setOptions(data.options);
            statusHandler.toggleFetching(false);
        })();
    }, []);

    // A design saved inside the editor has to be reflected in the grid behind
    // it, or coming back out shows a stale "Built-in card" badge.
    function onChanged() {
        (async () => {
            const data = await getAllIDCardTemplates();
            setSchools(data.schools);
            setPicked(p => (p ? data.schools.find(s => s.id === p.id) || p : p));
        })();
    }

    if (fetching) return <Loader variant="cards" />;

    return (
        <div className="app-section">
            {picked
                ? <Editor school={picked} options={options}
                    onBack={() => setPicked(null)} onChanged={onChanged} />
                : <SchoolsGrid schools={schools} onPick={setPicked} />}
        </div>
    );
}

export default IDCardTemplates;
