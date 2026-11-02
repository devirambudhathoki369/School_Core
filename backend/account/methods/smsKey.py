"""What may be saved as a school's SMS API key.

The key box on SMS Settings accepted anything of 5 to 100 characters. A school
typed its results-day announcement into it (school 31, between 2026-10-29 and
2026-11-01). That replaced the real key, so every SMS the school sent failed, and
the OTP screen went on saying "OTP has been sent!".

A gateway token is one unbroken code: every key in use is 64 hex characters. The
rule below is wider than that so a new token format still saves, and still
refuses a sentence, in any language.
"""

import re

SMS_KEY_PATTERN = re.compile(r"^[A-Za-z0-9._-]{20,100}$")

SMS_KEY_REFUSED = (
    "This is not an SMS API key. A key is one long code with no spaces, copied from "
    "the SMS portal. To send a message, use Bulk SMS."
)


def looks_like_sms_key(value):
    return bool(SMS_KEY_PATTERN.match(str(value or "")))
