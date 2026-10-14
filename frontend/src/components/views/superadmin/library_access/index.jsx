import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import {
    BuildingLibraryIcon,
    MagnifyingGlassIcon,
    CheckIcon,
    XMarkIcon,
    ArrowsRightLeftIcon,
    ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { SearchInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { fetchLibraryAccess, saveLibraryAccess } from "@/services/functions/library";

/**
 * Library Access.
 *
 * Which OTHER schools' students a school's library may look up and issue books
 * to (schools of one foundation sharing a physical library, typically).
 *
 * This was previously a control on the school's own Book Issue/Return page,
 * which meant a school could grant itself the ability to read another school's
 * student records — names, classes, guardian contacts. It belongs here: the
 * party gaining the access is the last one who should be able to hand it out.
 *
 * The whole list is saved at once rather than one school at a time, so what the
 * superadmin sees on screen is exactly what gets stored — no half-applied state
 * if they change their mind mid-edit.
 */

const BRAND = "var(--t-brand-solid, #0d9488)";
const AMBER = "#d97706";

function LibraryAccess() {
    const { notification: { updateNotification } } = useAppContext();

    const [schools, setSchools] = useState([]);
    const [assignments, setAssignments] = useState({}); // { hostId: [guestId] }
    const [host, setHost] = useState("");
    const [draft, setDraft] = useState([]);             // guest ids being edited
    const [filter, setFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        const data = await fetchLibraryAccess();
        setSchools(Array.isArray(data?.schools) ? data.schools : []);
        setAssignments(data?.assignments || {});
        setLoading(false);
    }

    useEffect(() => { load(); }, []);

    const schoolName = useMemo(() => schools.reduce((acc, s) => {
        acc[s.id] = s.name;
        return acc;
    }, {}), [schools]);

    // Long option list, so it must be typeable rather than a plain <select>.
    const options = useMemo(
        () => schools.map((s) => ({ value: s.id, name: s.name })),
        [schools]
    );

    function onHost({ value }) {
        setHost(value);
        setFilter("");
        setDraft((assignments[String(value)] || []).map(Number));
    }

    function toggle(id) {
        setDraft((prev) => prev.includes(id)
            ? prev.filter((v) => v !== id)
            : [...prev, id]);
    }

    const saved = useMemo(
        () => (assignments[String(host)] || []).map(Number).slice().sort((a, b) => a - b),
        [assignments, host]
    );
    const dirty = useMemo(() => {
        const now = draft.slice().sort((a, b) => a - b);
        return now.length !== saved.length || now.some((v, i) => v !== saved[i]);
    }, [draft, saved]);

    // every school except the host — a library always serves its own students
    const selectable = useMemo(() => {
        const q = filter.trim().toLowerCase();
        return schools.filter((s) =>
            String(s.id) !== String(host) &&
            (!q || (s.name || "").toLowerCase().includes(q) || (s.address || "").toLowerCase().includes(q))
        );
    }, [schools, host, filter]);

    async function onSave() {
        setSaving(true);
        const [status, message] = await saveLibraryAccess(host, draft);
        updateNotification(status, message);
        if (status === 200) {
            setAssignments((prev) => ({ ...prev, [String(host)]: draft.slice() }));
        }
        setSaving(false);
    }

    // Every library that currently serves somebody — the at-a-glance answer to
    // "who can see whose students?", which is the question this page exists for.
    const active = useMemo(
        () => Object.entries(assignments)
            .filter(([, guests]) => guests?.length > 0)
            .map(([hostId, guests]) => ({ hostId, guests }))
            .sort((a, b) => (schoolName[a.hostId] || "").localeCompare(schoolName[b.hostId] || "")),
        [assignments, schoolName]
    );

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">

            {/* ── header ───────────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative px-5 py-6 sm:px-7"
                    style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>
                    <div className="relative flex items-start gap-3.5">
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-inset ring-white/25">
                            <BuildingLibraryIcon className="h-6 w-6 text-white" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/75">
                                Superadmin · Setup
                            </p>
                            <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">Library Access</h1>
                            <p className="mt-1 max-w-2xl text-[0.85rem] text-white/85">
                                Which other schools&apos; students a library may issue books to. Used when
                                schools of one foundation share a physical library.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-start gap-2.5 px-5 py-3.5 sm:px-7">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: AMBER }} />
                    <p className="text-[0.85rem] leading-5 text-gray-600">
                        Granting access lets the host library <strong>search another school&apos;s students</strong> —
                        their names, classes and contact details. Only schools that genuinely share a
                        library should be paired here.
                    </p>
                </div>
            </section>

            {loading ? <Loader /> : (
                <>
                    {/* ── pick the library ─────────────────────────────── */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: BRAND }} />
                            <div>
                                <h2 className="text-lg font-semibold leading-6 text-gray-900">The library</h2>
                                <p className="text-[0.85rem] text-gray-600">
                                    The school that holds the books and issues them at its desk.
                                </p>
                            </div>
                        </div>
                        <div className="mygrid">
                            <SearchInput input={{ name: "school", label: "School", options }}
                                value={host} onChange={onHost} />
                        </div>
                    </section>

                    {/* ── pick whose students it may serve ─────────────── */}
                    {host ? (
                        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: BRAND }} />
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-semibold leading-6 text-gray-900">
                                            Students visible to this library
                                        </h2>
                                        <p className="truncate text-[0.85rem] text-gray-600">
                                            Tick the schools whose students <span className="font-semibold capitalize">{schoolName[host]}</span> may issue books to.
                                        </p>
                                    </div>
                                </div>
                                <span className="shrink-0 self-start rounded-full px-3 py-1 text-xs font-semibold text-white"
                                    style={{ backgroundColor: draft.length ? BRAND : "#94a3b8" }}>
                                    {draft.length} selected
                                </span>
                            </div>

                            <div className="relative mb-3">
                                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
                                    placeholder="Filter schools…"
                                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[0.9rem]
                                               text-gray-800 outline-none placeholder:text-gray-400" />
                            </div>

                            <div className="grid max-h-[26rem] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                                {selectable.length === 0 && (
                                    <p className="col-span-full py-6 text-center text-[0.9rem] text-gray-500">
                                        No school matches “{filter}”.
                                    </p>
                                )}
                                {selectable.map((s) => {
                                    const on = draft.includes(s.id);
                                    return (
                                        <button key={s.id} type="button" onClick={() => toggle(s.id)}
                                            className="flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
                                            style={on
                                                ? { borderColor: BRAND, backgroundColor: `color-mix(in srgb, ${BRAND} 7%, #fff)` }
                                                : { borderColor: "#e5e7eb", backgroundColor: "#fff" }}>
                                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border-2"
                                                style={on
                                                    ? { borderColor: BRAND, backgroundColor: BRAND }
                                                    : { borderColor: "#cbd5e1" }}>
                                                {on && <CheckIcon className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block truncate text-[0.92rem] font-semibold capitalize text-gray-900">
                                                    {s.name}
                                                </span>
                                                {s.address && (
                                                    <span className="block truncate text-xs capitalize text-gray-500">{s.address}</span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex flex-col-reverse items-stretch justify-end gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                                {dirty && (
                                    <span className="mr-auto text-[0.82rem] font-semibold" style={{ color: AMBER }}>
                                        Unsaved changes
                                    </span>
                                )}
                                <Button variant="outlined" disabled={!dirty || saving}
                                    onClick={() => setDraft(saved.slice())}
                                    className="rounded-lg normal-case font-semibold">
                                    <span className="flex items-center justify-center gap-1.5">
                                        <XMarkIcon className="h-4 w-4" /> Discard
                                    </span>
                                </Button>
                                <Button disabled={!dirty || saving} onClick={onSave}
                                    className="rounded-lg normal-case font-semibold shadow-none"
                                    style={{ backgroundColor: BRAND }}>
                                    {saving ? "Saving…" : "Save access"}
                                </Button>
                            </div>
                        </section>
                    ) : (
                        <section className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-8 text-center">
                            <p className="text-[0.95rem] font-semibold text-gray-700">Pick a library above.</p>
                            <p className="mt-1 text-[0.87rem] text-gray-500">
                                Then tick the schools whose students it is allowed to serve.
                            </p>
                        </section>
                    )}

                    {/* ── who currently shares with whom ───────────────── */}
                    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="mb-4 flex items-center gap-2">
                            <span className="inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: AMBER }} />
                            <div>
                                <h2 className="text-lg font-semibold leading-6 text-gray-900">Current sharing</h2>
                                <p className="text-[0.85rem] text-gray-600">
                                    Every library that can serve another school&apos;s students right now.
                                </p>
                            </div>
                        </div>

                        {active.length === 0 ? (
                            <p className="py-4 text-[0.9rem] text-gray-500">
                                No library serves another school. Every school sees only its own students.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {active.map(({ hostId, guests }) => (
                                    <li key={hostId}
                                        className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-gray-50/70 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3">
                                        <span className="flex min-w-0 items-center gap-2 sm:w-1/3">
                                            <BuildingLibraryIcon className="h-4 w-4 shrink-0" style={{ color: BRAND }} />
                                            <span className="truncate text-[0.92rem] font-semibold capitalize text-gray-900">
                                                {schoolName[hostId] || `School ${hostId}`}
                                            </span>
                                        </span>
                                        <ArrowsRightLeftIcon className="hidden h-4 w-4 shrink-0 text-gray-400 sm:block" />
                                        <span className="min-w-0 flex-1 text-[0.87rem] capitalize text-gray-600">
                                            {guests.map((g) => schoolName[g] || `School ${g}`).join(", ")}
                                        </span>
                                        <button type="button"
                                            onClick={() => onHost({ value: Number(hostId) })}
                                            className="shrink-0 text-[0.8rem] font-semibold hover:underline"
                                            style={{ color: BRAND }}>
                                            Edit
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}

export default LibraryAccess;
