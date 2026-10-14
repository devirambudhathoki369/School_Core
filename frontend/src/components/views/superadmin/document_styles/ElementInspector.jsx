import {
    EyeIcon, EyeSlashIcon, ChevronUpIcon, ChevronDownIcon, XMarkIcon,
} from "@heroicons/react/24/outline";

// The controls for the ONE element the user clicked in the preview. Direct
// manipulation: pick a word on the sheet, change how that word is set. Nothing
// here is hunted for in a long list — it is whatever was just clicked.

function Segmented({ label, value, options, onChange, capitalize }) {
    return (
        <div>
            <span className="block text-[0.68rem] uppercase tracking-wide text-blue-gray-500 mb-1">{label}</span>
            <div className="flex flex-wrap gap-1">
                {options.map((opt) => {
                    const val = opt.value ?? opt;
                    const text = opt.label ?? opt;
                    return (
                        <button key={val} type="button" onClick={() => onChange(val)}
                            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold border transition-colors duration-150 ${value === val
                                ? "border-teal-500 bg-teal-50 text-teal-900"
                                : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"} ${capitalize ? "capitalize" : ""}`}>
                            {text}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ElementInspector({ el, meta, options, index, count, onChange, onMove, onDeselect }) {
    if (!el) {
        return (
            <div className="rounded-xl border border-dashed border-blue-gray-200 bg-white p-6 text-center">
                <p className="font-semibold text-blue-gray-700">Click any part of the sheet</p>
                <p className="mt-1 text-sm text-blue-gray-500">
                    Pick the school name, logo, title or any line in the preview to change how it looks.
                </p>
            </div>
        );
    }
    
    const required = !!meta?.required;
    const hidden = el.visible === false;

    return (
        <div className="rounded-xl border border-teal-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-blue-gray-100 bg-teal-50/60 rounded-t-xl">
                <div className="min-w-0">
                    <span className="block text-[0.68rem] uppercase tracking-wide text-teal-700">Editing</span>
                    <span className="block font-bold text-blue-gray-900 truncate">{meta?.label || el.key}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button type="button" disabled={index === 0} onClick={() => onMove(index, index - 1)}
                        title="Move up" className="rounded-md p-1.5 text-blue-gray-500 hover:bg-white disabled:opacity-30">
                        <ChevronUpIcon className="h-5 w-5" />
                    </button>
                    <button type="button" disabled={index === count - 1} onClick={() => onMove(index, index + 1)}
                        title="Move down" className="rounded-md p-1.5 text-blue-gray-500 hover:bg-white disabled:opacity-30">
                        <ChevronDownIcon className="h-5 w-5" />
                    </button>
                    <button type="button" disabled={required}
                        onClick={() => onChange({ ...el, visible: hidden })}
                        title={required ? "Always printed — cannot be removed" : hidden ? "Show on the sheet" : "Remove from the sheet"}
                        className={`rounded-md p-1.5 ${required ? "opacity-25 cursor-not-allowed"
                            : hidden ? "text-blue-gray-400 hover:bg-white" : "text-teal-700 hover:bg-white"}`}>
                        {hidden ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </button>
                    <button type="button" onClick={onDeselect} title="Done"
                        className="rounded-md p-1.5 text-blue-gray-400 hover:bg-white">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {hidden ? (
                <div className="px-4 py-4 text-sm text-blue-gray-500">
                    This part is off the sheet. Use the eye above to put it back.
                </div>
            ) : (
                <div className="px-4 py-4 flex flex-col gap-4">
                    <label className="flex flex-col gap-1">
                        <span className="text-[0.68rem] uppercase tracking-wide text-blue-gray-500">Font</span>
                        <select value={el.font} onChange={(e) => onChange({ ...el, font: e.target.value })}
                            className="rounded-lg border border-blue-gray-200 px-3 py-2 text-sm bg-white">
                            {(options.element_fonts || []).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                    </label>

                    <div>
                        <span className="flex items-center justify-between text-[0.68rem] uppercase tracking-wide text-blue-gray-500 mb-1">
                            <span>Size</span><span className="text-teal-700 font-bold">{el.size}%</span>
                        </span>
                        <input type="range" min="50" max="300" step="5" value={el.size} className="w-full accent-teal-600"
                            onChange={(e) => onChange({ ...el, size: Number(e.target.value) })} />
                    </div>

                    <Segmented label="Weight" value={el.weight} onChange={(v) => onChange({ ...el, weight: v })}
                        options={options.weights || []} capitalize />
                    <Segmented label="Alignment" value={el.align} onChange={(v) => onChange({ ...el, align: v })}
                        options={options.alignments || []} capitalize />
                    <Segmented label="Letter case" value={el.transform} onChange={(v) => onChange({ ...el, transform: v })}
                        options={options.transforms || []} capitalize />
                    <Segmented label="Letter spacing" value={el.tracking || "normal"} onChange={(v) => onChange({ ...el, tracking: v })}
                        options={options.trackings || ["tight", "normal", "wide", "wider", "widest"]} capitalize />

                    <div>
                        <span className="block text-[0.68rem] uppercase tracking-wide text-blue-gray-500 mb-1">Style</span>
                        <div className="flex gap-1">
                            <button type="button" onClick={() => onChange({ ...el, italic: !el.italic })}
                                className={`rounded-md px-3 py-1.5 text-sm border italic ${el.italic
                                    ? "border-teal-500 bg-teal-50 text-teal-900" : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                                Italic
                            </button>
                            <button type="button" onClick={() => onChange({ ...el, underline: !el.underline })}
                                className={`rounded-md px-3 py-1.5 text-sm border underline ${el.underline
                                    ? "border-teal-500 bg-teal-50 text-teal-900" : "border-blue-gray-200 text-blue-gray-600 hover:bg-blue-gray-50"}`}>
                                Underline
                            </button>
                        </div>
                    </div>

                    <div>
                        <span className="block text-[0.68rem] uppercase tracking-wide text-blue-gray-500 mb-1">Colour</span>
                        <div className="flex items-center gap-2">
                            <input type="color" value={el.color || "#000000"}
                                onChange={(e) => onChange({ ...el, color: e.target.value })}
                                className="h-9 w-14 rounded border border-blue-gray-200 bg-white" />
                            <span className="text-sm text-blue-gray-600">{el.color || "document colour"}</span>
                            {el.color && (
                                <button type="button" onClick={() => onChange({ ...el, color: "" })}
                                    className="ml-auto text-[0.72rem] text-teal-700 font-semibold hover:underline">reset</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ElementInspector;
