"""Access and refresh tokens of the mobile app (mobile/SPEC.md §3).

Access token: ``mv1.<session id hex>.<expiry unix>.<signature>``, signed with
HMAC-SHA256 and valid for 15 minutes. It names a session; each request still
loads that session, so a session ended on the server stops working at once.

Refresh token: 32 random bytes, kept only as a SHA-256 hash, valid 60 days.
Each refresh returns a new pair and spends the old token. A spent token that
comes back means two copies exist, so the whole session ends.
"""
import base64
import hashlib
import hmac
import secrets
import time
import uuid
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import AppSession, RefreshToken

ACCESS_SECONDS = 15 * 60
REFRESH_DAYS = 60
MAX_SESSIONS_PER_ACCOUNT = 5
PREFIX = "mv1"


def _key(purpose: str) -> bytes:
    """A key per purpose, from MOBILE_TOKEN_KEY or else from SECRET_KEY."""
    base = (getattr(settings, "MOBILE_TOKEN_KEY", "") or settings.SECRET_KEY).encode()
    return hmac.new(base, f"schoolcore.mobileapi.{purpose}".encode(), hashlib.sha256).digest()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def code_hash(code: str) -> str:
    """HMAC of a short code: a plain hash of six digits could be reversed."""
    return hmac.new(_key("code"), code.encode(), hashlib.sha256).hexdigest()


def credential_stamp(account) -> str:
    """Changes whenever the account's password changes (empty for parents)."""
    password = getattr(account, "password", "") or ""
    return sha256_hex(password) if password else ""


def make_access_token(session_id: uuid.UUID, now: float | None = None) -> tuple[str, int]:
    expires = int((now or time.time()) + ACCESS_SECONDS)
    body = f"{PREFIX}.{session_id.hex}.{expires}"
    signature = _b64(hmac.new(_key("access"), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}", expires


def read_access_token(token: str) -> uuid.UUID | None:
    """The session id of a valid, unexpired token, else None."""
    parts = (token or "").split(".")
    if len(parts) != 4 or parts[0] != PREFIX:
        return None
    body = ".".join(parts[:3])
    expected = _b64(hmac.new(_key("access"), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, parts[3]):
        return None
    try:
        if int(parts[2]) <= time.time():
            return None
        return uuid.UUID(hex=parts[1])
    except ValueError:
        return None


def _new_refresh(session: AppSession) -> str:
    raw = _b64(secrets.token_bytes(32))
    now = timezone.now()
    RefreshToken.objects.create(
        session=session, token_hash=sha256_hex(raw), created_at=now, expires_at=now + timedelta(days=REFRESH_DAYS)
    )
    return raw


def token_pair(session: AppSession) -> dict:
    access, expires = make_access_token(session.id)
    return {
        "access_token": access,
        "access_expires_at": expires,
        "refresh_token": _new_refresh(session),
        "token_type": "Bearer",
    }


ACCOUNT_FIELD = {
    AppSession.PARENT: "guardian",
    AppSession.STUDENT: "student_account",
    AppSession.STAFF: "staff_account",
    AppSession.ADMIN: "admin_account",
}


def revoke(sessions, reason: int) -> int:
    return sessions.filter(revoked_at__isnull=True).update(revoked_at=timezone.now(), revoke_reason=reason)


@transaction.atomic
def start_session(*, role: int, account, school, platform: int, device_label: str, app_version: str) -> tuple[AppSession, dict]:
    """A new signed-in phone for `account`, keeping at most five per account."""
    field = ACCOUNT_FIELD[role]
    live = AppSession.objects.select_for_update().filter(
        **{field: account}, revoked_at__isnull=True
    ).order_by("-last_seen_at")
    keep = list(live.values_list("id", flat=True)[: MAX_SESSIONS_PER_ACCOUNT - 1])
    revoke(live.exclude(id__in=keep), AppSession.REPLACED)
    session = AppSession.objects.create(
        role=role,
        school=school,
        platform=platform,
        device_label=device_label[:80],
        app_version=app_version[:20],
        credential_stamp=credential_stamp(account),
        **{field: account},
    )
    return session, token_pair(session)


class RefreshRefused(Exception):
    pass


def refresh(raw_token: str) -> tuple[AppSession, dict]:
    """A new pair for a live refresh token; a reused one ends its session."""
    reused = None
    with transaction.atomic():
        token = (
            RefreshToken.objects.select_for_update()
            .select_related("session")
            .filter(token_hash=sha256_hex(raw_token or ""))
            .first()
        )
        if token is None:
            raise RefreshRefused("unknown")
        session = token.session
        now = timezone.now()
        if token.used_at is not None:
            reused = session
        elif session.revoked_at is not None or token.expires_at <= now:
            raise RefreshRefused("ended")
        else:
            token.used_at = now
            token.save(update_fields=["used_at"])
            return session, token_pair(session)
    # Outside the refused transaction, so the session stays ended.
    revoke(AppSession.objects.filter(pk=reused.pk), AppSession.TOKEN_REUSED)
    raise RefreshRefused("reused")
