import View from "@/components/View";
import Login from "@/components/views/auth/Login";
import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import { validateToken, sessionHolder, sameAccount, accountLabel } from "@/services/functions/auth/login";
import { leaveStaleSession } from "@/services/server";
import { __fetch } from "@/services/functions";
import PageNotFound from "@/components/PageNotFound";
import AppSidebar from "@/components/Sidebar";
import { fetchNoticesFromSA } from "@/services/functions/superadmin/sa_notices";
import MessageFromOrg from "@/components/MessageFromOrg";
import SplashModal from "@/components/SplashModal";
import Users from "@/configs/Users";
import Loader from "@/components/Loader";
import EmptyState from "@/components/EmptyState";
import { MapIcon } from "@heroicons/react/24/outline";
import { isSchoolBlocked } from "@/configs/blockedSchools";
import { menuAccessKey, menuAccessOf } from "@/configs/moduleGates";

const ALLOWED_ROLES = process.env.NEXT_PUBLIC_ALLOWED_ROLES.split(',');

export default function Page({ role }) {
    const { menu: { menus, selectedMenu },
        user: { setUser, user }, status: { setupDone },
        notification: { updateNotification } } = useAppContext();
    const [isValidating, setIsValidating] = useState(true);
    const [messages, setMessages] = useState([]);
    // 
    const showNotices = [Users.ADMIN, Users.STAFF].includes(role);
    /**
     * Schools that are held out of the portal (`configs/blockedSchools.js`).
     *
     * The check sits on `user` rather than on the two places a session is
     * established, so it covers both of them at once — a fresh sign-in, which
     * `Login` reports by setting the user, and a returning browser, whose
     * cookie the effect below validates. Nothing of the app is rendered while it
     * holds: the effect leaves the page, and the guard on the render keeps the
     * shell off the screen for the frame or two before the browser gets there,
     * so no dashboard flashes past on the way out.
     */
    const isBlocked = isSchoolBlocked(user);
    useEffect(() => {
        if (!isBlocked) return;
        // A full navigation, not the router: this is a hard stop, and it must
        // not leave the portal's own trees mounted underneath it.
        const query = user?.role ? `?role=${encodeURIComponent(user.role)}` : '';
        window.location.replace(`/server_error${query}`);
    }, [isBlocked]);

    useEffect(() => {
        if (role) {
            (async () => {
                const data = await validateToken(role);
                if (data?.user) {
                    if (showNotices) {
                        const msgs = await fetchNoticesFromSA();
                        if (msgs) setMessages(msgs);
                    }
                    setUser(data.user);
                    // Left by `leaveStaleSession` when this tab was reloaded
                    // into another account's session. Said once.
                    try {
                        const switched = sessionStorage.getItem('session-switched');
                        if (switched) {
                            sessionStorage.removeItem('session-switched');
                            updateNotification('', switched);
                        }
                    } catch (_) { /* storage unavailable */ }
                } else setIsValidating(false);
            })();
        }
    }, []);
    /**
     * Keep `user.today` current in a tab that stays open across midnight.
     *
     * It is read once, above, and navigation is by `#fragment`, so the page
     * never reloads: a phone left open since yesterday kept defaulting every
     * bill, voucher and posting to YESTERDAY's date. Re-ask the server when the
     * tab comes back into view and every few minutes, and touch the user only
     * when the day has actually changed so nothing re-renders for nothing.
     */
    /**
     * The same question also catches a tab that is no longer what it shows.
     *
     * A browser holds one sign-in (`leaveStaleSession` in services/server.js
     * has the story). The answer used to be read for its date and nothing
     * else, so a staff tab went on looking like staff after the school signed
     * in beside it, and saved bills as "admin". Now the account in the answer
     * is compared with the account on screen:
     *
     *   · the same account — carry on, refresh the date;
     *   · another account on this portal — reload into it, and say so;
     *   · nobody on this portal — reload to the sign-in form, naming the
     *     account that took the browser when another portal has one;
     *   · no answer at all (offline, a server error) — do nothing. A tab is
     *     never signed out on a maybe.
     */
    const signedInAs = user?.username || '';
    const signedIn = !!signedInAs;
    useEffect(() => {
        if (!role || !signedIn) return;
        let busy = false;
        const mine = { username: signedInAs, role: user?.role || role };
        const whoTookTheBrowser = async () => {
            for (const other of ALLOWED_ROLES.map(r => r.trim().toLowerCase())) {
                if (!other || other === String(role).toLowerCase()) continue;
                const { user: holder } = await sessionHolder(other);
                if (holder) return holder;
            }
            return null;
        };
        const refreshToday = async () => {
            if (busy || document.visibilityState !== 'visible') return;
            busy = true;
            try {
                let { answered, user: holder } = await sessionHolder(role);
                if (answered && !sameAccount(holder, mine)) {
                    // Asked twice, a moment apart: one odd answer must not cost
                    // anyone the screen they are working on.
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    ({ answered, user: holder } = await sessionHolder(role));
                }
                if (answered && holder && !sameAccount(holder, mine)) {
                    leaveStaleSession(
                        `This browser is now signed in as ${accountLabel(holder)}, so this tab has moved to that account. `
                        + `A browser keeps one sign-in at a time.`, true);
                } else if (answered && !holder) {
                    const taker = await whoTookTheBrowser();
                    leaveStaleSession(taker
                        ? `This tab was signed out because this browser signed in as ${accountLabel(taker)}. `
                        + `A browser keeps one sign-in at a time: use another browser or a private window to work in two accounts together.`
                        : "Your session has ended. Please sign in again.");
                } else if (holder?.today) {
                    const { today, today_npt } = holder;
                    // The same answer says what the menu is drawn from: a module
                    // the superadmin granted (or took away) since sign-in, or a
                    // page given to this member of staff, shows without signing
                    // in again (configs/moduleGates.js `menuAccessOf`).
                    const access = menuAccessOf(holder.profile);
                    setUser(state => {
                        if (!state) return state;
                        const newDay = state.today !== today || state.today_npt !== today_npt;
                        const newAccess = !!access && menuAccessKey(holder.profile) !== menuAccessKey(state.profile);
                        if (!newDay && !newAccess) return state;
                        return {
                            ...state, today, today_npt,
                            ...(newAccess ? { profile: { ...state.profile, ...access } } : {}),
                        };
                    });
                }
            } catch (e) { /* keep the current date; try again next time */ }
            busy = false;
        };
        const timer = setInterval(refreshToday, 5 * 60 * 1000);
        document.addEventListener('visibilitychange', refreshToday);
        window.addEventListener('focus', refreshToday);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', refreshToday);
            window.removeEventListener('focus', refreshToday);
        };
    }, [role, signedInAs]);
    /**
     * Hand the browser one frame to paint before mounting a heavy view.
     *
     * This was a hard-coded `setTimeout(…, 500)`: the FIRST time a page was
     * opened it rendered a loader for half a second and then rendered the view.
     * Nothing was being fetched during that window — the view had not even
     * mounted, and every screen does its own loading afterwards — so it was
     * half a second of pure invented latency on the first visit to each of the
     * ~90 pages in the menu, every session.
     *
     * The pattern was worth keeping for one reason, which is presumably why it
     * was written: some views do enough work on first render to block the
     * thread, and without this the click would land on a frozen page with no
     * feedback. So the loader still appears — for ONE animation frame, which is
     * all that is needed to get it painted before the work starts. The wait is
     * gone; the feedback is not.
     */
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [loadedPages, setLoadedPages] = useState({});
    useEffect(() => {
        if (!selectedMenu || loadedPages?.[selectedMenu]) return;
        setIsPageLoading(true);
        // double rAF: the first callback runs BEFORE the paint that shows the
        // loader, the second after it. Releasing on the first would let React
        // batch both states into one render and the loader would never appear.
        let raf2;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                setIsPageLoading(false);
                setLoadedPages(state => ({ ...state, [selectedMenu]: true }));
            });
        });
        return () => {
            cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [selectedMenu]);

    return (
        <main className={`overflow-hidden h-screen`}>
            {
                (!setupDone && isValidating) ?
                    <>
                        <div className="w-full h-screen grid place-items-center">
                            <div className="loader"></div>
                        </div>
                    </> :
                    <>
                        {
                            (user?.username && user?.role && !isBlocked) ?
                                <>
                                    <div className="app-shell flex h-screen w-full overflow-hidden">
                                        {
                                            (menus?.menu && menus?.views) &&
                                            <>
                                                <AppSidebar menus={menus?.menu || []} />
                                                <View type={role} selectedMenu={selectedMenu || ''}>
                                                    {/* change component according to selectedMenu */}
                                                    {isPageLoading ? <Loader /> :
                                                        typeof menus?.views?.[selectedMenu] === 'function'
                                                            ? menus.views[selectedMenu]()
                                                            : menus?.views?.[selectedMenu] || (
                                                                // The backstop, and it should never be
                                                                // reached: the rail and the shortcuts
                                                                // grid are both pruned to pages that
                                                                // resolve (`methods/menuTree.js`), so
                                                                // nothing clickable lands here any
                                                                // more. What DOES land here is a stale
                                                                // or hand-typed `#fragment`, and the
                                                                // honest answer to that is "this
                                                                // address is not a page" — not
                                                                // "COMING SOON!!!", which promised a
                                                                // feature to anyone who mistyped a URL.
                                                                <EmptyState icon={MapIcon} tone="info"
                                                                    title="That page isn't here"
                                                                    hint="The address doesn't match any page you can open. Pick one from the menu on the left, or search it from the box at the top of the menu." />
                                                            )
                                                    }
                                                </View>
                                            </>
                                        }
                                    </div>
                                </>
                                :
                                <>
                                    {
                                        // Held school on its way to `/server_error`: the
                                        // sign-in form would be a lie for the moment it
                                        // showed, since the session is fine.
                                        isBlocked ? null :
                                            ALLOWED_ROLES.includes(role.toLowerCase()) ?
                                                <Login role={role} />
                                                :
                                                <PageNotFound />
                                    }
                                </>
                        }
                    </>
            }
            <>
                {/* messages/notices from ceo/team. Both of these are overlays,
                    so they would paint OVER a blanked-out portal — a held
                    school has to see nothing at all. */}
                {(showNotices && !isBlocked) && <MessageFromOrg items={messages || []} />}
                {/* superadmin login splash (once per session, auto-closes). Not
                    for a canteen user: their sign-in opens the canteen alone,
                    and the splash endpoint rightly refuses it. */}
                {(user?.username && !isBlocked && role !== Users.CANTEEN) && <SplashModal />}
            </>
        </main>
    )
}

export async function getServerSideProps(context) {
    const { role } = context.params;
    return {
        props: {
            role
        }
    }
}