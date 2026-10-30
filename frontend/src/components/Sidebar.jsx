import {
    Card,
    Typography,
    List,
    Tooltip
} from "@material-tailwind/react";
import CustomAccordionMenu, { Menu } from "./CustomAccordionMenu";
import { useAppContext } from "@/contexts/AppContext";
// Outline, like every other row: `.icon` sets `stroke-[1.4]` and a SOLID
// heroicon ignores stroke, so the one solid glyph in the rail read as the
// heaviest thing in it. A door-and-arrow also says "sign out" where a plain
// right-chevron-in-a-circle said "next".
import { ArrowRightStartOnRectangleIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import logout from "@/services/functions/auth/logout";
import Users from "@/configs/Users";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import OurLogo from "./OurLogo";
import { collectMenuLeaves, filterMenuTree, pruneUnopenableMenus } from "@/methods/menuTree";

// Width at which the layout switches from mobile overlay → desktop flex.
// Matches Tailwind's `md` breakpoint.
const MD_BREAKPOINT = 768;

// 
// The two working years the whole app is scoped to. They used to be one
// absolutely-positioned line pinned to the bottom-right of the masthead, set at
// `text-[2rem]` — the largest type in the product — with a bare `|` between
// them. It crowded the wordmark, gave a number the weight of a headline, and
// when the academic year was unset it grew into "MISSING ACADEMIC YEAR!!!" and
// ran clean off the rail.
// They are two values, so they are two chips: a quiet caption naming which year
// it is, the value beside it, and the academic year carrying the accent because
// it is the one that changes and the one that can be absent.
// The stored names usually carry their own prefix — the economic year comes back
// as "EY2083/084", and some schools name theirs "FY 2082/083" — so putting an
// "EY" caption beside it printed "EY EY2083/084". The caption IS the label, so
// the value gives it up. Falls back to the original if stripping empties it.
function stripKey(value, key) {
    if (!value) return value;
    const stripped = String(value)
        .replace(new RegExp(`^\\s*(?:${key}|FY)\\s*[:./-]?\\s*`, 'i'), '')
        .trim();
    return stripped || String(value);
}

function FiscalYearNames() {
    const { fiscalYear: { year } } = useAppContext();
    useEffect(() => { }, [year]);
    const academic = year?.academic_year_name;
    return (
        <div className="app-rail-years">
            <Tooltip content="Economic Year">
                <span className="app-year-chip">
                    <span className="app-year-chip-key">EY</span>
                    <span className="app-year-chip-value">
                        {stripKey(year?.economic_year_name, 'EY') || '—'}
                    </span>
                </span>
            </Tooltip>
            <Tooltip content={academic ? "Academic Year" : "No academic year selected — pick one from the top-right corner"}>
                <span className={`app-year-chip ${academic ? 'app-year-chip-accent' : 'app-year-chip-warn'}`}>
                    <span className="app-year-chip-key">AY</span>
                    <span className="app-year-chip-value">{stripKey(academic, 'AY') || 'Not set'}</span>
                </span>
            </Tooltip>
        </div>
    )
}

//
export default function AppSidebar({ menus }) {
    const { sidebar: { sidebarOpened, setSidebarOpened },
        menu: { selectedMenu, setSelectedMenu, menus: menuBundle },
        user: { user }, notification: { updateNotification } } = useAppContext();
    const router = useRouter();

    // AppContext starts closed so the mobile overlay never covers the
    // hamburger on first paint. On desktop we open it once on mount so the
    // original always-pinned UX is preserved.
    // No resize listener — a user manually toggling the sidebar wins after
    // this initial check, and we don't want to keep snapping their state
    // shut on every viewport change (e.g. mobile keyboard popup).
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.innerWidth >= MD_BREAKPOINT) setSidebarOpened(true);
    }, []);

    // Auto-close after a menu navigation on mobile so the user can see the
    // page they just opened. No-op on desktop where the sidebar is meant to
    // stay pinned.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (window.innerWidth < MD_BREAKPOINT) setSidebarOpened(false);
    }, [selectedMenu]);

    /**
     * Is the rail currently a MODAL OVERLAY, rather than part of the layout?
     *
     * This used to be `const isMobileOverlay = sidebarOpened` — which is simply
     * "is the rail open", true on a desktop where the rail is a column in the
     * flex row and not a modal at all. It only ever fed the backdrop, which
     * carries `md:hidden` and so hid the mistake. Anything that must behave
     * differently BECAUSE it is a modal (focus, aria-modal, the tab ring) needs
     * the real answer, so it is measured with a media query that stays live
     * across a rotate or a resize.
     */
    const [isNarrow, setIsNarrow] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia(`(max-width: ${MD_BREAKPOINT - 0.02}px)`);
        const sync = () => setIsNarrow(mq.matches);
        sync();
        mq.addEventListener("change", sync);
        return () => mq.removeEventListener("change", sync);
    }, []);
    const isModal = sidebarOpened && isNarrow;
    const isMobileOverlay = sidebarOpened;

    /**
     * FOCUS, while the drawer is a modal.
     *
     * The drawer covers the page behind a backdrop, so for anyone navigating by
     * keyboard or screen reader it was the worst kind of dialog: focus stayed
     * on the page underneath, so Tab walked through forty controls the user
     * could not see and could not reach, with no indication that a menu was
     * even open.
     *
     * Three things fix that, and all three only apply while it is genuinely a
     * modal — on a desktop the rail is part of the page and stealing focus into
     * it on every toggle would be its own bug:
     *   · focus moves into the rail when it opens, and returns to whatever
     *     opened it (the hamburger) when it closes;
     *   · Tab and Shift+Tab cycle WITHIN the rail;
     *   · `aria-modal` tells assistive tech the rest of the page is inert.
     */
    const railRef = useRef(null);
    const restoreFocusRef = useRef(null);

    useEffect(() => {
        if (!isModal) return;
        restoreFocusRef.current = document.activeElement;
        // After the open transition has started, so focus lands on something
        // painted. It goes to the drawer itself, not to its first control:
        // that is the search box, and focusing it would raise the on-screen
        // keyboard over the menu every time the menu is opened on a phone.
        const t = setTimeout(() => railRef.current?.focus?.(), 60);
        return () => {
            clearTimeout(t);
            const back = restoreFocusRef.current;
            // Only give focus back if it is still inside the rail — if the user
            // has already clicked into the page, yanking it away is worse than
            // doing nothing.
            if (back?.focus && (!document.activeElement || railRef.current?.contains(document.activeElement))) {
                back.focus();
            }
        };
    }, [isModal]);

    const onRailKeyDown = useCallback((e) => {
        if (!isModal || e.key !== "Tab") return;
        const focusables = railRef.current?.querySelectorAll(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables?.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        // Focus starts on the drawer itself; going back from there is the last control.
        if (e.shiftKey && (document.activeElement === first || document.activeElement === railRef.current)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, [isModal]);

    // Escape closes the mobile drawer.
    //
    // The drawer covers the page behind a backdrop, so while it is open it is
    // effectively a modal. It has no close button of its own: a tap anywhere
    // outside it — the backdrop — closes it, and so does Escape, the one every
    // keyboard user already reaches for. Bound only
    // below md, where the rail is an overlay rather than part of the layout:
    // on desktop the same key would collapse the navigation out from under
    // someone who was only trying to dismiss a dropdown.
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!sidebarOpened) return;
        function onKey(e) {
            if (e.key !== "Escape") return;
            if (window.innerWidth >= MD_BREAKPOINT) return;
            setSidebarOpened(false);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [sidebarOpened, setSidebarOpened]);


    /**
     * THE RAIL ONLY OFFERS PAGES THAT OPEN.
     *
     * `views` is the same map `[role].jsx` resolves the selected menu against,
     * so a row it cannot answer renders "COMING SOON!!!" — a menu entry that
     * looks like every other one and leads nowhere. Those rows are dropped here
     * rather than annotated: a page that does not exist is not a page.
     */
    const views = menuBundle?.views;
    const openableMenus = useMemo(
        () => pruneUnopenableMenus(menus || [], views),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [menus, views]
    );

    /**
     * SEARCH.
     *
     * The rail carries well over a hundred pages under a dozen collapsible
     * groups, so reaching one meant remembering which group somebody filed it
     * under. Typing beats remembering: the tree filters to the matches, the
     * groups holding them unfold, and Enter opens the first one.
     */
    const [query, setQuery] = useState('');
    const searchRef = useRef(null);
    const filtering = query.trim().length > 0;
    const visibleMenus = useMemo(
        () => filterMenuTree(openableMenus, query),
        [openableMenus, query]
    );
    const matches = useMemo(
        () => (filtering ? collectMenuLeaves(visibleMenus) : []),
        [filtering, visibleMenus]
    );

    // Navigating clears the box. Leaving the query behind would hold the whole
    // rail in a filtered state around a page the user has already opened, so
    // the next thing they look for is missing for a reason nothing on screen
    // explains.
    useEffect(() => { setQuery(''); }, [selectedMenu]);

    // Enter opens the first match — with one result on screen, reaching for the
    // mouse to click the row you are already looking at is a wasted step.
    const onSearchKeyDown = useCallback((e) => {
        if (e.key === 'Escape') {
            // Escape with something typed clears the box and stops there; with
            // an empty box it belongs to the drawer, which closes on it.
            if (!query) return;
            e.stopPropagation();
            setQuery('');
            return;
        }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const first = matches[0];
        if (!first) return;
        setSelectedMenu(first.view);
        router.push(`#${first.view}`);
        setQuery('');
    }, [matches, query, router, setSelectedMenu]);

    // Ctrl/⌘+K puts the cursor in the box from anywhere in the app — the
    // shortcut every product with a search field has trained people to try. It
    // opens the rail first, because on a phone and in the mini rail the field it
    // is focusing is not on screen yet.
    useEffect(() => {
        if (typeof window === "undefined") return;
        function onKey(e) {
            if (e.key?.toLowerCase() !== 'k' || !(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            setSidebarOpened(true);
            setTimeout(() => {
                searchRef.current?.focus();
                searchRef.current?.select();
            }, 220);
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setSidebarOpened]);

    // In the mini rail the box is just its magnifier. Clicking it is the
    // clearest possible request for the labels back, so it expands the rail and
    // puts the cursor in the field it just grew into.
    const onSearchShellClick = useCallback(() => {
        if (sidebarOpened) return;
        setSidebarOpened(true);
        setTimeout(() => searchRef.current?.focus(), 220);
    }, [sidebarOpened, setSidebarOpened]);
    //
    return (
        <>
            {/* Mobile backdrop. md+ is hidden via responsive class. */}
            {isMobileOverlay && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    aria-hidden="true"
                    onClick={() => setSidebarOpened(false)}
                />
            )}

            <div className="app-rail-shell flex items-stretch">
                {/* Collapsing used to remove the rail from the page altogether
                    (`md:hidden`), so the whole navigation disappeared and the
                    only way back was a small circular chevron floating on the
                    page edge. Collapsed now means MINI: the rail keeps its
                    place and its icons, and only the labels go. */}
                <Card
                    role="navigation"
                    aria-label="Main menu"
                    ref={railRef}
                    tabIndex={-1}
                    aria-modal={isModal ? "true" : undefined}
                    onKeyDown={onRailKeyDown}
                    className={`app-rail rounded-none h-screen px-2 focus:outline-none
                bg-white md:bg-sidebar overflow-y-auto overflow-x-hidden
                fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 shadow-xl md:shadow-none
                md:relative md:z-auto md:transform-none md:transition-[width] md:duration-200
                ${sidebarOpened ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                ${sidebarOpened ? 'md:w-72' : 'app-rail-mini md:w-[4.25rem] md:px-1'}`}>
                    {/* sidebar-menu-section */}
                    <div className="app-rail-head relative flex flex-col items-center gap-2.5 py-4 px-2 sticky top-0 z-10 bg-teal-100 border-b-2 border-white">
                        {/* brand lockup: the mark and the wordmark are one unit,
                            centred on their own line, so the years below have a
                            line of their own instead of being wedged into the
                            gap beside the logo */}
                        <div className="app-rail-brand flex items-center justify-center gap-2">
                            <OurLogo size={38} />
                            <Typography variant="h4" color="teal" className="app-rail-wordmark leading-none">
                                CentIT
                            </Typography>
                        </div>
                        {/* A canteen user works in no academic or fiscal year
                            of their own: the canteen files by today's date. */}
                        {user?.role !== Users.CANTEEN && <FiscalYearNames />}
                        {/* Search sits IN the masthead, which is `sticky top-0`,
                            so it stays put while a hundred rows scroll under
                            it — a filter you have to scroll back up to reach is
                            a filter nobody uses twice. */}
                        <div className="app-rail-search"
                            onClick={onSearchShellClick}
                            title={sidebarOpened ? undefined : 'Search menu'}>
                            <MagnifyingGlassIcon className="app-rail-search-icon" aria-hidden="true" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={onSearchKeyDown}
                                placeholder="Search menu…  (Ctrl+K)"
                                aria-label="Search menu"
                                // `search` gives WebKit its own clear button on
                                // top of ours, and Escape inside it is handled
                                // by the browser before this component sees it.
                                autoComplete="off"
                                className="app-rail-search-input" />
                            {filtering &&
                                <button type="button" aria-label="clear search"
                                    className="app-rail-search-clear"
                                    onClick={(e) => { e.stopPropagation(); setQuery(''); searchRef.current?.focus(); }}>
                                    <XMarkIcon className="h-3.5 w-3.5" />
                                </button>
                            }
                        </div>
                    </div>
                    <hr />
                    {/* actual-menu  */}
                    <List>
                        {
                            visibleMenus?.map((menu, i) => {
                                if (menu?.onlySuperuser && user?.role != 'superuser') {
                                    return null;
                                }
                                return (
                                    <CustomAccordionMenu key={menu?.view || menu?.action || i}
                                        parent={null} menu={menu} forceOpen={filtering} />
                                )
                            })
                        }
                        {/* A search that matches nothing has to SAY so. Without
                            this the rail simply empties, which reads as the menu
                            having broken rather than as a word being wrong. */}
                        {filtering && matches.length < 1 &&
                            <div className="app-rail-noresult">
                                No menu matches “{query.trim()}”
                            </div>
                        }
                        {/* logout menu */}
                        <Menu
                            mini={!sidebarOpened}
                            menu={{ name: 'Logout', prefix: <ArrowRightStartOnRectangleIcon className="icon" /> }}
                            onClick={async () => {
                                const [status, message,] = await logout(user);
                                updateNotification(status, message);
                                if (status === 200) {
                                    setTimeout(returnToLogin, afterLogoutReloadTime);
                                }
                            }} />
                    </List>
                </Card>
                {/* The collapse control used to live here: a 20px circular
                    chevron sitting on the rail's edge, vertically centred on a
                    full-height shell, so it landed halfway down the page where
                    nobody looked for it. It is now a hamburger at the start of
                    the topbar — the place every user already reaches for, and
                    the same affordance the phone header uses. */}
            </div>
        </>
    );
}

const afterLogoutReloadTime = 1 * 1000; // 1 seconds!

/**
 * Land on the bare login URL after signing out.
 *
 * The portal keeps the open page in the fragment (`/admin#accounting.entry`),
 * so a plain `location.reload()` left the address bar still pointing at the
 * page the user had just been signed out of — and because the next sign-in
 * reads that same fragment, they were dropped straight back into that screen
 * instead of the dashboard. Rewriting the history entry to the bare role path
 * first means the reload both shows the login screen at `/admin` and starts the
 * next session with nothing to restore.
 *
 * `location.replace(pathname)` cannot be used here: dropping only a fragment is
 * a same-document navigation, so it would rewrite the URL without ever
 * reloading and leave the signed-out session's state on screen.
 */
function returnToLogin() {
    const { pathname, search, hash } = window.location;
    if (hash || search) {
        window.history.replaceState(null, '', pathname);
    }
    window.location.reload();
}
