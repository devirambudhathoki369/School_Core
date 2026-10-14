import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { getActiveSplash } from "@/services/functions/splash";

// Superadmin-authored splash shown once per browser session at login.
// Stays open until the user dismisses it (close button or backdrop click).
export default function SplashModal() {
    const [splash, setSplash] = useState(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        (async () => {
            const s = await getActiveSplash();
            if (!s) return;
            const key = `splash_shown_${s.id}`;
            if (typeof window !== "undefined" && sessionStorage.getItem(key)) return;
            setSplash(s);
            setOpen(true);
            if (typeof window !== "undefined") sessionStorage.setItem(key, "1");
        })();
    }, []);

    if (!open || !splash) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
        >
            <div
                className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
                    title="Close"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
                {splash.image && (
                    <img
                        src={splash.image}
                        alt={splash.title || "Notice"}
                        className="w-full max-h-[60vh] object-contain bg-gray-50"
                    />
                )}
                {(splash.title || splash.message) && (
                    <div className="p-4">
                        {splash.title && (
                            <h3 className="text-lg font-bold text-gray-800 mb-1">{splash.title}</h3>
                        )}
                        {splash.message && (
                            <p className="text-sm text-gray-600 whitespace-pre-wrap">{splash.message}</p>
                        )}
                    </div>
                )}
                <div className="px-4 pb-3 pt-1 text-[11px] text-gray-400 text-center">
                    Tap outside or press × to close.
                </div>
            </div>
        </div>
    );
}
