import { __fetch, __save, __update, __delete } from ".";
import server from "../server";

const PUBLIC = "/api/idcard-templates";
const MANAGE = "/api/manage/idcard-templates";
const BACKGROUND = "/api/manage/idcard-templates/background";

/**
 * The ACTIVE design for a school's cards, or null.
 *
 * Null is meaningful and must be passed through untouched: it means the school
 * has never been designed for, and `IDCard` then draws the built-in card it has
 * always drawn. Turning it into `{}` here would make every school look
 * "configured with an empty layout" and print blank cards.
 */
const _cache = {};

export async function getIDCardTemplate(school, card_type = "student") {
    if (!school) return null;
    const key = `${school}::${card_type}`;
    if (!_cache[key]) {
        _cache[key] = (async () => {
            const data = await __fetch(PUBLIC, { school, card_type });
            return data?.template || null;
        })();
    }
    return _cache[key];
}

export function clearIDCardTemplateCache(school) {
    Object.keys(_cache)
        .filter(k => !school || k.startsWith(`${school}::`))
        .forEach(k => delete _cache[k]);
}

// superadmin: every school, its designs, and the option catalogue the editor
// builds its controls from — so the UI never keeps its own copy of the field
// list and drift out of step with the backend's sanitizer.
export async function getAllIDCardTemplates() {
    const data = await __fetch(MANAGE, {});
    return {
        schools: Array.isArray(data?.schools) ? data.schools : [],
        options: data?.options || {},
    };
}

export async function createIDCardTemplate(payload) {
    clearIDCardTemplateCache(payload?.school);
    return __save(MANAGE, payload, false);
}

export async function saveIDCardTemplate(payload) {
    clearIDCardTemplateCache(payload?.school);
    return __update(MANAGE, payload, false);
}

export async function deleteIDCardTemplate(id, school) {
    clearIDCardTemplateCache(school);
    return __delete(MANAGE, { id });
}

/**
 * The artwork. Multipart, so it goes straight to axios rather than through
 * `__save` — that helper JSON-stringifies its payload to size-check and
 * de-duplicate it, which a File cannot survive.
 *
 * No file means "remove the background", which is the only way back to a plain
 * card once one has been set.
 */
export async function saveIDCardBackground(id, file, side = "front") {
    const body = new FormData();
    body.append("id", id);
    body.append("side", side);
    if (file) body.append("background", file);
    try {
        const res = await server.put(BACKGROUND, body,
            { headers: { "Content-Type": "multipart/form-data" } });
        return [res.status, res.data?.message, res.data];
    } catch (e) {
        return [e?.response?.status || 400,
            e?.response?.data?.message || e.message, null];
    }
}
