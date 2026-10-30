import { useCallback, useState } from "react";
import { CheckIcon, Square2StackIcon } from "@heroicons/react/24/outline";

// The pieces a profile's identity band is made of, shared by the student and
// the staff headers so the two profiles read as one design.

export function Fact({ icon: Icon, label, value, href }) {
    if (!value) return null;   // an empty field is noise, not information
    // A number you can ring and an address you can write to. These are the two
    // facts on this card that exist to be ACTED on, and they were flat text.
    const body = (
        <div title={value}
            className={`mt-1 break-words text-[0.875rem] font-semibold leading-[1.3] text-[var(--ink-900)]
                ${href ? 'underline decoration-teal-300 decoration-2 underline-offset-2 hover:text-teal-700' : ''}`}>
            {value}
        </div>
    );
    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-soft)]">
            <Icon className="mt-[3px] h-4 w-4 shrink-0 text-teal-600" />
            <div className="min-w-0">
                {/* muted ink, not the old 3:1 grey: a label is text and is read */}
                <div className="text-[0.6875rem] font-semibold uppercase leading-4 tracking-[0.06em] text-[var(--ink-500)]">{label}</div>
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
export function IdChip({ label, value }) {
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
            className="group inline-flex items-center gap-1.5 rounded-full bg-white py-1 pl-2.5 pr-2
                text-[0.75rem] font-semibold text-[var(--ink-800)] ring-1 ring-[var(--line)]
                transition-colors hover:bg-[var(--surface-soft)] hover:ring-[var(--field-line)]">
            <span className="text-[0.6875rem] uppercase tracking-wide text-[var(--ink-500)]">{label}</span>
            <span className="font-mono tabular-nums">{value}</span>
            {copied
                ? <CheckIcon className="h-3.5 w-3.5 text-[#12723F]" />
                : <Square2StackIcon className="h-3.5 w-3.5 text-[var(--ink-500)] opacity-0 transition-opacity group-hover:opacity-100" />}
        </button>
    );
}

