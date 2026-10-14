const SENTRY_CONFIG = {
    enabled: process.env.NEXT_PUBLIC_SENTRY === "on",
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: "frontend-prod",
    sampleRate: 0.1, // 10%
    tracesSampleRate: 0.01,
    profilesSampleRate: 0.0,
    maxBreadcrumbs: 50,
    enableLogs: false,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.01, // ONLY record if a crash happens
};


export default SENTRY_CONFIG;