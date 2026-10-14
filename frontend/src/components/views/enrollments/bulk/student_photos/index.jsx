import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Tabs, TabsHeader, Tab, Typography } from "@material-tailwind/react";
import {
    ArrowUpCircleIcon,
    TrashIcon,
    XMarkIcon,
    PhotoIcon,
    CheckCircleIcon,
    UserGroupIcon,
    MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon as CheckCircleSolid } from "@heroicons/react/24/solid";

import { useAppContext } from "@/contexts/AppContext";
import SearchDialog from "@/components/inputs/SearchDialog";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { fetchClassesInOrder } from "@/services/functions/classes";
import {
    searchStudents,
    uploadPendingStudentPhotos,
    listPendingStudentPhotos,
    pairPendingStudentPhoto,
    deletePendingStudentPhoto,
} from "@/services/functions/students";
import { formatImagePath } from "@/methods/formatMediaPath";
import { ALLOWED_IMAGE_TYPES, ACCEPT_STR } from "@/configs/file_types";
import { compressImage, mapWithConcurrency } from "./compressImage";

// Caps the post-compression file size. The browser compressor usually lands
// well under 200 KB; this is the safety net for HEIC → PNG re-encodes.
const MAX_FILE_MB = 4;
// Batched upload — keeps requests under reverse-proxy body limits while
// saturating the network with 3 concurrent batches.
const BATCH_SIZE = 10;
const PARALLEL = 3;

const MODES = { POOL: "pool", PAIR: "pair" };

