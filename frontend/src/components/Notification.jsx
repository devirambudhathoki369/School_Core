import { useAppContext } from "@/contexts/AppContext";
import getStatusTone, { TONES } from "@/methods/getStatusColor";
import {
    XMarkIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    ExclamationCircleIcon,
    InformationCircleIcon
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useCallback, useState } from "react";

const NOTIFICATION_TIMEOUT = 15 * 1000; // 15 seconds

// One row per tone: the surface, the hairline, the text and the icon that
// carries the meaning. Written out in full because Tailwind only keeps classes
// it can see as complete strings — these must never be built by concatenation.
const TONE_STYLES = {
    [TONES.SUCCESS]: {
        shell: "bg-emerald-50 border-emerald-200 text-emerald-900",
        accent: "bg-emerald-500",
        icon: CheckCircleIcon,
        iconColor: "text-emerald-600"
    },
    [TONES.WARNING]: {
        shell: "bg-amber-50 border-amber-200 text-amber-900",
        accent: "bg-amber-500",
        icon: ExclamationTriangleIcon,
        iconColor: "text-amber-600"
    },
    [TONES.DANGER]: {
        shell: "bg-rose-50 border-rose-200 text-rose-900",
        accent: "bg-rose-500",
        icon: ExclamationCircleIcon,
        iconColor: "text-rose-600"
    },
    [TONES.NEUTRAL]: {
        shell: "bg-white border-blue-gray-200 text-blue-gray-900",
        accent: "bg-blue-gray-400",
        icon: InformationCircleIcon,
        iconColor: "text-blue-gray-500"
    }
};

function Notification() {
    const { notification: { notification, updateNotification } } = useAppContext();
    const timerRef = useRef();
    // Drives the enter transition. The old markup put a ternary on
    // `notification.message` INSIDE a block that only renders when that message
    // exists, so the "hidden" half was unreachable and nothing ever animated.
    const [shown, setShown] = useState(false);

    const clearNotification = useCallback(() => {
        clearTimeout(timerRef.current);
        updateNotification(null, null);
    }, [updateNotification]);

    useEffect(() => {
        clearTimeout(timerRef.current);
        if (notification?.message) {
            const raf = requestAnimationFrame(() => setShown(true));
            timerRef.current = setTimeout(() => {
                updateNotification(null, null);
            }, NOTIFICATION_TIMEOUT);
            return () => { cancelAnimationFrame(raf); clearTimeout(timerRef.current); };
        }
        setShown(false);
        return () => clearTimeout(timerRef.current);
    }, [notification?.message, updateNotification]);

    const tone = TONE_STYLES[getStatusTone(notification?.status)] || TONE_STYLES[TONES.NEUTRAL];
    const Icon = tone.icon;

    return (
        // The live region stays mounted so a screen reader announces each new
        // message; only the card comes and goes.
        // A full-width rail does the centring, so the toast itself never needs a
        // horizontal offset. The previous `fixed w-max mx-auto` gave `mx-auto`
        // no left/right anchor to work against, so a long sentence simply grew
        // past both screen edges and carried its own dismiss button off-screen.
        // `pointer-events-none` stops the empty rail swallowing taps on the page
        // underneath; the card turns them back on for itself.
        <div
            className="fixed inset-x-0 top-0 z-[100] flex justify-center pointer-events-none
                px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
            role="alert"
            aria-live="assertive">
            {notification?.message && (
                <div
                    className={`app-toast pointer-events-auto w-full max-w-md overflow-hidden
                        flex items-start gap-3 rounded-xl border shadow-lg shadow-blue-gray-900/10
                        pe-2 py-2.5 transition-all duration-300 ease-out
                        ${tone.shell}
                        ${shown ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
                    {/* a colour spine, so the meaning reads at a glance */}
                    <span className={`self-stretch w-1 shrink-0 rounded-full ${tone.accent}`} aria-hidden="true" />
                    <Icon className={`h-5 w-5 shrink-0 mt-px ${tone.iconColor}`} aria-hidden="true" />
                    {/* min-w-0 + break-words is what lets a long message wrap
                        instead of forcing the card wider than the screen */}
                    <span className="flex-1 min-w-0 text-sm leading-5 font-medium break-words">
                        {notification.message}
                    </span>
                    <button
                        type="button"
                        onClick={clearNotification}
                        aria-label="Dismiss notification"
                        className="shrink-0 p-1.5 rounded-lg opacity-60 hover:opacity-100
                            hover:bg-black/5 active:bg-black/10 transition">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
}

export default Notification;
