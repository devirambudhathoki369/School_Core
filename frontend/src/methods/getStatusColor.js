// A response status maps to one of four meanings. The caller wants the meaning,
// not a colour — so this returns a tone name and the presentation layer decides
// how a tone looks. That keeps one status→appearance decision in one place
// instead of inline background colours the theme can never reach.
export const TONES = {
    NEUTRAL: 'neutral',   // no status, 1xx informational, 3xx redirection
    SUCCESS: 'success',   // 2xx
    WARNING: 'warning',   // 4xx — the user can act on it
    DANGER: 'danger'      // 5xx — the server broke
};

function getStatusTone(statusCode) {
    if (!statusCode) return TONES.NEUTRAL;
    if (statusCode >= 200 && statusCode < 300) return TONES.SUCCESS;
    if (statusCode >= 400 && statusCode < 500) return TONES.WARNING;
    if (statusCode >= 500 && statusCode < 600) return TONES.DANGER;
    return TONES.NEUTRAL;
}

export default getStatusTone;
