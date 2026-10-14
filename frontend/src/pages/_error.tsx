import * as Sentry from "@sentry/nextjs";
import Error, { ErrorProps } from "next/error";
import { NextPageContext } from "next";

/**
 * What the user sees when a request fails outright.
 *
 * This was `<Error statusCode={statusCode} />` — Next's built-in page, which
 * renders the bare string "500 | Internal Server Error" centred on white, in
 * the browser's default font. It carries no product identity, says nothing the
 * user can act on, and offers no route anywhere: the only exit is the browser's
 * back button.
 *
 * The Sentry reporting in `getInitialProps` is unchanged — it is the reason
 * this file exists and it still runs on every error.
 *
 * No theme lookup and no context here on purpose: this page renders when the
 * app failed to load at all, so it must depend on nothing. That makes it the
 * same on Classic, which is correct — a bare browser error page was never a
 * design decision anyone made.
 */
const MESSAGES: Record<number, { title: string; body: string }> = {
    403: {
        title: "You don’t have access to this",
        body: "Your account doesn’t have permission for this page. If you think it should, ask your school administrator to check your role.",
    },
    404: {
        title: "This page doesn’t exist",
        body: "The link may be out of date, or the page may have been renamed or moved to a different menu.",
    },
    500: {
        title: "Something went wrong on our side",
        body: "This isn’t your fault, and nothing you entered has been saved incorrectly. The problem has been reported automatically.",
    },
};

const CustomErrorComponent = ({ statusCode }: ErrorProps) => {
    const copy = MESSAGES[statusCode as number] || {
        title: "Something went wrong",
        body: "The page could not be loaded. Trying again often clears it.",
    };

    return (
        <main className="pub-page grid place-items-center px-4 py-12">
            <div className="pub-card w-full max-w-md p-7 text-center sm:p-8">
                <p className="pub-eyebrow text-teal-700">
                    {statusCode ? `Error ${statusCode}` : "Error"}
                </p>
                <h1 className="pub-title mt-2 text-slate-900">{copy.title}</h1>
                <p className="pub-lede mt-3 text-slate-500">{copy.body}</p>
                <div className="mt-7 flex flex-col items-stretch justify-center gap-2 sm:flex-row">
                    {/* A plain <a>, not the router: if the app's JS is what
                        failed, a client-side navigation fails with it. A real
                        document request is the one exit that always works. */}
                    <a href="/" className="pub-btn pub-btn-primary">Go to sign in</a>
                    <a href="/support" className="pub-btn pub-btn-ghost">Contact support</a>
                </div>
                <p className="pub-foot mt-7 text-slate-400">
                    Powered by Cent IT Solutions Pvt. Ltd.
                </p>
            </div>
        </main>
    );
};

CustomErrorComponent.getInitialProps = async (
    contextData: NextPageContext
): Promise<ErrorProps> => {
    await Sentry.captureUnderscoreErrorException(contextData);
    return Error.getInitialProps(contextData);
};

export default CustomErrorComponent;
