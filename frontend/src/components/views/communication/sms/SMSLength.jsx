// How long a message is and what it costs, counted the way the SMS provider
// counts it: a message in plain English letters is 160 characters to a credit;
// one with any other character in it — Nepali, an emoji, a curly quote — is
// sent as Unicode, 70 characters to a credit.
//
// The same arithmetic as `_credits_of` in the backend's main/methods/smsLog.py —
// change one, change the other.
const ENGLISH_PART = 160;
const UNICODE_PART = 70;

const isPlain = (char) => char.codePointAt(0) < 128;
const isNepali = (char) => { const code = char.codePointAt(0); return code >= 0x0900 && code <= 0x097f; };

/**
 * { language, characters, credits, perCredit, special }
 *   special  the characters that make an otherwise English message Unicode
 */
export function smsLength(text) {
    const message = `${text || ""}`;
    const chars = [...message];
    const plain = chars.every(isPlain);
    const nepali = chars.some(isNepali);
    const perCredit = plain ? ENGLISH_PART : UNICODE_PART;
    return {
        language: plain ? "English" : nepali ? "Nepali" : "Unicode",
        // UTF-16 units, which is what a message is billed in
        characters: message.length,
        credits: message.length ? Math.ceil(message.length / perCredit) : 0,
        perCredit,
        special: plain || nepali ? [] : [...new Set(chars.filter((c) => !isPlain(c) && c.trim()))],
    };
}

/**
 * The line under a message box: language, total characters, credit.
 *
 *   text          the message as typed
 *   placeholders  true when it holds {{place-values}} that are filled in per
 *                 recipient — the sent message is then a little longer or shorter
 */
function SMSLength({ text, placeholders = false }) {
    const { language, characters, credits, perCredit, special } = smsLength(text);
    if (!characters) return null;
    return (
        <div className="mt-1.5 flex flex-col gap-y-1" aria-live="polite">
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[#bae6fd] bg-[#f0f9ff] px-3 py-1.5">
                {[["Language", language], ["Total characters", characters], ["Credit", credits]].map(([label, value]) => (
                    <div key={label} className="flex items-baseline gap-x-1.5">
                        {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                        <dt className="text-[13px] font-medium text-[#0369a1]">{label}:</dt>
                        <dd className="text-[13px] font-bold text-[#0c4a6e]">{value}</dd>
                    </div>
                ))}
                <span className="text-xs text-[#0369a1]">({perCredit} characters per credit, for each SMS sent)</span>
            </dl>
            {special.length > 0 &&
                <p className="text-xs leading-snug text-[#92400e]">
                    <b className="text-xs font-semibold">{special.slice(0, 4).join(" ")}</b> {special.length === 1 ? "is not a plain English character" : "are not plain English characters"}, so
                    this message is sent as Unicode: {UNICODE_PART} characters per credit instead of {ENGLISH_PART}.
                </p>}
            {placeholders &&
                <p className="text-xs leading-snug text-gray-600">
                    Counted as typed. Each {"{{place-value}}"} is replaced by the real name or amount when the SMS is sent, so a message can come out a little longer or shorter.
                </p>}
        </div>
    );
}

export default SMSLength;