function StudentBulkPhotos() {
    const {
        user: { user },
        notification: { updateNotification },
    } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [classes, setClasses] = useState([]);
    const [classesLoading, setClassesLoading] = useState(true);
    const [showClassPicker, setShowClassPicker] = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);

    const [mode, setMode] = useState(MODES.PAIR);

    // ---- Pool tab (admin uploads, no pairing required) -------------------
    const [poolCells, setPoolCells] = useState([]); // local pre-upload buffer
    const [poolUploading, setPoolUploading] = useState(false);
    const [poolProgress, setPoolProgress] = useState({ done: 0, total: 0 });
    const poolFileInputRef = useRef(null);

    // ---- Pair tab (staff matches pool photos to students) ---------------
    const [poolItems, setPoolItems] = useState([]); // server-side pool
    const [poolItemsLoading, setPoolItemsLoading] = useState(false);
    const [students, setStudents] = useState([]);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [doneInSession, setDoneInSession] = useState(0);
    const [pairing, setPairing] = useState(false);

    const cellIdSeq = useRef(0);
    const objectUrlsRef = useRef(new Set());

    // ----- load classes ----------------------------------------------------
    useEffect(() => {
        if (!user?.profile?.id) return;
        (async () => {
            setClassesLoading(true);
            const raw = await fetchClassesInOrder(user);
            const list = Object.values(raw || {}).reduce((acc, val) => {
                const [classname, details] = val;
                acc.push({ name: classname, id: details.id, details });
                return acc;
            }, []);
            setClasses(list);
            setClassesLoading(false);
        })();
    }, [user?.profile?.id]);

    // ----- revoke object URLs on unmount -----------------------------------
    useEffect(() => {
        return () => {
            objectUrlsRef.current.forEach((u) => {
                try { URL.revokeObjectURL(u); } catch {}
            });
            objectUrlsRef.current.clear();
        };
    }, []);

    function trackUrl(u) {
        objectUrlsRef.current.add(u);
        return u;
    }
    function releaseUrl(u) {
        if (!u || !u.startsWith?.("blob:")) return;
        try { URL.revokeObjectURL(u); } catch {}
        objectUrlsRef.current.delete(u);
    }

    async function onSelectClass(_name, item) {
        setSelectedClass(item);
        setShowClassPicker(false);
        // Reset both tabs' state — the user just switched scope.
        clearPoolCells({ silent: true });
        setPoolItems([]);
        setStudents([]);
        setDoneInSession(0);
        // Eagerly load both panes so switching tabs is instant.
        await Promise.all([
            loadStudents(item),
            loadPoolItems(item),
        ]);
    }

    async function loadStudents(klass) {
        const k = klass || selectedClass;
        if (!k) return;
        setStudentsLoading(true);
        // merge_sections: roster spans every section of this grade, so a photo
        // uploaded under one section can be matched to any student of the grade.
        const [, , data] = await searchStudents({
            class_info: k.id,
            school: schoolId,
            include_images: true,
            merge_sections: true,
        });
        setStudents(Array.isArray(data) ? data : []);
        setStudentsLoading(false);
    }
    async function loadPoolItems(klass) {
        const k = klass || selectedClass;
        if (!k) return;
        setPoolItemsLoading(true);
        // merge_sections: show photos uploaded to ANY section of this grade.
        const items = await listPendingStudentPhotos(schoolId, k.id, true);
        setPoolItems(items);
        setPoolItemsLoading(false);
    }

    // ====== POOL TAB =======================================================
    function openPoolFilePicker() {
        if (!selectedClass) {
            updateNotification("", "Pick a class first!");
            return;
        }
        poolFileInputRef.current?.click();
    }
    async function addPoolFiles(fileList) {
        const incoming = Array.from(fileList || []).filter((f) =>
            ALLOWED_IMAGE_TYPES.includes(f.type)
        );
        if (!incoming.length) {
            updateNotification("", "No valid images selected.");
            return;
        }
        const created = incoming.map((file) => {
            const id = ++cellIdSeq.current;
            return {
                id,
                file,
                src: trackUrl(URL.createObjectURL(file)),
                processing: true,
            };
        });
        setPoolCells((prev) => [...prev, ...created]);
        await mapWithConcurrency(created, 4, async (cell) => {
            const compressed = await compressImage(cell.file);
            setPoolCells((prev) =>
                prev.map((c) => {
                    if (c.id !== cell.id) return c;
                    releaseUrl(c.src);
                    return {
                        ...c,
                        file: compressed,
                        src: trackUrl(URL.createObjectURL(compressed)),
                        processing: false,
                    };
                })
            );
        });
    }
    function removePoolCell(id) {
        setPoolCells((prev) => {
            const c = prev.find((x) => x.id === id);
            if (c) releaseUrl(c.src);
            return prev.filter((x) => x.id !== id);
        });
    }
    function clearPoolCells({ silent = false } = {}) {
        poolCells.forEach((c) => releaseUrl(c.src));
        setPoolCells([]);
    }
    // Asking is the caller's job now. `clearPoolCells` stays synchronous
    // because `onSelectClass` and the post-upload reset both clear it and then
    // immediately set more state — awaiting in between would let a render slip
    // through with half the tab reset.
    async function confirmClearPoolCells() {
        if (poolCells.length > 0 && !await confirmAction({
            title: "Discard all selected images?",
            body: `${poolCells.length} image${poolCells.length === 1 ? "" : "s"} waiting to be uploaded will be removed. Nothing already uploaded is affected.`,
            tone: "warning",
            confirmText: "Discard",
        })) return;
        clearPoolCells({ silent: true });
    }
    async function onPoolSave() {
        if (!poolCells.length) return;
        const oversized = poolCells.find((c) => c.file.size > MAX_FILE_MB * 1024 * 1024);
        if (oversized) {
            updateNotification("", `One image is over ${MAX_FILE_MB} MB even after compression.`);
            return;
        }
        if (poolCells.some((c) => c.processing)) {
            updateNotification("", "Wait for compression to finish.");
            return;
        }
        setPoolUploading(true);
        setPoolProgress({ done: 0, total: poolCells.length });

        const batches = [];
        for (let i = 0; i < poolCells.length; i += BATCH_SIZE) {
            batches.push(poolCells.slice(i, i + BATCH_SIZE));
        }
        let firstErrorMsg = null;
        let savedTotal = 0;
        let next = 0;
        await Promise.all(
            Array.from(
                { length: Math.min(PARALLEL, batches.length) },
                async () => {
                    while (firstErrorMsg === null) {
                        const idx = next++;
                        if (idx >= batches.length) return;
                        const batch = batches[idx];
                        const [status, message, data] = await uploadPendingStudentPhotos({
                            school: schoolId,
                            class_info: selectedClass.id,
                            files: batch.map((c) => c.file),
                        });
                        if (status === 200 && data) {
                            savedTotal += data.saved || 0;
                            setPoolProgress((p) => ({ done: p.done + batch.length, total: p.total }));
                        } else {
                            firstErrorMsg = message || "Upload failed.";
                            return;
                        }
                    }
                }
            )
        );

        setPoolUploading(false);
        if (firstErrorMsg) {
            updateNotification(400, `Upload stopped: ${firstErrorMsg}. Saved ${savedTotal} so far.`);
            return;
        }
        updateNotification(200, `Uploaded ${savedTotal} image${savedTotal === 1 ? "" : "s"} to the pool.`);
        clearPoolCells({ silent: true });
        loadPoolItems();
    }

    // ====== PAIR TAB =======================================================
    async function confirmMatch(pendingId, student) {
        if (!pendingId || !student?.id) return;
        setPairing(true);
        const [status, message] = await pairPendingStudentPhoto({
            school: schoolId,
            class_info: selectedClass.id,
            pending_id: Number(pendingId),
            student: student.id,
        });
        setPairing(false);
        if (status === 200) {
            setPoolItems((prev) => prev.filter((p) => String(p.id) !== String(pendingId)));
            setDoneInSession((n) => n + 1);
            // Refresh students so the just-paired one gets an image and is
            // removed from the search-able pool on the next open.
            loadStudents();
            updateNotification(200, `Matched ${student.name}.`);
            return true;
        }
        updateNotification(400, message || "Match failed.");
        return false;
    }

    async function discardPoolItem(pendingId) {
        if (!await confirmAction({
            title: "Delete this photo from the pool?",
            body: "The uploaded file is removed. It has not been attached to a student yet, so no profile changes.",
        })) return;
        const [status, message] = await deletePendingStudentPhoto({
            school: schoolId, id: pendingId,
        });
        if (status === 200) {
            setPoolItems((prev) => prev.filter((p) => p.id !== pendingId));
        } else {
            updateNotification(400, message || "Delete failed.");
        }
    }

    const studentsWithoutPhoto = useMemo(
        () => students.filter((s) => !s.image).length,
        [students]
    );

    // ====== render =========================================================
    if (classesLoading) return <Loader />;

    return (
        <div className="p-2 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
                <div className="flex items-center gap-x-2">
                    <CameraIconLogo />
                    <div>
                        <Typography variant="h5" className="font-bold leading-tight">
                            Match Photos to Students
                        </Typography>
                        {selectedClass ? (
                            <Typography variant="small" color="gray" className="leading-tight">
                                {selectedClass.name} • {user?.profile?.school_name || user?.profile?.name || "School"}
                            </Typography>
                        ) : (
                            <Typography variant="small" color="gray" className="leading-tight">
                                Pick a class to begin.
                            </Typography>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-x-2 flex-wrap">
                    <Button
                        size="sm"
                        variant="outlined"
                        onClick={() => setShowClassPicker(true)}
                        disabled={poolUploading || pairing}
                    >
                        {selectedClass ? "Change Class" : "Choose Class"}
                    </Button>
                </div>
            </div>

            {!selectedClass ? (
                <Card className="p-4">
                    <Typography variant="small" className="font-bold uppercase tracking-wide text-gray-700 mb-3">
                        Pick a class
                    </Typography>
                    {classes.length === 0 ? (
                        <NotFound error="No classes available." />
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                            {classes.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => onSelectClass(c.name, c)}
                                    className="px-3 py-3 rounded-lg border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 text-blue-900 font-semibold text-sm text-center transition-colors"
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                    )}
                </Card>
            ) : (
                <>
                    <Tabs value={mode} className="mb-3">
                        <TabsHeader>
                            <Tab value={MODES.PAIR} onClick={() => setMode(MODES.PAIR)}>
                                Match {poolItems.length > 0 && `(${poolItems.length})`}
                            </Tab>
                            <Tab value={MODES.POOL} onClick={() => setMode(MODES.POOL)}>
                                Upload More
                            </Tab>
                        </TabsHeader>
                    </Tabs>

                    {mode === MODES.POOL ? (
                        <PoolUploadPanel
                            cells={poolCells}
                            onAddFiles={addPoolFiles}
                            onRemove={removePoolCell}
                            onClear={confirmClearPoolCells}
                            onOpenPicker={openPoolFilePicker}
                            fileInputRef={poolFileInputRef}
                            uploading={poolUploading}
                            progress={poolProgress}
                            onSave={onPoolSave}
                        />
                    ) : (
                        <PairPanel
                            poolItems={poolItems}
                            poolItemsLoading={poolItemsLoading}
                            students={students}
                            studentsLoading={studentsLoading}
                            studentsWithoutPhoto={studentsWithoutPhoto}
                            doneInSession={doneInSession}
                            onConfirmMatch={confirmMatch}
                            onDiscardItem={discardPoolItem}
                            onRefresh={() => loadPoolItems()}
                            pairing={pairing}
                        />
                    )}
                </>
            )}

            <SearchDialog
                name="class"
                open={showClassPicker}
                handler={() => setShowClassPicker((s) => !s)}
                title="Class"
                data={classes}
                onSelect={onSelectClass}
            />
        </div>
    );
}

function CameraIconLogo() {
    return (
        <div className="hidden sm:flex w-10 h-10 rounded-full bg-blue-100 text-blue-700 items-center justify-center">
            <PhotoIcon className="w-6 h-6" />
        </div>
    );
}

// ===== POOL UPLOAD PANEL ====================================================
function PoolUploadPanel({
    cells, onAddFiles, onRemove, onClear, onOpenPicker, fileInputRef,
    uploading, progress, onSave,
}) {
    const processingCount = cells.filter((c) => c.processing).length;
    return (
        <>
            <Card
                className="p-6 border-2 border-dashed border-blue-300 bg-blue-50 cursor-pointer text-center"
                onClick={onOpenPicker}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) onAddFiles(e.dataTransfer.files);
                }}
            >
                <ArrowUpCircleIcon className="w-10 h-10 mx-auto text-blue-600" />
                <Typography className="font-semibold text-blue-800 mt-1">
                    Drop images here or click to select multiple
                </Typography>
                <Typography variant="small" color="gray">
                    JPG or PNG. Auto-resized to ~900px before upload. No
                    pairing needed at this step — the class teacher matches
                    names later.
                </Typography>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STR}
                    multiple
                    hidden
                    onChange={(e) => {
                        onAddFiles(e.target.files);
                        e.target.value = "";
                    }}
                />
            </Card>

            {cells.length > 0 && (
                <Card className="mt-3 p-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-y-1">
                        <Typography className="font-semibold">
                            {cells.length} image{cells.length === 1 ? "" : "s"} ready
                            {processingCount > 0 && ` • ${processingCount} compressing…`}
                        </Typography>
                        <button
                            type="button"
                            onClick={onClear}
                            className="text-red-600 text-sm flex items-center gap-x-1 hover:underline"
                            disabled={uploading}
                        >
                            <TrashIcon className="w-4 h-4" /> Clear all
                        </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                        {cells.map((c) => (
                            <div key={c.id} className={`relative aspect-[3/4] bg-white border rounded overflow-hidden shadow-sm group ${c.processing ? "opacity-70" : ""}`}>
                                <img src={c.src} alt="" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => onRemove(c.id)}
                                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                                    title="Remove"
                                >
                                    <TrashIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <div className="sticky bottom-0 left-0 right-0 -mx-2 mt-3 bg-white border-t px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-y-2 shadow z-10">
                <Typography variant="small">
                    <span className="font-bold">{cells.length}</span> photo
                    {cells.length === 1 ? "" : "s"} selected
                    {uploading && <> • uploading {progress.done}/{progress.total}</>}
                </Typography>
                <Button
                    color="blue"
                    onClick={onSave}
                    disabled={uploading || cells.length === 0 || processingCount > 0}
                >
                    {uploading ? `Uploading ${progress.done}/${progress.total}…` : `Upload ${cells.length || ""} to Pool`}
                </Button>
            </div>
        </>
    );
}

// ===== PAIRING PANEL ========================================================
function PairPanel({
    poolItems, poolItemsLoading, students, studentsLoading,
    studentsWithoutPhoto, doneInSession,
    onConfirmMatch, onDiscardItem, onRefresh, pairing,
}) {
    // Picker sheet — opens when a photo is tapped.
    const [pickerOpenFor, setPickerOpenFor] = useState(null);
    // Lightbox — full-screen image view, opens when the photo thumbnail
    // inside the picker is tapped.
    const [lightboxSrc, setLightboxSrc] = useState(null);

    const waiting = poolItems.length;
    const totalNeeded = studentsWithoutPhoto + doneInSession;
    const progressPct = totalNeeded > 0
        ? Math.round((doneInSession / totalNeeded) * 100)
        : 0;

    const activePending = poolItems.find((p) => String(p.id) === String(pickerOpenFor));

    if (poolItemsLoading || studentsLoading) return <Loader />;

    return (
        <>
            {/* ── Hero card with task instructions + progress ─────────────── */}
            <Card className="p-4 bg-blue-700 text-white shadow-sm">
                <div className="flex items-start gap-x-2.5">
                    <PhotoIcon className="w-6 h-6 flex-shrink-0 mt-0.5 opacity-90" />
                    <div className="flex-1">
                        <Typography className="font-bold text-base leading-tight">
                            Tap a photo, pick the student
                        </Typography>
                        <Typography variant="small" className="opacity-90 leading-snug mt-0.5">
                            The matched photo will be saved to that student automatically.
                        </Typography>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                    <StatChip icon={<PhotoIcon className="w-4 h-4" />} label={`${waiting} waiting`} />
                    <StatChip icon={<UserGroupIcon className="w-4 h-4" />} label={`${studentsWithoutPhoto} students to go`} />
                    <StatChip icon={<CheckCircleSolid className="w-4 h-4" />} label={`${doneInSession} done`} done />
                </div>
                {totalNeeded > 0 && (
                    <div className="mt-3 h-2 rounded-full bg-white/25 overflow-hidden">
                        <div
                            className="h-full bg-yellow-300 transition-all"
                            style={{ width: `${progressPct}%` }}
                        />
                    </div>
                )}
            </Card>

            {/* ── Pool photos ─────────────────────────────────────────────── */}
            <div className="mt-4 flex items-center justify-between">
                <Typography variant="small" className="font-bold uppercase tracking-wide text-gray-700">
                    Photos waiting to be matched
                </Typography>
                <div className="flex items-center gap-x-2">
                    <span className="text-xs text-gray-500">{poolItems.length}</span>
                    <button
                        type="button"
                        onClick={onRefresh}
                        className="text-xs text-blue-700 underline"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {poolItems.length === 0 ? (
                <Card className="mt-2 p-6">
                    <NotFound error="No pending photos for this class. Switch to the Upload tab to add some." />
                </Card>
            ) : (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {poolItems.map((p) => (
                        <PhotoCard
                            key={p.id}
                            item={p}
                            onTap={() => setPickerOpenFor(p.id)}
                            onDiscard={() => onDiscardItem(p.id)}
                        />
                    ))}
                </div>
            )}

            {/* ── Picker bottom-sheet / dialog ────────────────────────────── */}
            {pickerOpenFor != null && activePending && (
                <PickerSheet
                    pending={activePending}
                    students={students}
                    onClose={() => setPickerOpenFor(null)}
                    onViewFull={(src) => setLightboxSrc(src)}
                    onConfirm={async (student) => {
                        const ok = await onConfirmMatch(pickerOpenFor, student);
                        if (ok) setPickerOpenFor(null);
                    }}
                    saving={pairing}
                />
            )}

            {/* ── Full-screen image lightbox ──────────────────────────────── */}
            {lightboxSrc && (
                <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
            )}
        </>
    );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function StatChip({ icon, label, done }) {
    return (
        <span
            className={`inline-flex items-center gap-x-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                done ? "bg-emerald-400/95 text-emerald-950" : "bg-white/20 text-white"
            }`}
        >
            {icon}
            {label}
        </span>
    );
}

function PhotoCard({ item, onTap, onDiscard }) {
    const [errored, setErrored] = useState(false);
    return (
        <div
            className="relative aspect-[3/4] bg-gray-100 border rounded-lg overflow-hidden shadow-sm group cursor-pointer active:scale-[0.98] transition-transform"
            onClick={onTap}
            title="Tap to pick student"
        >
            {errored ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 px-2 text-center">
                    <PhotoIcon className="w-8 h-8 mb-1" />
                    <span className="text-xs font-semibold">Pending photo</span>
                </div>
            ) : (
                <img
                    src={formatImagePath(item.image)}
                    alt="Pending photo"
                    className="w-full h-full object-cover"
                    draggable={false}
                    onError={() => setErrored(true)}
                />
            )}
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDiscard(); }}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center sm:opacity-0 group-hover:opacity-100 transition-opacity"
                title="Delete from pool"
            >
                <TrashIcon className="w-4 h-4" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/65 to-transparent text-white text-[0.65rem] font-bold uppercase text-center pt-4 pb-1.5 truncate">
                Tap to match
            </div>
        </div>
    );
}

