"""
A one-day marker recording that a class's absent-student SMS already went out.

Absent SMS has two triggers — automatic on the app/web attendance save
(ClassAttendanceSerializer) and manual from the "Send Messages" page
(AbsentSMSView, for RFID/UHF schools whose attendance no teacher saves). Both
stamp this marker so the manual page can tell the admin a class has already been
messaged instead of charging the school for a second round of SMS.

Cache-only on purpose: losing it (restart/eviction) only costs the warning, never
attendance data. Prod cache is Redis, so the marker is shared across workers.
"""

from django.core.cache import cache

# a school day is well inside 24h; the marker is only meaningful for "today".
ABSENT_SMS_TTL = 60 * 60 * 24


def absent_sms_key(school_id, class_info_id, date):
    # ids arrive as int (serializer) or str (query params) and the BS date as a
    # string or a nepali_datetime.date — normalise so both callers share a key.
    return f"absent_sms_sent:{school_id}:{class_info_id}:{date}"


def mark_absent_sms_sent(school_id, class_info_id, date):
    try:
        cache.set(absent_sms_key(school_id, class_info_id, date), True, ABSENT_SMS_TTL)
    except Exception:
        # the marker is a convenience — never fail a send over it.
        pass


def absent_sms_already_sent(school_id, class_info_id, date):
    try:
        return bool(cache.get(absent_sms_key(school_id, class_info_id, date)))
    except Exception:
        return False


def absent_sms_sent_classes(school_id, class_info_ids, date):
    """The subset of class ids already messaged today."""
    return [
        cid for cid in class_info_ids if absent_sms_already_sent(school_id, cid, date)
    ]
