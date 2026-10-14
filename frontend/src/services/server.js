import axios from "axios";

const server = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_LOCAL_URL,
    withCredentials: true,
    xsrfCookieName: 'csrftoken',
    xsrfHeaderName: 'X-CSRFToken',
    headers: {
        "Content-Type": "application/json"
    }
});

server.interceptors.request.use(config => {
    if (config.data instanceof FormData || config.data?.images) {
        config.headers['Content-Type'] = "multipart/form-data";
        delete config.data?.images;
    }
    return config;
})

/**
 * The sign-in screen's own 401s, which must never be treated as an expiry.
 *
 * A wrong password answers 401 exactly like an expired session does, and the
 * two need opposite handling: one is "try again", the other is "you are no
 * longer signed in". Matching on the path is what keeps them apart.
 */
const AUTH_ENDPOINTS = /\/auth\/(?:[a-z]+\/)?(?:signin|obtain|logout)$/i;

/**
 * What happens when the server says the session is over.
 *
 * Until recently: nothing. Every helper in `services/functions/index.js`
 * swallows a failed response into `[status, message, null]` or a bare `[]`, so a
 * request rejected for an expired or revoked token looked exactly like a page
 * with no records — an empty table, no error, no explanation. The user carried
 * on clicking, every action failed silently, and the only way out was to guess
 * that they had been signed out.
 *
 * Sending them back to the sign-in screen is right for a session that has
 * really ended. It is WRONG for the other thing a 401 means, which this code
 * originally missed:
 *
 *     401 also means "you are signed in, but this particular endpoint does not
 *     accept your kind of token".
 *
 * That is not hypothetical. `/api/{student,staff}/upcoming_birthdays` was
 * declared `authentication_classes = (AdminTokenAuthentication,)`, and the two
 * widgets that call it sit on the dashboard — a screen STAFF can be granted.
 * So a staff sign-in went: validate token (200) → paint the dashboard → two
 * 401s → tear the session down → full reload → validate token (200) → … 1,560
 * times for one user in one sitting, roughly one reload every two seconds, with
 * the page never staying up long enough to use. That is the "it keeps
 * reloading" report, and the reload was coming from HERE.
 *
 * So a 401 no longer ends the session on its own word. It ASKS: re-validate the
 * token against `/auth/<role>/obtain`, the same endpoint `[role].jsx` uses on
 * mount. If that answers, the session is alive, the 401 belonged to one
 * endpoint, and the right response is the one every caller already has — the
 * rejection it was given. Only a token the server itself will no longer accept
 * ends in a redirect.
 *
 * Two more things stop this from ever becoming a loop again, because a redirect
 * loop is far worse than a stale screen:
 *
 * 1. Once the token is confirmed good, it stays confirmed for a minute, so a
 *    page firing several forbidden calls costs one check, not one per call.
 * 2. A hard brake, independent of everything above: if a session-ended reload
 *    already happened in the last 30 seconds, do not do it again. Whatever new
 *    reason a future endpoint invents for a spurious 401, the worst it can now
 *    produce is one reload.
 *
 * The redirect itself is deliberately a FULL reload rather than a router push.
 * The whole portal is one route whose contents come from React state (`user`,
 * `menus`, the open view); navigating within it would leave a signed-out
 * session's data on screen. A reload drops all of it, and `[role].jsx` then
 * renders the login form because `validateToken` no longer resolves.
 */
const PORTAL_ROLES = ["superadmin", "admin", "staff", "student"];
const SESSION_OK_FOR_MS = 60 * 1000;
const REDIRECT_COOLDOWN_MS = 30 * 1000;
const LAST_TEARDOWN_KEY = "session-ended-at";

let redirecting = false;
let sessionConfirmedAt = 0;

function currentRole() {
    // The portal is `/<role>` — the same param `[role].jsx` renders from.
    const first = (window.location.pathname || "").split("/").filter(Boolean)[0];
    const role = (first || "").toLowerCase();
    return PORTAL_ROLES.includes(role) ? role : null;
}

/**
 * Is the token still good? Asked of the server, not inferred.
 *
 * `/auth/<role>/obtain` is matched by AUTH_ENDPOINTS above, so its own 401
 * cannot re-enter this path — no recursion, however it answers.
 */
