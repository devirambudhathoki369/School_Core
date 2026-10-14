import AttentionBox from "@/components/AttentionBox";
import { smsLength } from "./SMSLength";

const HAS_PLACE_VALUE = /\{\{[^{}]+\}\}/;

/**
 * What a send will cost: { perSMS, total, about }.
 *
 * One credit per recipient is only true of a short message. A Nepali reminder
 * of 201 characters is three — a school that was told "487 credits" for 487
 * students was charged 1,461. `about` is true when the message holds place
 * values, which are filled in per recipient and can change its length.
 */
export function creditsNeeded(recipients, text) {
    const perSMS = smsLength(text).credits;
    return { perSMS, total: recipients * perSMS, about: HAS_PLACE_VALUE.test(`${text || ""}`) };
}

/**
 * The "Review SMS Credits" note above a send: how many recipients, and the
 * credits THIS message needs for them.
 *
 *   recipients  how many will be messaged
 *   noun        "students" / "staff"
 *   text        the message as typed (or the saved template)
 */
function CreditsReview({ recipients, noun = "students", text }) {
    const { perSMS, total, about } = creditsNeeded(recipients, text);
    const lines = [`No. of ${noun} : ${recipients}`];
    if (perSMS === 0) {
        lines.push(`You need at least ${recipients} SMS credits: 1 for each, more if the message is long.`);
        lines.push("Write the message below to see the exact figure.");
    } else {
        lines.push(`This message takes ${perSMS} credit${perSMS === 1 ? "" : "s"} per SMS, so you need ${about ? "about " : ""}${total} SMS credits (${recipients} × ${perSMS}).`);
        lines.push("Check your balance above and buy more credits if needed.");
    }
    return <AttentionBox title="Review SMS Credits" description={lines.join("\n")} />;
}

export default CreditsReview;
