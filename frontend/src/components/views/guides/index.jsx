import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    MagnifyingGlassIcon,
    ChevronDownIcon,
    ArrowRightCircleIcon,
    LightBulbIcon,
    BookOpenIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";

import FALLBACK_GUIDES, { CATEGORIES as FALLBACK_CATEGORIES } from "./content";
import { getGuides } from "@/services/functions/help";

/**
 * Guides.
 *
 * This menu entry used to render "COMING SOON!!!". It is now the written
 * answer to the questions support actually gets asked — how do I collect a fee,
 * why is a subject missing from marks entry, what does closing the year do —
 * with each guide able to hand the reader straight to the screen it describes.
 *
 * The library is authored by the superadmin (Help Centre ▸ Guides) and fetched
 * on mount; `content.js` is the copy that shipped in this bundle and is what
 * renders while the request is in flight or if it fails. That fallback is why
 * the page never needs a spinner.
 *
 * Theme handling is the same rule as the Support page: anything carrying the
 * interface's own colour reads `var(--t-*, <classic value>)`, so this is drawn
 * in the school's theme on all four palettes and in teal on Classic.
 */

const BRAND = "var(--t-brand-solid, #0d9488)";
const AMBER = "#d97706";

// The API calls the identifier `slug`; the bundled copy calls it `id`. One shape
// from here down, so nothing below has to know where a guide came from.
function normalise(guides) {
    return (guides || []).map((g) => ({
        key: g.slug || g.id,
        category: g.category,
        title: g.title,
        summary: g.summary || "",
        where: g.where || "",
        view: g.view || "",
        steps: g.steps || [],
        tips: g.tips || [],
    }));
}

// The whole guide is matched, not just its title, so "credit", "duplicate
// receipt" or "accession" all find their way home.
function buildHaystack(guides) {
    return guides.reduce((acc, g) => {
        acc[g.key] = [g.title, g.summary, g.where, ...g.steps, ...g.tips]
            .join(" ")
            .toLowerCase();
        return acc;
    }, {});
}

function GuideCard({ guide, categoryName, open, onToggle }) {
    return (
        <article className={`overflow-hidden rounded-xl border bg-white transition-shadow ${open ? "shadow-md" : "shadow-sm hover:shadow-md"}`}
            style={{ borderColor: open ? "color-mix(in srgb, var(--t-brand-solid, #0d9488) 35%, #fff)" : "#e5e7eb" }}>

            <button type="button" onClick={onToggle} aria-expanded={open}
                className="flex w-full items-start gap-3 p-4 text-left">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: `color-mix(in srgb, ${BRAND} 13%, #fff)`, color: BRAND }}>
                    <BookOpenIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[0.68rem] font-bold uppercase tracking-wider text-gray-500">
                        {categoryName}
                    </span>
                    <span className="block text-[1rem] font-semibold leading-5 text-gray-900">{guide.title}</span>
                    <span className="mt-1 block text-[0.87rem] leading-5 text-gray-600">{guide.summary}</span>
                </span>
                <ChevronDownIcon className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <p className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1">
                        <span className="text-[0.62rem] font-bold uppercase tracking-wider text-gray-500">Where</span>
                        <span className="truncate text-xs font-semibold text-gray-700">{guide.where}</span>
                    </p>

                    <ol className="flex flex-col gap-2.5">
                        {guide.steps.map((step, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.68rem] font-bold text-white"
                                    style={{ backgroundColor: BRAND }}>
                                    {i + 1}
                                </span>
                                <span className="text-[0.9rem] leading-5 text-gray-700">{step}</span>
                            </li>
                        ))}
                    </ol>

                    {guide.tips?.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2 rounded-lg p-3"
                            style={{ backgroundColor: `color-mix(in srgb, ${AMBER} 8%, #fff)` }}>
                            {guide.tips.map((tip, i) => (
                                <p key={i} className="flex items-start gap-2 text-[0.85rem] leading-5 text-gray-700">
                                    <LightBulbIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: AMBER }} />
                                    <span>{tip}</span>
                                </p>
                            ))}
                        </div>
                    )}

                    {guide.view && (
                        <Link href={`#${guide.view}`}
                            className="mt-3 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold hover:underline"
                            style={{ color: BRAND }}>
                            Open this page
                            <ArrowRightCircleIcon className="h-4 w-4" />
                        </Link>
                    )}
                </div>
            )}
        </article>
    );
}

