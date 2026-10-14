import { Component } from "react";
import * as Sentry from "@sentry/nextjs";
import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

/**
 * The last line of defence.
 *
 * This app had NO error boundary anywhere. A render error in any one view —
 * a report reading a field the API stopped sending, a marksheet dividing by a
 * missing total — unmounts the entire React tree, so the whole page goes blank.
 * The user is left on a white scree mnn with the sidebar gone and no indication
 * that anything failed, let alone what to do about it.
 *
 * Scoped around the VIEW rather than the whole app on purpose: the rail, the
 * header and the fiscal-year picker keep working, so a single broken report
 * costs the user that report instead of their session. They can pick another
 * menu item and carry on.
 *
 * Sentry is already wired into this project (`sentry.*.config.ts`), but it only
 * ever saw errors that Next itself caught. A component error swallowed by a
 * missing boundary was never reported — so the crashes users hit most were the
 * ones least likely to be in the dashboard. `componentDidCatch` forwards them.
 *
 * The fallback is deliberately plain and unthemed: it has to render when the
 * app is already in a bad state, so it depends on no context, no theme lookup
 * and no data. That also means it is the same on Classic — but a blank white
 * page is not a Classic design decision worth preserving.
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    }

    componentDidUpdate(prevProps) {
        // Moving to another screen must clear the error, or the boundary keeps
        // showing the old failure over a view that is perfectly fine. The
        // caller passes the active menu key as `resetKey`.
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div className="w-full grid place-items-center px-4 py-12">
                <div className="w-full max-w-md rounded-2xl border border-dashed border-blue-gray-200
                    bg-white px-6 py-10 text-center">
                    <span className="mx-auto grid place-items-center h-14 w-14 rounded-2xl
                        bg-amber-500/10 text-amber-600">
                        <ExclamationTriangleIcon className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-base font-semibold text-gray-900">
                        This screen ran into a problem
                    </h2>
                    <p className="mt-1 text-body leading-5 text-gray-500">
                        Nothing you entered has been lost or saved incorrectly — the page
                        just failed to draw. The rest of the system is still working, so
                        you can pick another menu item, or try this one again.
                    </p>
                    <button type="button"
                        onClick={() => this.setState({ error: null })}
                        className="mt-5 inline-flex items-center gap-2 rounded-lg border
                            border-blue-gray-200 bg-white px-4 py-2 text-sm font-semibold
                            text-blue-gray-700 transition hover:bg-blue-gray-50">
                        <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                        Try again
                    </button>
                    {/* The message itself, for the support call that follows.
                        Collapsed, because a stack trace shown to a head teacher
                        is noise — but hiding it entirely means the person on the
                        phone has nothing to go on. */}
                    {this.state.error?.message && (
                        <details className="mt-4 text-left">
                            <summary className="cursor-pointer text-note font-semibold text-gray-400
                                hover:text-gray-600">
                                Technical details
                            </summary>
                            <p className="mt-2 break-words rounded-lg bg-gray-50 p-2 font-mono
                                text-label leading-4 text-gray-600">
                                {String(this.state.error.message)}
                            </p>
                        </details>
                    )}
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