async function sessionStillValid() {
    if (Date.now() - sessionConfirmedAt < SESSION_OK_FOR_MS) return true;
    const role = currentRole();
    // No role in the URL means this is not the portal, and there is no endpoint
    // to ask. Treat the 401 at face value, as before.
    if (!role) return false;
    try {
        const res = await server.get(`/auth/${role}/obtain`);
        if (res?.data?.user) {
            sessionConfirmedAt = Date.now();
            return true;
        }
        return false;
    } catch (_) {
        // The check failed for its own reasons (offline, 500). Do NOT sign the
        // user out on a maybe: a stale screen is recoverable, being thrown to
        // the login form mid-work is not.
        return false;
    }
}

function recentlyToreDown() {
    try {
        const at = Number(sessionStorage.getItem(LAST_TEARDOWN_KEY) || 0);
        return at > 0 && Date.now() - at < REDIRECT_COOLDOWN_MS;
    } catch (_) {
        return false;
    }
}

/**
 * Reload the portal from scratch, leaving behind why. `key` is the storage slot
 * the next screen reads: "session-ended" is shown by the sign-in form.
 */
function reloadPortal(key, reason) {
    try {
        // Read once on the next screen, then cleared — so the user is told
        // WHY they are looking at a sign-in form instead of their work.
        sessionStorage.setItem(key, reason);
        sessionStorage.setItem(LAST_TEARDOWN_KEY, String(Date.now()));
    } catch (_) { /* private mode / storage disabled — the redirect still matters */ }
    // Drop the fragment as well: it is the page they were on, and restoring
    // it after the next sign-in would drop them straight back into a screen
    // they were just refused.
    window.location.replace(window.location.pathname);
}

async function endSession(reason) {
    if (typeof window === "undefined" || redirecting) return;
    redirecting = true;
    try {
        if (await sessionStillValid()) {
            // Signed in, just not allowed here. Nothing to tear down.
            redirecting = false;
            return;
        }
        if (recentlyToreDown()) {
            // The brake. We have already sent the user to sign in once within
            // the cooldown; reloading again would be the loop itself.
            redirecting = false;
            return;
        }
        reloadPortal("session-ended", reason || "Your session has ended. Please sign in again.");
    } catch (_) {
        redirecting = false;
    }
}

/**
 * This tab is showing an account the browser is no longer signed in as.
 *
 * Every role signs in to the same cookie, so a browser holds ONE sign-in. Open
 * the portal as staff, sign in as the school in a second tab, and the first
 * tab carries on showing the member of staff while every request it sends is
 * the school's: a bill saved from it is recorded, correctly, as entered by
 * "admin". No request fails, so nothing above ever noticed.
 *
 * `[role].jsx` asks the server whose session the browser holds each time the
 * tab comes back into view, and calls this when the answer is not the account
 * on screen. The tab is reloaded so what it shows is what it is:
 *
 *   · `switchedTo` set — the same portal now belongs to another account. The
 *     reload lands in that account, and it is told so once (`session-switched`).
 *   · otherwise — this portal has no session any more (another role signed in,
 *     the session ended, or it was signed out elsewhere). The reload lands on
 *     the sign-in form with `reason` above it.
 *
 * Same brake as `endSession`: at most one such reload per cooldown, whatever
 * the server goes on answering. Returns whether it reloaded.
 */
export function leaveStaleSession(reason, switchedTo = false) {
    if (typeof window === "undefined" || redirecting || recentlyToreDown()) return false;
    redirecting = true;
    reloadPortal(switchedTo ? "session-switched" : "session-ended", reason);
    return true;
}

server.interceptors.response.use(
    response => response,
    error => {
        const status = error?.response?.status;
        const url = error?.config?.url || "";
        if (status === 401 && !AUTH_ENDPOINTS.test(url)) {
            // Fire-and-forget: the caller's rejection must not wait on a
            // network round-trip it never asked for.
            endSession(error?.response?.data?.message);
        }
        // Rethrow either way — every existing caller still gets the rejection it
        // has always handled, so no call site has to change.
        return Promise.reject(error);
    }
);

export default server;
