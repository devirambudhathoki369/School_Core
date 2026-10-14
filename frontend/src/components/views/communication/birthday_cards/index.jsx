import { useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import {
    PlusIcon, CheckCircleIcon, TrashIcon, DocumentDuplicateIcon, PhotoIcon,
    XMarkIcon, ShareIcon, ArrowDownTrayIcon, PaintBrushIcon, CakeIcon,
    ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import CardDesigner from "@/components/designer/CardDesigner";
import CardCanvas from "@/components/designer/CardCanvas";
import { fillPlaceholders } from "@/methods/cardLayout";
import { shareCard, openFacebookShare, openWhatsAppShare, canShareFiles } from "@/methods/shareCard";
import {
    getBirthdayTemplates, createBirthdayTemplate, saveBirthdayTemplate,
    deleteBirthdayTemplate, saveBirthdayBackground,
} from "@/services/functions/birthdayTemplates";
import { __fetch } from "@/services/functions";

/**
 * Birthday cards — designed by the school, and shared from here.
 *
 * TWO TABS, BECAUSE THEY ARE TWO JOBS. "Design" is done once, by whoever cares
 * how the school presents itself. "Today" is done every morning by whoever is
 * on the desk, and it must not require understanding the designer at all: pick
 * a person, press Share.
 *
 * The card the sharer sends is drawn by the SAME renderer the designer previews
 * with (`CardCanvas`), so what was designed is what goes out. That is the whole
 * argument for one renderer rather than two.
 */

const TABS = [
    { key: "today", label: "Today's birthdays", icon: CakeIcon },
    { key: "design", label: "Design the card", icon: PaintBrushIcon },
];

// ---- the person the designer previews against -------------------------------
// Long on purpose: a card laid out against "Ram" and sent for "Shailendra
// Bahadur Bishwakarma" is how a design turns out wrong only once it is public.
const SAMPLE = {
    name: "Shailendra Bahadur Bishwakarma",
    first_name: "Shailendra",
    classname: "Class Nine 'B'",
    section: "B",
    age: "15",
    birth_date: "2068-05-12",
    birth_day: "Bhadra 12",
    school_name: "Shree Janata Secondary School",
    school_address: "Tulsipur, Dang",
    school_contact: "082-520123",
    photo: "",
};

/** The data a real card is drawn with. `wish` is resolved here rather than in
 *  the renderer so the same filled sentence is what the preview shows and what
 *  gets shared. */
function personData(person, template, school) {
    const first = String(person?.name || "").trim().split(/\s+/)[0] || "";
    const base = {
        name: person?.name || "",
        first_name: first,
        classname: person?.classname || person?.class_name || "",
        section: person?.section || "",
        age: person?.age ?? "",
        birth_date: person?.birth_date || "",
        birth_day: person?.birth_day || "",
        school_name: school?.name || "",
        school_address: school?.address || "",
        school_contact: school?.contact || "",
        photo: person?.image ? `/media/${person.image}` : "",
        logo: school?.logo || "",
        decoration: "",
    };
    return { ...base, wish: fillPlaceholders(template?.wish || "", base) };
}

// ---- share controls ---------------------------------------------------------
function ShareBar({ nodeRef, person, scale }) {
    const { notification: { updateNotification } } = useAppContext();
    const [busy, setBusy] = useState(false);
    const [native, setNative] = useState(false);

    // Feature-detected against a real File, because `canShare` answers per
    // payload — a browser may take text and refuse an image.
    useEffect(() => {
        try {
            setNative(canShareFiles(new File([new Blob([""])], "x.png", { type: "image/png" })));
        } catch (_) { setNative(false); }
    }, []);

    async function doShare() {
        setBusy(true);
        try {
            const result = await shareCard(nodeRef.current, {
                filename: `birthday-${String(person?.name || "card").replace(/\s+/g, "_")}.png`,
                title: `Happy birthday, ${person?.name || ""}!`,
                text: `Happy birthday, ${person?.name || ""}!`,
                scale,
            });
            // Reported honestly: on a desktop this is a download, and saying
            // "Shared!" would leave someone waiting for a post that never came.
            if (result.method === "share") updateNotification(200, "Shared!");
            else if (result.method === "download") {
                updateNotification(200, "Card saved to your downloads — attach it to your post.");
            }
        } catch (e) {
            updateNotification("", e?.message || "Could not create the image.");
        }
        setBusy(false);
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={doShare} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60">
                {native ? <ShareIcon className="h-4 w-4" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                {busy ? "Preparing…" : (native ? "Share" : "Download card")}
            </button>
            {/* Facebook cannot be handed a picture by a link — the sharer takes a
                URL and unfurls its OG tags. So this posts the school's page and
                the picture is attached from the download, which is what sharing
                to Facebook from a browser actually is. Labelled so nobody
                expects the image to travel on its own. */}
            <button type="button"
                onClick={() => openFacebookShare(typeof window !== "undefined" ? window.location.origin : "")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-gray-200 bg-white px-3 py-2 text-sm font-semibold text-blue-gray-700 hover:bg-blue-gray-50">
                Post to Facebook
            </button>
            <button type="button"
                onClick={() => openWhatsAppShare(`Happy birthday, ${person?.name || ""}!`)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-gray-200 bg-white px-3 py-2 text-sm font-semibold text-blue-gray-700 hover:bg-blue-gray-50">
                WhatsApp
            </button>
            {!native &&
                <span className="text-caption text-blue-gray-400">
                    Your browser can’t hand the picture straight to an app — download it, then attach it.
                </span>}
        </div>
    );
}

// ---- today ------------------------------------------------------------------
function TodayTab({ schoolId, school, template, audience }) {
    const [people, setPeople] = useState([]);
    const [loading, setLoading] = useState(true);
    const [picked, setPicked] = useState(null);
    const cardRef = useRef(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                // The dashboard's own roster — reused rather than duplicated, so
                // "whose birthday is it" has one answer in the product.
                const data = await __fetch(`/api/${audience}/upcoming_birthdays`, { school: schoolId }, {});
                const rows = Array.isArray(data) ? data : (data?.results || []);
                setPeople(rows);
            } catch (_) {
                setPeople([]);
            }
            setLoading(false);
        })();
    }, [schoolId, audience]);

    const todays = useMemo(
        () => people.filter(p => p?.is_birthday_today),
        [people]
    );
    const list = todays.length > 0 ? todays : people;

    if (loading) return <Loader variant="cards" />;

    if (!template) {
        return (
            <p className="rounded-xl border border-dashed border-blue-gray-200 p-8 text-center text-blue-gray-500">
                No birthday card is active yet. Open <strong>Design the card</strong>,
                make one, and tick “Use this card”.
            </p>
        );
    }

    const size = template.size || { width: 270, height: 270, scale: 4 };

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
            <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-blue-gray-100 bg-white">
                {list.length === 0 &&
                    <p className="p-6 text-center text-meta text-blue-gray-400">
                        No birthdays to show.
                    </p>}
                {list.map((p) => (
                    <button key={p.id} type="button" onClick={() => setPicked(p)}
                        className={`flex w-full items-center gap-3 border-b border-blue-gray-50 px-3 py-2.5 text-left transition last:border-0 ${picked?.id === p.id ? "bg-teal-50" : "hover:bg-blue-gray-50"}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-700">
                            {(p?.name || "?").charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-blue-gray-800">{p?.name}</span>
                            <span className="block truncate text-caption text-blue-gray-500">
                                {p?.classname || p?.designation || ""}
                            </span>
                        </span>
                        {p?.is_birthday_today &&
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-semibold text-amber-700">
                                Today
                            </span>}
                    </button>
                ))}
            </div>

            <div className="flex flex-col items-center gap-4">
                {!picked &&
                    <p className="rounded-xl border border-dashed border-blue-gray-200 p-8 text-center text-blue-gray-500">
                        Pick someone on the left to make their card.
                    </p>}
                {picked &&
                    <>
                        <div ref={cardRef}>
                            <CardCanvas
                                layout={template.layout || []}
                                data={personData(picked, template, school)}
                                width={size.width}
                                height={size.height}
                                scale={1}
                                background={template.background}
                                backgroundColor={template.background_color}
                            />
                        </div>
                        <ShareBar nodeRef={cardRef} person={picked} scale={size.scale || 4} />
                    </>
                }
            </div>
        </div>
    );
}

// ---- design -----------------------------------------------------------------
function DesignTab({ school, audience, templates, setTemplates, options, reload }) {
    const { notification: { updateNotification } } = useAppContext();
    const [currentId, setCurrentId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    const current = useMemo(
        () => templates.find(t => t.id === currentId) || null, [templates, currentId]
    );
    useEffect(() => {
        if (current) return;
        const next = templates.find(t => t.is_active) || templates[0];
        setCurrentId(next?.id ?? null);
    }, [templates, current]);
    useEffect(() => {
        setDraft(current ? { ...current, layout: [...(current.layout || [])] } : null);
    }, [currentId, current?.updated_at]);

    const size = draft
        ? (options?.formats || []).find(f => f.value === draft.card_format) || { width: 270, height: 270 }
        : { width: 270, height: 270 };

    function patch(changes) { setDraft(d => (d ? { ...d, ...changes } : d)); }

    async function create(preset) {
        setSaving(true);
        const [status, message, data] = await createBirthdayTemplate({
            school, audience, preset, name: `${preset} card`,
        });
        updateNotification(status, message);
        if (data?.template) { await reload(); setCurrentId(data.template.id); }
        setSaving(false);
    }

    async function save(extra = {}) {
        if (!draft) return;
        setSaving(true);
        const [status, message, data] = await saveBirthdayTemplate({
            id: draft.id, name: draft.name, audience: draft.audience,
            card_format: draft.card_format, background_color: draft.background_color,
            wish: draft.wish, layout: draft.layout, ...extra,
        });
        updateNotification(status, message);
        if (data?.template) await reload();
        setSaving(false);
    }

    async function duplicate() {
        if (!draft) return;
        setSaving(true);
        const [status, message, data] = await createBirthdayTemplate({
            school, audience, duplicate: draft.id,
        });
        updateNotification(status, message);
        if (data?.template) { await reload(); setCurrentId(data.template.id); }
        setSaving(false);
    }

    async function remove() {
        if (!draft) return;
        const [status, message] = await deleteBirthdayTemplate(draft.id);
        if (!status) return;
        updateNotification(status, message);
        if (status === 200) { setCurrentId(null); await reload(); }
    }

    async function uploadBackground(file) {
        if (!draft) return;
        setSaving(true);
        const [status, message] = await saveBirthdayBackground(draft.id, file);
        updateNotification(status, message);
        await reload();
        setSaving(false);
    }

    const preview = useMemo(
        () => ({ ...SAMPLE, wish: fillPlaceholders(draft?.wish || "", SAMPLE) }),
        [draft?.wish]
    );

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {templates.map(t => (
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
                    No card yet. Start from one of the designs above.
                </p>}

            {draft &&
                <>
                    <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-blue-gray-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="block">
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Card name</span>
                            <input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-meta focus:border-teal-400 focus:outline-none"
                                value={draft.name || ""} onChange={(e) => patch({ name: e.target.value })} />
                        </label>
                        <label className="block">
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Size</span>
                            <select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-meta focus:border-teal-400 focus:outline-none"
                                value={draft.card_format} onChange={(e) => patch({ card_format: e.target.value })}>
                                {(options?.formats || []).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                            </select>
                        </label>
                        <div>
                            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">Background</span>
                            <div className="mt-1 flex gap-1">
                                <button type="button" onClick={() => fileRef.current?.click()}
                                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-meta font-semibold text-slate-700 hover:bg-slate-50">
                                    <PhotoIcon className="h-4 w-4" /> {draft.background ? "Replace" : "Upload"}
                                </button>
                                {draft.background &&
                                    <button type="button" onClick={() => uploadBackground(null)}
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
                                Use this card
                            </label>
                        </div>
                    </div>

                    {/* the wish */}
                    <label className="mb-4 block rounded-xl border border-blue-gray-100 bg-white p-3">
                        <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">
                            The wish
                        </span>
                        <textarea rows={2} maxLength={options?.max_wish || 600}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-meta focus:border-teal-400 focus:outline-none"
                            value={draft.wish || ""} onChange={(e) => patch({ wish: e.target.value })} />
                        <span className="mt-1 block text-caption text-slate-400">
                            Use {(options?.placeholders || []).map(p => `{${p}}`).join(", ")} and they’ll be
                            filled in per person. A placeholder with nothing behind it disappears
                            instead of leaving a gap.
                        </span>
                    </label>

                    <CardDesigner
                        layout={draft.layout || []}
                        onChange={(layout) => patch({ layout })}
                        options={options}
                        fields={options?.fields || []}
                        sample={preview}
                        width={size.width}
                        height={size.height}
                        scale={1}
                        background={draft.background}
                        backgroundColor={draft.background_color}
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => save()} disabled={saving}
                            className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60">
                            {saving ? "Saving…" : "Save card"}
                        </button>
                        <button type="button" onClick={duplicate} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-gray-200 bg-white px-4 py-2 text-sm font-semibold text-blue-gray-700 hover:bg-blue-gray-50 disabled:opacity-60">
                            <DocumentDuplicateIcon className="h-4 w-4" /> Duplicate
                        </button>
                        <button type="button" onClick={remove} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
                            <TrashIcon className="h-4 w-4" /> Delete
                        </button>
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
function BirthdayCards() {
    const { user: { user } } = useAppContext();
    const { fetching, statusHandler } = useRequestStatus();
    const [tab, setTab] = useState("today");
    const [audience, setAudience] = useState("student");
    const [templates, setTemplates] = useState([]);
    const [active, setActive] = useState(null);
    const [options, setOptions] = useState({});

    // The signed-in school. `profile.school` is set for a staff account and
    // `profile.id` for an admin one — the same expression every other screen in
    // the app resolves it with (see AppContext).
    const schoolId = user?.profile?.school || user?.profile?.id;
    // The school's own identity, for the `school_name` / logo elements a card
    // may carry. Read from the profile already in context rather than fetched
    // again.
    const schoolProfile = useMemo(() => ({
        name: user?.profile?.school_name || user?.profile?.name || "",
        address: user?.profile?.location || user?.profile?.address || "",
        contact: user?.profile?.contact || user?.profile?.primary_contact || "",
        logo: user?.profile?.school_logo || user?.profile?.logo || "",
    }), [user?.profile]);

    async function reload() {
        const data = await getBirthdayTemplates(schoolId, audience);
        setTemplates(data.templates);
        setActive(data.active);
        setOptions(data.options);
    }

    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching(true);
            await reload();
            statusHandler.toggleFetching(false);
        })();
    }, [schoolId, audience]);

    if (fetching) return <Loader variant="cards" />;

    return (
        <div className="app-section">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-bold text-blue-gray-800">Birthday cards</h2>
                    <p className="text-[0.85rem] text-blue-gray-500">
                        Design the card once, then send it to whoever is celebrating.
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {(options?.audiences || [{ value: "student", label: "Students" }]).map(a => (
                        <button key={a.value} type="button" onClick={() => setAudience(a.value)}
                            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${audience === a.value
                                ? "border-teal-500 bg-teal-600 text-white"
                                : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-4 flex gap-1.5 border-b border-blue-gray-100">
                {TABS.map(t => (
                    <button key={t.key} type="button" onClick={() => setTab(t.key)}
                        className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${tab === t.key
                            ? "border-teal-600 text-teal-700"
                            : "border-transparent text-blue-gray-500 hover:text-blue-gray-800"}`}>
                        <t.icon className="h-4 w-4" /> {t.label}
                    </button>
                ))}
            </div>

            {tab === "today"
                ? <TodayTab schoolId={schoolId} school={schoolProfile} template={active} audience={audience} />
                : <DesignTab school={schoolId} audience={audience} templates={templates}
                    setTemplates={setTemplates} options={options} reload={reload} />}
        </div>
    );
}

export default BirthdayCards;
