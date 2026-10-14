import Image from "next/image";
import QRCode from "react-qr-code";
import { useCallback, useMemo, useState } from "react";
import { useStudentProfile } from "@/contexts/StudentProfile";
import { useAppContext } from "@/contexts/AppContext";
import { formatImagePath } from "@/methods/formatMediaPath";
import showOnlyClass from "@/methods/showOnlyClass";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import {
    PhoneIcon, EnvelopeIcon, MapPinIcon, CakeIcon,
    UserGroupIcon, IdentificationIcon, HeartIcon, HashtagIcon,
    UserIcon, CreditCardIcon, CheckIcon, Square2StackIcon,
} from "@heroicons/react/24/outline";

const domain = typeof window !== "undefined" ? window.location.origin : "";

// Status drives the only strong colour on the card, so it reads at a glance:
// running is calm, passed out is celebratory, dropped out is a warning.
const STATUS_STYLES = {
    1: "bg-emerald-400/25 text-emerald-50 ring-emerald-200/50",
    2: "bg-sky-400/25 text-sky-50 ring-sky-200/50",
    3: "bg-rose-400/25 text-rose-50 ring-rose-200/50",
};
// …and the same three states as a dot on the portrait, so the card says which
// one it is even when the chip has scrolled out of view on a phone.
const STATUS_DOT = { 1: "bg-emerald-400", 2: "bg-sky-400", 3: "bg-rose-400" };

const GENDERS = { 1: "Male", 2: "Female", 3: "Other" };

function Fact({ icon: Icon, label, value, href }) {
    if (!value) return null;   // an empty field is noise, not information
    // A number you can ring and an address you can write to. These are the two
    // facts on this card that exist to be ACTED on, and they were flat text.
    const body = (
        <div title={value}
            className={`mt-1 break-words text-[0.88rem] font-semibold leading-[1.3] text-blue-gray-800
                ${href ? 'underline decoration-teal-300 decoration-2 underline-offset-2 hover:text-teal-700' : ''}`}>
            {value}
        </div>
    );
    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-blue-gray-50/70">
            <Icon className="mt-[3px] h-4 w-4 shrink-0 text-teal-600" />
            <div className="min-w-0">
                <div className="text-[0.66rem] font-semibold uppercase leading-3 tracking-[0.07em] text-blue-gray-400">{label}</div>
                {/* Wrap, never clip. A contact number cut to "986864…" and a date
                    cut to "2074-1…" are the two facts on this card people actually
                    come to read, and truncation made both useless. */}
                {href ? <a href={href} className="block">{body}</a> : body}
            </div>
        </div>
    );
}

/**
 * An identifier, and one click to put it on the clipboard.
 *
 * EMIS, registration and symbol numbers exist to be typed into something else —
 * a board form, a spreadsheet, a message — and the office was reading them off
 * the screen digit by digit. Copying is silent and reversible, so it needs no
 * confirmation beyond the tick that replaces the icon for a moment.
 */
function IdChip({ label, value }) {
    const [copied, setCopied] = useState(false);
    const copy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(String(value));
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
        } catch {
            // No clipboard permission (or an insecure origin) — the number is
            // still on screen to read, so this stays quiet rather than throwing
            // an error box at someone who only wanted to copy a number.
        }
    }, [value]);
    if (!value) return null;
    return (
        <button type="button" onClick={copy}
            title={copied ? 'Copied' : `Copy ${label}`}
            aria-label={`${label} ${value}. Copy`}
            className="group inline-flex items-center gap-1.5 rounded-full bg-white/15 py-1 pl-2.5 pr-2
                text-[0.72rem] font-semibold text-white ring-1 ring-white/25 backdrop-blur-[2px]
                transition-colors hover:bg-white/25">
            <span className="uppercase tracking-wide opacity-75">{label}</span>
            <span className="tabular-nums">{value}</span>
            {copied
                ? <CheckIcon className="h-3.5 w-3.5 text-emerald-200" />
                : <Square2StackIcon className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-70" />}
        </button>
    );
}

