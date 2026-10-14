import { NextResponse } from 'next/server';
import { getConfig } from "./lib/edge-config";
import { MAINTENANCE_HTML } from "./lib/maintenance-page";

// The superadmin portal stays reachable during maintenance. Every role is the
// same `[role].jsx` route, which renders the login form until a token validates
// and the portal itself afterwards (menus are client-side state, not routes) —
// so exempting this one path covers both login and the whole portal.
function isSuperadminPortal(pathname) {
    const path = pathname.toLowerCase();
    return path === '/superadmin' || path.startsWith('/superadmin/');
}

// Google Play requires the privacy policy URL to stay reachable at all times. A
// 503 maintenance page on this route reads as a missing policy and fails review,
// so it serves normally even while the rest of the site is down.
// Covers the per-school forms too (`/privacy_policy/8`), since those are the
// URLs on the individual Play listings.
function isPublicLegalPage(pathname) {
    const path = pathname.toLowerCase().replace(/\/+$/, '');
    return path === '/privacy_policy' || path.startsWith('/privacy_policy/');
}

export async function middleware(req) {
    const maintenance = await getConfig('maintenance');
    const { pathname } = req.nextUrl;
    if (maintenance === 'on' && !isSuperadminPortal(pathname) && !isPublicLegalPage(pathname)) {
        return new NextResponse(MAINTENANCE_HTML, {
            status: 503,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
                'retry-after': '3600',
            },
        });
    }
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * 1. Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files: CSS, JS)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * 2. It also excludes paths with common file extensions 
         * to prevent middleware from waking up for images/assets.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|css|js|woff2?|ico)$).*)',
    ],
}