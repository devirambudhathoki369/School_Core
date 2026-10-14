/** @type {import('next').NextConfig} */

const isDev = process.env.NODE_ENV === 'development';
const _url = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_BASE_LOCAL_URL;
const urlObj = new URL(_url);
const protocol = urlObj.protocol.slice(0, -1),
  hostname = urlObj.hostname;
const doAnalyze = process.env.ANALYZE === 'true';

// Response headers for every page the frontend serves.
//
// The frontend answered with NO security headers at all (the backend sends its
// own; this origin did not), and it announced itself with `x-powered-by:
// Next.js`. So any site could load the signed-in portal inside an invisible
// frame and steer an admin's clicks onto it (clickjacking), browsers were free
// to second-guess content types, and nothing limited which powerful browser
// features a page here could ask for.
//
// Deliberately conservative — each one is something this app provably does not
// need:
//   · framing: only by the app itself (`'self'`, not `'none'`: same-origin
//     frames are how responsive layouts are checked, and react-to-print prints
//     through an about:blank frame, which these rules do not touch);
//   · CSP is limited to directives that cannot break a working page —
//     frame-ancestors, base-uri, object-src, form-action. A script-src policy
//     would need nonces for Next's inline scripts, Sentry and Google Maps, and
//     is a separate, testable change of its own;
//   · no camera, microphone or geolocation anywhere in src/ (checked), so none
//     is granted; the clipboard stays allowed (student/staff screens copy
//     details).
// HSTS is left to the edge (Cloudflare): it cannot be withdrawn from the
// server once a browser has seen it — the backend makes the same call.
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()' },
];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  images: {
    deviceSizes: [640, 1080, 1920],
    // small logos/avatars render at fixed widths (40/60/90px). The optimizer only
    // serves widths in deviceSizes ∪ imageSizes, so an empty imageSizes made every
    // sub-640px image 400 ("w parameter not allowed"). Restore Next's default tier.
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
    minimumCacheTTL: 31536000, // 1year
    remotePatterns: [
      { protocol, hostname },
      // { protocol: 'https', hostname: 'backend.nirsabi.com' }
    ],
    unoptimized: isDev,
  }
}

module.exports = (() => {
  if (doAnalyze) {
    try {
      const withBundleAnalyzer = require('@next/bundle-analyzer')({
        enabled: true,
      });
      return withBundleAnalyzer(nextConfig);
    } catch (err) {
      console.warn('[@next/bundle-analyzer] is not installed. Skipping analysis.');
    }
  }

  return nextConfig;
})();


// Injected content via Sentry wizard below
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(module.exports, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableSourceMapUpload: process.env.VERCEL_ENV !== 'production',
  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
