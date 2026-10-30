import { useEffect, useState } from "react";
import {
    PhoneIcon,
    EnvelopeIcon,
    MapPinIcon,
    ClockIcon,
    GlobeAltIcon,
    ArrowTopRightOnSquareIcon,
    LifebuoyIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";

import OurLogo from "@/components/OurLogo";
import { WhatsappMark, MessengerMark } from "@/components/supports/marks";
import { useMessengerUrl } from "@/components/supports/Facebook";
import { getSupportInfo } from "@/services/functions/help";

/**
 * Support.
 *
 * One page whose entire job is: "something is wrong / I need help — how do I
 * reach a human, right now?" So every channel is a full, tappable card with the
 * value shown in plain text (a phone number you can read out loud, an address
 * you can copy) rather than a line of small print with two logos under it.
 *
 * It has to hold on all four interface themes. The rule that makes that work is
 * that nothing here hard-codes the product's teal: anything carrying the
 * interface's own colour reads it from `var(--t-*, <classic value>)`, so a
 * themed school gets its own accent and Classic — which sets no `data-ui-theme`
 * and therefore none of the variables — falls back to the teal it has always
 * had. Only the two channel logos keep fixed colours, because a WhatsApp mark
 * that is blue on one school and green on another is not a WhatsApp mark.
 *
 * The details themselves are edited by the superadmin (Help Centre ▸ Support
 * Details) and fetched on mount. `FALLBACK` is what shipped in this bundle: the
 * page renders it while the request is in flight and keeps it if the request
 * fails, because a support page that shows no phone number is worse than one
 * showing a slightly stale one.
 */

const FALLBACK = {
    name: "Cent IT Solutions Pvt. Ltd.",
    product: "SchoolCore · School Management System",
    address: "Madannagar, Tulsipur-6, Dang, Lumbini",
    open_days: "Sunday – Friday",
    open_time: "9:00 AM – 5:00 PM",
    open_from_hour: 9,
    open_to_hour: 17,
    closed_weekdays: [5],
    contact: "9815582814",
    email: "centit37@gmail.com",
    website: "https://nirsabi.com",
    whatsapp_contact: "https://wa.me/9815582814?text=Hi CentIT team, I need support for ",
    fb_page_id: "61579363944373",
    checklist: [
        "The page you were on (e.g. Payment ▸ Student).",
        "A screenshot showing the error message.",
        "The student / staff name or bill number involved.",
        "What you expected to happen instead.",
    ],
};

// The palette. Four roles, stated once: the interface's own accent for the
// primary action, the two channel brands, and amber as the warm note — the same
// four-hue discipline the themes themselves follow.
const BRAND = "var(--t-brand-solid, #0d9488)";
const WHATSAPP = "#25d366";
const MESSENGER = "#0084ff";
const AMBER = "#d97706";

/**
 * Are they at their desks right now?
 *
 * `closed_weekdays` is stored the way Python counts weekdays (Monday 0 …
 * Sunday 6); `Date.getDay()` counts from Sunday, so it is shifted here rather
 * than stored twice and left to drift.
 */
function isOpenNow(now, info) {
    if (!now) return false;
    const weekday = (now.getDay() + 6) % 7;
    if ((info.closed_weekdays || []).includes(weekday)) return false;
    const hour = now.getHours() + now.getMinutes() / 60;
    return hour >= info.open_from_hour && hour < info.open_to_hour;
}

/**
 * Drop keys the superadmin has left blank, so the fallback shows through.
 *
 * Empty ARRAYS are kept deliberately: "closed on no days" and "no checklist"
 * are both things someone can mean, and pruning them would make those two
 * settings impossible to save.
 */
function pruneEmpty(data) {
    return Object.fromEntries(
        Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== "")
    );
}

/** A tinted disc behind a glyph — the one icon treatment used across the page. */
function IconBadge({ color, children, size = "lg" }) {
    const box = size === "lg" ? "h-11 w-11" : "h-9 w-9";
    return (
        <span className={`${box} shrink-0 grid place-items-center rounded-xl`}
            style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, #fff)`, color }}>
            {children}
        </span>
    );
}

/**
 * A way to reach us. The whole card is the link, so on a phone the target is
 * the card and not a 14px string of text.
 */
function ChannelCard({ href, external, color, icon, label, value, hint }) {
    return (
        <a href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="group relative flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3.5
                       transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ "--tw-ring-color": color }}>
            {/* a hairline of the channel's own colour down the leading edge */}
            <span className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                style={{ backgroundColor: color }} />
            <IconBadge color={color}>{icon}</IconBadge>
            <span className="min-w-0 flex-1">
                <span className="block text-[0.72rem] font-bold uppercase tracking-wider text-gray-500">{label}</span>
                <span className="block truncate text-[0.98rem] font-semibold text-gray-900">{value}</span>
                {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
            </span>
            <ArrowTopRightOnSquareIcon
                className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
        </a>
    );
}

/** A fact about us — not clickable, so it is deliberately quieter than a channel. */
function FactRow({ icon, label, value, color = BRAND }) {
    return (
        <div className="flex items-start gap-3">
            <IconBadge color={color} size="sm">{icon}</IconBadge>
            <div className="min-w-0">
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                <p className="text-[0.95rem] font-semibold text-gray-800">{value}</p>
            </div>
        </div>
    );
}

