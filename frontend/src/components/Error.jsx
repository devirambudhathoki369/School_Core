import { ExclamationCircleIcon } from "@heroicons/react/20/solid";

/**
 * A field's validation message.
 *
 * Set as a quiet line under the field — an icon and the message in the error
 * red, regular weight, no trailing "!" (every message used to shout, bold and
 * exclaimed, which made a single missing field read like a crash). Styling is
 * `.app-field-error` in globals.css. The parts that matter to assistive tech
 * apply everywhere, because a validation error nobody is told about is a
 * defect at any palette:
 *
 *  · `id` lets the field point at this message with `aria-describedby`, so the
 *    reason a field is rejected is read out with the field instead of being
 *    red text floating below it;
 *  · `role="alert"` announces the message when it appears — validation here is
 *    driven by yup on blur/submit, so the message arrives long after the field
 *    was read and would otherwise be missed entirely.
 */
export function Error({ error, id }) {
    return (
        <>
            {error && (
                <p id={id} role="alert" className="app-field-error">
                    <ExclamationCircleIcon aria-hidden="true" />
                    <span>{error}</span>
                </p>
            )}
        </>
    );
}


export default Error;
