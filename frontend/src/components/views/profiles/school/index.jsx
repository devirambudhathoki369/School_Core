import Image from "next/image";
import {
    EnvelopeIcon,
    PhoneIcon,
    MapPinIcon,
    CalendarDaysIcon,
    IdentificationIcon,
    ArrowPathIcon,
    BuildingLibraryIcon,
    PhotoIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import ImageForm from "@/components/inputs/ImageForm";
import { removeSchoolImage, updateSchool } from "@/services/functions/schools";
import SchoolSettingsPage from "./settings";
import Users from "@/configs/Users";

/**
 * The school's own profile.
 *
 * Same construction as the Support page, for the same reason: everything that
 * carries the interface's colour reads `var(--t-*, <classic value>)`, so this
 * looks deliberate on all four themes and unchanged-in-spirit on Classic.
 *
 * The identity block is read-only here — a school's name, PAN and dates are
 * superadmin-owned — so it is presented as a record, not a form. The only
 * things an admin can change on this page are the four brand images and the
 * settings below, and both are given their own titled card so it is obvious
 * which parts of the page are editable. Each image can be added, edited and
 * deleted; whatever is saved is written back to the signed-in profile, so the
 * logo in the header and on the next printed bill follows without a re-login.
 */

const BRAND = "var(--t-brand-solid, #0d9488)";
const AMBER = "#d97706";
const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

/** Resolve a stored media path the same way ImageForm does. */
function mediaUrl(path) {
    if (!path) return null;
    if (/^https?:\/\//.test(path)) return path;
    return `${baseURL}${path.startsWith("/media/") ? path : `/media/${path}`}`;
}

function DetailRow({ icon, label, value, color = BRAND }) {
    if (!value) return null;
    return (
        <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 13%, #fff)`, color }}>
                {icon}
            </span>
            <div className="min-w-0">
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-gray-500">{label}</p>
                <p className="break-words text-[0.95rem] font-semibold text-gray-800">{value}</p>
            </div>
        </div>
    );
}

/** A fact worth reading at a glance, sitting on the coloured band. */
function HeaderChip({ label, value }) {
    if (!value) return null;
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1
                         ring-1 ring-inset ring-white/25">
            <span className="text-[0.62rem] font-bold uppercase tracking-wider text-white/75">{label}</span>
            <span className="truncate text-xs font-semibold text-white">{value}</span>
        </span>
    );
}

function CardTitle({ icon, title, description, color = BRAND }) {
    return (
        <div className="mb-4 flex items-start gap-2.5">
            <span className="mt-0.5 inline-block h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-lg font-semibold leading-6 text-gray-900">
                    {icon}
                    {title}
                </h2>
                {description && <p className="mt-0.5 text-[0.85rem] text-gray-600">{description}</p>}
            </div>
        </div>
    );
}

const BRAND_IMAGES = [
    { name: "logo", what: "logo", label: "School logo", hint: "Printed on bills, marksheets and ID cards." },
    { name: "award_logo", what: "logo", label: "Award logo", hint: "Optional second mark, shown beside the logo." },
    { name: "sign", what: "signature", label: "Principal's signature", hint: "Used on certificates and marksheets." },
    { name: "exam_coordinator_sign", what: "signature", label: "Exam coordinator's signature", hint: "Used on result documents." },
];

function SchoolProfile() {
    const { user: { user, setUser } } = useAppContext();
    const profile = user?.profile;
    if (!profile) return null;

    // The profile the whole app reads its logo and signatures from.
    function onImageSaved(name, path) {
        setUser(state => (state ? { ...state, profile: { ...state.profile, [name]: path } } : state));
    }

    const schoolId = profile.school || profile.id;
    const extraData = { id: schoolId };
    const logo = mediaUrl(profile.logo);

    const contacts = [
        profile.contact || profile.primary_contact,
        profile.telephone,
        profile.secondary_contact,
    ].filter(Boolean).join(", ");

    const economicYear = profile.school_economic_year__name || profile.economic_year__name;

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-6">

            {/* ── identity ─────────────────────────────────────────────── */}
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative px-5 py-6 sm:px-7 sm:py-7"
                    style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>

                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                        <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-sm sm:h-20 sm:w-20">
                            {logo
                                ? <Image unoptimized src={logo} alt={`${profile.name || "School"} logo`}
                                    width={64} height={64} className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                                    onContextMenu={(e) => e.preventDefault()} />
                                : <BuildingLibraryIcon className="h-8 w-8 text-gray-400" />}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/75">
                                School profile
                            </p>
                            <h1 className="text-xl font-bold capitalize leading-tight text-white sm:text-2xl">
                                {profile.name || ""}
                            </h1>
                            {profile.address && (
                                <p className="mt-0.5 flex items-center gap-1 text-[0.85rem] font-medium capitalize text-white/85">
                                    <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate">{profile.address}</span>
                                </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <HeaderChip label="ESTD" value={profile.estd_date} />
                                <HeaderChip label="PAN" value={profile.pan_no} />
                                <HeaderChip label="EY" value={economicYear} />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── the record ───────────────────────────────────────────── */}
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <CardTitle title="School details"
                    description="Held by CentIT — contact support to have any of these corrected." />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailRow icon={<PhoneIcon className="h-4 w-4" />} label="Contact" value={contacts} />
                    <DetailRow icon={<EnvelopeIcon className="h-4 w-4" />} label="Email" value={profile.email} color={AMBER} />
                    <DetailRow icon={<MapPinIcon className="h-4 w-4" />} label="Address" value={profile.address} />
                    <DetailRow icon={<IdentificationIcon className="h-4 w-4" />} label="PAN number" value={profile.pan_no} color={AMBER} />
                    <DetailRow icon={<CalendarDaysIcon className="h-4 w-4" />} label="Established" value={profile.estd_date} />
                    <DetailRow icon={<ArrowPathIcon className="h-4 w-4" />} label="Renew date" value={profile.renew_date} color={AMBER} />
                    <DetailRow icon={<CalendarDaysIcon className="h-4 w-4" />} label="Economic year" value={economicYear} />
                </div>
            </section>

            {/* ── brand images ─────────────────────────────────────────── */}
            {user?.role === Users.ADMIN && (
                <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                    <CardTitle color={AMBER}
                        icon={<PhotoIcon className="h-5 w-5" style={{ color: AMBER }} />}
                        title="Logos and signatures"
                        description="Add, edit or delete each image. These appear on every printed bill, marksheet and certificate, so use a clear image with a transparent or white background." />
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {BRAND_IMAGES.map(({ name, what, label, hint }) => (
                            <div key={name}
                                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/70 p-3
                                           transition-colors hover:border-gray-300 hover:bg-white">
                                {/* unoptimized (ImageForm default): the backend media host is
                                    Cloudflare-fronted and the on-VPS optimizer gets bot-challenged
                                    fetching it (upstream 403) — same constraint as View.jsx. */}
                                <ImageForm name={name} what={what} src={profile[name] || ""}
                                    label={<span className="text-[0.8rem] text-gray-800">{label}</span>}
                                    hint={hint}
                                    alt={`${profile.name || "School"} ${label}`}
                                    onSubmit={updateSchool} extraData={extraData}
                                    onDelete={() => removeSchoolImage(schoolId, name)}
                                    onSaved={(path) => onImageSaved(name, path)} />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── account + SMS settings ───────────────────────────────── */}
            <SchoolSettingsPage />
        </div>
    );
}

export default SchoolProfile;