function Support() {
    const [info, setInfo] = useState(FALLBACK);
    useEffect(() => {
        let live = true;
        (async () => {
            const data = await getSupportInfo();
            // Merge onto the fallback: a field the superadmin has never filled
            // in comes back empty, and an empty masthead is not an improvement
            // on a stale one.
            if (live && data) setInfo((s) => ({ ...s, ...pruneEmpty(data) }));
        })();
        return () => { live = false; };
    }, []);

    const messengerUrl = useMessengerUrl(info.fb_page_id);

    // Rendered on the server too, where there is no clock and no timezone — so
    // the badge starts absent and appears once the browser has a real time,
    // rather than flashing "closed" on every server-rendered load.
    const [now, setNow] = useState(null);
    useEffect(() => {
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), 60 * 1000);
        return () => clearInterval(id);
    }, []);
    const open = isOpenNow(now, info);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">

            {/* ── masthead ─────────────────────────────────────────────────
                One flat panel in the palette's accent — indigo on Core, teal
                on Himalaya, blue on Phewa, green on Terai, crimson on
                Laliguras — with no per-theme markup. (It was a gradient with two decorative light
                discs; the product has dropped both.) */}
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative px-5 py-6 sm:px-7 sm:py-7"
                    style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>

                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3.5">
                            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white shadow-sm sm:h-16 sm:w-16">
                                <OurLogo size={46} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/75">
                                    Support &amp; Help Desk
                                </p>
                                <h1 className="truncate text-xl font-bold leading-tight text-white sm:text-2xl">
                                    {info.name}
                                </h1>
                                <p className="mt-0.5 truncate text-[0.82rem] font-medium text-white/85">
                                    {info.product}
                                </p>
                            </div>
                        </div>

                        {/* Are they there right now? The single most useful thing
                            this page can tell someone before they dial. */}
                        {now && (
                            <div className="flex shrink-0 items-center gap-2 self-start rounded-full bg-white/15 px-3 py-1.5
                                            ring-1 ring-inset ring-white/25 sm:self-auto">
                                <span className="relative flex h-2.5 w-2.5">
                                    {open && (
                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                                    )}
                                    <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${open ? "bg-emerald-400" : "bg-amber-300"}`} />
                                </span>
                                <span className="whitespace-nowrap text-xs font-semibold text-white">
                                    {open ? "We're online now" : "Outside office hours"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* the facts strip, sitting on the card below the band */}
                <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3 sm:px-7">
                    <FactRow icon={<ClockIcon className="h-4 w-4" />}
                        label="Office hours" value={info.open_time} />
                    <FactRow icon={<LifebuoyIcon className="h-4 w-4" />}
                        label="Open on" value={info.open_days} color={AMBER} />
                    <FactRow icon={<MapPinIcon className="h-4 w-4" />}
                        label="Office" value={info.address} />
                </div>
            </section>

            {/* ── the channels ─────────────────────────────────────────── */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex items-center gap-2">
                    <span className="inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: BRAND }} />
                    <div>
                        <h2 className="text-lg font-semibold leading-6 text-gray-900">Talk to us</h2>
                        <p className="text-[0.85rem] text-gray-600">
                            Pick whichever is easiest — they all reach the same team.
                        </p>
                    </div>
                </div>

                {/* A channel with nothing behind it is a dead link, so each one
                    is rendered only when its detail has actually been filled in. */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {info.contact && (
                        <ChannelCard href={`tel:${info.contact}`} color={BRAND}
                            icon={<PhoneIcon className="h-5 w-5" />}
                            label="Call us" value={info.contact}
                            hint="Fastest during office hours" />
                    )}

                    {info.whatsapp_contact && (
                        <ChannelCard href={info.whatsapp_contact} external color={WHATSAPP}
                            icon={<WhatsappMark size={22} />}
                            label="WhatsApp" value={info.contact}
                            hint="Send a screenshot of the problem" />
                    )}

                    {messengerUrl && (
                        <ChannelCard href={messengerUrl} external color={MESSENGER}
                            icon={<MessengerMark size={22} />}
                            label="Messenger" value={info.name}
                            hint="Chat with us on Facebook" />
                    )}

                    {info.email && (
                        <ChannelCard href={`mailto:${info.email}?subject=SchoolCore support request`}
                            color={AMBER}
                            icon={<EnvelopeIcon className="h-5 w-5" />}
                            label="Email" value={info.email}
                            hint="Best for detailed reports" />
                    )}
                </div>
            </section>

            {/* ── what to send us ──────────────────────────────────────────
                Not decoration: the biggest cause of a slow fix is a report that
                says only "it is not working". */}
            {(info.checklist || []).length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-3 flex items-center gap-2">
                    <span className="inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: AMBER }} />
                    <h2 className="text-lg font-semibold leading-6 text-gray-900">Help us fix it faster</h2>
                </div>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {info.checklist.map((line) => (
                        <li key={line} className="flex items-start gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
                            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                            <span className="text-[0.9rem] leading-5 text-gray-700">{line}</span>
                        </li>
                    ))}
                </ul>
            </section>
            )}

            {/* ── footer ───────────────────────────────────────────────── */}
            <div className="flex flex-col items-center justify-between gap-2 rounded-2xl border border-gray-200
                            bg-white px-5 py-3.5 shadow-sm sm:flex-row">
                <p className="text-[0.82rem] text-gray-500">
                    © {new Date().getFullYear()} {info.name} · All rights reserved.
                </p>
                <a href={info.website} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-[0.82rem] font-semibold hover:underline"
                    style={{ color: BRAND }}>
                    <GlobeAltIcon className="h-4 w-4" />
                    nirsabi.com
                </a>
            </div>
        </div>
    );
}

export default Support;
