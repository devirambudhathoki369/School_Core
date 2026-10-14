/**
 * The navigation tree, as data.
 *
 * Three things every surface that offers pages needs, and that each of them
 * used to do slightly differently (or not at all):
 *
 *   · `joinView`  — build the dot path a page is addressed by
 *                   (`exams.results.number-system.marksheet`). The sidebar,
 *                   the shortcuts grid and the rail's search must agree on it
 *                   exactly, because it IS the route.
 *   · `pruneUnopenableMenus` — drop rows that lead nowhere. A menu row whose
 *                   view has no component behind it renders "COMING SOON!!!",
 *                   which is not a page — it is a dead end with a promise
 *                   attached. Rows are checked against the SAME `views` map
 *                   the page renderer resolves against, so the rail can only
 *                   ever offer something that opens.
 *   · `filterMenuTree` — the search: keep the branches whose names match, drop
 *                   the rest.
 */

export function joinView(parent, view) {
    return [...(parent ? [parent] : []), view].filter(Boolean).join('.');
}

// A row is a real destination if it resolves to a view, or if it IS an action
// (Database Backup has no view and never navigates).
function opensSomething(item, path, views) {
    if (item?.action || item?.onClick) return true;
    return Boolean(path && views?.[path]);
}

/**
 * Keep only the rows that actually open something.
 *
 * A group survives when any of its children do — a group with nothing left
 * under it is a chevron that unfolds an empty list.
 *
 * If the caller has no `views` map yet (the menus arrive a tick after the
 * user), the tree is returned untouched: an empty map would otherwise prune
 * the entire rail away for the one render before it lands.
 */
export function pruneUnopenableMenus(list, views, parent = '') {
    if (!views || Object.keys(views).length < 1) return list || [];
    return (list || []).reduce((acc, item) => {
        const path = joinView(parent, item?.view);
        if (item?.submenu) {
            const submenu = pruneUnopenableMenus(item.submenu, views, path);
            if (submenu.length > 0) acc.push({ ...item, submenu });
        } else if (opensSomething(item, path, views)) {
            acc.push(item);
        }
        return acc;
    }, []);
}

/**
 * Filter the tree by what the user typed.
 *
 * Matching is against the BREADCRUMB, not the row's own name: a leaf is
 * searched as "Accounting Reports Day Book", so "acc day" finds it and so does
 * "day book". Every whitespace-separated term has to appear somewhere in that
 * trail, which is what makes typing two vague words narrow the list instead of
 * emptying it.
 *
 * A group whose own name matches is kept WHOLE — searching "library" should
 * show the library, not force a second guess at which page inside it you meant.
 */
export function filterMenuTree(list, query, trail = []) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length < 1) return list || [];
    return (list || []).reduce((acc, item) => {
        if (item?.hidden) return acc;
        const text = [...trail, item?.name || ''].join(' ').toLowerCase();
        const selfMatch = terms.every(term => text.includes(term));
        if (item?.submenu) {
            if (selfMatch) {
                acc.push(item);
                return acc;
            }
            const submenu = filterMenuTree(item.submenu, query, [...trail, item?.name || '']);
            if (submenu.length > 0) acc.push({ ...item, submenu });
        } else if (selfMatch) {
            acc.push(item);
        }
        return acc;
    }, []);
}

/**
 * Flatten to the destinations themselves — used for the match count, for
 * "Enter opens the first result", and by the shortcuts grid.
 */
export function collectMenuLeaves(list, parent = '', out = []) {
    for (const item of list || []) {
        if (item?.hidden) continue;
        const path = joinView(parent, item?.view);
        if (item?.submenu) collectMenuLeaves(item.submenu, path, out);
        else if (path) out.push({ name: item?.name || '', view: path, prefix: item?.prefix });
    }
    return out;
}
