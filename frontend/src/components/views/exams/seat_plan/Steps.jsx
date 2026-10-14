import { CheckIcon } from "@heroicons/react/24/solid";

export const STEP_ROOMS = "rooms";
export const STEP_SEATING = "seating";

/**
 * The two steps of a seat plan, in the order a school does them: the rooms
 * first, then who sits in them. They are tabs — the number says which comes
 * first, the line under each says what the school already has there.
 *
 *   status  { [step]: { text, done } } — or nothing while it loads
 */
function Steps({ value, onChange, status }) {
    const steps = [
        { id: STEP_ROOMS, no: 1, title: "Rooms", text: "Add the exam rooms and their benches. You do this once." },
        { id: STEP_SEATING, no: 2, title: "Seat students", text: "Choose the exam, send classes to the rooms, then print." },
    ];
    return (
        <div role="tablist" aria-label="Seat plan steps" className="sm:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-3">
            {steps.map((step) => {
                const selected = value === step.id;
                const state = status?.[step.id];
                return (
                    <button key={step.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(step.id)}
                        className={`flex items-start gap-x-3 rounded-xl border p-3.5 text-left transition-colors duration-150
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-ring)]
                            ${selected
                                // the inset line doubles the border without moving the layout
                                ? "border-[var(--t-brand-solid)] bg-[var(--t-brand-tint)] shadow-[inset_0_0_0_1px_var(--t-brand-solid)]"
                                : "border-[var(--line)] bg-white hover:border-[var(--field-line-hover)]"}`}>
                        <span aria-hidden="true"
                            className={`grid place-items-center h-10 w-10 shrink-0 rounded-[10px] text-lg font-bold transition-colors duration-150
                                ${selected ? "bg-[var(--t-brand-solid)] text-white" : "bg-[var(--surface-soft)] text-[var(--ink-500)]"}`}>
                            {/* a finished step you are not on shows its tick */}
                            {state?.done && !selected ? <CheckIcon className="w-5 h-5 text-[var(--t-brand-solid)]" /> : step.no}
                        </span>
                        <span className="min-w-0 flex-1 flex flex-col">
                            {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                            <span className="text-[15px] font-semibold leading-snug text-[var(--ink-900)]">{step.title}</span>
                            <span className="mt-0.5 text-[13px] leading-snug text-[var(--ink-600)]">{step.text}</span>
                            <span className="mt-2 flex items-center gap-x-1.5 min-h-[1.25rem]">
                                {!state
                                    ? <span className="h-2.5 w-28 rounded-full bg-[var(--line)] animate-pulse" aria-hidden="true"></span>
                                    : (
                                        <>
                                            <span aria-hidden="true"
                                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${state.done ? "bg-[var(--t-brand-solid)]" : "bg-[var(--ink-400)]"}`}></span>
                                            <span className={`text-xs font-semibold ${state.done ? "text-[var(--t-brand-ink)]" : "text-[var(--ink-500)]"}`}>
                                                {state.text}
                                            </span>
                                        </>
                                    )}
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default Steps;
