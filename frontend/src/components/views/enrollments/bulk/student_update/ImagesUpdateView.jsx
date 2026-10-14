import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, Typography } from "@material-tailwind/react";
import {
    ArrowUpCircleIcon, CheckCircleIcon, MagnifyingGlassIcon,
    PhotoIcon, TrashIcon, XCircleIcon, XMarkIcon,
} from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { ACCEPT_STR, ALLOWED_IMAGE_TYPES, aitString } from "@/configs/file_types";
import { UPDATE_TYPES } from "./configs";
import { compressImage, mapWithConcurrency } from "../student_photos/compressImage";

/**
 * Bulk photo matching: a screen of faces, and a name for each.
 *
 * WHAT WAS WRONG WITH IT
 * · The upload card DISAPPEARED as soon as any image was chosen, so a second
 *   batch could not be added — the only way to add one more photo was to start
 *   over and lose every pairing already made.
 * · One oversized file rejected the WHOLE selection ("File X must be less than
 *   1MB"), which on a folder of phone photos means nothing can ever be uploaded.
 *   Files are compressed on the way in now (~700px, ~600KB — an ID photo prints
 *   at a fraction of that), so a 4MB camera original is fine, and a file that
 *   really cannot be used is skipped BY ITSELF instead of taking the batch down.
 * · A pairing could not be undone and an image could not be removed. Both are on
 *   the card now: ✕ takes the name off, the bin takes the image out.
 * · Pairing was drag-and-drop ONLY, which does not exist on a touch screen. Tap
 *   a photo and pick the student from a searchable list.
 * · Dropping a name moved the image to the end of the grid by MUTATING the
 *   list, which reshuffled the faces under the cursor mid-drag. Matched photos
 *   still sink to the bottom — that is the point of the screen, the top is
 *   always what is left to do — but the order is DERIVED now, so the underlying
 *   list never moves and undoing a match puts the photo back where it was.
 *
 * WHO OWNS A PAIRING
 * Not this component. `updateForm[studentId].image` — the parent's state, the
 * thing that actually gets uploaded — is the single source of truth, and the
 * name under a photo is DERIVED from it by matching the File object. So the
 * parent's Clean/Reset buttons clear the labels too, instead of leaving a grid
 * that claims pairings the upload no longer has.
 */

// Originals up to this size are accepted; everything is compressed on the way
// in, so what actually travels is ~600 KB regardless.
const MAX_UPLOAD_MB = 4;
// Compressing 100 canvases at once starves the main thread and freezes the tab.
const COMPRESS_CONCURRENCY = 3;

