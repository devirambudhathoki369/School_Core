import os
import json

import requests

from .utils import get_access_token
from .messaging import build_data_payload
from main.constants.app_notification import NOTIFICATION_CONFIG

FCM_URL = os.environ.get("FCM_URL")
# Instance ID API — server-side topic membership management (no app code needed;
# the app just sends its device token at login and the backend subscribes it).
IID_BATCH_ADD = "https://iid.googleapis.com/iid/v1:batchAdd"
IID_BATCH_REMOVE = "https://iid.googleapis.com/iid/v1:batchRemove"
# FCM caps a single batch subscribe/unsubscribe at 1000 tokens.
IID_MAX_TOKENS = 1000
REQUEST_TIMEOUT = 10


def _oauth_headers():
    return {
        "Authorization": f"Bearer {get_access_token()}",
        "Content-Type": "application/json; UTF-8",
    }


def _iid_headers():
    headers = _oauth_headers()
    # required when the IID API is authenticated with an OAuth2 token (the way
    # the Admin SDK does it) instead of a legacy server key.
    headers["access_token_auth"] = "true"
    return headers


def _batches(tokens):
    for i in range(0, len(tokens), IID_MAX_TOKENS):
        yield tokens[i : i + IID_MAX_TOKENS]


def _manage_topic(url, topic, tokens):
    """
    POST device tokens to an IID batchAdd/batchRemove endpoint, in 1000-token
    batches. Returns the count of tokens the API accepted (no per-token error).
    """
    tokens = [t for t in dict.fromkeys(tokens) if t]  # de-dupe, drop falsy
    if not tokens:
        return 0
    headers = _iid_headers()
    ok = 0
    for batch in _batches(tokens):
        payload = {"to": f"/topics/{topic}", "registration_tokens": batch}
        try:
            res = requests.post(
                url, headers=headers, data=json.dumps(payload), timeout=REQUEST_TIMEOUT
            )
        except requests.RequestException:
            continue
        if res.status_code == 200:
            try:
                results = res.json().get("results", [])
            except ValueError:
                results = []
            # results align with the input order; an empty {} means success.
            ok += sum(1 for r in results if "error" not in r)
    return ok


def subscribe_tokens(topic, tokens):
    """Subscribe device tokens to a topic (batched). Returns count subscribed."""
    return _manage_topic(IID_BATCH_ADD, topic, tokens)


def unsubscribe_tokens(topic, tokens):
    """Unsubscribe device tokens from a topic (batched). Returns count removed."""
    return _manage_topic(IID_BATCH_REMOVE, topic, tokens)


def send_to_topic(topic, title, body, data=None, include_notification=False):
    """
    Send ONE FCM HTTP v1 message that Google fans out to every subscriber of
    `topic` — no per-token loop, so it scales to thousands of devices.

    Data-only by default (title/body in the data payload, like the bus alert) so
    the app renders it even while foregrounded. Returns True if FCM accepted it.
    """
    message = {
        "topic": topic,
        "data": build_data_payload(title, body, data),
        **NOTIFICATION_CONFIG,
    }
    if include_notification:
        message["notification"] = {"title": title, "body": body}
    try:
        res = requests.post(
            FCM_URL,
            headers=_oauth_headers(),
            data=json.dumps({"message": message}),
            timeout=REQUEST_TIMEOUT,
        )
        return res.status_code == 200
    except requests.RequestException:
        return False