function Guides() {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("");
    const [openId, setOpenId] = useState(null);

    const [content, setContent] = useState({
        categories: FALLBACK_CATEGORIES,
        guides: normalise(FALLBACK_GUIDES),
    });

    useEffect(() => {
        let live = true;
        (async () => {
            const data = await getGuides();
            // An empty library is a misconfiguration, not an answer — keep the
            // bundled copy rather than showing a school a page with no guides.
            if (live && data?.guides?.length) {
                setContent({
                    categories: data.categories || [],
                    guides: normalise(data.guides),
                });
            }
        })();
        return () => { live = false; };
    }, []);

    const { categories, guides } = content;
    const haystack = useMemo(() => buildHaystack(guides), [guides]);
    const categoryName = useMemo(
        () => categories.reduce((acc, c) => ({ ...acc, [c.key]: c.name }), {}),
        [categories]
    );

    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        return guides.filter((g) => {
            if (category && g.category !== category) return false;
            if (!q) return true;
            return (haystack[g.key] || "").includes(q);
        });
    }, [guides, haystack, query, category]);

    // Only the categories that still have something in them, so filtering never
    // offers a chip that leads to an empty page.
    const liveCategories = useMemo(() => {
        const q = query.trim().toLowerCase();
        const present = new Set(
            guides.filter((g) => !q || (haystack[g.key] || "").includes(q)).map((g) => g.category)
        );
        return categories.filter((c) => present.has(c.key));
    }, [guides, haystack, categories, query]);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">

            {/* ── header ───────────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative px-5 py-6 sm:px-7"
                    style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>
                    <div className="relative">
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/75">
                            Help centre
                        </p>
                        <h1 className="text-xl font-bold leading-tight text-white sm:text-2xl">Guides</h1>
                        <p className="mt-1 max-w-2xl text-[0.85rem] text-white/85">
                            Short, step-by-step answers to the things people ask us most. Search below,
                            or open a section and follow it in order.
                        </p>

                        {/* the search field sits on the band, where the eye lands first */}
                        <div className="relative mt-4 max-w-xl">
                            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search the guides — fee, marks, SMS, closing…"
                                className="w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-9 text-[0.9rem] text-gray-800
                                           shadow-sm outline-none placeholder:text-gray-400
                                           focus:ring-2 focus:ring-white/70" />
                            {query && (
                                <button type="button" onClick={() => setQuery("")} aria-label="clear search"
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                                    <XMarkIcon className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── category filter ──────────────────────────────────── */}
                <div className="flex flex-wrap gap-2 px-5 py-3.5 sm:px-7">
                    <button type="button" onClick={() => setCategory("")}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                        style={category === ""
                            ? { backgroundColor: BRAND, borderColor: BRAND, color: "#fff" }
                            : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#4b5563" }}>
                        All guides
                    </button>
                    {liveCategories.map((c) => {
                        const active = category === c.key;
                        return (
                            <button key={c.key} type="button" onClick={() => setCategory(active ? "" : c.key)}
                                className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                                style={active
                                    ? { backgroundColor: BRAND, borderColor: BRAND, color: "#fff" }
                                    : { backgroundColor: "#fff", borderColor: "#e5e7eb", color: "#4b5563" }}>
                                {c.name}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* ── results ──────────────────────────────────────────────── */}
            {results.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-[0.95rem] font-semibold text-gray-800">
                        Nothing here matches “{query}”.
                    </p>
                    <p className="mt-1 text-[0.87rem] text-gray-600">
                        Try a single word — “fee”, “marks”, “SMS” — or ask us directly from the Support page.
                    </p>
                    <Link href="#support"
                        className="mt-3 inline-flex items-center gap-1.5 text-[0.87rem] font-semibold hover:underline"
                        style={{ color: BRAND }}>
                        Go to Support
                        <ArrowRightCircleIcon className="h-4 w-4" />
                    </Link>
                </div>
            ) : (
                <div className="flex flex-col gap-2.5">
                    <p className="px-1 text-xs font-semibold text-gray-500">
                        {results.length} guide{results.length === 1 ? "" : "s"}
                    </p>
                    {results.map((g) => (
                        <GuideCard key={g.key} guide={g} categoryName={categoryName[g.category]}
                            open={openId === g.key}
                            onToggle={() => setOpenId((id) => (id === g.key ? null : g.key))} />
                    ))}
                </div>
            )}

            {/* ── still stuck ──────────────────────────────────────────── */}
            <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white
                            px-5 py-4 shadow-sm sm:flex-row sm:items-center">
                <div>
                    <p className="text-[0.95rem] font-semibold text-gray-900">Still stuck?</p>
                    <p className="text-[0.85rem] text-gray-600">
                        Call, WhatsApp or email the CentIT team — the details are one click away.
                    </p>
                </div>
                <Link href="#support"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[0.85rem] font-semibold text-white"
                    style={{ backgroundColor: BRAND }}>
                    Contact support
                    <ArrowRightCircleIcon className="h-4 w-4" />
                </Link>
            </div>
        </div>
    );
}

export default Guides;
