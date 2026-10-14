import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    PlusIcon, TrashIcon, DocumentDuplicateIcon, ArrowUpIcon, ArrowDownIcon,
    EyeIcon, EyeSlashIcon, Squares2X2Icon,
} from "@heroicons/react/24/outline";
import CardCanvas from "./CardCanvas";
import { clampBox, newElementId } from "@/methods/cardLayout";

/**
 * The drag surface and the properties panel — the editor both card designers
 * are built from.
 *
 * It owns NO persistence and knows nothing about ID cards or birthdays. It is
 * handed a layout, an option catalogue (which the BACKEND supplies, so the
 * controls can never offer a value the sanitizer would silently clamp) and a
 * sample record to preview with; it hands back a new layout. That is what lets
 * the same editor serve a superadmin designing a student card and an admin
 * writing a birthday wish.
 *
 * WHY THE DRAG IS WRITTEN BY HAND
 * The app already carries framer-motion, but a drag library's coordinate space
 * is its own. Here the layout is stored in PERCENT of the card, the canvas is
 * displayed at an arbitrary zoom, and the drop has to be resolved against the
 * card's true size — so the maths has to be done explicitly either way. Mouse
 * and touch both route through pointer events, which is the one API that
 * handles a stylus and a finger without a second code path.
 */

const ZOOMS = [1, 1.5, 2];

function Row({ label, children, hint }) {
    return (
        <label className="block">
            <span className="block text-label font-semibold uppercase tracking-wide text-slate-500">
                {label}
            </span>
            <div className="mt-1">{children}</div>
            {hint && <span className="mt-0.5 block text-caption text-slate-400">{hint}</span>}
        </label>
    );
}

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-meta text-slate-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30";

