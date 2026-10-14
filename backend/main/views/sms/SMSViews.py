from rest_framework.response import Response
from rest_framework import status
import requests
import os
import time
import logging
from datetime import datetime, timezone as dt_timezone

#
from django.core.cache import cache
from django.db.models import Sum

#
from account.auth.Authentication import AdminTokenAuthentication
from account.models import AdminAccount

#
from ..BaseViews import SecuredAPIView
from ...methods.push import _in_background
from ...models.SMSLog import SMSLog, STATUS_FAILED, STATUS_ABORTED

SMS_CREDITS_API = os.environ.get("SMS_CREDITS_API")

logger = logging.getLogger(__name__)

# The provider's credit API is SLOW (~37s) and frequently times out, so we never
# fetch it inline on a dashboard load (that would hang the page). Instead the last
# good balance is cached in Redis and refreshed in a background thread.
CREDITS_CACHE_TTL = 60 * 60 * 6      # keep the last good value up to 6h
CREDITS_REFRESH_AFTER = 60 * 5       # refresh in the background once older than 5m
CREDITS_FAIL_TTL = 60 * 2            # remember a failed fetch so the card stops spinning
# The provider does not take a send off the balance the instant it accepts it.
# Asked straight after a bulk send it still answers with the balance from BEFORE
# the send -- and that answer used to be cached as fresh: a school that had just
# sent 487 dues reminders (1,437 credits) was shown 2,619 on its dashboard while
# the provider's own panel said 1,182. So a balance only counts as current when
# the provider was asked at least this long after the school's last send.
CREDITS_SETTLE = 45
# at most one in-flight refresh per admin (> settle wait + request timeout)
CREDITS_LOCK_TTL = CREDITS_SETTLE + 105
# ...and a large send can take the provider longer than that. An answer whose
# own sent-count has not moved, although we have sent since the last one, is the
# old balance again; it is not accepted until the send is this many seconds old
# (after which the messages were evidently never counted, e.g. all refused).
CREDITS_SETTLE_GIVE_UP = 60 * 10


def _credits_key(admin_id):
    return f"sms_credits:{admin_id}"


def _credits_lock_key(admin_id):
    return f"sms_credits_lock:{admin_id}"


def _credits_fail_key(admin_id):
    return f"sms_credits_fail:{admin_id}"


# keys the provider has used for the balance, in order of preference
_CREDIT_KEYS = ("available_credit", "credit", "credits", "balance", "available_balance")


def _extract_credit(data):
    """Pull a numeric balance out of the provider reply, whatever its shape.
    Returns None when the reply carries no balance (error body, bad token...)."""
    if isinstance(data, dict):
        for key in _CREDIT_KEYS:
            if key in data:
                found = _extract_credit(data[key])
                if found is not None:
                    return found
        # nested envelopes, e.g. {"data": {...}} or per-type {"both": 2723}
        for value in data.values():
            if isinstance(value, (dict, list)):
                found = _extract_credit(value)
                if found is not None:
                    return found
        for key in ("both", "total"):
            if key in data and _is_real_credit(data[key]):
                return data[key]
        return None
    if isinstance(data, list):
        for item in data:
            found = _extract_credit(item)
            if found is not None:
                return found
        return None
    return data if _is_real_credit(data) else None


