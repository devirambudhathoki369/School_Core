import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { collectMenuLeaves, pruneUnopenableMenus } from "@/methods/menuTree";

/**
 * Jump to any page.
 *
 * This used to flatten every submenu into one unbroken run of ~80 chips inside
 * a box with no height limit, so it spilled past the bottom of the window and
 * the only way to find a page was to read all of them. It is now grouped under
 * the section each page belongs to, filterable, and scrolls inside itself.
 *
 * WHAT IT IS ALLOWED TO OFFER
 * It used to walk `adminMenu` — the raw config — so it showed every page in the
 * product to everyone: a staff member without accounting rights got tiles for
 * the whole accounting section, and every one of them opened "COMING SOON!!!",
 * because the view map they resolve against IS permission-filtered. It now
 * walks the same already-filtered tree the sidebar renders, pruned to the pages
 * that actually have a component behind them, so a tile in here can only ever
 * be a page this user can open.
 */

function ShortcutsView({ toggleShortcuts }) {
    const { menu: { menus }, user: { user } } = useAppContext();
    const [query, setQuery] = useState("");
    const inputRef = useRef(null);

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (e) => { if (e.key === "Escape") toggleShortcuts(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [toggleShortcuts]);

    const groups = useMemo(() => (
        pruneUnopenableMenus(menus?.menu || [], menus?.views)
            .filter((m) => !m?.hidden)
            .filter((m) => !m?.onlySuperuser || user?.role === 'superuser')
            .map((m) => ({
                title: m.name,
                // A group is addressed through its own view; a top-level page
                // with no submenu is addressed by that view alone. Emitting
                // "<view>.<view>" for the second kind is the old bug that made
                // Match Photos link to a route that does not exist.
                items: m?.submenu
                    ? collectMenuLeaves(m.submenu, m.view)
                    : collectMenuLeaves([m]),
            }))
            .filter((g) => g.items.length > 0)
    ), [menus, user?.role]);

    const needle = query.trim().toLowerCase();
    const shown = needle
        ? groups
            .map((g) => ({ ...g, items: g.items.filter((i) => i.name?.toLowerCase().includes(needle)) }))
            .filter((g) => g.items.length > 0)
        : groups;
    const count = shown.reduce((n, g) => n + g.items.length, 0);

    return (
        <>
            {/* Closing lives on the backdrop and the ×, not on the panel — the
                previous version closed on any click inside it, which is why it
                could never have held a filter field. */}
            <div className="fixed inset-0 z-40 bg-black/25" onClick={toggleShortcuts} aria-hidden="true" />

            <div role="dialog" aria-label="Jump to a page"
                className="app-shortcuts fixed z-50 left-1/2 top-[8vh] w-[92vw] max-w-3xl -translate-x-1/2
                    flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-blue-gray-100
                    bg-white shadow-2xl">

                <div className="app-shortcuts-head flex items-center gap-2 border-b border-blue-gray-100 px-4 py-3">
                    <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-teal-600" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter pages…"
                        className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                    />
                    <span className="shrink-0 text-[11px] font-semibold text-gray-400 tabular-nums">{count}</span>
                    <button type="button" aria-label="close shortcuts" onClick={toggleShortcuts}
                        className="shrink-0 rounded-md p-1 text-gray-500 hover:bg-blue-gray-50 hover:text-gray-800">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    {count === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-500">Nothing matches that.</p>
                    ) : shown.map((g) => (
                        <div key={g.title} className="mb-4 last:mb-1">
                            <h4 className="app-shortcuts-group mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                {g.title}
                            </h4>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                {g.items.map((item) => (
                                    <Link key={item.view} href={`#${item.view}`} onClick={toggleShortcuts}
                                        className="app-shortcut-item flex items-center gap-2 rounded-lg border border-blue-gray-50
                                            bg-white px-3 py-2 text-sm text-gray-800 transition-colors
                                            hover:border-teal-300 hover:bg-teal-50">
                                        <span className="shrink-0 opacity-70">{item.prefix}</span>
                                        <span className="min-w-0 truncate">{item.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

export default ShortcutsView;
