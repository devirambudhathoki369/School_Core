// Dot-separated view keys remain internal; public URLs use path segments.
export const PORTAL_ROLES = ['admin', 'staff', 'student', 'superadmin', 'superuser', 'canteen'];
const VIEW_KEY = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/i;

// One page per feature. Old names resolve before permission-filtered lookup.
export const LEGACY_VIEWS = {
    'dashboard.summary': 'dashboard',
    'dashboard.classwise-student-statistics': 'enrollment.classwise-student-statistics',
    'send-sms-absent': 'communication.sms.send-messages',
    'exams.seat-plan-old': 'exams.seat-plan',
};
export function canonicalView(view, role = 'admin') {
    if (!['admin', 'staff', 'student'].includes(role)) return view;
    if (view.startsWith('app.attendance.')) return view.slice(4);
    if (view.startsWith('app.rfid.')) return 'attendance.' + view.slice(4);
    return LEGACY_VIEWS[view] || view;
}

export function portalRole(path = '') {
    if (String(path).startsWith('//')) return null;
    const role = String(path).split(/[?#]/)[0].split('/').filter(Boolean)[0];
    return PORTAL_ROLES.includes(role) ? role : null;
}

export function portalPath(role, view = '') {
    if (!PORTAL_ROLES.includes(role)) return '/';
    if (!view) return `/${role}`;
    if (!VIEW_KEY.test(view)) return `/${role}`;
    return `/${role}/${canonicalView(view, role).split('.').join('/')}`;
}

export function portalView(path = '') {
    const [beforeHash, hash = ''] = String(path).split('#');
    if (!portalRole(beforeHash)) return '';
    if (VIEW_KEY.test(hash)) return canonicalView(hash, portalRole(beforeHash));
    const parts = beforeHash.split('?')[0].split('/').filter(Boolean).slice(1);
    const view = parts.join('.');
    return VIEW_KEY.test(view) ? canonicalView(view, portalRole(beforeHash)) : '';
}

// Accept old links from stored guides and the many shared report buttons too.
// Leave public anchors, external URLs and Next URL objects alone.
export function portalHref(href, currentPath = '') {
    if (typeof href !== 'string') return href;
    const match = href.match(/^(?:(\/?(?:admin|staff|student|superadmin|superuser|canteen))(\?[^#]*)?)?#([a-z0-9.-]+)$/i);
    if (!match || !VIEW_KEY.test(match[3])) {
        const role = portalRole(href);
        // Canonicalize old path-form aliases too, preserving query parameters.
        if (role && !href.includes('#')) {
            const [pathname, ...query] = href.split('?');
            const view = pathname.split('/').filter(Boolean).slice(1).join('.');
            if (VIEW_KEY.test(view) && canonicalView(view, role) !== view) {
                return portalPath(role, view) + (query.length ? '?' + query.join('?') : '');
            }
        }
        return href;
    }
    const role = match[1] ? portalRole(match[1]) : portalRole(currentPath);
    if (!role) return href;
    return portalPath(role, match[3]) + (match[2] || '');
}

export async function navigatePortal(router, href, { replace = false } = {}) {
    const target = portalHref(href, router.asPath);
    // Do not skip the current URL: it may be the user’s latest choice while
    // a different destination is still in flight. Next must cancel that move.
    const samePortal = typeof target === 'string' && portalRole(target)
        && portalRole(target) === portalRole(router.asPath);
    try {
        return await router[replace ? 'replace' : 'push'](target, undefined, {
            shallow: Boolean(samePortal), scroll: !samePortal,
        });
    } catch (error) {
        // A newer navigation superseded this one. Genuine failures still surface.
        if (error?.cancelled) return false;
        throw error;
    }
}