function StudentHeader() {
    const { data: { student, studentBackup } } = useStudentProfile();
    const { class: { classesBackup } } = useAppContext();

    const fullName = [student?.first_name, student?.middle_name, student?.last_name]
        .filter(Boolean).join(" ").trim();

    // Initials, for the students with no photo. The shared placeholder png made
    // every one of them look like the same anonymous person; two letters at
    // least belong to this student.
    const initials = [student?.first_name, student?.last_name]
        .filter(Boolean).map(n => n.trim()[0]).join("").toUpperCase();

    const qrUrl = useMemo(() => (
        `${domain}/profiles?org=${encodeURIComponent(student?.school)}&user=${encodeURIComponent(student?.id)}`
    ), [student?.id, student?.school]);

    // `classesBackup` is a list of [key, class] PAIRS — every other caller
    // destructures it that way. This one searched it for objects with an `id`,
    // which no entry has, so the lookup always failed and the class chip never
    // rendered: the identity band named the student and then said nothing else
    // about them.
    const classname = useMemo(() => {
        const cid = studentBackup?.ids?.cid;
        if (!cid || !Array.isArray(classesBackup)) return "";
        const found = classesBackup.find(entry => (
            Array.isArray(entry) ? entry?.[1]?.id === cid : entry?.id === cid
        ));
        const cls = Array.isArray(found) ? found[1] : found;
        return showOnlyClass(cls?.name || cls?.classname || "");
    }, [studentBackup?.ids?.cid, classesBackup]);

    const status = STUDENT_STATUS_OPTIONS.find((s) => s.value === Number(student?.status));
    const guardian = student?.guardian_info?.guardian_name || student?.guardian_info?.father_name;
    const photo = student?.image ? formatImagePath(student.image) : "";

    return (
        <div className="mb-4 overflow-hidden rounded-2xl border border-blue-gray-100 bg-white shadow-md">
            {/* Identity band — the one place the student is named, so it carries
                the colour and everything below it stays quiet. One flat fill in
                the palette's accent (`app-profile-hero` is repainted per theme);
                it was a teal→sky→blue sweep with two radial "lights" over it. */}
            <div className="app-profile-hero relative bg-[var(--t-brand-solid)] px-4 py-5 sm:px-6">

                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="relative mx-auto shrink-0 sm:mx-0">
                        {photo ? (
                            <Image
                                unoptimized
                                src={photo}
                                alt={fullName || "student"}
                                width={96} height={96}
                                className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/40 bg-white/20 sm:h-24 sm:w-24"
                            />
                        ) : (
                            <div aria-hidden="true"
                                className="grid h-20 w-20 place-items-center rounded-2xl bg-white/20 text-2xl font-bold
                                    text-white ring-4 ring-white/40 sm:h-24 sm:w-24 sm:text-3xl">
                                {initials || "?"}
                            </div>
                        )}
                        {status && (
                            <span title={status.name}
                                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white
                                    ${STATUS_DOT[status.value] || STATUS_DOT[1]}`} />
                        )}
                    </div>

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <h1 className="text-xl font-bold capitalize leading-tight text-white sm:text-2xl">
                            {fullName || "—"}
                        </h1>
                        {/* Who they are, in the order the office asks: which class,
                            which roll, and whether they are still with the school. */}
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                            {classname && (
                                <span className="rounded-full bg-white/20 px-2.5 py-1 text-[0.75rem] font-semibold capitalize text-white ring-1 ring-white/30">
                                    {classname}
                                </span>
                            )}
                            {student?.roll_no && (
                                <span className="rounded-full bg-white/20 px-2.5 py-1 text-[0.75rem] font-semibold text-white ring-1 ring-white/30">
                                    Roll {student.roll_no}
                                </span>
                            )}
                            {status && (
                                <span className={`rounded-full px-2.5 py-1 text-[0.75rem] font-semibold capitalize ring-1 ${STATUS_STYLES[status.value] || STATUS_STYLES[1]}`}>
                                    {status.name}
                                </span>
                            )}
                        </div>
                        {/* The numbers, one row down and one step quieter — they
                            are reference data, not identity, and each one is a
                            click to copy. */}
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                            <IdChip label="EMIS" value={student?.emis} />
                            <IdChip label="Regd" value={student?.regd_no} />
                            <IdChip label="Symbol" value={student?.symbol_no} />
                        </div>
                    </div>

                    {/* Scannable straight off the screen — no need to open the tab. */}
                    <a href={qrUrl} target="_blank" rel="noreferrer"
                        title="Open this student's public profile"
                        className="mx-auto flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white p-2 shadow-lg
                            transition-transform duration-150 hover:scale-105 sm:mx-0">
                        <QRCode value={qrUrl} size={56} />
                        <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-blue-gray-600">
                            Digital ID
                        </span>
                    </a>
                </div>
            </div>
            {/* Facts strip. Auto-fit columns rather than a fixed six: a student
                with three filled fields used to get three sixth-width columns and
                every value was clipped. Now each fact keeps a readable minimum
                and the row simply fits as many as the screen allows. */}
            <div className="grid gap-x-4 gap-y-1 border-t border-blue-gray-100 bg-blue-gray-50/40 px-3 py-3 sm:px-5
                grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))]">
                <Fact icon={PhoneIcon} label="Contact" value={student?.contact}
                    href={student?.contact ? `tel:${student.contact}` : undefined} />
                <Fact icon={UserGroupIcon} label="Guardian" value={guardian} />
                <Fact icon={CakeIcon} label="Birth Date" value={student?.birth_date} />
                <Fact icon={UserIcon} label="Gender" value={GENDERS[Number(student?.gender)]} />
                <Fact icon={HashtagIcon} label="Roll No" value={student?.roll_no} />
                <Fact icon={HeartIcon} label="Blood Group" value={student?.other_info?.blood_group} />
                <Fact icon={MapPinIcon} label="Location" value={student?.location} />
                <Fact icon={EnvelopeIcon} label="Email" value={student?.email}
                    href={student?.email ? `mailto:${student.email}` : undefined} />
                <Fact icon={CreditCardIcon} label="RFID Card" value={student?.rfid_card} />
                <Fact icon={IdentificationIcon} label="Previous School" value={student?.previous_school} />
            </div>
        </div>
    );
}

export default StudentHeader;
