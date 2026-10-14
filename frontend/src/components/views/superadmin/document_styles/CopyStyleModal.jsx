import { useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { copyDocumentStyle } from "@/services/functions/documentStyles";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";

// Copy one school's finished design onto many others in a single step — the
// difference between styling 70 schools one-by-one and styling one then
// stamping it across a whole group.
function CopyStyleModal({ schools, sourceId, sourceName, onClose, onCopied }) {
    const { notification: { updateNotification } } = useAppContext();
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState(() => new Set());
    const { uploading, statusHandler } = useRequestStatus();

    // Never offer the source as a target — copying a style onto itself is a
    // no-op that only invites confusion.
    const targets = useMemo(
        () => schools.filter((s) => s.id !== sourceId),
        [schools, sourceId]
    );
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? targets.filter((s) => (s.name || "").toLowerCase().includes(q)) : targets;
    }, [targets, query]);

    function toggle(id) {
        setPicked((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    function pickAllShown() {
        setPicked((prev) => {
            const next = new Set(prev);
            filtered.forEach((s) => next.add(s.id));
            return next;
        });
    }

    async function apply() {
        if (!picked.size) { updateNotification("", "Choose at least one school."); return; }
        statusHandler.toggleUploading();
        const [status, message, res] = await copyDocumentStyle(sourceId, [...picked]);
        statusHandler.toggleUploading();
        if (status === 200) onCopied?.(res || { message });
        else updateNotification(status, message);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-2 p-4 border-b border-blue-gray-100">
                    <div className="min-w-0">
                        <h3 className="font-bold text-blue-gray-800">Copy this style to other schools</h3>
                        <p className="text-[0.8rem] text-blue-gray-500 truncate">
                            Everything from <span className="font-semibold capitalize">{sourceName}</span> — theme, fonts,
                            borders, layout and where it applies — replaces each chosen school's style.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-md p-1 text-blue-gray-400 hover:bg-blue-gray-50">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-3 border-b border-blue-gray-100 flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full bg-blue-gray-50 px-3 py-2 flex-1">
                        <MagnifyingGlassIcon className="h-4 w-4 text-teal-700 shrink-0" />
                        <input value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter schools" className="bg-transparent focus:outline-none text-sm w-full" />
                    </div>
                    <button type="button" onClick={pickAllShown}
                        className="text-sm font-semibold text-teal-700 hover:underline shrink-0">Select shown</button>
                </div>

                <div className="overflow-y-auto p-2 flex-1">
                    {filtered.map((s) => {
                        const on = picked.has(s.id);
                        return (
                            <button key={s.id} type="button" onClick={() => toggle(s.id)}
                                className={`w-full flex items-center gap-2 text-left rounded-lg px-3 py-2 ${on ? "bg-teal-50" : "hover:bg-blue-gray-50"}`}>
                                <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${on ? "bg-teal-600 border-teal-600" : "border-blue-gray-300"}`}>
                                    {on && <span className="text-white text-[0.6rem] leading-none">✓</span>}
                                </span>
                                <span className="font-semibold text-blue-gray-800 truncate">{s.name}</span>
                                {s.style?.configured && (
                                    <span className="ml-auto text-[0.7rem] text-blue-gray-400 capitalize shrink-0">has {s.style.theme}</span>
                                )}
                            </button>
                        );
                    })}
                    {filtered.length === 0 && <p className="text-center text-blue-gray-400 py-6 text-sm">No school matches.</p>}
                </div>

                <div className="p-4 border-t border-blue-gray-100 flex items-center justify-between gap-2">
                    <span className="text-sm text-blue-gray-500">{picked.size} selected</span>
                    <div className="flex gap-2">
                        <Button variant="outlined" onClick={onClose}>Cancel</Button>
                        <Button color="teal" onClick={apply} disabled={uploading || !picked.size}>
                            {uploading ? "Copying..." : `Copy to ${picked.size || ""} school${picked.size === 1 ? "" : "s"}`}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CopyStyleModal;