def _as_number(value):
    """A balance as a number, or None when it is not one ("-", "...", text)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _school_sends(admin_id, answered_ts):
    """What our own SMS log knows that a cached balance may not.

    Returns (when the school last sent anything, as a timestamp -- or None;
    the credits logged AFTER the provider answered at `answered_ts`). A send
    logged after the answer cannot be in it, so taking those credits off never
    counts a message twice. Messages the gateway refused cost nothing and are
    left out. Never raises: the balance must not fail because the log did.
    """
    try:
        sends = SMSLog.objects.filter(school__account_id=admin_id).exclude(
            status__in=(STATUS_FAILED, STATUS_ABORTED)
        )
        last = sends.order_by("-sent_at").values_list("sent_at", flat=True).first()
        if not last:
            return None, 0
        used = 0
        if last.timestamp() > answered_ts:
            since = datetime.fromtimestamp(answered_ts, tz=dt_timezone.utc)
            used = sends.filter(sent_at__gt=since).aggregate(total=Sum("credit"))["total"] or 0
        return last.timestamp(), int(used)
    except Exception:  # pragma: no cover - defensive
        logger.exception("SMS credits: could not read the SMS log for admin %s", admin_id)
        return None, 0


def _reply_predates_sends(admin_id, previous, reply):
    """True when the provider's answer cannot include what the school has just
    sent: our log has sends after the previous answer, the newest of them only
    minutes old, and the provider's own sent-count has not moved since then.

    Such an answer is the old balance over again. Keeping the previous entry
    instead means the credits used are still counted from ITS time, so the
    estimate the school sees stays right until the provider catches up.
    """
    if not previous or not isinstance(reply, dict):
        return False
    before = previous.get("data", {}).get("total_sms_sent")
    after = reply.get("total_sms_sent")
    if before is None or after is None or before != after:
        return False
    last_sent, used = _school_sends(admin_id, previous["ts"])
    return bool(used) and time.time() - last_sent < CREDITS_SETTLE_GIVE_UP


def _is_real_credit(value):
    """True when the provider returned an actual balance (not our '-'/'...' fallbacks)."""
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        return value.strip() not in ("", "-", "...")
    return False


class SMSCredits:
    def sms_credits(self, api_key):
        """Blocking call to the provider. ~37s; only used from a background thread."""
        if not SMS_CREDITS_API:
            return {"available_credit": "-", "error": "SMS_CREDITS_API not configured"}
        try:
            # generous read timeout: this only runs in a background thread (never
            # blocks a request), and the provider regularly takes 35-60s+.
            res = requests.post(SMS_CREDITS_API, {"auth_token": api_key}, timeout=(5, 90))
        except requests.RequestException as exc:
            return {"available_credit": "-", "error": f"provider unreachable: {exc.__class__.__name__}"}
        try:
            return res.json()
        except ValueError:
            return {"available_credit": "-", "error": f"provider HTTP {res.status_code}, non-JSON reply"}

    def _refresh_credits(self, admin_id, api_key, wait=0):
        """Background: fetch the live balance and cache it — but only a real value,
        so a timeout fallback never overwrites a previously good balance. A failed
        fetch is remembered briefly so the dashboard shows "-" instead of spinning.

        `wait` holds the question back (see CREDITS_SETTLE) when the school has
        only just sent something. The entry records when the provider was ASKED
        as well as when it answered: the call takes the best part of a minute,
        and it is the asking time that says which sends the answer can know of."""
        try:
            if wait > 0:
                time.sleep(min(wait, CREDITS_SETTLE))
            asked = time.time()
            data = self.sms_credits(api_key)
            credit = _extract_credit(data)
            if credit is not None:
                reply = dict(data) if isinstance(data, dict) else {}
                reply["available_credit"] = credit
                if _reply_predates_sends(admin_id, cache.get(_credits_key(admin_id)), reply):
                    # not an error, and not news either: ask again later
                    return
                cache.set(
                    _credits_key(admin_id),
                    {"data": reply, "ts": time.time(), "asked": asked},
                    CREDITS_CACHE_TTL,
                )
                cache.delete(_credits_fail_key(admin_id))
            else:
                logger.warning("SMS credits fetch failed for admin %s: %r", admin_id, data)
                message = data.get("error") or data.get("message") if isinstance(data, dict) else None
                cache.set(
                    _credits_fail_key(admin_id),
                    str(message or "Balance unavailable from SMS provider"),
                    CREDITS_FAIL_TTL,
                )
        finally:
            cache.delete(_credits_lock_key(admin_id))

    def refresh_credits_now(self, admin_id, api_key):
        """Kick off an immediate background refresh (no-op if one is already
        in flight). Used right after SMS are sent, when the provider balance
        is known to have changed."""
        # a send has just gone out: give the provider time to take it off first
        if cache.add(_credits_lock_key(admin_id), 1, CREDITS_LOCK_TTL):
            _in_background(self._refresh_credits, admin_id, api_key, CREDITS_SETTLE)

    def cached_credits(self, admin_id, api_key):
        """
        Return the last cached balance immediately and refresh it in the background
        when stale/missing. First-ever call (cold cache) returns a pending marker so
        the client can poll until the background fetch lands.

        With the balance come the facts a reader needs to trust it or not:
          as_of             when the provider gave this figure (epoch seconds)
          stale             present when a newer figure is being fetched -- the
                            cached one is old, or the school has sent since
          used_since        credits our own log recorded after `as_of`
          estimated_credit  available_credit less `used_since`
        """
        entry = cache.get(_credits_key(admin_id))
        now = time.time()
        current, used, wait = False, 0, 0
        if entry:
            last_sent, used = _school_sends(admin_id, entry["ts"])
            asked = entry.get("asked") or entry["ts"]
            settled = last_sent is None or asked >= last_sent + CREDITS_SETTLE
            current = settled and (now - entry["ts"] < CREDITS_REFRESH_AFTER)
            if last_sent is not None:
                wait = max(0, last_sent + CREDITS_SETTLE - now)
        if not current:
            # cache.add is atomic — only one refresh thread per admin at a time
            # (the provider call is ~37s, so without this polling would pile up).
            if cache.add(_credits_lock_key(admin_id), 1, CREDITS_LOCK_TTL):
                _in_background(self._refresh_credits, admin_id, api_key, wait)
        if entry:
            data = dict(entry["data"])
            data["as_of"] = int(entry["ts"])
            if not current:
                data["stale"] = True
            if used:
                data["used_since"] = used
                balance = _as_number(data.get("available_credit"))
                if balance is not None:
                    data["estimated_credit"] = max(0, balance - used)
            return data
        failure = cache.get(_credits_fail_key(admin_id))
        if failure:
            return {"available_credit": "-", "error": failure}
        return {"available_credit": "...", "pending": True}


def refresh_credits_for_api_key(api_key):
    """After SMS go out the provider balance drops, but our cached balance
    doesn't know that. Called from the send paths so every admin dashboard
    using this key picks up the new balance as soon as the provider reports it
    (the fetch itself still runs in the background — sends are never delayed)."""
    if not api_key:
        return
    credits = SMSCredits()
    admin_ids = AdminAccount.objects.filter(sms_api=api_key).values_list("id", flat=True)
    for admin_id in admin_ids:
        credits.refresh_credits_now(admin_id, api_key)


class SMSView(SecuredAPIView, SMSCredits):
    authentication_classes = (AdminTokenAuthentication,)

    def get(self, request):
        user = request.query_params.get("user")
        include_credits = request.query_params.get("include_credits")
        if user:
            if include_credits:
                account = AdminAccount.objects.only("sms_api").filter(id=user).first()
                if account:
                    sms_api = account.sms_api
                    if sms_api:
                        return Response(self.cached_credits(account.id, sms_api))
                    return Response(
                        {"available_credit": "API key not found!"},
                        status=status.HTTP_404_NOT_FOUND,
                    )
        return self.RESPONSE__INVALID_REQUEST
