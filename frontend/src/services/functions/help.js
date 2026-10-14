import { __fetch, __save, __update, __delete } from ".";

/**
 * Support & Guides content.
 *
 * The pages used to render constants compiled into the bundle; the text now
 * lives in the database and is edited from the superadmin console. The frontend
 * keeps the old constants as a fallback (see the pages themselves), so a slow or
 * unreachable API degrades to the last shipped copy rather than a blank screen.
 */

const SUPPORT = "/api/help/support";
const CATEGORIES = "/api/help/categories";
const GUIDES = "/api/help/guides";

/**
 * Support details.
 *
 * `/support` is reachable signed-out, so the read goes to the public endpoint —
 * the authenticated one would 401 for a visitor who has no token.
 */
export async function getSupportInfo() {
    const data = await __fetch(`${SUPPORT}/public`);
    return data && data.name ? data : null;
}

export async function updateSupportInfo(payload) {
    // `clean = false`: cleanEmptyFields would drop a field the superadmin has
    // deliberately blanked, so the change would silently not save.
    return __update(SUPPORT, payload, false);
}

/** Categories + guides. `manage` also returns the unpublished rows (superadmin). */
export async function getGuides({ manage = false } = {}) {
    const data = await __fetch(GUIDES, manage ? { manage: true } : undefined);
    if (!data || !Array.isArray(data.guides)) return null;
    return { categories: data.categories || [], guides: data.guides };
}

export async function saveGuide(guide) {
    return guide?.id ? __update(GUIDES, guide, false) : __save(GUIDES, guide, false);
}

export async function deleteGuide(id) {
    return __delete(GUIDES, { id });
}

export async function getGuideCategories() {
    return __fetch(CATEGORIES);
}

export async function saveGuideCategory(category) {
    return category?.id
        ? __update(CATEGORIES, category, false)
        : __save(CATEGORIES, category, false);
}

export async function deleteGuideCategory(id) {
    return __delete(CATEGORIES, { id });
}
