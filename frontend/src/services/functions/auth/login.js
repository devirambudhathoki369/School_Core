import { __fetch, __save } from "..";
import server from "../../server";

async function login(role, data) {
    return __save(`/auth/${role}/signin`, data);
}

async function validateToken(role) {
    return __fetch(`/auth/${role}/obtain`, {}, {});
}

/**
 * Whose session does this browser hold for `role`'s portal, right now?
 *
 * `validateToken` cannot say: it hands back whatever body came, so "nobody is
 * signed in here" and "the request never arrived" look the same. This keeps
 * them apart, because one of them reloads the tab:
 *
 *   { answered: true,  user }        the server's own account for this portal
 *   { answered: true,  user: null }  the server looked and there is none
 *   { answered: false, user: null }  no answer: offline, a 5xx, a proxy page
 *
 * The endpoint answers 200 with a JSON object in every case it answers at all
 * (`{user}` when signed in, `{message}` or `{}` when not), so only that counts.
 * An error status or an HTML body is not the server saying no.
 */
async function sessionHolder(role) {
    try {
        const res = await server.get(`/auth/${role}/obtain`);
        const body = res?.data;
        const answered = res?.status === 200 && !!body && typeof body === "object" && !Array.isArray(body);
        return { answered, user: (answered && body.user?.username) ? body.user : null };
    } catch (_) {
        return { answered: false, user: null };
    }
}

/** Are these two the same sign-in? (`user` objects as the server sends them.) */
function sameAccount(a, b) {
    const key = (u) => `${String(u?.role || "").toLowerCase()}:${String(u?.username || "").trim().toLowerCase()}`;
    return !!a?.username && !!b?.username && key(a) === key(b);
}

/** How an account is named to the person looking at the screen. */
function accountLabel(u) {
    const name = u?.profile?.name || u?.username || "";
    return u?.role ? `${name} (${u.role})` : name;
}

export { login, validateToken, sessionHolder, sameAccount, accountLabel };