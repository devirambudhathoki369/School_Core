"""
Turning a gateway reply into SMSLog rows.

Every SMS this system sends goes out through one of two functions —
`SMSTemplateMixin.sendSMS` (bulk paths) or `account.utils.send_sms.send_sms`
(single OTP). Both hand their reply here, so a new sending feature gets logged
by using the existing sender rather than by remembering to log.

The provider answers a send with a row per recipient that already carries the
id, network, credit and status the school's report wants, so those are stored as
given instead of being re-derived. Everything below the parser is FALLBACK, for
the cases where there is no usable body: a timeout, a 500, an HTML error page.
A message we cannot confirm still gets a row — a log that silently omits the
failures is worse than no log.
"""

import logging
import math

#
from ..models.SMSLog import (
    SMSLog,
    SMS_TYPE_OTHER,
    SMS_TYPE_OTP,
    STATUS_QUEUED,
    STATUS_FAILED,
)

logger = logging.getLogger(__name__)

# What the school sees instead of a one-time password. The report is visible to
# every admin of the school, and an OTP is live for 20 minutes — printing the
# code there would hand over any student account whose login is in flight.
OTP_MESSAGE_PLACEHOLDER = "OTP (code hidden)"

def looks_like_otp(message):
    """
    A message that is nothing but a short run of digits is a one-time password.

    Live OTP sends are masked at the source because the caller says so, but
    history imported from the provider arrives as raw text with no idea what it
    is — and an OTP printed into a report every admin of the school can read is
    exactly what the masking exists to prevent. Nothing else this system sends
    is a bare 4-8 digit number, so the test is safe in both directions.
    """
    text = str(message or "").strip()
    return text.isdigit() and 4 <= len(text) <= 8


# Nepali mobile prefixes, used ONLY when the gateway did not name the network.
_NETWORKS = {
    "980": "ncell", "981": "ncell", "982": "ncell",
    "984": "ntc", "985": "ntc", "986": "ntc",
    "974": "ntc", "975": "ntc", "976": "ntc",
    "961": "smart", "962": "smart", "988": "smart",
    "972": "utl",
}

# Provider billing: a plain-ASCII part is 160 characters, a Unicode (Devanagari)
# part is 70. Only used for the fallback estimate.
_GSM_PART = 160
_UNICODE_PART = 70


def _network_of(contact):
    digits = "".join(ch for ch in str(contact or "") if ch.isdigit())
    # numbers reach us both bare (98…) and country-coded (97798…)
    if digits.startswith("977"):
        digits = digits[3:]
    return _NETWORKS.get(digits[:3], "")


def _credits_of(text):
    text = text or ""
    part = _GSM_PART if text.isascii() else _UNICODE_PART
    return max(1, math.ceil(len(text) / part))


def _shape_of(body, depth=2):
    """
    A reply's KEYS, with none of its values.

    Enough to teach the parser a shape it does not know yet, without writing a
    message body, a phone number or a live OTP into the server log.
    """
    if isinstance(body, dict):
        if depth <= 0:
            return "{...}"
        return {key: _shape_of(value, depth - 1) for key, value in body.items()}
    if isinstance(body, list):
        return [_shape_of(body[0], depth - 1)] if body else []
    return type(body).__name__


def _rows_from_response(body):
    """The gateway's per-recipient rows, valid and invalid alike, or None when
    the body is not the shape we know."""
    if not isinstance(body, dict):
        return None
    data = body.get("data")
    if not isinstance(data, dict):
        return None
    rows = []
    for key in ("valid", "invalid"):
        entries = data.get(key)
        if isinstance(entries, list):
            rows.extend(e for e in entries if isinstance(e, dict))
    return rows or None


def record_sms(school_id, sms_type, contacts, messages, response=None, failed=False):
    """
    Write one SMSLog row per recipient.

    `contacts`/`messages` are what we asked the gateway to send (parallel lists,
    or single values); `response` is the parsed JSON body if we got one. Never
    raises: logging an SMS must not be able to fail the send that produced it.
    """
    try:
        if not school_id:
            return 0
        if not isinstance(contacts, (list, tuple)):
            contacts = [contacts]
        if not isinstance(messages, (list, tuple)):
            messages = [messages] * len(contacts)
        sms_type = sms_type or SMS_TYPE_OTHER
        # The gateway answers 200 OK even when it refuses the job ("error": true
        # for a bad token or an empty balance), so the HTTP status alone would
        # log a send that never happened as queued. Its own flag decides.
        # Per-recipient rows, when present, still speak for themselves.
        if isinstance(response, dict) and response.get("error") is True:
            failed = True

        rows = _rows_from_response(response)
        if response is not None and not rows:
            # The gateway answered, and we could not find per-recipient rows in
            # what it said. That send is then logged from ESTIMATES — a credit
            # counted off the text length rather than billed, a network read off
            # the number's prefix, and a status that can never become
            # "delivered", because the delivery sync matches on the provider id
            # that only those rows carry.
            #
            # This is not hypothetical: the bulk endpoint (`send-user`, which
            # every feature except the OTP uses) answers in a shape this parser
            # does not know, so most of the report's credit and status columns
            # are our arithmetic rather than the provider's. Only the SHAPE is
            # logged — keys, no values — so the parser can be taught it without
            # a message body or a live code reaching the log.
            logger.warning(
                "SMS reply had no per-recipient rows (school %s, type %s): %s",
                school_id,
                sms_type,
                _shape_of(response, 4),
            )
        logs = []
        if rows:
            # The gateway spoke for itself — store what it said.
            for row in rows:
                text = str(row.get("text") or "")
                logs.append(
                    SMSLog(
                        school_id=school_id,
                        sms_type=sms_type,
                        receiver=str(row.get("mobile") or "")[:20],
                        message=(
                            OTP_MESSAGE_PLACEHOLDER if sms_type == SMS_TYPE_OTP else text
                        ),
                        network=str(row.get("network") or "")[:20],
                        credit=_safe_int(row.get("credit")),
                        status=str(row.get("status") or STATUS_QUEUED)[:20],
                        provider_id=_safe_int(row.get("id"), default=None),
                    )
                )
        else:
            # No usable answer: record the attempt from what we sent.
            for index, contact in enumerate(contacts):
                if not contact:
                    continue
                text = str(
                    messages[index] if index < len(messages) else (messages[-1] if messages else "")
                )
                logs.append(
                    SMSLog(
                        school_id=school_id,
                        sms_type=sms_type,
                        receiver=str(contact)[:20],
                        message=(
                            OTP_MESSAGE_PLACEHOLDER if sms_type == SMS_TYPE_OTP else text
                        ),
                        network=_network_of(contact),
                        credit=0 if failed else _credits_of(text),
                        status=STATUS_FAILED if failed else STATUS_QUEUED,
                    )
                )
        if not logs:
            return 0
        # bulk_create: a 500-recipient send is one INSERT, and it skips the
        # BaseModel history-log signals — an append-only log does not need a
        # second append-only log describing it.
        SMSLog.objects.bulk_create(logs, batch_size=500)
        return len(logs)
    except Exception:
        logger.exception("could not record SMS log for school %s", school_id)
        return 0


def _safe_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
