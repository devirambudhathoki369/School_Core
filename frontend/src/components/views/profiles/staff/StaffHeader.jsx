import Image from "next/image";
import QRCode from "react-qr-code";
import { useEffect, useMemo, useState } from "react";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { formatImagePath } from "@/methods/formatMediaPath";
import { fetchStaffRoles } from "@/services/functions/staffs";
import STAFF_STATUS_OPTIONS from "@/components/inputs/options/staff_status";
import { PhoneIcon, EnvelopeIcon, MapPinIcon, CakeIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
import { Fact } from "../ProfileHeaderParts";

const domain = typeof window !== "undefined" ? window.location.origin : "";
const ROLE_STAFF = 2;

// The one coloured chip on the card, said in words as well as colour; each ink
// is at least 5:1 on its own tint. Employed is calm, on leave a caution,
// retired informational, departed neutral.
const STATUS_STYLES = {
    1: "bg-[var(--st-ok-bg)] text-[var(--st-ok-ink)] ring-[var(--st-ok-line)]",
    2: "bg-[var(--line-soft)] text-[var(--ink-700)] ring-[var(--line)]",
    3: "bg-[var(--t-brand-tint)] text-[var(--t-brand-ink)] ring-[var(--t-brand-line)]",
    4: "bg-[var(--st-warn-bg)] text-[var(--st-warn-ink)] ring-[var(--st-warn-line)]",
};
const STATUS_DOT = { 1: "bg-emerald-400", 2: "bg-gray-400", 3: "bg-sky-400", 4: "bg-amber-400" };

/**
 * Who this staff member is, before the tabs: the same identity band as a
 * student's profile — portrait, name, role and status, the facts the office
 * reaches for, and the digital ID — so the two profiles read as one design.
 */
function StaffHeader() {
    const { data: { staff } } = useStaffProfile();
    const [roles, setRoles] = useState([]);

    // The detail carries the role as an id; its name comes from the same list
    // the role picker reads.
    useEffect(() => {
        let live = true;
        (async () => {
            const options = await fetchStaffRoles(true);
            if (live) setRoles(Array.isArray(options) ? options : []);
        })();
        return () => { live = false; };
    }, []);

    const fullName = [staff?.first_name, staff?.middle_name, staff?.last_name].filter(Boolean).join(" ").trim();
    const initials = [staff?.first_name, staff?.last_name].filter(Boolean).map((n) => n.trim()[0]).join("").toUpperCase();
    const photo = staff?.image ? formatImagePath(staff.image) : "";
    const role = roles.find((r) => String(r.value) === String(staff?.role))?.name;
    const status = STAFF_STATUS_OPTIONS.find((s) => s.value === Number(staff?.status));
    const info = staff?.other_info || {};
    const qrUrl = useMemo(() => (
        `${domain}/profiles?org=${encodeURIComponent(staff?.school)}&user=${encodeURIComponent(staff?.id)}&role=${ROLE_STAFF}`
    ), [staff?.school, staff?.id]);

    return (
        <div className="mb-4 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            <div className="app-profile-hero relative bg-[var(--t-brand-tint)] px-4 py-5 sm:px-6">
                <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="relative mx-auto shrink-0 sm:mx-0">
                        {photo ? (
                            <Image unoptimized src={photo} alt={fullName || "staff"} width={96} height={96}
                                className="h-20 w-20 rounded-2xl bg-white object-cover ring-4 ring-white sm:h-24 sm:w-24" />
                        ) : (
                            <div aria-hidden="true"
                                className="grid h-20 w-20 place-items-center rounded-2xl bg-white text-2xl font-semibold
                                    text-[var(--t-brand-ink)] ring-4 ring-white sm:h-24 sm:w-24 sm:text-3xl">
                                {initials || "?"}
                            </div>
                        )}
                        {status && (
                            <span title={status.name}
                                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white ${STATUS_DOT[status.value] || STATUS_DOT[1]}`} />
                        )}
                    </div>

                    <div className="min-w-0 flex-1 text-center sm:text-left">
                        <h1 className="text-[1.375rem] font-semibold capitalize leading-tight tracking-[-0.01em] text-[var(--ink-900)] sm:text-[1.625rem]">
                            {fullName || "—"}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                            {role && (
                                <span className="rounded-full bg-white px-2.5 py-1 text-[0.75rem] font-semibold capitalize text-[var(--ink-800)] ring-1 ring-[var(--line)]">
                                    {role}
                                </span>
                            )}
                            {status && (
                                <span className={`rounded-full px-2.5 py-1 text-[0.75rem] font-semibold capitalize ring-1 ${STATUS_STYLES[status.value] || STATUS_STYLES[1]}`}>
                                    {status.name}
                                </span>
                            )}
                        </div>
                    </div>

                    {staff?.id && (
                        <a href={qrUrl} target="_blank" rel="noreferrer" title="Open this staff member's public profile"
                            className="mx-auto flex shrink-0 flex-col items-center gap-1 rounded-xl bg-white p-2 ring-1 ring-[var(--line)]
                                transition-transform duration-150 hover:scale-105 sm:mx-0">
                            <QRCode value={qrUrl} size={56} />
                            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--ink-600)]">Digital ID</span>
                        </a>
                    )}
                </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-x-4 gap-y-1 border-t border-[var(--line)] bg-white px-3 py-3 sm:px-5">
                <Fact icon={PhoneIcon} label="Contact" value={staff?.primary_contact}
                    href={staff?.primary_contact ? `tel:${staff.primary_contact}` : undefined} />
                <Fact icon={PhoneIcon} label="Second contact" value={staff?.secondary_contact}
                    href={staff?.secondary_contact ? `tel:${staff.secondary_contact}` : undefined} />
                <Fact icon={EnvelopeIcon} label="Email" value={info.email}
                    href={info.email ? `mailto:${info.email}` : undefined} />
                <Fact icon={CalendarDaysIcon} label="Joined" value={info.joined_date} />
                <Fact icon={CakeIcon} label="Birth date" value={info.birth_date} />
                <Fact icon={MapPinIcon} label="Location" value={staff?.location} />
            </div>
        </div>
    );
}

export default StaffHeader;
