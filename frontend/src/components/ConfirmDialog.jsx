import { useEffect, useRef, useState } from "react";
import { Dialog, DialogHeader, DialogBody, DialogFooter, Input } from "@material-tailwind/react";
import {
    ExclamationTriangleIcon,
    TrashIcon,
    InformationCircleIcon,
} from "@heroicons/react/24/outline";

/**
 * Confirmation for actions that cannot be undone.
 *
 * Eighteen destructive actions in this app were guarded by `window.confirm()` —
 * deleting a notice, deleting an inventory item, switching a student's
 * transport, and "remove leading zeros from ALL RFID card numbers in this
 * school". A native confirm is the wrong control for all of them:
 *
 *   · it renders in the browser's chrome, so the most dangerous moment in the
 *     product is the one moment that looks like it belongs to no product;
 *   · it cannot show what is about to be lost, only a sentence;
 *   · every option is weighted identically, so "OK" for a delete looks exactly
 *     like "OK" for a save;
 *   · it blocks the JS thread outright — which is also why the browser-driven
 *     tooling in this repo cannot get past one.
 *
 * IT IS NOW EVERY SCHOOL'S DIALOG. It shipped gated behind `data-ui-theme`, so
 * the schools on Classic — most of them — still got the native confirm on the
 * one class of action that cannot be undone. That gate made sense while the
 * theme layer was a colour overlay being proved out; it stopped making sense
 * the moment the question was "does the product warn people properly before it
 * deletes their data". Nothing here reads a theme variable — it is Tailwind
 * classes and Material Tailwind's Dialog, which every school already renders —
 * so there was nothing left for the gate to protect.
 *
 * `window.confirm` remains the fallback for one case only: server-side render,
 * where there is no document to mount a dialog into.
 *
 * The API is a promise so call sites keep the shape they already have:
 *
 *     if (!window.confirm("Delete this item?")) return;
 *     if (!(await confirmAction({ title: "Delete this item?" }))) return;
 */

// A one-slot store. There is never more than one confirmation on screen, and a
// module-level subscription lets non-component code (contexts, service
// helpers) raise one without having to be inside the React tree.
let current = null;
const listeners = new Set();

function publish(next) {
    current = next;
    listeners.forEach((fn) => fn(current));
}

/**
 * @param {object|string} options  A plain string is treated as the title, so
 *   the simplest call sites read the same as the `window.confirm` they replace.
 * @param {string} options.title        The question. Say what will happen.
 * @param {string} [options.body]       The consequence, in a full sentence.
 * @param {string} [options.confirmText] Label for the confirming button.
 * @param {string} [options.cancelText]
 * @param {"danger"|"warning"|"info"} [options.tone="danger"]
 * @param {string} [options.requireText] When set, the confirming button stays
 *   disabled until the user types this exact word. For the handful of actions
 *   that rewrite every row in a school, a click is too cheap.
 * @returns {Promise<boolean>}
 */
export function confirmAction(options) {
    const opts = typeof options === "string" ? { title: options } : (options || {});

    // No DOM (SSR) ⇒ there is nothing to render into. Nothing on the server
    // asks for a confirmation, so this only guards against a future call site
    // doing so by accident.
    if (typeof document === "undefined") {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        publish({
            tone: "danger",
            confirmText: "Delete",
            cancelText: "Cancel",
            ...opts,
            resolve,
        });
    });
}

const TONES = {
    danger: {
        icon: TrashIcon,
        chip: "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
        confirm: "bg-rose-600 hover:bg-rose-700 text-white border-rose-700",
    },
    warning: {
        icon: ExclamationTriangleIcon,
        chip: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
        confirm: "bg-amber-600 hover:bg-amber-700 text-white border-amber-700",
    },
    info: {
        icon: InformationCircleIcon,
        chip: "bg-sky-50 text-sky-600 ring-1 ring-sky-100",
        confirm: "bg-sky-600 hover:bg-sky-700 text-white border-sky-700",
    },
};

/**
 * Mounted once, in `_app`. Renders nothing until something asks it to.
 */
export function ConfirmHost() {
    const [req, setReq] = useState(null);
    const [typed, setTyped] = useState("");
    const cancelRef = useRef(null);

    useEffect(() => {
        const fn = (next) => { setReq(next); setTyped(""); };
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    }, []);

    // The safe option takes focus, not the destructive one. A user who hits
    // Enter or Space out of habit must land on Cancel.
    useEffect(() => {
        if (req) {
            const t = setTimeout(() => cancelRef.current?.focus(), 40);
            return () => clearTimeout(t);
        }
    }, [req]);

    function close(result) {
        req?.resolve?.(result);
        publish(null);
    }

    if (!req) return null;

    const tone = TONES[req.tone] || TONES.danger;
    const Icon = tone.icon;
    const locked = req.requireText && typed.trim() !== req.requireText;

    return (
        <Dialog
            open
            size="xs"
            // Escape and backdrop both mean "no". A destructive dialog that can
            // only be dismissed by choosing one of two buttons is a trap.
            handler={() => close(false)}
            className="app-confirm rounded-2xl"
            aria-labelledby="app-confirm-title">
            <DialogHeader className="flex items-start gap-3 pb-2">
                <span className={`grid place-items-center h-10 w-10 shrink-0 rounded-xl ${tone.chip}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {/* min-w-0 so a long question wraps instead of widening the
                    dialog past the viewport on a phone. */}
                <span id="app-confirm-title" className="min-w-0 text-base font-semibold leading-6 text-blue-gray-900">
                    {req.title}
                </span>
            </DialogHeader>
            <DialogBody className="pt-0 pb-4 text-copy leading-6 text-blue-gray-600">
                {req.body || "This cannot be undone."}
                {req.requireText && (
                    <div className="mt-4">
                        <label className="block text-xs font-semibold text-blue-gray-700 mb-1.5">
                            Type <b className="font-mono">{req.requireText}</b> to confirm
                        </label>
                        <Input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            crossOrigin=""
                            autoComplete="off"
                            label=""
                            className="!text-sm" />
                    </div>
                )}
            </DialogBody>
            <DialogFooter className="gap-2 pt-0">
                <button
                    ref={cancelRef}
                    type="button"
                    onClick={() => close(false)}
                    className="rounded-lg border border-blue-gray-200 bg-white px-4 py-2 text-sm font-semibold
                        text-blue-gray-700 transition hover:bg-blue-gray-50">
                    {req.cancelText}
                </button>
                <button
                    type="button"
                    disabled={locked}
                    onClick={() => close(true)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition
                        disabled:opacity-40 disabled:cursor-not-allowed ${tone.confirm}`}>
                    {req.confirmText}
                </button>
            </DialogFooter>
        </Dialog>
    );
}

export default confirmAction;