// ─── Picker bottom-sheet ────────────────────────────────────────────────────
function PickerSheet({ pending, students, onClose, onConfirm, onViewFull, saving }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => {
        // Don't autofocus on mobile — it pops up the keyboard and shoves
        // the sheet around. Desktop is fine.
        if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
            inputRef.current?.focus();
        }
    }, []);

    // Lock body scroll while the sheet is open so the user doesn't
    // accidentally scroll the page behind it.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, []);

    const sortedStudents = useMemo(() => {
        // Show students without a photo first — they're the ones who still
        // need a match. Then alphabetical by name.
        const copy = [...students];
        copy.sort((a, b) => {
            const aNeeds = a.image ? 1 : 0;
            const bNeeds = b.image ? 1 : 0;
            if (aNeeds !== bNeeds) return aNeeds - bNeeds;
            return (a.name || "").localeCompare(b.name || "");
        });
        return copy;
    }, [students]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return sortedStudents;
        return sortedStudents.filter((s) => {
            const name = (s.name || "").toLowerCase();
            const roll = String(s.roll_no ?? "").toLowerCase();
            return name.includes(q) || roll.includes(q);
        });
    }, [sortedStudents, query]);

    const pendingSrc = formatImagePath(pending.image);

    return (
        <div
            className="fixed inset-0 z-50 bg-black/55 flex items-end sm:items-center sm:justify-center"
            onClick={onClose}
        >
            <div
                className="w-full sm:w-[460px] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[80vh] animate-slide-up"
                onClick={(e) => e.stopPropagation()}
            >
                {/* drag handle (visual only) */}
                <div className="sm:hidden flex justify-center pt-2 pb-1">
                    <div className="w-10 h-1.5 rounded-full bg-gray-300" />
                </div>

                {/* header — photo + title + close */}
                <div className="flex items-center gap-x-3 px-4 pt-2 sm:pt-4 pb-3 border-b">
                    <button
                        type="button"
                        onClick={() => onViewFull?.(pendingSrc)}
                        className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border hover:ring-2 hover:ring-blue-400"
                        title="Tap to view full photo"
                    >
                        <img
                            src={pendingSrc}
                            alt="Pending"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    </button>
                    <div className="flex-1">
                        <Typography className="font-bold text-base leading-tight">
                            Who is this?
                        </Typography>
                        <Typography variant="small" color="gray" className="leading-tight">
                            Tap the matching student.
                        </Typography>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-800 p-1"
                        title="Close"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* search */}
                <div className="px-3 pt-3 pb-2">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name or roll no…"
                            className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                        />
                    </div>
                </div>

                {/* student list */}
                <div className="overflow-y-auto flex-1 px-2 pb-2">
                    {filtered.length === 0 ? (
                        <div className="p-4 text-xs text-gray-500 text-center">
                            No student matches “{query}”.
                        </div>
                    ) : (
                        filtered.map((s) => {
                            const isSelected = selected?.id === s.id;
                            const hasPhoto = !!s.image;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setSelected(s)}
                                    className={`w-full text-left text-sm px-3 py-2.5 my-1 rounded-lg flex items-center gap-x-2.5 border-2 ${
                                        isSelected
                                            ? "border-blue-500 bg-blue-50"
                                            : "border-transparent hover:bg-gray-50"
                                    }`}
                                >
                                    <span className={`inline-flex w-5 h-5 items-center justify-center rounded-full border-2 ${isSelected ? "border-blue-600" : "border-gray-300"}`}>
                                        {isSelected && (
                                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                                        )}
                                    </span>
                                    {(s.roll_no) != null && (
                                        <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 h-6 rounded bg-gray-900 text-white text-[0.7rem] font-bold">
                                            {s.roll_no}
                                        </span>
                                    )}
                                    <span className="font-semibold flex-1 truncate">
                                        {s.name}
                                    </span>
                                    {hasPhoto && (
                                        <CheckCircleIcon
                                            className="w-4 h-4 text-emerald-500"
                                            title="Already has a photo — pairing will replace it."
                                        />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* footer — confirm */}
                <div className="border-t px-3 py-2.5 flex items-center justify-between gap-x-2 flex-wrap gap-y-2">
                    <div className="text-sm flex items-center gap-x-1.5 min-w-0">
                        <span className="text-gray-500 whitespace-nowrap">Match to:</span>
                        {selected ? (
                            <span className="flex items-center gap-x-1 min-w-0">
                                {(selected.roll_no) != null && (
                                    <span className="inline-flex items-center justify-center min-w-[1.75rem] px-1.5 h-5 rounded bg-gray-900 text-white text-[0.65rem] font-bold">
                                        {selected.roll_no}
                                    </span>
                                )}
                                <span className="font-semibold truncate">{selected.name}</span>
                            </span>
                        ) : (
                            <span className="text-gray-400">no student picked yet</span>
                        )}
                    </div>
                    <Button
                        color="blue"
                        size="md"
                        disabled={!selected || saving}
                        onClick={() => selected && onConfirm(selected)}
                        className="flex items-center gap-x-1.5"
                    >
                        <CheckCircleIcon className="w-5 h-5" />
                        {saving ? "Saving…" : "Confirm Match"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ─── Full-screen image lightbox ─────────────────────────────────────────────
function ImageLightbox({ src, onClose }) {
    useEffect(() => {
        function onKey(e) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);
    return (
        <div
            className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center"
                title="Close"
            >
                <XMarkIcon className="w-6 h-6" />
            </button>
            <img
                src={src}
                alt="Full"
                className="max-w-full max-h-full rounded shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}

export default StudentBulkPhotos;
