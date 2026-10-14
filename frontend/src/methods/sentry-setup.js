import * as Sentry from "@sentry/nextjs";

const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY === "on",
    sentryFeedbackEnabled = process.env.NEXT_PUBLIC_SENTRY_FEEDBACK === "on";
let sentryInitialized = false;

function getCurrentUser(user) {
    return {
        user_id: user.profile.id,
        user_type: user?.role,
        org_id: user?.profile?.school_id || user?.profile?.id // org_id || admin_id;
    }
}

function isDeviceLowEnd() {
    const cores = navigator.hardwareConcurrency || 2;
    const ram = navigator.deviceMemory || 2;
    const status = cores < 2 || ram < 4;
    return status;
}

function enableSentry(user) {
    if (sentryInitialized || !sentryEnabled) return;

    Sentry.setUser(getCurrentUser(user));
    if (sentryFeedbackEnabled) {
        Sentry.addIntegration(
            Sentry.feedbackIntegration({
                autoInject: true,
                showBranding: false,
                colorScheme: "light",
                isNameRequired: true,
            })
        );
        // trigger button customization
        const shadowButton = document
            .querySelector('#sentry-feedback')
            .shadowRoot.querySelector('.widget__actor');
        shadowButton.style.transform = 'scale(0.7)';
        shadowButton.style.padding = '12px';
        shadowButton.style.margin = '0px';
    }
    if (!isDeviceLowEnd()) {
        Sentry.addIntegration(
            Sentry.replayIntegration({
                maskAllText: true,
                blockAllMedia: true,
                stickySession: false,
            })
        );
    }

    sentryInitialized = true;
}

function disableSentry() {
    if (!sentryInitialized || !sentryEnabled) return;

    Sentry.setUser(null);
    sentryInitialized = false;
}

export { enableSentry, disableSentry };