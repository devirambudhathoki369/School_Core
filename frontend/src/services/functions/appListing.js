import { __fetch, __update } from ".";

/**
 * Per-school mobile app listing details.
 *
 * Each school that takes the mobile product gets its own Play build, and each
 * of those listings needs a privacy policy that names it. `fetchAppListing` is
 * what the policy page calls from `getServerSideProps` — deliberately a bare
 * `fetch`, not the shared axios instance, because that instance is built for
 * the browser (cookies, CSRF header) and this call runs on the server for a
 * visitor who has no session at all.
 */

const LISTING = "/api/app/listing";

/**
 * Where the SERVER-side lookup goes.
 *
 * Not `NEXT_PUBLIC_BASE_URL`, on the VPS: backend.nirsabi.com is Cloudflare-
 * proxied, and Cloudflare answers requests coming from the origin box itself
 * with a 403 managed challenge — so the frontend, which runs on that same box,
 * cannot call its own API over the public hostname. `INTERNAL_API_URL` points
 * at a loopback-only nginx block that proxies straight to gunicorn
 * (`/etc/nginx/sites-available/backend-internal`, set in the systemd
 * EnvironmentFile — see deploy/smsys-frontend.env.example).
 *
 * Unset everywhere else, which is correct: in development the public URL is
 * already the local backend.
 */
const BASE_URL =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_LOCAL_URL;

/**
 * Read one school's app identity, server-side.
 *
 * Returns `null` for a missing id, an unknown school, or an unreachable API —
 * the caller then renders the generic CentEducation policy. A policy page that
 * fails to render is a failed Play review, so nothing in here is allowed to
 * throw.
 *
 * @param {string|number} schoolId
 */
export async function fetchAppListing(schoolId) {
    const id = String(schoolId ?? "").trim();
    if (!id || !/^\d+$/.test(id)) return null;

    try {
        const res = await fetch(
            `${BASE_URL}${LISTING}/public?school=${encodeURIComponent(id)}`,
            { headers: { Accept: "application/json" } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data && data.app_name ? data : null;
    } catch {
        return null;
    }
}

/** Superadmin: every app school's listing, or one of them. */
export async function getAppListings(schoolId) {
    return __fetch(LISTING, schoolId ? { school: schoolId } : undefined);
}

/** Superadmin: save one school's listing. */
export async function updateAppListing(payload) {
    // `clean = false`: a deliberately blanked override must reach the API, or
    // clearing a custom app name would silently keep the old one.
    return __update(LISTING, payload, false);
}
