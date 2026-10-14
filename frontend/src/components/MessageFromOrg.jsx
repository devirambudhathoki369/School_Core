import { useLayoutEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Dialog, DialogBody, Button } from "@material-tailwind/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

const STORAGE_KEY = "overlay:closedAtByFilename";
const MAX_HIDE_MS = 24 * 60 * 60 * 1000 * 1; // 1 day
const DIALOG_HEIGHT = "80vh";

const nowISO = () => new Date().toISOString();
const parseISO = (s) => {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
};
const readStore = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};
const writeStore = (obj) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch { }
};
const isPdfSrc = (src = "") => {
    try {
        const noHash = src.split("#")[0];
        const noQuery = noHash.split("?")[0];
        return /\.pdf$/i.test(noQuery);
    } catch {
        return false;
    }
};

export function filterEligibleImages(allItems) {
    const store = readStore();
    const now = Date.now();
    return (allItems || []).filter((it) => {
        const id = it.id;
        if (!id) return true; // fallback: if no id, always eligible
        const last = store[id];
        if (!last) return true;
        return now - parseISO(last) >= MAX_HIDE_MS;
    });
}

export default function MessageFromOrg({ items = [] }) {
    const [open, setOpen] = useState(false);
    const [queue, setQueue] = useState([]);
    const [idx, setIdx] = useState(0);
    const [dims, setDims] = useState({ w: 1, h: 1 });
    const [loading, setLoading] = useState(true);

    const markClosedNow = (current) => {
        const store = readStore();
        if (current?.id) {
            store[current.id] = nowISO();
        }
        writeStore(store);
    };

    const handleClose = () => {
        // if (current) markClosedNow(current);
        const nextIdx = idx + 1;
        if (nextIdx < queue.length) {
            setIdx(nextIdx);
        } else {
            setOpen(false);
        }
    };

    useLayoutEffect(() => {
        const eligible = filterEligibleImages(items);
        setQueue(eligible);
        setIdx(0);
        setOpen(eligible.length > 0);
    }, [JSON.stringify(items)]);

    const current = useMemo(() => queue[idx] ?? null, [queue, idx]);

    useLayoutEffect(() => {
        setLoading(true);
    }, [current?.src]);

    if (!current) return null;

    return (
        <Dialog
            open={open}
            handler={handleClose}
            size="lg"
            className="z-[9999] w-[min(95vw,1100px)] relative"
            overlayProps={{ className: "bg-black/50" }}>
            {/* Close button fixed at top-right of dialog */}
            <Button
                aria-label="Close"
                onClick={handleClose}
                color="gray"
                className="absolute -top-2 -right-2 rounded-full p-1 text-white border z-20"
                ripple={false}>
                <XMarkIcon className="h-5 w-5" />
            </Button>
            <DialogBody
                className="w-full overflow-y-scroll"
                style={{
                    height: DIALOG_HEIGHT,
                    scrollbarGutter: "stable both-edges",
                    overscrollBehavior: "contain",
                    contain: "layout paint"
                }}>
                <div className="w-full h-full">
                    <div className="flex items-start justify-center p-3 min-h-[120px] min-w-[120px] relative">
                        {loading && <Loader />}
                        {isPdfSrc(current.src) ? (
                            <object
                                data={current.src}
                                type="application/pdf"
                                className={`block rounded ${loading ? 'invisible' : ''}`}
                                style={{ width: "100%", height: "100%" }}
                                onLoad={() => setLoading(false)}
                                onError={() => setLoading(false)}
                            >
                                <a href={current.src} target="_blank" rel="noreferrer">Open PDF</a>
                            </object>
                        ) : (
                            <Image
                                unoptimized
                                src={current.src}
                                alt={current.alt || ""}
                                width={dims.w}
                                height={dims.h}
                                className={`w-auto h-auto rounded ${loading ? 'invisible' : ''}`}
                                loading="eager"
                                priority
                                fetchPriority="high"
                                decoding="async"
                                onLoadingComplete={img => {
                                    setDims({ w: img.naturalWidth, h: img.naturalHeight });
                                    setLoading(false);
                                }}
                            />
                        )}
                    </div>
                </div>
            </DialogBody>
        </Dialog>
    );
}


function Loader() {
    return (
        <div className="flex items-center justify-center absolute inset-0 z-10">
            <svg className="animate-spin h-8 w-8 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
        </div>
    )
}