function restrictSubmenu(menu, permissions) {
    const submenu = (menu?.submenu || []).reduce((acc, submenu) => {
        if (submenu?.alwaysShow) {
            acc.push(submenu);
        } else if (submenu?.id && permissions?.[submenu.id] === true) {
            acc.push(submenu);
        } else if (submenu?.submenu) {
            const restrictedSubmenu = restrictSubmenu(submenu || [], permissions);
            if (restrictedSubmenu.length > 0) acc.push({ ...submenu, submenu: restrictedSubmenu });
        }
        return acc;
    }, []);
    return submenu;
}

function getSubmenuViews(viewName, submenu) {
    const allowedViews = [];
    submenu.map(e => {
        const smViewName = viewName + '.' + (e?.view || '');
        if (e?.submenu) {
            const _av = getSubmenuViews(smViewName, e.submenu);
            allowedViews.push(..._av);
        }
        else allowedViews.push(smViewName);
    });
    // console.log(viewName, allowedViews);
    return allowedViews;
}

function filterViews(menus, views, permissions) {
    permissions = permissions.reduce((acc, val) => {
        acc[val] = true;
        return acc;
    }, {});
    // 
    const allowedViews = [];
    const menu = menus.reduce((acc, menu) => {
        if (menu?.submenu) {
            const submenu = restrictSubmenu(menu, permissions);
            if (submenu.length > 0) {
                acc.push({ ...menu, submenu });
                const viewName = menu?.view || '';
                const _av = getSubmenuViews(viewName, submenu);
                allowedViews.push(..._av);
            }
        } else {
            // Leaf top-level menus (Support, Guides, Profile, Match Photos…)
            // have no submenu. If one is gated by an `id` permission (e.g.
            // "Send SMS for absent students"), only show it when that
            // permission is granted — otherwise staff would see it regardless.
            // Ungated leaves (no `id`) stay visible to everyone as before.
            if (menu?.id && permissions?.[menu.id] !== true) {
                return acc;
            }
            acc.push({ ...menu });
            // register the view directly so it resolves for non-bypass roles
            // like `staff`.
            if (menu?.view) allowedViews.push(menu.view);
        }
        return acc;
    }, []);
    // 
    views = Array.from(allowedViews).reduce((acc, viewname) => {
        const view = views?.[viewname];
        if (view) {
            acc[viewname] = view;
        }
        return acc;
    }, {});
    return { menu, views }
}

export default filterViews;