import { InboxIcon } from "@heroicons/react/24/outline";

/**
 * What a screen shows when there is nothing to show yet.
 *
 * The alternative that was in place — a bare string like "No device selected!"
 * dropped into the layout — reads as a bug rather than a state. Worse, it left
 * the rest of the viewport as blank canvas, so the page looked broken instead
 * of waiting.
 *
 * This fills that space deliberately and says what to do next. `hint` is the
 * part that matters: an empty state that only reports emptiness wastes the one
 * moment the user is actually looking for guidance.
 */
function EmptyState({ icon: Icon = InboxIcon, title, hint, action, tone = "neutral" }) {
    const tones = {
        neutral: "text-gray-400 bg-gray-500/5",
        info: "text-sky-500 bg-sky-500/10",
        warn: "text-amber-500 bg-amber-500/10",
    };
    return (
        <div className="app-empty w-full flex flex-col items-center justify-center text-center
            rounded-xl border border-dashed border-blue-gray-100 bg-white/50
            px-6 py-10 sm:py-14">
            <span className={`app-empty-icon grid place-items-center h-14 w-14 rounded-2xl ${tones[tone] || tones.neutral}`}>
                <Icon className="h-7 w-7" />
            </span>
            <h3 className="app-empty-title mt-4 text-base font-semibold text-gray-800">{title}</h3>
            {hint && (
                <p className="app-empty-hint mt-1 max-w-sm text-[0.85rem] leading-5 text-gray-500">{hint}</p>
            )}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export default EmptyState;
