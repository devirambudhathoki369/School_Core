import AttentionBox from "@/components/AttentionBox";
import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";

const EXPIRE_ALERT_DURATION_DAYS = 30;
const RENEW_ALERT_POPUP_INTERVAL = (60 * 1000) * 5; // every 5 minutes after dismissing it!

function shouldAskForRenew(renewDateString) {
    const currentDate = new Date();
    const renewDate = new Date(renewDateString);
    const expiryDurationInMillis = 1000 * 60 * 60 * 24 * EXPIRE_ALERT_DURATION_DAYS;
    const timeDifference = renewDate - currentDate;
    const nearExpiry = timeDifference <= expiryDurationInMillis && timeDifference > 0,
        exceededExpiry = !nearExpiry && timeDifference <= 0;

    return {
        nearExpiry, exceededExpiry
    };
}

function RenewAlert() {
    const { user: { user } } = useAppContext();
    const [askForRenew, setAskForRenew] = useState(false);

    useEffect(() => {
        const renew_date = user?.profile?.renew_date;
        if (renew_date) {
            const { nearExpiry, exceededExpiry } = shouldAskForRenew(renew_date);
            if (nearExpiry) setAskForRenew(true);
            else if (exceededExpiry) {
                // Carry the role across. The licence screen offers a way out —
                // signing out — and `/auth/logout` needs to know which portal
                // this session belongs to. It can find that out on its own, but
                // handing it over saves the round-trips.
                const role = user?.role ? `?role=${encodeURIComponent(user.role)}` : '';
                window.location.href = `/license_expired${role}`;
            }
        }
    }, [user?.profile?.renew_date]);

    return (
        <div className="fixed top-1/4 left-1/2 z-50">
            {askForRenew &&
                <AttentionBox interval={RENEW_ALERT_POPUP_INTERVAL} title={"License Expiration Alert"}
                    description={`Your license will expire on ${user?.profile?.renew_date}.`} />
            }
        </div>
    )
}

export default RenewAlert;