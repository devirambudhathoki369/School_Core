import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";

import { SearchInput } from "@/components/inputs";

// An exam's name as people say it — with its year, since two years can each
// have a "First Terminal Exam".
export function planLabel(plan) {
    return plan?.academic_year_name ? `${plan.name} (${plan.academic_year_name})` : `${plan?.name || "another exam"}`;
}

/**
 * Shown while the exam on screen has no class in any room and the school has
 * already seated another exam: send the same classes to the same rooms instead
 * of choosing them all again.
 *
 *   sources    the exams that have a seating (see `getSeatPlans`), newest first
 *   busy       some write is in flight (nothing may be clicked);
 *   copying    …and it is this copy
 */
function CopyPlan({ sources, busy, copying, onCopy }) {
    const [choice, setChoice] = useState("");
    // the first source is the best guess: the newest exam
    useEffect(() => {
        if (!sources.some((p) => `${p.exam}` === choice)) setChoice(sources[0] ? `${sources[0].exam}` : "");
    }, [sources]);

    if (sources.length === 0) return null;
    const picked = sources.find((p) => `${p.exam}` === choice);

    return (
        <div className="mb-4 rounded-xl border border-[var(--t-brand-line)] bg-[var(--t-brand-tint)] p-3.5 sm:p-4 print:hidden">
            <div className="flex items-start gap-x-3">
                <span aria-hidden="true" className="grid place-items-center h-10 w-10 shrink-0 rounded-[10px] bg-white text-[var(--t-brand-solid)] border border-[var(--t-brand-line)]">
                    <DocumentDuplicateIcon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold leading-snug text-[var(--ink-900)]">Same seating as an earlier exam?</h3>
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--ink-700)]">
                        Send the same classes to the same rooms as an exam you already seated, then change only what is different — or choose the classes yourself below.
                    </p>
                </div>
            </div>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:pl-[3.25rem]">
                <div className="min-w-0 md:flex-1 [&_.app-field-label]:hidden [&_.app-picker-trigger]:mt-0">
                    <SearchInput grid={12}
                        input={{
                            name: "copy-from", label: "exam", hideLabel: true,
                            placeholder: "Choose an exam…", readOnly: busy,
                            options: sources.map((p) => ({
                                value: `${p.exam}`,
                                name: `${planLabel(p)} — ${p.rooms} room${p.rooms === 1 ? "" : "s"}, ${p.seated} seated`,
                            })),
                        }}
                        value={choice}
                        onChange={({ value }) => { if (value) setChoice(`${value}`); }} />
                </div>
                <Button size="sm" color="teal" className="shrink-0" disabled={!picked || busy}
                    onClick={() => onCopy(picked)}>
                    {copying ? "Copying…" : "Use this seating"}
                </Button>
            </div>
            <p className="mt-2 text-xs leading-snug text-[var(--ink-600)] md:pl-[3.25rem]">
                Students are seated from today&apos;s class lists. The earlier exam&apos;s seat plan is not changed.
            </p>
        </div>
    );
}

export default CopyPlan;
