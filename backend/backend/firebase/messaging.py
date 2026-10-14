import os
import json
import requests

from .utils import get_access_token
from main.constants.app_notification import NOTIFICATION_CONFIG

#
FCM_URL = os.environ.get("FCM_URL")
# FCM rejects requests that take too long; keep a sane per-request timeout.
REQUEST_TIMEOUT = 10
# FCM errorCodes that mean the device token is dead and should be cleared.
STALE_TOKEN_ERRORS = {"UNREGISTERED", "INVALID_ARGUMENT"}


def build_data_payload(title, body, data=None):
    """
    Build the `data` block shared by token-targeted and topic-targeted messages.
    Title/body always ride here (so the app can render data-only pushes); extra
    `data` values are coerced to strings, as FCM requires.
    """
    payload_data = {"title": title, "body": body}
    if data:
        payload_data.update({k: str(v) for k, v in data.items()})
    return payload_data


def build_message(token, title, body, data=None, include_notification=True):
    """
    Build a single FCM HTTP v1 message body for one device token.

    With include_notification=True, title/body go in BOTH the `notification`
    block (so the OS auto-displays it when the app is backgrounded) AND in `data`.
    With include_notification=False the message is DATA-ONLY (no `notification`
    block) — exactly like the bus alert — so the app's own handler renders it from
    the `data` payload even while foregrounded.

    A picture is carried as `data["image"]` — a fully-qualified URL — and is
    lifted from there into `notification.image` rather than being passed as its
    own argument. One value, read in one place: the URL the app renders in its
    own UI and the URL the OS draws as a big picture can never disagree.
    Apple additionally needs `mutable-content` before it will fetch the image,
    and an app-side Notification Service Extension to do the fetching.
    """
    image = (data or {}).get("image")
    message = {
        "token": token,
        "data": build_data_payload(title, body, data),
        **NOTIFICATION_CONFIG,
    }
    if include_notification:
        message["notification"] = {"title": title, "body": body}
        if image:
            message["notification"]["image"] = image
            message["apns"] = _with_mutable_content(message.get("apns"))
    return {"message": message}


def _with_mutable_content(apns):
    """A copy of the APNs block with `mutable-content` set.

    Copied rather than mutated: `NOTIFICATION_CONFIG` is a module-level constant
    spread into every message, so editing it in place would leave the flag set
    on every later push in the process.
    """
    apns = {**(apns or {})}
    payload = {**apns.get("payload", {})}
    payload["aps"] = {**payload.get("aps", {}), "mutable-content": 1}
    apns["payload"] = payload
    return apns


def _is_stale_token(response):
    """Detect whether FCM rejected the token because it is invalid/unregistered."""
    if response is None or response.status_code not in (400, 404):
        return False
    try:
        error = response.json().get("error", {})
        # errorCode lives under error.details[].errorCode in v1 responses.
        for detail in error.get("details", []):
            if detail.get("errorCode") in STALE_TOKEN_ERRORS:
                return True
        # fall back to the top-level status string.
        return error.get("status") in STALE_TOKEN_ERRORS
    except ValueError:
        return False


def send_to_token(access_token, token, title, body, data=None, include_notification=True):
    """
    Send one notification to one device token.
    Returns (sent: bool, stale: bool).
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; UTF-8",
    }
    payload = build_message(token, title, body, data, include_notification)
    try:
        res = requests.post(
            FCM_URL, headers=headers, data=json.dumps(payload), timeout=REQUEST_TIMEOUT
        )
    except requests.RequestException:
        return False, False
    if res.status_code == 200:
        return True, False
    return False, _is_stale_token(res)


# per-token delivery outcomes (mirror NotificationHistory status semantics).
RESULT_SENT = "sent"
RESULT_FAILED = "failed"
RESULT_STALE = "stale"


def send_notification(tokens, title, body, data=None, include_notification=True):
    """
    Send the same notification to many device tokens.

    FCM HTTP v1 has no multicast endpoint, so each token is sent individually.
    Returns a summary dict:
        {
            "sent": <count delivered to FCM>,
            "failed": <count not delivered>,
            "stale_tokens": [<tokens FCM reports as invalid/unregistered>],
            "results": {<token>: "sent" | "failed" | "stale", ...},
        }
    `results` lets callers record per-recipient delivery history.
    """
    tokens = [t for t in dict.fromkeys(tokens) if t]  # de-dupe, drop falsy
    summary = {"sent": 0, "failed": 0, "stale_tokens": [], "results": {}}
    if not tokens:
        return summary

    access_token = get_access_token()
    for token in tokens:
        sent, stale = send_to_token(
            access_token, token, title, body, data, include_notification
        )
        if sent:
            summary["sent"] += 1
            summary["results"][token] = RESULT_SENT
        else:
            summary["failed"] += 1
            if stale:
                summary["stale_tokens"].append(token)
                summary["results"][token] = RESULT_STALE
            else:
                summary["results"][token] = RESULT_FAILED
    return summary
