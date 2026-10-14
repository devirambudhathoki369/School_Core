import { useEffect, useState } from "react";
import logout from "@/services/functions/auth/logout";
import { findSignedInRole, loginPathFor } from "@/methods/portalSignOut";
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

/**
 * The screen a held school lands on instead of the portal.
 *
 * `configs/blockedSchools.js` names the schools; `[role].jsx` sends their
 * users here the moment a session is recognised, before any app screen is
 * mounted. The page is deliberately bare: the app's own 500 wording and
 * nothing else on it but a way out.
 *
 * Sign-out matters because this is otherwise a trap. The session is valid, so
 * `/admin` re-validates the same cookie and bounces right back; the cookie is
 * `httpOnly`, so only the server can drop it — which is what the button asks
 * for. Without it nobody could sign in as another school, or as another user
 * of the same one, without clearing site data.
 */
function ServerErrorPage() {
    const [role, setRole] = useState(null);
    const [checking, setChecking] = useState(true);
    const [signingOut, setSigningOut] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        (async () => {
            const hint = new URLSearchParams(window.location.search).get("role");
            try {
                setRole(await findSignedInRole(hint));
            } catch (_) {
                setRole(null);
            }
            setChecking(false);
        })();
    }, []);

    async function signOut() {
        setError("");
        // No session found: there is nothing to end, so just leave the page.
        if (!role) {
            window.location.replace("/");
            return;
        }
        setSigningOut(true);
        const [status, message] = await logout({ role });
        if (status === 200) {
            // A full navigation, not a router push: the cookie is gone and the
            // login screen has to be rendered by a fresh page load.
            window.location.replace(loginPathFor(role));
            return;
        }
        setSigningOut(false);
        setError(message || "Could not sign out. Please try again.");
    }

    return (
        // Same shell as `_error.tsx` renders for a real 500, and for the same
        // reason: no theme lookup and no context, so nothing here can depend on
        // the app having loaded. The `.pub-*` classes are plain rules in
        // globals.css — exactly as safe as the Tailwind utilities they replace,
        // since both come from the same stylesheet.
        <main className="pub-page grid place-items-center px-4 py-12">
            <div className="pub-card w-full max-w-md p-7 text-center sm:p-8">
                <p className="pub-eyebrow text-teal-700">Error 500</p>
                <h1 className="pub-title mt-2 text-slate-900">
                    Something went wrong on our side
                </h1>
                <p className="pub-lede mt-3 text-slate-500">
                    The server could not complete your request. This isn’t your fault,
                    and nothing you entered has been saved incorrectly.
                </p>
                <div className="mt-7">
                    <button type="button" onClick={signOut} disabled={checking || signingOut}
                        className="pub-btn pub-btn-primary">
                        {signingOut ? "Signing out…" : (checking ? "Please wait…" : "Sign out")}
                    </button>
                </div>
                {error &&
                    <div role="alert" className="pub-note pub-note-error mt-4">
                        <ExclamationCircleIcon aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                }
                <p className="pub-foot mt-7 text-slate-400">
                    Powered by Cent IT Solutions Pvt. Ltd.
                </p>
            </div>
        </main>
    )
}

export default ServerErrorPage;
