import Head from "next/head";
import Image from "next/image";

import { buildPrivacyPolicy, DEFAULT_APP_NAME } from "@/data/privacy_policy_content";
import { fetchAppListing } from "@/services/functions/appListing";

/**
 * The public privacy policy, rendered for one app.
 *
 * SchoolCore is not one Play listing. Every school that takes the mobile
 * product gets its own build (`com.centit.rolpasunlight.app`,
 * `com.centit.divineacademy.app`, …), and Play expects each listing's privacy
 * policy URL to open a policy naming *that* app — a document headed
 * "SchoolCore" under a listing called "Rolpa Sunlight" reads as the wrong
 * policy and fails review.
 *
 * So this page takes a school:
 *
 *   /privacy_policy                 the generic SchoolCore document
 *   /privacy_policy?schoolid=8      the same document, as Rolpa Sunlight's app
 *   /privacy_policy/8               the same thing with a tidier URL
 *
 * The policy TEXT is still the text Play reviewed — see
 * `data/privacy_policy_content`, where only the app name and the product
 * paragraph are substituted, and the no-school render is byte-identical to what
 * this page has always served.
 *
 * Everything is server-rendered, including the school lookup. Play's policy
 * crawler does not run JavaScript: the markup used to be gated behind a
 * useEffect, which left the prerendered page an empty spinner and got the
 * listing rejected. An unknown id or an unreachable API falls back to the
 * generic document rather than erroring, for the same reason — a policy URL
 * that 500s is a failed review.
 */

const BRAND = "var(--t-brand-solid, #0d9488)";
const LAST_UPDATED = "July 29, 2026";
const DEVELOPER = "Cent IT Solution Pvt. Ltd.";
const DEVELOPER_EMAIL = "centit37@gmail.com";

/** Shared by both routes: look the school up and shape the props. */
export async function getPolicyProps(schoolId) {
    const listing = await fetchAppListing(schoolId);
    return {
        props: {
            app: listing
                ? {
                      appName: listing.app_name,
                      appDescription: listing.app_description || "",
                      packageName: listing.package_name || "",
                      schoolName: listing.school_name || "",
                      schoolAddress: listing.school_address || "",
                      supportEmail: listing.support_email || DEVELOPER_EMAIL,
                      logo: listing.school_logo || "",
                  }
                : null,
        },
    };
}

function PrivacyPolicyDocument({ app }) {
    const appName = app?.appName || DEFAULT_APP_NAME;
    const supportEmail = app?.supportEmail || DEVELOPER_EMAIL;
    const html = buildPrivacyPolicy(app || undefined);

    return (
        <>
            <Head>
                <title>{`Privacy Policy — ${appName}`}</title>
                <meta
                    name="description"
                    content={`Privacy Policy for ${appName}, the school management app and web application published by ${DEVELOPER}.`}
                />
                <meta name="robots" content="index, follow" />
            </Head>

            <div className="min-h-screen w-full">
                {/* who publishes this document, and which app it is */}
                <header
                    className="w-full print:hidden"
                    style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>
                    <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <a href="/" className="flex min-w-0 items-center gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white shadow-sm">
                                {app?.logo ? (
                                    /* the school's own logo lives on the API host;
                                       a plain <img> keeps this page independent of
                                       the image optimizer, which the crawler would
                                       otherwise have to get a 200 out of too */
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={app.logo}
                                        alt={appName}
                                        className="h-[34px] w-[34px] object-contain"
                                        onContextMenu={(e) => e.preventDefault()}
                                    />
                                ) : (
                                    <Image
                                        src="/logo.png"
                                        alt={appName}
                                        width={34}
                                        height={34}
                                        onContextMenu={(e) => e.preventDefault()}
                                    />
                                )}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[0.62rem] font-bold uppercase tracking-[0.14em] text-white/75">
                                    {DEVELOPER}
                                </span>
                                <span className="block truncate text-base font-bold text-white">{appName}</span>
                            </span>
                        </a>
                        <span
                            className="shrink-0 self-start rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold
                                       text-white ring-1 ring-inset ring-white/25 sm:self-auto">
                            Privacy Policy · Updated {LAST_UPDATED}
                        </span>
                    </div>
                </header>

                <main className="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
                    {/* A reviewer opens this URL from one specific listing. Naming the
                        app, its package and the school it serves up front is how they
                        confirm, without reading 12 sections, that they have the right
                        policy. Omitted entirely on the generic page, which has no
                        single listing to point at. */}
                    {app ? (
                        <section
                            className="mb-4 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-10"
                            aria-label="Which app this policy covers">
                            <dl className="grid gap-x-8 gap-y-2 text-[0.82rem] sm:grid-cols-2">
                                <div>
                                    <dt className="font-semibold text-gray-900">Application</dt>
                                    <dd className="text-gray-600">{appName}</dd>
                                </div>
                                <div>
                                    <dt className="font-semibold text-gray-900">Published by</dt>
                                    <dd className="text-gray-600">{DEVELOPER}</dd>
                                </div>
                                {app.packageName ? (
                                    <div>
                                        <dt className="font-semibold text-gray-900">Package</dt>
                                        <dd className="break-all text-gray-600">{app.packageName}</dd>
                                    </div>
                                ) : null}
                                {app.schoolName ? (
                                    <div>
                                        <dt className="font-semibold text-gray-900">Institution</dt>
                                        <dd className="text-gray-600">
                                            {app.schoolName}
                                            {app.schoolAddress ? `, ${app.schoolAddress}` : ""}
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                        </section>
                    ) : null}

                    {/* the document itself, on a sheet, at a readable measure */}
                    <article
                        className="privacy-policy rounded-2xl border border-gray-200 bg-white px-5 py-7 shadow-sm
                                   sm:px-10 sm:py-10 print:border-0 print:p-0 print:shadow-none"
                        dangerouslySetInnerHTML={{ __html: html }}
                    />

                    <footer
                        className="mt-4 flex flex-col items-center justify-between gap-2 rounded-2xl border
                                   border-gray-200 bg-white px-5 py-4 shadow-sm sm:flex-row print:hidden">
                        <p className="text-[0.82rem] text-gray-600">
                            Questions about this policy? Write to{" "}
                            <a
                                href={`mailto:${supportEmail}`}
                                className="font-semibold hover:underline"
                                style={{ color: BRAND }}>
                                {supportEmail}
                            </a>
                            .
                        </p>
                        <a
                            href="/support"
                            className="shrink-0 rounded-lg px-4 py-2 text-[0.82rem] font-semibold text-white"
                            style={{ backgroundColor: BRAND }}>
                            Contact support
                        </a>
                    </footer>
                </main>
            </div>
        </>
    );
}

export default PrivacyPolicyDocument;