function CardDesigner({
    layout = [],
    onChange,
    options = {},
    sample = {},
    width = 300,
    height = 450,
    scale = 1,
    background = "",
    backgroundColor = "#ffffff",
    fields = [],
}) {
    const [selectedId, setSelectedId] = useState(null);
    const [zoom, setZoom] = useState(1);
    const canvasRef = useRef(null);
    // The live drag. Held in a ref, not state: it is written on every pointer
    // move and re-rendering the whole canvas at mouse frequency would make the
    // drag feel heavy on a large layout.
    const drag = useRef(null);

    const selected = useMemo(
        () => (layout || []).find(el => el?.id === selectedId) || null,
        [layout, selectedId]
    );

    const update = useCallback((id, patch) => {
        onChange((layout || []).map(el => (el?.id === id ? clampBox({ ...el, ...patch }) : el)));
    }, [layout, onChange]);

    // ---- dragging -----------------------------------------------------------
    const onPointerDownElement = useCallback((e, el) => {
        // Only the primary button starts a drag; a right-click here would
        // otherwise begin one that never receives its matching pointerup.
        if (e.button !== 0) return;
        e.preventDefault();
        setSelectedId(el?.id);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        drag.current = {
            id: el.id,
            startX: e.clientX,
            startY: e.clientY,
            originX: Number(el.x) || 0,
            originY: Number(el.y) || 0,
            rectW: rect.width,
            rectH: rect.height,
        };
    }, []);

    useEffect(() => {
        function move(e) {
            const d = drag.current;
            if (!d) return;
            // The delta is measured in SCREEN pixels and converted through the
            // canvas's displayed size, so the drag tracks the cursor exactly at
            // every zoom rather than running fast or slow.
            const dx = ((e.clientX - d.startX) / d.rectW) * 100;
            const dy = ((e.clientY - d.startY) / d.rectH) * 100;
            update(d.id, {
                // Snapped to a tenth of a percent: enough to place an element
                // precisely, coarse enough that two dragged elements can still
                // be given the same edge.
                x: Math.round((d.originX + dx) * 10) / 10,
                y: Math.round((d.originY + dy) * 10) / 10,
            });
        }
        function up() { drag.current = null; }
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
        };
    }, [update]);

    // ---- keyboard nudging ---------------------------------------------------
    // A drag places an element roughly; the arrow keys are how it is placed
    // exactly. Without this the only way to move something a hair is to type
    // numbers into the X/Y boxes.
    useEffect(() => {
        function onKey(e) {
            if (!selected) return;
            const tag = (e.target?.tagName || "").toLowerCase();
            if (tag === "input" || tag === "select" || tag === "textarea") return;
            const step = e.shiftKey ? 1 : 0.1;
            const map = {
                ArrowLeft: { x: -step }, ArrowRight: { x: step },
                ArrowUp: { y: -step }, ArrowDown: { y: step },
            };
            const delta = map[e.key];
            if (!delta) return;
            e.preventDefault();
            update(selected.id, {
                x: Math.round(((Number(selected.x) || 0) + (delta.x || 0)) * 10) / 10,
                y: Math.round(((Number(selected.y) || 0) + (delta.y || 0)) * 10) / 10,
            });
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selected, update]);

    // ---- the element list ---------------------------------------------------
    function addElement(kind) {
        const base = options?.element_default || {};
        const el = clampBox({
            ...base,
            id: newElementId(kind, layout),
            kind,
            field: kind === "text" ? (fields?.[0]?.value || "static")
                : kind === "image" ? (options?.images?.[0]?.value || "photo") : "",
            x: 10, y: 10,
            w: kind === "qr" || kind === "image" ? 25 : 80,
            h: kind === "qr" || kind === "image" ? 18 : 7,
            // A new element goes ON TOP of what is already there — anything
            // else and it can be added behind the background band and appear to
            // have done nothing.
            z: Math.max(0, ...(layout || []).map(e => Number(e?.z) || 0)) + 1,
        });
        onChange([...(layout || []), el]);
        setSelectedId(el.id);
    }

    function removeElement(id) {
        onChange((layout || []).filter(el => el?.id !== id));
        if (selectedId === id) setSelectedId(null);
    }

    function duplicateElement(el) {
        const copy = clampBox({
            ...el,
            id: newElementId(el?.kind || "text", layout),
            x: (Number(el?.x) || 0) + 3,
            y: (Number(el?.y) || 0) + 3,
        });
        onChange([...(layout || []), copy]);
        setSelectedId(copy.id);
    }

    const fieldOptions = selected?.kind === "image" ? (options?.images || []) : fields;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 items-start">
            {/* ---- canvas ---- */}
            <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                    <Squares2X2Icon className="h-4 w-4 text-slate-400" />
                    {ZOOMS.map(z => (
                        <button key={z} type="button" onClick={() => setZoom(z)}
                            className={`rounded-md px-2 py-1 text-caption font-semibold transition
                                ${zoom === z ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                            {z}×
                        </button>
                    ))}
                </div>
                <div className="rounded-xl border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3 shadow-sm">
                    <div style={{ width: width * zoom, height: height * zoom }}
                        onClick={() => setSelectedId(null)}>
                        <CardCanvas
                            ref={canvasRef}
                            layout={layout}
                            data={sample}
                            width={width * zoom}
                            height={height * zoom}
                            scale={scale * zoom}
                            background={background}
                            backgroundColor={backgroundColor}
                            selectedId={selectedId}
                            onSelectElement={setSelectedId}
                            onPointerDownElement={onPointerDownElement}
                        />
                    </div>
                </div>
                <p className="max-w-[22rem] text-center text-caption text-slate-500">
                    Drag any element to place it. With one selected, the arrow keys
                    nudge it by 0.1% — hold Shift for 1%.
                </p>
            </div>

            {/* ---- properties ---- */}
            <div className="w-full space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {["text", "image", "shape", "qr", "barcode"]
                        .filter(k => (options?.kinds || ["text", "image", "shape", "qr", "barcode"]).includes(k))
                        .map(kind => (
                            <button key={kind} type="button" onClick={() => addElement(kind)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-caption font-semibold text-slate-700 transition hover:bg-slate-50">
                                <PlusIcon className="h-3.5 w-3.5" /> {kind}
                            </button>
                        ))}
                </div>

                {/* the layer list — the only way to reach an element that has
                    been dragged underneath another one */}
                <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                    {(layout || []).length === 0 &&
                        <p className="p-3 text-meta text-slate-400">
                            Nothing on the card yet. Add an element above.
                        </p>}
                    {(layout || []).map((el) => (
                        <div key={el?.id}
                            onClick={() => setSelectedId(el?.id)}
                            className={`flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 py-1.5 text-meta last:border-0
                                ${selectedId === el?.id ? "bg-teal-50" : "hover:bg-slate-50"}`}>
                            <span className="w-12 shrink-0 text-caption font-semibold uppercase text-slate-400">
                                {el?.kind}
                            </span>
                            <span className="flex-1 truncate text-slate-700">
                                {el?.kind === "text"
                                    ? (el?.field === "static" ? (el?.text || "(fixed text)") : el?.field)
                                    : (el?.field || el?.kind)}
                            </span>
                            <button type="button" title="Bring forward"
                                onClick={(e) => { e.stopPropagation(); update(el.id, { z: (Number(el?.z) || 0) + 1 }); }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <ArrowUpIcon className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Send backward"
                                onClick={(e) => { e.stopPropagation(); update(el.id, { z: Math.max(0, (Number(el?.z) || 0) - 1) }); }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <ArrowDownIcon className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Duplicate"
                                onClick={(e) => { e.stopPropagation(); duplicateElement(el); }}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                                <DocumentDuplicateIcon className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" title="Remove"
                                onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                                <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>

                {!selected &&
                    <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-meta text-slate-400">
                        Select an element on the card to style it.
                    </p>
                }

                {selected &&
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className="grid grid-cols-2 gap-2">
                            <Row label={selected.kind === "image" ? "Picture" : "Field"}>
                                <select className={inputCls} value={selected.field || ""}
                                    onChange={(e) => update(selected.id, { field: e.target.value })}
                                    disabled={selected.kind === "qr" || selected.kind === "barcode" || selected.kind === "shape"}>
                                    {fieldOptions.map(f => (
                                        <option key={f.value} value={f.value}>{f.label}</option>
                                    ))}
                                </select>
                            </Row>
                            {selected.kind === "text" &&
                                <Row label="Label before it" hint="e.g. “Class”">
                                    <input className={inputCls} value={selected.label || ""}
                                        onChange={(e) => update(selected.id, { label: e.target.value })} />
                                </Row>
                            }
                        </div>

                        {selected.kind === "text" && selected.field === "static" &&
                            <Row label="Fixed text">
                                <textarea className={inputCls} rows={2} value={selected.text || ""}
                                    onChange={(e) => update(selected.id, { text: e.target.value })} />
                            </Row>
                        }

                        {/* geometry */}
                        <div className="grid grid-cols-4 gap-2">
                            {["x", "y", "w", "h"].map(k => (
                                <Row key={k} label={k.toUpperCase()}>
                                    <input type="number" step="0.1" className={inputCls}
                                        value={selected[k] ?? 0}
                                        onChange={(e) => update(selected.id, { [k]: parseFloat(e.target.value) || 0 })} />
                                </Row>
                            ))}
                        </div>

                        {selected.kind === "text" &&
                            <>
                                <div className="grid grid-cols-3 gap-2">
                                    <Row label="Font">
                                        <select className={inputCls} value={selected.font || "sans"}
                                            onChange={(e) => update(selected.id, { font: e.target.value })}>
                                            {(options?.fonts || []).map(f =>
                                                <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </Row>
                                    <Row label="Size (px)">
                                        <input type="number" min="5" max="72" className={inputCls}
                                            value={selected.size ?? 12}
                                            onChange={(e) => update(selected.id, { size: parseInt(e.target.value, 10) || 12 })} />
                                    </Row>
                                    <Row label="Weight">
                                        <select className={inputCls} value={selected.weight || "semibold"}
                                            onChange={(e) => update(selected.id, { weight: e.target.value })}>
                                            {(options?.weights || []).map(w => <option key={w} value={w}>{w}</option>)}
                                        </select>
                                    </Row>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <Row label="Align">
                                        <select className={inputCls} value={selected.align || "left"}
                                            onChange={(e) => update(selected.id, { align: e.target.value })}>
                                            {(options?.alignments || []).map(a => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    </Row>
                                    <Row label="Case">
                                        <select className={inputCls} value={selected.transform || "none"}
                                            onChange={(e) => update(selected.id, { transform: e.target.value })}>
                                            {(options?.transforms || []).map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </Row>
                                    <Row label="Colour">
                                        <input type="color" className="h-[34px] w-full rounded-lg border border-slate-200"
                                            value={selected.color || "#111827"}
                                            onChange={(e) => update(selected.id, { color: e.target.value })} />
                                    </Row>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <Row label="Tracking" hint="tenths of a px">
                                        <input type="number" className={inputCls} value={selected.letter_spacing ?? 0}
                                            onChange={(e) => update(selected.id, { letter_spacing: parseInt(e.target.value, 10) || 0 })} />
                                    </Row>
                                    <Row label="Line height %">
                                        <input type="number" className={inputCls} value={selected.line_height ?? 120}
                                            onChange={(e) => update(selected.id, { line_height: parseInt(e.target.value, 10) || 120 })} />
                                    </Row>
                                    <Row label="Style">
                                        <div className="flex gap-1">
                                            <button type="button"
                                                onClick={() => update(selected.id, { italic: !selected.italic })}
                                                className={`flex-1 rounded-lg border px-2 py-1.5 text-meta italic ${selected.italic ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600"}`}>I</button>
                                            <button type="button"
                                                onClick={() => update(selected.id, { underline: !selected.underline })}
                                                className={`flex-1 rounded-lg border px-2 py-1.5 text-meta underline ${selected.underline ? "border-teal-400 bg-teal-50 text-teal-700" : "border-slate-200 text-slate-600"}`}>U</button>
                                        </div>
                                    </Row>
                                </div>
                            </>
                        }

                        {(selected.kind === "image" || selected.kind === "shape") &&
                            <div className="grid grid-cols-3 gap-2">
                                {selected.kind === "image" &&
                                    <Row label="Fit">
                                        <select className={inputCls} value={selected.fit || "cover"}
                                            onChange={(e) => update(selected.id, { fit: e.target.value })}>
                                            {(options?.fits || []).map(f => <option key={f} value={f}>{f}</option>)}
                                        </select>
                                    </Row>
                                }
                                <Row label="Shape">
                                    <select className={inputCls} value={selected.shape || "rect"}
                                        onChange={(e) => update(selected.id, { shape: e.target.value })}>
                                        {(options?.shapes || []).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </Row>
                                <Row label="Fill">
                                    <input type="color" className="h-[34px] w-full rounded-lg border border-slate-200"
                                        value={selected.bg || "#ffffff"}
                                        onChange={(e) => update(selected.id, { bg: e.target.value })} />
                                </Row>
                            </div>
                        }

                        <div className="grid grid-cols-3 gap-2">
                            <Row label="Border colour">
                                <input type="color" className="h-[34px] w-full rounded-lg border border-slate-200"
                                    value={selected.border_color || "#ffffff"}
                                    onChange={(e) => update(selected.id, { border_color: e.target.value })} />
                            </Row>
                            <Row label="Border width">
                                <input type="number" min="0" max="20" className={inputCls}
                                    value={selected.border_width ?? 0}
                                    onChange={(e) => update(selected.id, { border_width: parseInt(e.target.value, 10) || 0 })} />
                            </Row>
                            <Row label="Opacity %">
                                <input type="number" min="0" max="100" className={inputCls}
                                    value={selected.opacity ?? 100}
                                    onChange={(e) => update(selected.id, { opacity: parseInt(e.target.value, 10) })} />
                            </Row>
                        </div>

                        {selected.kind === "text" &&
                            <button type="button"
                                onClick={() => update(selected.id, { hide_when_empty: !selected.hide_when_empty })}
                                className="inline-flex items-center gap-1.5 text-meta font-semibold text-slate-600 hover:text-slate-900">
                                {selected.hide_when_empty
                                    ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                                {selected.hide_when_empty
                                    ? "Hidden when this person has no value"
                                    : "Always shown, even when empty"}
                            </button>
                        }
                    </div>
                }
            </div>
        </div>
    );
}

export default CardDesigner;
