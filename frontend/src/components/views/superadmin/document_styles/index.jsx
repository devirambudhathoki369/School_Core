import { useEffect, useMemo, useState } from "react";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getAllDocumentStyles, saveDocumentStyle, copyDocumentStyle } from "@/services/functions/documentStyles";
import { formatImagePath } from "@/methods/formatMediaPath";
import {
    MagnifyingGlassIcon, CheckCircleIcon, ChevronLeftIcon, PaintBrushIcon,
    ArrowUturnLeftIcon, ArrowUturnRightIcon, DocumentDuplicateIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import CopyStyleModal from "./CopyStyleModal";
import DocumentMasthead from "@/components/documents/DocumentMasthead";
import { documentStyleProps } from "@/methods/documentStyle";
import ElementInspector from "./ElementInspector";

const SCALES = [80, 90, 100, 110, 120, 130];
const SAMPLE_ROWS = [
    ["1", "English", "4", "B+", "A", "3.6"],
    ["2", "Nepali", "4", "A", "A+", "3.9"],
    ["3", "Mathematics", "4", "B", "B+", "3.2"],
    ["4", "Science", "4", "A", "A", "3.6"],
];

// ---- schools grid (the landing view) ---------------------------------------
// A card per school rather than a wide table: the logo is the fastest way to
// recognise a school, and cards reflow cleanly from one column on a phone to
// three on a desktop instead of a table scrolling sideways.
function SchoolsTable({ schools, onPick }) {
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState("all");   // all | styled | default
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return schools.filter((s) => {
            if (q && !(s.name || "").toLowerCase().includes(q)) return false;
            if (filter === "styled") return s.style?.configured;
            if (filter === "default") return !s.style?.configured;
            return true;
        });
    }, [schools, query, filter]);

    const styledCount = schools.filter((s) => s.style?.configured).length;
    const chips = [
        { key: "all", label: `All (${schools.length})` },
        { key: "styled", label: `Styled (${styledCount})` },
        { key: "default", label: `Default (${schools.length - styledCount})` },
    ];

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-xl font-bold text-blue-gray-800">Document styles</h2>
                    <p className="text-[0.85rem] text-blue-gray-500">Pick a school to design its grade-sheets and certificates.</p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-white border border-blue-gray-200 px-3 py-2 sm:w-72 shadow-sm">
                    <MagnifyingGlassIcon className="h-4 w-4 text-teal-700 shrink-0" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search schools" className="bg-transparent focus:outline-none text-sm w-full" />
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
                {chips.map((c) => (
                    <button key={c.key} type="button" onClick={() => setFilter(c.key)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold border transition-colors duration-150 ${filter === c.key
                            ? "border-teal-500 bg-teal-600 text-white" : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                        {c.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map((school) => {
                    const styled = school.style?.configured;
                    return (
                        <button key={school.id} type="button" onClick={() => onPick(school)}
                            className="group text-left rounded-xl border border-blue-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-teal-300 transition-all duration-150">
                            <div className="flex items-center gap-3 min-w-0">
                                {school.profile?.logo
                                    ? <img src={formatImagePath(school.profile.logo)} alt=""
                                        className="h-12 w-12 rounded-lg object-contain bg-blue-gray-50 shrink-0 ring-1 ring-blue-gray-100" />
                                    : <span className="h-12 w-12 rounded-lg bg-blue-gray-100 shrink-0 flex items-center justify-center text-blue-gray-300 font-bold">
                                        {(school.name || "?").charAt(0)}</span>}
                                <div className="min-w-0 flex-1">
                                    <span className="block font-bold text-blue-gray-800 truncate">{school.name}</span>
                                    <span className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                        {styled
                                            ? <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[0.72rem] font-semibold text-teal-700 capitalize">
                                                <CheckCircleIcon className="h-3 w-3" />{school.style.theme}</span>
                                            : <span className="rounded-full bg-blue-gray-50 px-2 py-0.5 text-[0.72rem] font-semibold text-blue-gray-500">Default look</span>}
                                        {styled && school.style.applies_to?.length > 0 && (
                                            <span className="text-[0.72rem] text-blue-gray-500">
                                                {school.style.applies_to.length} doc{school.style.applies_to.length === 1 ? "" : "s"}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-3 flex items-center justify-end text-teal-700 text-sm font-semibold opacity-70 group-hover:opacity-100">
                                <PaintBrushIcon className="h-4 w-4 mr-1" /> Design documents
                            </div>
                        </button>
                    );
                })}
                {filtered.length === 0 && (
                    <p className="col-span-full text-center text-blue-gray-400 py-10">No school matches.</p>
                )}
            </div>
        </div>
    );
}

// ---- the live, clickable sheet ---------------------------------------------
function LiveSheet({ draft, profile, schoolName, selectedKey, onSelect, onReorder }) {
    // Previewed as though switched on, whatever is ticked under "apply", so it
    // never goes blank while a theme is being chosen.
    const themed = documentStyleProps({ ...draft, applies_to: ["__preview__"] }, "__preview__");
    const school = {
        school_name: schoolName || "School Name",
        image: profile?.logo || "",
        address: profile?.address || "Tulsipur-9, Dang",
        estd: profile?.estd || "2056",
        contact: profile?.contact || "9857825095",
        email: profile?.email || "school@example.com",
        motto: profile?.motto || "Excellence in Education is our Passion.",
    };
    return (
        <div className="overflow-x-auto bg-blue-gray-50/40 p-3 sm:p-5 rounded-xl"
            onClick={() => onSelect(null)}>
            <div className={`text-black mx-auto bg-white border-2 border-black border-solid p-4 sm:p-6 w-[40rem] max-w-full ${themed.className}`}
                style={themed.style}>
                <DocumentMasthead layout={draft?.layout} title="GRADE-SHEET" school={school}
                    selectable selectedKey={selectedKey} onSelect={onSelect} onReorder={onReorder} />
                <div className="mt-3 flex flex-wrap justify-between gap-2 text-[0.78rem] font-semibold">
                    <span>Name : Sample Student</span><span>Class : Six</span><span>Roll : 12</span>
                </div>
                <table className="result w-full mt-2">
                    <thead>
                        <tr>{["S.N", "SUBJECTS", "CREDIT", "TH.", "GRADE", "G.P."].map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {SAMPLE_ROWS.map((r) => (
                            <tr key={r[0]}>{r.map((c, i) => <td key={i} className={i === 1 ? "text-left capitalize font-semibold" : ""}>{c}</td>)}</tr>
                        ))}
                        <tr><td colSpan={4} className="text-left">Remarks : Excellent</td><td>G.P.A</td><td>3.58</td></tr>
                    </tbody>
                </table>
                {draft?.show_watermark !== false && (
                    <p className="mt-3 text-center text-[0.7rem] italic opacity-40">watermark shown on the printed sheet</p>
                )}
            </div>
        </div>
    );
}

function GradesheetStyles() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [options, setOptions] = useState({ themes: [], fonts: [], documents: [], elements: [], borders: [], table_borders: [], trackings: [], header_rules: [] });
    const [selected, setSelected] = useState(null);
    const [draft, setDraft] = useState(null);
    // Undo/redo: past and future snapshots of the draft. setDraft still works
    // everywhere; a small wrapper records history so any edit is reversible.
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);
    const [selectedKey, setSelectedKey] = useState(null);   // element clicked in the preview
    const [showCopy, setShowCopy] = useState(false);
    const { fetching, uploading, statusHandler } = useRequestStatus();

    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching();
            const { schools: _schools, options: _options } = await getAllDocumentStyles();
            setSchools(_schools); setOptions(_options);
            statusHandler.toggleFetching();
        })();
    }, []);

    const current = schools.find((s) => s.id === selected) || null;
    const layout = draft?.layout || [];
    const selIndex = layout.findIndex((e) => e.key === selectedKey);
    const selEl = selIndex >= 0 ? layout[selIndex] : null;
    const selMeta = (options.elements || []).find((e) => e.value === selectedKey);

    // Record the CURRENT draft into history, then apply the updater. Every
    // mutation goes through this, so undo/redo covers all of them uniformly.
    function commit(updater) {
        setDraft((cur) => {
            setPast((p) => [...p.slice(-49), cur]);   // cap history so it can't grow forever
            setFuture([]);
            return typeof updater === "function" ? updater(cur) : updater;
        });
    }
    function undo() {
        setPast((p) => {
            if (!p.length) return p;
            const prev = p[p.length - 1];
            setFuture((f) => [draft, ...f]);
            setDraft(prev);
            return p.slice(0, -1);
        });
    }
    function redo() {
        setFuture((f) => {
            if (!f.length) return f;
            const next = f[0];
            setPast((p) => [...p, draft]);
            setDraft(next);
            return f.slice(1);
        });
    }
    function pick(school) {
        setSelected(school.id);
        setDraft({ ...school.style });   // edited on a copy
        setPast([]); setFuture([]);
        setSelectedKey(null);
    }
    function back() { setSelected(null); setDraft(null); setSelectedKey(null); setPast([]); setFuture([]); }
    function set(key, value) { commit((s) => ({ ...s, [key]: value })); }

    function updateElement(next) {
        commit((s) => ({ ...s, customised: true, layout: s.layout.map((e) => (e.key === next.key ? next : e)) }));
    }
    function moveElement(from, to) {
        if (to < 0 || to >= layout.length) return;
        commit((s) => {
            const next = [...s.layout];
            const [item] = next.splice(from, 1);
            next.splice(to, 0, item);
            return { ...s, customised: true, layout: next };
        });
    }
    // Drag one element onto another in the preview: move the dragged one to the
    // dropped-on one's position. Keyed, not indexed, so it is robust to the
    // preview only rendering the masthead subset.
    function reorderByKey(fromKey, toKey) {
        commit((s) => {
            const next = [...s.layout];
            const fromI = next.findIndex((e) => e.key === fromKey);
            const toI = next.findIndex((e) => e.key === toKey);
            if (fromI < 0 || toI < 0) return s;
            const [item] = next.splice(fromI, 1);
            next.splice(toI, 0, item);
            return { ...s, customised: true, layout: next };
        });
    }
    function applyTheme(t) {
        commit((s) => ({
            ...s, theme: t.value,
            font_family: t.font_family || s.font_family,
            accent_color: t.accent_color || s.accent_color,
            border_style: t.border_style || "theme",
            table_border: t.table_border || "all",
            layout: t.layout ? t.layout.map((e) => ({ ...e })) : s.layout,
            customised: false,
        }));
        setSelectedKey(null);
    }
    function toggleDocument(key) {
        commit((s) => {
            const on = (s.applies_to || []).includes(key);
            return { ...s, applies_to: on ? s.applies_to.filter((k) => k !== key) : [...(s.applies_to || []), key] };
        });
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const payload = { school: selected, ...draft };
        if (!draft.customised) delete payload.layout;   // keep following the preset
        delete payload.customised;
        const [status, message, res] = await saveDocumentStyle(payload);
        updateNotification(status, message);
        if (status === 200 && res?.style) {
            setSchools((st) => st.map((s) => (s.id === selected ? { ...s, style: res.style } : s)));
            setDraft({ ...res.style });
        }
        statusHandler.toggleUploading();
    }

    if (fetching) return <Loader />;
    if (!current) return <SchoolsTable schools={schools} onPick={pick} />;

    return (
        <form onSubmit={onSave} className="w-full">
            {/* Action bar */}
            <div className="sticky top-0 z-20 mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-gray-100 bg-white/95 backdrop-blur px-3 py-2 shadow-sm">
                <button type="button" onClick={back}
                    className="flex items-center gap-1 text-sm font-semibold text-blue-gray-600 hover:text-teal-700">
                    <ChevronLeftIcon className="h-5 w-5" /> All schools
                </button>
                <div className="flex items-center gap-2 min-w-0">
                    {current.profile?.logo && <img src={formatImagePath(current.profile.logo)} alt=""
                        className="h-8 w-8 rounded object-contain bg-blue-gray-50" />}
                    <span className="font-bold text-blue-gray-800 truncate">{current.name}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" onClick={undo} disabled={!past.length} title="Undo"
                        className="rounded-lg p-2 text-blue-gray-500 hover:bg-blue-gray-50 disabled:opacity-30">
                        <ArrowUturnLeftIcon className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={redo} disabled={!future.length} title="Redo"
                        className="rounded-lg p-2 text-blue-gray-500 hover:bg-blue-gray-50 disabled:opacity-30">
                        <ArrowUturnRightIcon className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => setShowCopy(true)} title="Copy this style to other schools"
                        className="hidden sm:flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-blue-gray-600 hover:bg-blue-gray-50">
                        <DocumentDuplicateIcon className="h-5 w-5" /> Copy to…
                    </button>
                    <div className="[&>button]:py-2.5 [&>button]:px-6">
                        <FormSaveButton saving={uploading} isUpdate custom={[uploading, "Save", "Saving..."]} />
                    </div>
                </div>
            </div>

            {/* Two panes: sheet on the left, controls on the right. Stacks on a phone. */}
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="lg:w-1/2 lg:sticky lg:top-16 lg:self-start">
                    <p className="text-[0.78rem] text-blue-gray-500 mb-2">
                        Click any part of the sheet to change it — the controls open on the right.
                    </p>
                    <LiveSheet draft={draft} profile={current.profile} schoolName={current.name}
                        selectedKey={selectedKey} onSelect={setSelectedKey} onReorder={reorderByKey} />
                </div>

                <div className="lg:w-1/2 flex flex-col gap-4">
                    <ElementInspector el={selEl} meta={selMeta} options={options}
                        index={selIndex} count={layout.length}
                        onChange={updateElement} onMove={moveElement}
                        onDeselect={() => setSelectedKey(null)} />

                    {/* Theme */}
                    <div className="rounded-xl border border-blue-gray-100 bg-white p-4">
                        <h3 className="font-semibold text-blue-gray-800 mb-2">Theme</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {options.themes.map((t) => (
                                <button key={t.value} type="button" onClick={() => applyTheme(t)}
                                    className={`text-left rounded-lg border p-3 transition-colors duration-150 ${draft.theme === t.value
                                        ? "border-teal-400 bg-teal-50/70 ring-1 ring-teal-300"
                                        : "border-blue-gray-200 hover:bg-blue-gray-50"}`}>
                                    <span className="block font-bold text-blue-gray-800">{t.label}</span>
                                    <span className="block text-[0.75rem] text-blue-gray-500">{t.blurb}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Document-wide */}
                    <div className="rounded-xl border border-blue-gray-100 bg-white p-4">
                        <h3 className="font-semibold text-blue-gray-800 mb-3">Whole document</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Base font</span>
                                <select value={draft.font_family} onChange={(e) => set("font_family", e.target.value)}
                                    className="rounded-lg border border-blue-gray-200 px-3 py-2 text-sm bg-white">
                                    {options.fonts.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                                </select>
                            </label>
                            <div className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Overall size — {draft.font_scale}%</span>
                                <div className="flex flex-wrap gap-1">
                                    {SCALES.map((s) => (
                                        <button key={s} type="button" onClick={() => set("font_scale", s)}
                                            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold border ${draft.font_scale === s
                                                ? "border-teal-400 bg-teal-50 text-teal-900" : "border-blue-gray-200 hover:bg-blue-gray-50"}`}>
                                            {s}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Accent colour</span>
                                <span className="flex items-center gap-2">
                                    <input type="color" value={draft.accent_color || "#000000"}
                                        onChange={(e) => set("accent_color", e.target.value)}
                                        className="h-9 w-14 rounded border border-blue-gray-200 bg-white" />
                                    <span className="text-sm text-blue-gray-600">{draft.accent_color}</span>
                                </span>
                            </label>
                            <label className="flex items-center gap-2 mt-5">
                                <input type="checkbox" checked={draft.show_watermark !== false}
                                    onChange={(e) => set("show_watermark", e.target.checked)} />
                                <span className="text-sm font-semibold text-blue-gray-700">Show the school watermark</span>
                            </label>
                        </div>
                    </div>

                    {/* Frame & table lines */}
                    <div className="rounded-xl border border-blue-gray-100 bg-white p-4">
                        <h3 className="font-semibold text-blue-gray-800 mb-3">Frame &amp; table</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Sheet border</span>
                                <select value={draft.border_style || "theme"} onChange={(e) => set("border_style", e.target.value)}
                                    className="rounded-lg border border-blue-gray-200 px-3 py-2 text-sm bg-white">
                                    {(options.borders || []).map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Table lines</span>
                                <select value={draft.table_border || "all"} onChange={(e) => set("table_border", e.target.value)}
                                    className="rounded-lg border border-blue-gray-200 px-3 py-2 text-sm bg-white">
                                    {(options.table_borders || []).map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Divider under header</span>
                                <select value={draft.header_rule || "none"} onChange={(e) => set("header_rule", e.target.value)}
                                    className="rounded-lg border border-blue-gray-200 px-3 py-2 text-sm bg-white">
                                    {(options.header_rules || []).map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                                </select>
                            </label>
                            <div className="flex flex-col gap-1">
                                <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Page tint</span>
                                <span className="flex items-center gap-2">
                                    <input type="color" value={draft.background_tint || "#ffffff"}
                                        onChange={(e) => set("background_tint", e.target.value)}
                                        className="h-9 w-14 rounded border border-blue-gray-200 bg-white" />
                                    {draft.background_tint
                                        ? <button type="button" onClick={() => set("background_tint", "")}
                                            className="text-[0.72rem] text-teal-700 font-semibold hover:underline">clear</button>
                                        : <span className="text-sm text-blue-gray-500">white</span>}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Where to apply */}
                    <div className="rounded-xl border border-blue-gray-100 bg-white p-4">
                        <h3 className="font-semibold text-blue-gray-800">Where to apply</h3>
                        <p className="text-[0.78rem] text-blue-gray-500 mb-3">
                            Only the ticked documents use this style. Leave all clear to set it up without changing anything printed today.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {options.documents.map((d) => {
                                const on = (draft.applies_to || []).includes(d.value);
                                return (
                                    <button key={d.value} type="button" onClick={() => toggleDocument(d.value)}
                                        className={`flex items-center gap-2 text-left rounded-lg border px-3 py-2 transition-colors duration-150 ${on
                                            ? "border-teal-400 bg-teal-50/70" : "border-blue-gray-200 hover:bg-blue-gray-50"}`}>
                                        <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${on ? "bg-teal-600 border-teal-600" : "border-blue-gray-300"}`}>
                                            {on && <span className="text-white text-[0.6rem] leading-none">✓</span>}
                                        </span>
                                        <span className="text-sm font-semibold text-blue-gray-800">{d.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {draft.customised && (
                        <button type="button"
                            onClick={() => { const t = options.themes.find((x) => x.value === draft.theme); if (t) applyTheme(t); }}
                            className="self-start text-sm font-semibold text-teal-700 hover:underline">
                            Reset the arrangement back to the theme
                        </button>
                    )}
                </div>
            </div>

            {showCopy && (
                <CopyStyleModal schools={schools} sourceId={selected} sourceName={current.name}
                    onClose={() => setShowCopy(false)}
                    onCopied={(res) => {
                        updateNotification(200, res?.message || "Copied.");
                        setShowCopy(false);
                        // refetch so the target cards reflect their new style
                        (async () => {
                            const { schools: fresh } = await getAllDocumentStyles();
                            if (Array.isArray(fresh) && fresh.length) setSchools(fresh);
                        })();
                    }} />
            )}
        </form>
    );
}

export default GradesheetStyles;
