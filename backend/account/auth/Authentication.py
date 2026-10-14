from rest_framework.authentication import BaseAuthentication, get_authorization_header
from .AuthToken import (
    AdminAuthToken,
    SuperAdminAuthToken,
    UserAuthToken,
    StaffAuthToken,
    StudentAuthToken,
)
from .UserRole import UserRoles
from rest_framework import exceptions
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.models import ContentType
import logging
import sentry_sdk

#
from main.models.Staff import Staff
from main.models.Student import Student
from main.models.SchoolAdmin import SchoolAdmin
from .context import users_context

COOKIE_NAME = "smsys"
# Methods that change nothing; the cross-site check leaves them alone.
SAFE_METHODS = ("GET", "HEAD", "OPTIONS", "TRACE")

logger = logging.getLogger("django.security")


# TODO : OPTIMIZE AUTHENTICATION !!!
#
class BaseTokenAuthentication(BaseAuthentication):
    """
    Simple token based authentication cloned from rest_framework with custom functionality.

    Clients should authenticate by passing the token key in the "Authorization"
    HTTP header, prepended with the string "Token ".  For example:

        Authorization: Token 401f7ac837da42b97f613d789819ff93537bee6a
    """

    keyword = "IGNITE"  # normally [BEARER, TOKEN] are used
    model = None
    role = None
    # check if school-id is real, if request is from staff/admin/student.
    #
    # Students were left out, so a student token was bound to NO school: the
    # same `?school=` swap the check below stops for staff worked unchanged for
    # every student account, across every endpoint that answers student tokens
    # (rosters, fee ledgers, invoices). A student belongs to exactly one school
    # — the school of their class — so the rule is just as unambiguous.
    SchoolValidationRequiredRoles = (
        UserRoles.ROLE_STAFF,
        UserRoles.ROLE_ADMIN,
        UserRoles.ROLE_STUDENT,
    )

    def get_model(self):
        if self.model is not None:
            return self.model
        from rest_framework.authtoken.models import Token

        return Token

    """
    A custom token model may be used, but must have the following properties.

    * key -- The string identifying the token
    * user -- The user to which the token belongs
    """

    def authenticate(self, request):
        from_cookie = False
        try:
            auth = request.COOKIES.get(COOKIE_NAME)
            if auth:
                auth = auth.encode("utf-8")
                from_cookie = True
            else:
                auth = get_authorization_header(request).split()
                auth = auth[1]  # actual token!
        except:
            return None
        if not auth:
            return None
        auth = [self.keyword.encode("utf-8"), auth]

        if auth[0].lower() != self.keyword.lower().encode():
            return None

        if len(auth) == 1:
            msg = _("Invalid token header. No credentials provided.")
            raise exceptions.AuthenticationFailed(msg)
        elif len(auth) > 2:
            msg = _("Invalid token header. Token string should not contain spaces.")
            raise exceptions.AuthenticationFailed(msg)

        try:
            token = auth[1].decode()
        except UnicodeError:
            msg = _(
                "Invalid token header. Token string should not contain invalid characters."
            )
            raise exceptions.AuthenticationFailed(msg)
        #
        school_id = None
        if self.role in self.SchoolValidationRequiredRoles:
            school_id = self.get_school(request)
        user, auth = self.authenticate_credentials(school_id, token)
        if user and from_cookie and request.method not in SAFE_METHODS:
            self.enforce_trusted_origin(request, user)
        #
        if user:
            user_ip = self._get_remote_addr(request)
            user_type = ContentType.objects.get_for_model(user.__class__)
            user_details = {
                "user_id": user.id,
                "user_type": user_type,
                "ip_address": user_ip,
                "school_id": school_id,
            }
            users_context.set(user_details)
            # Sentry keeps this dict by reference and its scrubber replaces
            # "ip_address" in place with an AnnotatedValue when it sends an
            # event. Handing it `user_details` itself corrupted users_context,
            # and HistoryLog.create then 500'd on the IP field. Give it a copy.
            sentry_sdk.set_user({"id": user.id, "school_id": school_id})
        #
        return (user, auth)

    def enforce_trusted_origin(self, request, user):
        """
        CROSS-SITE REQUEST FORGERY, for sessions carried by the cookie.

        The web session is the `smsys` cookie, set `SameSite=None` because the
        frontend and the API live on different hosts. `None` means the browser
        attaches it to requests that ANY website starts — and nothing checked
        where a write came from: DRF only enforces CSRF for its own session
        authentication, never for a custom token read out of a cookie. So a page
        on any site could auto-submit a form to this API while a school admin
        had it open in another tab, and the write would land as that admin
        (post a notice, send SMS on the school's credits, change a record).
        CORS does not help: it hides the RESPONSE from the other site, it does
        not stop a simple form POST from being sent and acted on.

        The fix is the browser's own statement of where a request came from.
        Every current browser sends `Origin` on a cross-origin POST, PUT, PATCH
        and DELETE, and it cannot be forged by page script. A cookie-borne
        write is accepted only from an origin this API already trusts for CORS
        (the portal's own hosts) or from itself. Everything else that matters
        is untouched:

          · reads (GET/HEAD/OPTIONS) — not state-changing, and CORS already
            keeps their responses from foreign pages;
          · the mobile app — it sends its token in the Authorization header,
            not a cookie, and a native client sends no `Origin`;
          · a request with no `Origin` at all is a non-browser client, unless
            the browser's own `Sec-Fetch-Site` says it was cross-site.

        Refusals are logged to django.security with the account and origin, and
        `ENFORCE_ORIGIN_CHECK=false` in the environment turns the refusal into
        log-only, so a legitimate flow that trips it can be unblocked without a
        redeploy while it is investigated.
        """
        origin = request.META.get("HTTP_ORIGIN")
        if origin:
            if origin in self.trusted_origins(request):
                return
            reason = f"origin {origin}"
        else:
            if request.META.get("HTTP_SEC_FETCH_SITE") != "cross-site":
                return
            reason = "cross-site request without an Origin"
        logger.warning(
            "cross-site write refused: %s %s by %s account %s (%s)",
            request.method,
            request.path,
            self.role,
            getattr(user, "username", "?"),
            reason,
        )
        if getattr(settings, "ENFORCE_ORIGIN_CHECK", True):
            raise exceptions.PermissionDenied(_("Cross-site request refused."))

    @staticmethod
    def trusted_origins(request):
        """The portal's own origins (the CORS allow-list) plus this API's own."""
        trusted = set(getattr(settings, "CORS_ALLOWED_ORIGINS", ()) or ())
        trusted |= set(getattr(settings, "CSRF_TRUSTED_ORIGINS", ()) or ())
        try:
            trusted.add(f"{request.scheme}://{request.get_host()}")
        except Exception:
            pass
        return trusted

    def get_school(self, request):
        params = request.query_params
        data = request.data
        DATA_TYPE_IS_DICT = isinstance(data, dict)
        class_info = data.get("class_info") if DATA_TYPE_IS_DICT else {}
        return (
            params.get("school")
            or params.get("school_id")
            or (data.get("school") if DATA_TYPE_IS_DICT else None)
            or (data.get("school_id") if DATA_TYPE_IS_DICT else None)
            or (class_info.get("school") if isinstance(class_info, dict) else None)
        )

    def authenticate_credentials(self, school_id, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise exceptions.AuthenticationFailed(_("Unauthorized."))

        if not token.user.is_active:
            raise exceptions.AuthenticationFailed(_("User inactive or deleted."))
        # An expired session is deleted, not merely refused: leaving the row in
        # place means the same dead key is re-checked on every subsequent
        # request, and the table only ever grows. The client sees the same
        # "session expired" either way and signs in again.
        if token.is_expired:
            token.delete()
            raise exceptions.AuthenticationFailed(_("Session expired. Please sign in again."))
        #
        # the token row itself travels as `request.auth`, so a view can tell
        # WHICH of the user's devices is making the call (see the device-token
        # refresh endpoint) instead of only who the user is.
        if school_id and not self.belongs_to_school(token.user, school_id):
            # THE TENANT BOUNDARY.
            #
            # This block used to call `.exists()` and THROW THE RESULT AWAY —
            # `Staff.objects.filter(...).exists()` on its own line, then
            # `return (token.user, token)` regardless of what it said. A
            # `.filter()` does not raise when it finds nothing, so the `except`
            # arms could never run either. The whole check was decoration: any
            # signed-in school could read another school's records by changing
            # `?school=` in the URL, which is precisely the "manually entering a
            # URL" bypass this authenticator was written to stop.
            #
            # It matters far beyond one endpoint. Views across the product take
            # `request.query_params.get("school")` and filter on it directly —
            # they trust the authenticator to have already established that the
            # caller owns that school. Making this real closes the hole for
            # every one of them at once, and no view has to change.
            #
            # Logged rather than silently refused, so a legitimate flow that
            # trips it can be found in django-errors.log by school id instead of
            # being reported as "the app randomly signs me out".
            logger.warning(
                "school-scope refused: %s token for account %s requested school %s",
                self.role,
                getattr(token.user, "username", "?"),
                school_id,
            )
            if getattr(settings, "ENFORCE_SCHOOL_SCOPE", True):
                raise exceptions.AuthenticationFailed(
                    _("Not permitted for this school.")
                )
        return (token.user, token)

    def belongs_to_school(self, user, school_id):
        """
        Is this account actually part of the school it is asking about?

        The table to ask is decided by the authenticator's ROLE, not by trying
        both. That is not a style preference: `Staff.account` is a FK to
        StaffAccount, so handing it an AdminAccount raises ValueError rather
        than returning False — which is what the original `try/except` around
        each query was really catching. Selecting on role means one query, no
        exception used as control flow, and no chance of a raised error being
        mistaken for a passed check.

        Both links are OneToOne (a staff account has exactly one Staff row, an
        admin account exactly one SchoolAdmin), so "belongs" is unambiguous and
        cannot be widened by data.

        A school id that is not a number cannot be matched against either table
        — and would make the view's own `filter(school=...)` raise anyway — so
        it is left for the view to reject rather than being turned into a
        confusing authentication failure here.
        """
        try:
            school_id = int(school_id)
        except (TypeError, ValueError):
            return True
        try:
            if self.role == UserRoles.ROLE_ADMIN:
                return SchoolAdmin.objects.filter(
                    id=school_id, account_id=user.pk
                ).exists()
            if self.role == UserRoles.ROLE_STAFF:
                return Staff.objects.filter(
                    school_id=school_id, account_id=user.pk
                ).exists()
            if self.role == UserRoles.ROLE_STUDENT:
                return Student.objects.filter(
                    class_info__school_id=school_id, account_id=user.pk
                ).exists()
        except Exception:
            # Fail CLOSED. A check that cannot be completed is not a check that
            # passed — that conflation is the bug this whole method replaces.
            logger.exception("school-scope check failed for school %s", school_id)
            return False
        return True

    def authenticate_header(self, request):
        return self.keyword

    def _get_remote_addr(self, request):
        forwarded_for = request.headers.get("X-Forwarded-For")
        # Normalize to string
        if forwarded_for is not None and not isinstance(forwarded_for, str):
            forwarded_for = str(forwarded_for)

        # In case there is no proxy, return the original address
        if not forwarded_for:
            remote_addr = request.META.get("REMOTE_ADDR") or ""
            return str(remote_addr)

        # In case of proxy, set 'original' address
        remote_addr: str = str(forwarded_for).split(",")[0].strip()

        # Remove port number from remote_addr
        if "." in remote_addr and ":" in remote_addr:  # IPv4 with port (`x.x.x.x:x`)
            remote_addr = remote_addr.split(":")[0]
        elif "[" in remote_addr:  # IPv6 with port (`[:::]:x`)
            remote_addr = remote_addr[1:].split("]")[0]

        return remote_addr or None


class SuperAdminTokenAuthentication(BaseTokenAuthentication):
    model = SuperAdminAuthToken
    role = UserRoles.ROLE_SUPERADMIN


class UserTokenAuthentication(BaseTokenAuthentication):
    """
    Default User model. Here, for Superuser!
    """

    model = UserAuthToken
    role = UserRoles.ROLE_SUPERUSER


class AdminTokenAuthentication(BaseTokenAuthentication):
    model = AdminAuthToken
    role = UserRoles.ROLE_ADMIN


class StaffTokenAuthentication(BaseTokenAuthentication):
    model = StaffAuthToken
    role = UserRoles.ROLE_STAFF


class StudentTokenAuthentication(BaseTokenAuthentication):
    model = StudentAuthToken
    role = UserRoles.ROLE_STUDENT
