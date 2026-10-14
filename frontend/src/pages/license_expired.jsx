import { useEffect, useState } from "react";
import { ArrowRightStartOnRectangleIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";
import Support from "@/components/views/support";
import logout from "@/services/functions/auth/logout";
import { findSignedInRole, loginPathFor } from "@/methods/portalSignOut";

/**
 * The screen a school lands on when its licence has run out.
 *
 * It used to be a dead end. The session is still valid — only the licence has
 * expired — so `RenewAlert` throws every signed-in page here, and with no way
 * to sign out the browser was stuck: going back to `/admin` re-validated the
 * same token and bounced straight back. Nobody could log in as another school,
 * or even as another user of the same one, without clearing site data. The auth
 * cookie is `httpOnly`, so only the server can drop it — which is exactly what
 * the sign-out button below asks it to do. Finding the role to sign out of is
 * shared with `/server_error`, the other page outside the portal that has to
 * end a session: `methods/portalSignOut.js`.
 */

function LicenseExpiredPage() {
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
        // The wording used to be "OOPS...," at 5xl in red over "Your license has
        // been expired !". An expired licence is an ordinary commercial fact,
        // not a crash — and the person reading this is a school administrator
        // who has done nothing wrong and cannot fix it from here. Every other
        // page in this product states a problem calmly and points at the way
        // out; this one now does too.
        <main className="pub-page flex w-full flex-col items-center justify-center gap-5 px-4 py-10">
            <section className="pub-card w-full max-w-2xl p-7 text-center sm:p-8">
                <p className="pub-eyebrow text-amber-600">Licence expired</p>
                <h1 className="pub-title mt-2 text-slate-900">
                    This school’s licence needs renewing
                </h1>
                <p className="pub-lede mt-3 text-slate-500">
                    The portal stays closed until it is renewed. Your data is safe and
                    nothing has been lost — get in touch using the details below and
                    we’ll get you back in.
                </p>
                {/* The way out. Without it this page is a trap: the session is
                    fine, so every route leads back here. */}
                <div className="mt-7">
                    <button type="button" onClick={signOut} disabled={checking || signingOut}
                        className="pub-btn pub-btn-primary">
                        <ArrowRightStartOnRectangleIcon className="h-5 w-5" />
                        {signingOut ? "Signing out…" : (checking ? "Please wait…" : "Sign out")}
                    </button>
                </div>
                <p className="mt-2 text-note text-slate-400">
                    Sign out to log in with another account.
                </p>
                {error &&
                    <div role="alert" className="pub-note pub-note-error mt-4">
                        <ExclamationCircleIcon aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                }
            </section>
            <div className="w-full max-w-2xl">
                <Support />
            </div>
        </main>
    )
}

export default LicenseExpiredPage;