function ImagesUpdateView({ data, onChange }) {
    const { notification: { updateNotification } } = useAppContext();
    const [images, setImages] = useState([]);       // {id, file, src}
    const [processing, setProcessing] = useState(0);
    const [chipQuery, setChipQuery] = useState("");
    const [pickerFor, setPickerFor] = useState(null);
    // The chip the pointer is on, plus where it is — one hover card is rendered
    // for the whole strip rather than a tooltip component per name. A class of
    // 300 chips means 300 floating-ui instances otherwise, and the strip has to
    // stay light enough to scroll.
    const [hovered, setHovered] = useState(null);
    const fileInputRef = useRef(null);
    const idSeq = useRef(0);
    const objectUrls = useRef(new Set());
    // When each photo was matched, so the matched block at the bottom reads in
    // the order the work was done rather than jumping about as names land.
    const pairedAt = useRef(new Map());
    const pairSeq = useRef(0);

    // Object URLs are a manual allocation: without this the page leaks one blob
    // per photo for as long as the tab lives, and a 300-photo class is measured
    // in hundreds of megabytes.
    useEffect(() => () => {
        objectUrls.current.forEach(u => { try { URL.revokeObjectURL(u); } catch { } });
        objectUrls.current.clear();
    }, []);

    const students = data?.students || [];
    const updateForm = data?.updateForm || {};

    // File → student id. The pairing lives in the parent's form; this only reads
    // it back. File objects are stable references, so they are the key.
    const ownerOfFile = useMemo(() => {
        const map = new Map();
        for (const std of students) {
            const file = updateForm?.[std.id]?.[UPDATE_TYPES.image];
            if (file) map.set(file, std);
        }
        return map;
    }, [students, updateForm]);

    const pairedCount = images.reduce((n, img) => n + (ownerOfFile.has(img.file) ? 1 : 0), 0);

    /**
     * WHAT IS LEFT TO DO COMES FIRST.
     *
     * A matched photo is finished business: it sinks to the bottom the moment
     * its name lands, so the top of the grid is always the faces still waiting
     * and the work never requires scrolling past what is already done. Among
     * the matched, the order is the order they were matched in.
     *
     * Derived, not mutated — `images` keeps its insertion order, so taking a
     * name off (✕) drops the photo straight back among the unmatched instead of
     * leaving it stranded at the end.
     */
    const orderedImages = useMemo(() => {
        const withIndex = images.map((img, i) => ({ img, i }));
        return withIndex
            .sort((a, b) => {
                const aDone = ownerOfFile.has(a.img.file) ? 1 : 0;
                const bDone = ownerOfFile.has(b.img.file) ? 1 : 0;
                if (aDone !== bDone) return aDone - bDone;
                if (aDone === 1) {
                    const aSeq = pairedAt.current.get(a.img.id) ?? a.i;
                    const bSeq = pairedAt.current.get(b.img.id) ?? b.i;
                    if (aSeq !== bSeq) return aSeq - bSeq;
                }
                return a.i - b.i;
            })
            .map(e => e.img);
    }, [images, ownerOfFile]);

    const filteredStudents = useMemo(() => {
        const q = chipQuery.trim().toLowerCase();
        if (!q) return students;
        return students.filter(s => (s.name || "").toLowerCase().includes(q));
    }, [students, chipQuery]);

    // ---- adding files -----------------------------------------------------
    const addFiles = useCallback(async (fileList) => {
        const incoming = Array.from(fileList || {});
        if (incoming.length < 1) return;
        const usable = [], rejected = [];
        for (const file of incoming) {
            const tooBig = (file.size / 1024 / 1024) >= MAX_UPLOAD_MB;
            if (!ALLOWED_IMAGE_TYPES.includes(file.type) || tooBig) rejected.push(file.name);
            else usable.push(file);
        }
        if (rejected.length > 0) {
            // Named, and only the ones actually at fault — "some files were
            // skipped" leaves the user hunting through a folder of 300.
            updateNotification('', `Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''} (${aitString} under ${MAX_UPLOAD_MB}MB only): ${rejected.slice(0, 3).join(', ')}${rejected.length > 3 ? '…' : ''}`);
        }
        if (usable.length < 1) return;

        setProcessing(p => p + usable.length);
        const prepared = new Array(usable.length);
        await mapWithConcurrency(usable, COMPRESS_CONCURRENCY, async (file, i) => {
            const compressed = await compressImage(file);
            const src = URL.createObjectURL(compressed);
            objectUrls.current.add(src);
            prepared[i] = { id: `img-${idSeq.current++}`, file: compressed, src };
            setProcessing(p => p - 1);
        });
        // APPEND. Replacing the list is what made "add a few more" impossible.
        setImages(state => [...state, ...prepared.filter(Boolean)]);
    }, [updateNotification]);

    // ---- pairing ----------------------------------------------------------
    const pair = useCallback((image, student) => {
        if (!image || !student) return;
        // The student may already hold a different photo, and this photo may
        // already belong to somebody else. Clear both sides first so no student
        // ends up with two photos and no photo with two names.
        const currentOwner = ownerOfFile.get(image.file);
        if (currentOwner && currentOwner.id !== student.id) {
            onChange(currentOwner.id, UPDATE_TYPES.image, "", null);
        }
        onChange(student.id, UPDATE_TYPES.image, image.file, null);
        pairedAt.current.set(image.id, pairSeq.current++);
    }, [onChange, ownerOfFile]);

    const unpair = useCallback((image) => {
        const owner = ownerOfFile.get(image.file);
        if (!owner) return;
        onChange(owner.id, UPDATE_TYPES.image, "", null);
    }, [onChange, ownerOfFile]);

    const removeImage = useCallback((image) => {
        unpair(image);
        setImages(state => state.filter(i => i.id !== image.id));
        pairedAt.current.delete(image.id);
        try { URL.revokeObjectURL(image.src); } catch { }
        objectUrls.current.delete(image.src);
    }, [unpair]);

    const clearAll = useCallback(() => {
        images.forEach(img => {
            const owner = ownerOfFile.get(img.file);
            if (owner) onChange(owner.id, UPDATE_TYPES.image, "", null);
            try { URL.revokeObjectURL(img.src); } catch { }
            objectUrls.current.delete(img.src);
        });
        pairedAt.current.clear();
        setImages([]);
    }, [images, onChange, ownerOfFile]);

    // ---- drag and drop (desktop) -----------------------------------------
    const dragDrop = {
        onDragStart: (e, std) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", JSON.stringify({ id: std.id }));
        },
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e, image) => {
            e.preventDefault();
            let payload = {};
            try { payload = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { }
            const student = students.find(s => String(s.id) === String(payload.id));
            if (student) pair(image, student);
        },
    };

    const activeImage = images.find(i => i.id === pickerFor) || null;

    return (
        // NO INNER SCROLLER. This used to be `h-[80vh] overflow-auto`, which put
        // a second scrollbar inside the page's own and — far worse — scrolled
        // the NAMES out of sight as soon as you reached the photos. Dragging a
        // name onto a face needs both on screen at once, so past the first row
        // or two the drag path simply stopped working and the work stalled after
        // five or six photos. One scrollbar now, and the names stay pinned.
        <div onDragOverCapture={(e) => e.preventDefault()}>
            {/* ── the names. STICKY: they are one half of every pairing, so
                   they have to still be there when you have scrolled down to
                   the face you are naming. ─────────────────────────────── */}
            {students.length > 0 &&
                <Card className="sticky top-0 z-20 mt-2 p-3 shadow-md ring-1 ring-blue-gray-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                            <Typography className="font-bold leading-tight">Students</Typography>
                            <Typography variant="small" color="gray" className="leading-snug">
                                Drag a name onto a photo — or tap a photo and pick the student.
                            </Typography>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-[0.72rem] font-bold text-teal-800 ring-1 ring-teal-200">
                                {pairedCount} of {students.length} matched
                            </span>
                            {/* A class of 300 names is a wall. Typing three letters
                                is faster than reading it. */}
                            <div className="relative">
                                <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={chipQuery}
                                    onChange={(e) => setChipQuery(e.target.value)}
                                    placeholder="Find a name…"
                                    aria-label="Find a student name"
                                    className="w-40 rounded-lg border border-blue-gray-200 py-1.5 pl-8 pr-2 text-[0.8rem] outline-none
                                        focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30 sm:w-52" />
                            </div>
                        </div>
                    </div>
                    {/* Two rows deep, scrolling inside itself: pinned to the top
                        of the page, a 300-name wall would leave no room for the
                        photos it exists to label. The filter above is how you
                        reach a name that is not in the visible rows. */}
                    <div className="mt-2 flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto py-1 sm:max-h-28"
                        onDragOver={dragDrop.onDragOver}>
                        {filteredStudents.map((std) => {
                            const matched = Boolean(updateForm?.[std.id]?.[UPDATE_TYPES.image]);
                            return (
                                <span key={std.id} draggable
                                    onDragStart={(e) => { setHovered(null); dragDrop.onDragStart(e, std); }}
                                    // Four students can be called SUSHMITA CHAUDHARY, and the
                                    // A/B/D the office appends to tell them apart is not enough
                                    // to know WHICH face belongs to which. The card names the
                                    // father, the phone and the address — the three things the
                                    // register is actually keyed by.
                                    onMouseEnter={(e) => setHovered({ std, rect: e.currentTarget.getBoundingClientRect() })}
                                    onMouseLeave={() => setHovered(null)}
                                    className={`inline-flex w-max cursor-grab items-center gap-1 rounded-md px-2 py-1.5 text-sm uppercase
                                        transition-colors active:cursor-grabbing ${matched
                                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-300"
                                            : "bg-blue-gray-100 text-black hover:bg-blue-gray-200"}`}>
                                    {matched && <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />}
                                    {std.name}
                                </span>
                            );
                        })}
                        {filteredStudents.length === 0 &&
                            <span className="px-1 py-2 text-sm text-gray-500">
                                No name matches “{chipQuery.trim()}”.
                            </span>
                        }
                    </div>
                </Card>
            }

            {/* ── the dropzone. STAYS PUT: adding a second batch is normal. ── */}
            <Card
                className="mt-3 cursor-pointer border-2 border-dashed border-blue-300 bg-blue-50/70 p-6 text-center
                    transition-colors hover:border-blue-400 hover:bg-blue-50"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
                }}>
                <ArrowUpCircleIcon className="mx-auto h-10 w-10 text-blue-600" />
                <Typography className="mt-1 font-semibold text-blue-800">
                    Drop images here or click to select multiple
                </Typography>
                <Typography variant="small" color="gray">
                    {aitString.toUpperCase()}, up to {MAX_UPLOAD_MB} MB each. You can come back and add more.
                </Typography>
                <input ref={fileInputRef} type="file" hidden accept={ACCEPT_STR} multiple
                    onChange={(e) => { addFiles(e.target.files); e.target.value = null; }} />
            </Card>

            {/* ── what is selected, and what will actually be uploaded ────── */}
            {(images.length > 0 || processing > 0) &&
                <Card className="mt-3 flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <Typography variant="small" className="leading-snug">
                        <span className="font-bold">{images.length}</span> image{images.length === 1 ? '' : 's'} selected
                        {' • '}<span className="font-bold text-emerald-700">{pairedCount}</span> paired
                        {processing > 0 && <span className="text-blue-700"> • {processing} preparing…</span>}
                        <span className="text-gray-500">
                            {'  '}— drag a name onto an image to pair them. Unpaired images won&apos;t be uploaded.
                        </span>
                    </Typography>
                    <button type="button" onClick={clearAll}
                        className="flex w-max items-center gap-x-1 text-sm text-red-600 hover:underline">
                        <XCircleIcon className="h-4 w-4" /> Clear all images
                    </button>
                </Card>
            }

            {/* ── the faces ─────────────────────────────────────────────── */}
            {images.length > 0 &&
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9">
                    {orderedImages.map((image) => {
                        const owner = ownerOfFile.get(image.file);
                        return (
                            <ImageCell key={image.id} image={image} owner={owner}
                                onOpenPicker={() => setPickerFor(image.id)}
                                onUnpair={() => unpair(image)}
                                onRemove={() => removeImage(image)}
                                onDragOver={dragDrop.onDragOver}
                                onDrop={(e) => dragDrop.onDrop(e, image)} />
                        );
                    })}
                </div>
            }

            {images.length === 0 && processing === 0 &&
                <div className="mt-6 flex flex-col items-center gap-2 px-4 py-10 text-center text-gray-400">
                    <PhotoIcon className="h-10 w-10" />
                    <span className="text-sm font-semibold text-gray-500">No images chosen yet</span>
                    <span className="max-w-md text-[0.82rem]">
                        Pick the whole folder at once — then put a name on each face.
                    </span>
                </div>
            }

            {hovered && <StudentHoverCard student={hovered.std} rect={hovered.rect}
                matched={Boolean(updateForm?.[hovered.std.id]?.[UPDATE_TYPES.image])} />}

            {activeImage &&
                <StudentPickerSheet
                    image={activeImage}
                    owner={ownerOfFile.get(activeImage.file)}
                    students={students}
                    updateForm={updateForm}
                    onClose={() => setPickerFor(null)}
                    onPick={(student) => { pair(activeImage, student); setPickerFor(null); }}
                    onUnpair={() => { unpair(activeImage); setPickerFor(null); }} />
            }
        </div>
    );
}

