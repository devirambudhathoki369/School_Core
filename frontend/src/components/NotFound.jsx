import { InboxIcon, CursorArrowRaysIcon } from "@heroicons/react/24/outline";
import EmptyState from "@/components/EmptyState";

/**
 * The "there is nothing here" state, used in 50 files.
 *
 * It routes into `EmptyState`, which already existed in this codebase
 * and was being used in exactly ONE file. That component was written to fill
 * the space with a reason instead of leaving blank canvas; wiring `NotFound`
 * into it is what actually puts it on 50 screens.
 *
 * This was themed-only, and the branch it replaced — a centred, underlined
 * `<h6>` — is the reason: an underlined heading floating in the middle of an
 * otherwise blank screen reads as a broken page, on every palette. The
 * distinction it draws below, between "nothing exists" and "choose something
 * first", is the part that actually saves a support call, and Classic schools
 * were not getting it.
 *
 * The one piece of judgement here: half of these call sites are not empty
 * states at all. "Select class!", "Pick an exam to build its seat plan." and
 * their siblings are *instructions* — the screen is waiting on the user, not on
 * data. Rendering those with an empty inbox icon tells the user their records
 * are missing, which is a lie that costs a support call. They are detected and
 * given their own icon and tone, so "nothing exists yet" and "choose something
 * first" stop looking identical.
 */

// Leading verb ⇒ the screen is waiting for the user to make a choice.
const PROMPTING = /^\s*(select|pick|choose|enter|search|set|specify|provide)\b/i;

export function isPrompt(message) {
    return PROMPTING.test(String(message || ""));
}

// The trailing "!" / "!!" belongs to the old inline style; as a heading it just
// reads as shouting. The sentence itself is kept exactly as the caller wrote it.
function asTitle(message) {
    return String(message || "").replace(/[!.]+\s*$/, "");
}

function NotFound({ error = "Not found!!", hint, action, icon }) {
    const prompting = isPrompt(error);
    return (
        <EmptyState
            icon={icon || (prompting ? CursorArrowRaysIcon : InboxIcon)}
            tone={prompting ? "info" : "neutral"}
            title={asTitle(error)}
            hint={hint || (prompting
                ? "Make a selection above and the results will appear here."
                : "Nothing has been recorded for the filters you chose.")}
            action={action}
        />
    )
}

export default NotFound;
