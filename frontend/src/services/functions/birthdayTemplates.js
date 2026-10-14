import { __fetch, __save, __update, __delete } from ".";
import server from "../server";

const BASE = "/api/birthday-templates";
const BACKGROUND = "/api/birthday-templates/background";

/**
 * A school's birthday cards. Admin-owned, unlike the ID card designs — a
 * birthday wish is the school talking to its own families in its own voice.
 */
export async function getBirthdayTemplates(school, audience = "student") {
    if (!school) return { templates: [], active: null, options: {} };
    const data = await __fetch(BASE, { school, audience });
    return {
        templates: Array.isArray(data?.templates) ? data.templates : [],
        active: data?.active || null,
        options: data?.options || {},
    };
}

export async function createBirthdayTemplate(payload) {
    return __save(BASE, payload, false);
}

export async function saveBirthdayTemplate(payload) {
    return __update(BASE, payload, false);
}

export async function deleteBirthdayTemplate(id) {
    return __delete(BASE, { id });
}

export async function saveBirthdayBackground(id, file) {
    const body = new FormData();
    body.append("id", id);
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
