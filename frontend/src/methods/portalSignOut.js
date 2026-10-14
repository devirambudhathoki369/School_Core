import Users from "@/configs/Users";
import { validateToken } from "@/services/functions/auth/login";

/**
 * Ending a session from a page that is OUTSIDE the portal.
 *
 * `/license_expired` and `/server_error` are both dead ends by design: the
 * session is perfectly valid, so every portal route bounces straight back here,
 * and the auth cookie is `httpOnly` — only the server can drop it. The sign-out
 * button is the one way out, and `/auth/logout` needs to know WHICH portal the
 * session belongs to, because each role has its own token table.
 */

// Every portal role a session can belong to.
const PORTAL_ROLES = [Users.ADMIN, Users.STAFF, Users.STUDENT, Users.SUPERADMIN];

/**
 * Which role is signed in on this browser?
 *
 * The redirect passes the role in the query string, but that is only a hint — a
 * reload or a bookmark arrives without it. So the role is confirmed (or found
 * from scratch) by asking `/auth/<role>/obtain`, the same endpoint the portal
 * validates with: exactly one role's token table can hold this cookie, and a
 * miss answers "User not found!" rather than an error, so trying them costs
 * nothing but a round-trip.
 */
export async function findSignedInRole(hint) {
    const ordered = PORTAL_ROLES.includes(hint)
        ? [hint, ...PORTAL_ROLES.filter(role => role !== hint)]
        : PORTAL_ROLES;
    for (const role of ordered) {
        const data = await validateToken(role);
        // `role` comes back from the server because a superadmin cookie can
        // actually belong to a superUSER, and logout needs the real one.
        if (data?.user?.username) return data?.user?.role || role;
    }
    return null;
}

// Superuser signs in through the superadmin portal; every other role has a
// route of its own.
export function loginPathFor(role) {
    return `/${role === "superuser" ? Users.SUPERADMIN : role}`;
}
