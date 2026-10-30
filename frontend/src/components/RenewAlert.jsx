import AttentionBox from "@/components/AttentionBox";
import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import { bsDateLong } from "@/components/views/reports/dashboards/school/Today";

// When to start saying it, and how long a lapsed licence keeps working.
//
// The grace period is what makes the fix safe to ship: the old check compared
// the BS `renew_date` as if it were an AD date, so no school was ever warned or
// stopped. Correcting it all at once would have closed every school whose date
// had quietly passed, the moment it deployed. Instead a lapsed licence gets
// GRACE_DAYS of a warning that cannot be missed, and the superadmin console
// lists each one so the date can be renewed or corrected in that time.
const NEAR_DAYS = 30;
const GRACE_DAYS = 15;
const NEAR_INTERVAL = (60 * 1000) * 5;   // a dismissed reminder comes back every 5 minutes
const LAPSED_INTERVAL = (60 * 1000) * 2; // and a lapsed one every 2

/**
 * The days left are counted by the server in the BS calendar
 * (`renew_days_left`, main/methods/licence.py). Without that number -- an older
 * server mid-deploy, or a school with no date -- nothing is said and nobody is
 * locked out on a guess.
 */
export function licenceState(days) {
    if (typeof days !== "number" || Number.isNaN(days)) return { state: "unknown" };
    if (days < -GRACE_DAYS) return { state: "expired" };
    if (days < 0) return { state: "grace", lapsedFor: -days, locksIn: GRACE_DAYS + days };
    if (days <= NEAR_DAYS) return { state: "near", daysLeft: days };
    return { state: "current" };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function RenewAlert() {
    const { user: { user } } = useAppContext();
    const days = user?.profile?.renew_days_left;
    const status = licenceState(days);
    const [shown, setShown] = useState(null);

    useEffect(() => {
        if (status.state === "expired") {
            // Carry the role across. The licence screen offers a way out —
            // signing out — and `/auth/logout` needs to know which portal
            // this session belongs to. It can find that out on its own, but
            // handing it over saves the round-trips.
            const role = user?.role ? `?role=${encodeURIComponent(user.role)}` : '';
            window.location.href = `/license_expired${role}`;
            return;
        }
        setShown(status.state === "near" || status.state === "grace" ? status : null);
    }, [days]);

    if (!shown) return null;
    const on = bsDateLong(user?.profile?.renew_date) || user?.profile?.renew_date;
    return (
        <div className="fixed top-1/4 left-1/2 z-50">
            {shown.state === "near" &&
                <AttentionBox interval={NEAR_INTERVAL} title="Your licence is due for renewal"
                    description={shown.daysLeft === 0
                        ? `It renews today (${on}). Renew it to keep every screen open.`
                        : `It renews in ${plural(shown.daysLeft, "day")}, on ${on}.`} />}
            {shown.state === "grace" &&
                <AttentionBox interval={LAPSED_INTERVAL} title="Your licence has lapsed"
                    description={`It was due on ${on}, ${plural(shown.lapsedFor, "day")} ago. ${shown.locksIn === 0
                        ? "The system closes after today"
                        : `The system closes in ${plural(shown.locksIn, "day")}`} unless it is renewed.`} />}
        </div>
    )
}

export default RenewAlert;