/**
 * The three facts that tell two students of the same name apart.
 *
 * `detailed: true` is already on this page's search, so the father's name, the
 * phone and the address are in hand — they were simply never shown. Blank
 * fields are dropped rather than printed as empty rows.
 */
function studentFacts(std) {
    return [
        ['Roll No', std?.roll_no],
        ['Father', std?.father_name || std?.guardian_name],
        ['Phone', std?.contact || std?.guardian_contact],
        ['Address', std?.location || std?.guardian_location],
    ].filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== '');
}

/** A one-line summary of the same, for a list row that has no room for a table. */
function studentSubline(std) {
    return [
        std?.father_name || std?.guardian_name,
        std?.contact || std?.guardian_contact,
        std?.location || std?.guardian_location,
    ].filter(v => v && `${v}`.trim()).join(' · ');
}

/**
 * ONE hover card for the whole name strip.
 *
 * Positioned from the chip's own rect in viewport coordinates, so it follows the
 * chip wherever the tray has been scrolled to, and clamped so a name at the
 * right edge does not open its card off screen. `pointer-events-none` — the card
 * must never sit between the cursor and the chip it describes, or hovering it
 * would end the hover that produced it.
 */
function StudentHoverCard({ student, rect, matched }) {
    const facts = studentFacts(student);
    const WIDTH = 260;
    const left = Math.max(8, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - WIDTH - 8));
    const top = rect.bottom + 6;
    return (
        <div style={{ position: 'fixed', left, top, width: WIDTH, zIndex: 40 }}
            className="pointer-events-none rounded-xl border border-blue-gray-100 bg-white p-3 shadow-xl">
            <div className="text-[0.9rem] font-bold capitalize leading-tight text-gray-900">
                {student?.name}
            </div>
            {matched &&
                <div className="mt-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-600">
                    already matched — drag onto another photo to move
                </div>
            }
            {facts.length > 0 ? (
                <dl className="mt-2 space-y-1">
                    {facts.map(([label, value]) => (
                        <div key={label} className="flex gap-2 text-[0.8rem] leading-snug">
                            <dt className="w-16 shrink-0 text-gray-400">{label}</dt>
                            <dd className="min-w-0 flex-1 break-words font-medium capitalize text-gray-800">{value}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <div className="mt-1 text-[0.8rem] text-gray-400">No other details on record.</div>
            )}
        </div>
    );
}

/** One face: the photo, whose it is, and the two ways to take that back. */
function ImageCell({ image, owner, onOpenPicker, onUnpair, onRemove, onDragOver, onDrop }) {
    return (
        <div
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={onOpenPicker}
            title={owner ? `${owner.name} — click to change` : "Click to pick the student"}
            className={`group relative aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border bg-white
                shadow-sm transition-all hover:shadow-md active:scale-[0.99]
                ${owner ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-blue-gray-100'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.src} alt={owner?.name || "student photo"} draggable={false}
                className="h-full w-full object-contain" />

            {/* ✕ takes the name off; the bin takes the image out. Both sit where
                the thumb lands and both stop the click from opening the picker. */}
            {owner &&
                <button type="button" title="Remove this name (undo the match)"
                    aria-label={`Unpair ${owner.name}`}
                    onClick={(e) => { e.stopPropagation(); onUnpair(); }}
                    className="absolute left-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white
                        opacity-80 transition-opacity hover:bg-black/75 hover:opacity-100">
                    <XMarkIcon className="h-4 w-4" />
                </button>
            }
            <button type="button" title="Delete this image"
                aria-label="Delete this image"
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white
                    opacity-80 transition-opacity hover:bg-red-600 hover:opacity-100">
                <TrashIcon className="h-4 w-4" />
            </button>

            {owner &&
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1.5 pt-5">
                    <div className="truncate text-center text-[0.7rem] font-bold uppercase text-white">
                        {owner.name}
                    </div>
                </div>
            }
        </div>
    );
}

/**
 * "Who is this?" — the touch-friendly half of pairing.
 *
 * Drag-and-drop does not exist on a phone or a tablet, which is what the office
 * actually photographs a class with, so tapping the face has to be a complete
 * path: search, tap the name, done. Students who still need a photo are listed
 * first, because they are who the next face almost always is.
 */
function StudentPickerSheet({ image, owner, students, updateForm, onClose, onPick, onUnpair }) {
    const [query, setQuery] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
            inputRef.current?.focus();
        }
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        function onKey(e) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener("keydown", onKey);
        };
    }, [onClose]);

    const sorted = useMemo(() => {
        const copy = [...students];
        copy.sort((a, b) => {
            const aHas = updateForm?.[a.id]?.[UPDATE_TYPES.image] ? 1 : 0;
            const bHas = updateForm?.[b.id]?.[UPDATE_TYPES.image] ? 1 : 0;
            if (aHas !== bHas) return aHas - bHas;
            return (a.name || "").localeCompare(b.name || "");
        });
        return copy;
    }, [students, updateForm]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sorted;
        // Name, roll, FATHER and PHONE. When four students share a name, the
        // name is the one thing that cannot narrow the list — the father's name
        // is what the office actually says out loud to tell them apart.
        return sorted.filter(s => [
            s.name, s.roll_no, s.father_name, s.guardian_name,
            s.contact, s.guardian_contact,
        ].some(v => String(v ?? "").toLowerCase().includes(q)));
    }, [sorted, query]);

    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/55 sm:items-center sm:justify-center"
            onClick={onClose}>
            <div className="flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[80vh] sm:w-[460px] sm:rounded-2xl"
                role="dialog" aria-label="Pick the student"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-center pb-1 pt-2 sm:hidden">
                    <div className="h-1.5 w-10 rounded-full bg-gray-300" />
                </div>

                <div className="flex items-center gap-x-3 border-b px-4 pb-3 pt-2 sm:pt-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.src} alt="" className="h-16 w-14 shrink-0 rounded-lg border bg-gray-100 object-contain" />
                    <div className="min-w-0 flex-1">
                        <Typography className="text-base font-bold leading-tight">Who is this?</Typography>
                        <Typography variant="small" color="gray" className="leading-tight">
                            {owner ? <>Currently matched to <b className="capitalize">{owner.name}</b>.</> : 'Tap the matching student.'}
                        </Typography>
                    </div>
                    <button type="button" onClick={onClose} title="Close"
                        className="p-1 text-gray-500 hover:text-gray-800">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-3 pb-2 pt-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name, roll no, father or phone…"
                            className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none
                                focus:border-teal-500 focus:ring-1 focus:ring-teal-200" />
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {filtered.length === 0 ? (
                        <div className="p-4 text-center text-xs text-gray-500">
                            No student matches “{query}”.
                        </div>
                    ) : filtered.map((s) => {
                        const has = Boolean(updateForm?.[s.id]?.[UPDATE_TYPES.image]);
                        const isOwner = owner?.id === s.id;
                        return (
                            <button key={s.id} type="button" onClick={() => onPick(s)}
                                className={`my-1 flex w-full items-center gap-x-2.5 rounded-lg border-2 px-3 py-2.5 text-left text-sm
                                    ${isOwner ? 'border-emerald-500 bg-emerald-50' : 'border-transparent hover:bg-gray-50'}`}>
                                {s.roll_no != null && s.roll_no !== '' &&
                                    <span className="inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded bg-gray-900 px-1.5 text-[0.7rem] font-bold text-white">
                                        {s.roll_no}
                                    </span>
                                }
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-semibold capitalize">{s.name}</span>
                                    {/* Father · phone · address, so two students of
                                        the same name are two different rows here
                                        rather than the same row twice. */}
                                    {studentSubline(s) &&
                                        <span className="block truncate text-[0.72rem] font-normal capitalize text-gray-500">
                                            {studentSubline(s)}
                                        </span>
                                    }
                                </span>
                                {has && !isOwner &&
                                    <span title="Already has a photo in this batch — picking them moves it here."
                                        className="shrink-0 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-600">
                                        matched
                                    </span>
                                }
                                {isOwner && <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-600" />}
                            </button>
                        );
                    })}
                </div>

                {owner &&
                    <div className="border-t px-3 py-2.5">
                        <button type="button" onClick={onUnpair}
                            className="flex items-center gap-x-1.5 text-sm font-semibold text-red-600 hover:underline">
                            <XMarkIcon className="h-4 w-4" /> Remove this match
                        </button>
                    </div>
                }
            </div>
        </div>
    );
}

export default ImagesUpdateView;
