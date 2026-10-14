import { __fetch, __update, __save } from ".";

const PUBLIC = "/api/document-styles";
const MANAGE = "/api/manage/document-styles";

// The style a document should draw itself with. The backend always answers —
// an unstyled school gets the defaults — so a document never has to handle
// "not configured".
const _cache = {};

export async function getDocumentStyle(school) {
    if (!school) return null;
    if (!_cache[school]) {
        _cache[school] = (async () => {
            const data = await __fetch(PUBLIC, { school });
            return data?.style || null;
        })();
    }
    return _cache[school];
}

// superadmin: every school with its style, plus the option lists (themes,
// fonts, documents) so the UI never keeps its own copy to drift out of step.
export async function getAllDocumentStyles() {
    const data = await __fetch(MANAGE, {});
    return {
        schools: Array.isArray(data?.schools) ? data.schools : [],
        options: data?.options || { themes: [], fonts: [], documents: [] },
    };
}

export async function saveDocumentStyle(payload) {
    delete _cache[payload?.school];   // a saved change must show on the next print
    return __update(MANAGE, payload, false);
}

// superadmin: copy one school's whole style onto other schools at once.
export async function copyDocumentStyle(source, targets) {
    return __save("/api/manage/document-styles/copy", { source, targets }, false);
}
