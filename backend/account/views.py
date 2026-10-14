import re
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User

#
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.authentication import get_authorization_header
from rest_framework import permissions, status
from drf_yasg.utils import swagger_auto_schema
from datetime import timedelta

#
from main.views.BaseViews import SecuredAPIView
from .auth.Authentication import (
    UserTokenAuthentication,
    AdminTokenAuthentication,
    SuperAdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
    COOKIE_NAME,
)
from .models import SuperAdminAccount, AdminAccount, StaffAccount, StudentAccount
from .serializers import (
    SuperAdminAccountSerializer,
    StaffAccountSerializer,
    StudentAccountSerializer,
    #
    LoginPayloadSerializer,
    LogoutPayloadSerializer,
    DeviceTokenPayloadSerializer,
    AccountDeletionPayloadSerializer,
    OTPVerificationPayloadSerializer,
    OTPResendParamsSerializer,
)
from .auth.AuthToken import (
    SuperAdminAuthToken,
    AdminAuthToken,
    UserAuthToken,
    StaffAuthToken,
    StudentAuthToken,
)
from .auth.UserRole import UserRoles
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student
from main.models.Staff import Staff
from main.serializers.SchoolAdminSerializer import SchoolAdminSerializer
from main.methods.nepaliDatetime import ndt_today, ndt_today_npt
from main.methods.busTracking import with_tracking_flag
from .methods.getStaffProfile import getStaffProfile
from .methods.getStudentProfile import getStudentProfile
from .methods.extractSchoolSMSAPIKey import extractSchoolSMSAPIKey
from .auth.OTP import BaseOTP
from .utils.send_sms import send_sms


def clear_auth_cookie(res):
    """
    Expire the auth cookie the same way it was set.

    `HttpResponse.delete_cookie` cannot send `Secure`, and a `SameSite=None`
    cookie without `Secure` is rejected outright by the browser — so the delete
    silently did nothing and the stale cookie stayed in the jar. Overwriting it
    with an empty, already-expired value carrying the original attributes is
    what actually removes it.
    """
    res.set_cookie(
        key=COOKIE_NAME,
        value="",
        max_age=0,
        httponly=True,
        secure=True,
        samesite="None",
    )
    return res


#
ADMIN_PROFILE_RETURN_FIELDS = (
    "id",
    "name",
    "address",
    "contact",
    "telephone",
    "estd_date",
    "pan_no",
    "email",
    "contact",
    "renew_date",
    "economic_year",
    "economic_year__name",
    "slogan",
    "about_us",
    "logo",
    "award_logo",
    "sign",
    "exam_coordinator_sign",
    "account",
    "preferences",
    # The interface theme rides along with the profile so the app can draw its
    # first paint in the right colours — fetching it separately would show every
    # school the default palette for a moment before correcting itself.
    "ui_theme",
    "test_account",
    "uses_mobile_app",
    # MODULE ACCESS. Rides along with the profile for the same reason `ui_theme`
    # does: the rail is drawn on first paint, and a menu that appears a moment
    # after the page does reads as a glitch. The frontend gates the Hostel menu
    # AND its view map on this (configs/moduleGates.js); the backend refuses the
    # endpoints regardless, so this flag is convenience, never the protection.
    "uses_hostel",
    "uses_extra_billing",
    "time_set_required",
    "attendance_in_time",
    "attendance_out_time",
)


# ---------------------------------------------------------------------------
# SIGN-IN ABUSE CONTROL
#
# There was none. `/auth/<role>/signin` accepted unlimited guesses at unlimited
# speed, and the two failure paths answered differently — a missing account got
# 404 "Account doesn't exist!" while a wrong password got 401 "Incorrect
# username or password!" — so the endpoint would happily confirm which
# usernames are real before anyone tried a single password.
#
# Both are fixed here rather than in a middleware so the blast radius is exactly
# one endpoint: nothing else on this backend changes behaviour, which matters on
# a box that also serves sixteen live RFID readers.
#
# Counting is keyed on the USERNAME, not the IP. Every member of staff at a
# school shares one office IP, so an IP-keyed limit would lock out a whole
# school because one person mistyped their password; a username-keyed one
# affects only the account actually under attack. The IP is included in the key
# for the anonymous case where no username is supplied at all.

# A wrong password and an unknown username must be indistinguishable, in the
# text AND in the status code.
INVALID_CREDENTIALS = "Incorrect username or password!"
LOGIN_MAX_FAILURES = 10
LOGIN_LOCKOUT_SECONDS = 15 * 60


def _login_throttle_key(username, request):
    who = (username or "").strip().lower() or f"ip:{request.META.get('REMOTE_ADDR', '?')}"
    return f"login-fail:{who}"


def _login_is_locked(username, request):
    return (cache.get(_login_throttle_key(username, request)) or 0) >= LOGIN_MAX_FAILURES


def _login_record_failure(username, request):
    """
    Count one failed attempt, and keep the window rolling.

    `cache.add` then `cache.incr` rather than get/set: incr is atomic, so two
    workers racing on the same account cannot both read 9 and both write 10.
    """
    key = _login_throttle_key(username, request)
    cache.add(key, 0, LOGIN_LOCKOUT_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        # the entry expired in the gap between add and incr — start again
        cache.set(key, 1, LOGIN_LOCKOUT_SECONDS)


def _login_clear_failures(username, request):
    cache.delete(_login_throttle_key(username, request))


def _login_rejected(username, request, message=INVALID_CREDENTIALS):
    """Every failed sign-in leaves through here, so none of them can drift."""
    _login_record_failure(username, request)
    return Response({"message": message}, status=status.HTTP_401_UNAUTHORIZED)


# TODO: Login & Obtain views -> send id of user in key account
#
class LoginView(APIView):
    """
    - for superadmin login, check_superuser is true which lets us login as superuser.
    - for others, it's works...but no need of role?
    """

    permission_classes = (permissions.AllowAny,)
    role = None
    check_superuser = False
    Model = None
    Token = None

    """ def handleTokenExpiration(self, user):
        token, isNew = self.Token.objects.get_or_create(user=user)
        # print(token.key, token.created, isNew)
        if not isNew:
            # calculate token expiration and handle token update then return updated token.
            one_day_ago = timezone.now() - timedelta(days=1)
            if one_day_ago>=token.created:
                token.delete()
                token = self.Token.objects.create(user=user)
                return token.key
        return token.key
    
    def tokenExpiryDate(self, token):
        expiry_date =token.created+timedelta(days=1)
        expiry_timestamp = int(time.mktime(expiry_date.timetuple()))
        return expiry_timestamp """

    def assignUserModel(self, role):
        if role == UserRoles.ROLE_STAFF:
            self.Model = StaffAccount
            self.role = UserRoles.ROLE_STAFF
            self.Token = StaffAuthToken
        elif role == UserRoles.ROLE_STUDENT:
            self.Model = StudentAccount
            self.role = UserRoles.ROLE_STUDENT
            self.Token = StudentAuthToken
        elif role == UserRoles.ROLE_ADMIN:
            self.Model = AdminAccount
            self.role = UserRoles.ROLE_ADMIN
            self.Token = AdminAuthToken

    @swagger_auto_schema(
        operation_id="auth_login",
        operation_summary="Role based login",
        request_body=LoginPayloadSerializer,
    )
    def post(self, request):
        """
        Login api for different users based on the given role i.e. either "student" or "staff".
        """
        username = request.data.get("username")
        password = request.data.get("password")
        role = request.data.get("role")
        if role:
            self.assignUserModel(role)
        if _login_is_locked(username, request):
            return Response(
                {
                    "message": "Too many failed sign-in attempts. "
                    "Please wait 15 minutes and try again."
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        message = {}
        user = None
        token = None
        try:
            if self.Model:
                user = self.Model.objects.get(username=username, verified=True)
        except self.Model.DoesNotExist:
            if self.check_superuser:
                try:
                    user = User.objects.get(username=username)
                except User.DoesNotExist:
                    # Was 404 "Account doesn't exist!" — a free username oracle.
                    return _login_rejected(username, request)
            else:
                return _login_rejected(username, request)
        # user found, proceed further for pw validation and token management;
        if user is not None:
            # message['user']={}
            try:
                s = user.check_password(password)
                if not s:
                    return _login_rejected(username, request)
                app_device_token = request.data.get("device_token")
                # token generation
                # a sign-in always mints its OWN token. Reusing one row per user
                # (the old get_or_create) meant two devices shared a key, so a
                # logout on one killed the other's session too.
                if self.check_superuser:
                    if getattr(user, "is_superuser", False):
                        self.role = "superuser"  # has higher level permissions;
                        token = UserAuthToken.issue(user, app_device_token)
                if token is None:
                    token = self.Token.issue(user, app_device_token)
                # the password was right, so the run of failures is over
                _login_clear_failures(username, request)
                # update last-login, app-device-token
                if app_device_token and self.role in [
                    UserRoles.ROLE_STAFF,
                    UserRoles.ROLE_STUDENT,
                ]:
                    user.app_device_token = app_device_token
                user.last_login = timezone.now()
                user.save()
                # subscribe a student's device to its school topic so school-wide
                # notices reach it via a single topic send (no per-token loop).
                if app_device_token and self.role == UserRoles.ROLE_STUDENT:
                    from main.methods.push import subscribe_student_to_school

                    subscribe_student_to_school(user, app_device_token)
                # prepare response;
                message["message"] = "Login successful!"
                message["user"] = {
                    "username": user.username,
                    "role": self.role,
                    "today": ndt_today(),
                    # The server clock is UTC and Nepal is UTC+05:45, so between
                    # midnight and 05:45 in Kathmandu `today` above is still
                    # YESTERDAY's BS date. Anything stamped by the Nepal clock —
                    # the SMS log, and the 04:00 jobs that write into it — would
                    # then be filed under a day the screen never asks for. This
                    # is that same day read off Nepal's clock; it is offered
                    # alongside `today` rather than replacing it so nothing that
                    # already pairs with the server's day quietly shifts.
                    "today_npt": ndt_today_npt(),
                    "token": token.key,
                }
                # for admins, fetch more info:
                user_profile = {}
                if self.role == UserRoles.ROLE_ADMIN:
                    user_profile = (
                        SchoolAdmin.objects.filter(account=user)
                        .values(*ADMIN_PROFILE_RETURN_FIELDS)
                        .first()
                    )
                    # MODULE ACCESS, like `uses_hostel` -- but nobody switches
                    # this one on: a school has bus tracking exactly when it has
                    # a bus to track (main/methods/busTracking.py).
                    with_tracking_flag(user_profile, (user_profile or {}).get("id"))
                elif self.role == UserRoles.ROLE_STAFF:
                    user_profile = getStaffProfile(user)
                elif self.role == UserRoles.ROLE_STUDENT:
                    user_profile = getStudentProfile(user)
                message["user"]["profile"] = user_profile
                #
                res = Response(message, status=status.HTTP_200_OK)
                if token:
                    # A `domain` was computed here ("smsys.vercel.app", or
                    # ".nirsabi.com") and then never passed to `set_cookie` —
                    # dead code that read as if the cookie were being scoped to
                    # a parent domain when it has always been host-only. Removed
                    # rather than wired up: host-only is the tighter of the two,
                    # and `clear_auth_cookie` deletes it with matching
                    # attributes, which a domain cookie would have broken.
                    res.set_cookie(
                        key=COOKIE_NAME,
                        value=token.key,
                        max_age=timedelta(days=3),
                        httponly=True,
                        secure=True,
                        samesite="None",
                    )
                return res
            except Exception:
                return _login_rejected(username, request, "Login failed!")
        return Response(
            {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
        )


# ---
# LOGIN VIEWS
class SuperAdminLoginView(LoginView):
    Model = SuperAdminAccount
    check_superuser = True
    role = UserRoles.ROLE_SUPERADMIN
    Token = SuperAdminAuthToken
    swagger_schema = None


class AdminLoginView(LoginView):
    Model = AdminAccount
    role = UserRoles.ROLE_ADMIN
    Token = AdminAuthToken
    swagger_schema = None


class StaffLoginView(LoginView):
    Model = StaffAccount
    role = UserRoles.ROLE_STAFF
    Token = StaffAuthToken
    swagger_schema = None


class StudentLoginView(LoginView):
    Model = StudentAccount
    role = UserRoles.ROLE_STUDENT
    Token = StudentAuthToken
    swagger_schema = None


# ---
# OBTAIN VIEWS [Token based login]
class ObtainView(APIView):
    Token = None
    role = None
    check_superuser = False
    allowed_roles = [UserRoles.ROLE_ADMIN, UserRoles.ROLE_STAFF, UserRoles.ROLE_STUDENT]

    def assignToken(self, user_role):
        if user_role == UserRoles.ROLE_ADMIN:
            self.Token = AdminAuthToken
        elif user_role == UserRoles.ROLE_STAFF:
            self.Token = StaffAuthToken
        elif user_role == UserRoles.ROLE_STUDENT:
            self.Token = StudentAuthToken
        self.role = user_role

    @swagger_auto_schema(
        operation_id="auth_obtain",
        operation_summary="Role based token validation",
    )
    def get(self, request):
        """
        Token validation. Returns acccount and profile details.
        Requires `token` in header/cookie.
        """
        user_role = request.query_params.get("role") or None
        if not self.role and user_role and user_role in self.allowed_roles:
            self.assignToken(user_role)
        USER_NOT_FOUND = Response({"message": "User not found!"})
        user = {"username": "", "role": self.role}
        try:
            token = request.COOKIES.get(COOKIE_NAME)
            if not token:
                token = get_authorization_header(request).split()
                token = token[1].decode("utf-8")
        except:
            return Response({})
        if not token:
            return USER_NOT_FOUND
        token_obj = None
        try:
            token_obj = self.Token.objects.get(key=token)
        except self.Token.DoesNotExist:
            if not self.check_superuser:
                return USER_NOT_FOUND
            try:
                # print('checking on superuser')
                token_obj = UserAuthToken.objects.get(key=token)
                user["role"] = UserRoles.ROLE_SUPERUSER
            except UserAuthToken.DoesNotExist:
                del user["role"]
                return USER_NOT_FOUND
        # A token this view accepts is a token the whole API accepts, so the
        # same expiry rule has to apply here — otherwise an expired session
        # would still restore a signed-in-looking page and then fail on the
        # first real request.
        if token_obj and token_obj.is_expired:
            token_obj.delete()
            return clear_auth_cookie(
                Response({"message": "Session expired. Please sign in again."})
            )
        #
        if token_obj:
            user["username"] = token_obj.user.username
            user["token"] = token
            # for admin, extract more information;
            if self.role == UserRoles.ROLE_ADMIN:
                user_profile = (
                    SchoolAdmin.objects.filter(account=token_obj.user)
                    .values(*ADMIN_PROFILE_RETURN_FIELDS)
                    .first()
                )
                user["profile"] = SchoolAdminSerializer(user_profile).data
                with_tracking_flag(user["profile"], (user_profile or {}).get("id"))
            elif self.role == UserRoles.ROLE_STAFF:
                user["profile"] = getStaffProfile(token_obj.user)
            elif self.role == UserRoles.ROLE_SUPERADMIN:
                user["profile"] = {}
            user["today"] = ndt_today()
            # Nepal's own day — see the note where the login payload sets it.
            user["today_npt"] = ndt_today_npt()
            return Response({"user": user})
        return Response({})


class SuperAdminObtainView(ObtainView):
    Token = SuperAdminAuthToken
    check_superuser = True
    role = UserRoles.ROLE_SUPERADMIN
    swagger_schema = None


class AdminObtainView(ObtainView):
    Token = AdminAuthToken
    role = UserRoles.ROLE_ADMIN
    swagger_schema = None


class StaffObtainView(ObtainView):
    Token = StaffAuthToken
    role = UserRoles.ROLE_STAFF
    swagger_schema = None


# ---
# REGISTRATION VIEWS
class RegistrationView(APIView):
    """
    Self-registration for student/teacher.
    """

    permission_classes = (permissions.AllowAny,)
    Serializer = None
    _user = None
    otp_verification = False

    def post(self, request):
        serializer = self.Serializer(data=request.data)
        if serializer.is_valid():
            ins = serializer.save(otp_verification=self.otp_verification)
            #
            data = {
                "id": ins.id,
                "username": ins.username,
            }
            if hasattr(ins, "full_name"):
                data["full_name"] = getattr(ins, "full_name")
            return Response(
                {
                    "message": f"{self._user} account created!",
                    "data": data,
                },
                status=status.HTTP_200_OK,
            )
        else:
            if "username" in serializer.errors:
                return Response(
                    {"message": "Username already exists!"},
                    status=status.HTTP_409_CONFLICT,
                )
            # print(serializer.errors)
        return Response(
            {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
        )


class InternalRegistrationView(RegistrationView):
    """
    Account registration done by admins/superadmins/high-level operator.
    """

    permission_classes = (permissions.IsAuthenticated,)
    # authentication_classes=()


class SuperAdminRegistrationView(InternalRegistrationView):
    """By superuser/high-level"""

    Serializer = SuperAdminAccountSerializer
    authentication_classes = (UserTokenAuthentication,)
    swagger_schema = None
    _user = "Superadmin"


class StaffRegistrationView(InternalRegistrationView):
    Serializer = StaffAccountSerializer
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    swagger_schema = None
    _user = "Staff"
    # try each authenticator in turn (plain APIView stops at the first refusal)
    perform_authentication = SecuredAPIView.perform_authentication

    def post(self, request):
        # the staff record getting the login must be in the caller's school
        schools = caller_school_ids(request)
        staff_id = str(request.data.get("staff") or "")
        if schools is not None and not (
            staff_id.isdigit()
            and Staff.objects.filter(id=staff_id, school_id__in=schools).exists()
        ):
            return Response(
                {"message": "You can't create an account for this staff!"},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().post(request)


class StudentRegistrationView(RegistrationView):
    Serializer = StudentAccountSerializer
    _user = "Student"
    swagger_schema = None
    otp_verification = True


#
# LIST VIEWS
class SuperAdminListView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    authentication_classes = (UserTokenAuthentication,)
    swagger_schema = None

    def get(self, request):
        items = SuperAdminAccount.objects.values("full_name", "username")
        serializer = SuperAdminAccountSerializer(items, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


#
class OTPVerificationView(APIView, BaseOTP):
    @swagger_auto_schema(
        operation_id="auth_otp_verification",
        request_body=OTPVerificationPayloadSerializer,
    )
    def post(self, request):
        """
        OTP verification api [Only for students!]
        """
        username = request.data.get("username")
        otp = request.data.get("otp")
        user = StudentAccount.objects.get(username=username, verified=False)
        if user:
            isExpired = self.isOTPExpired(user)
            if isExpired:
                return Response(
                    {"message": "OTP has expired!"}, status=status.HTTP_400_BAD_REQUEST
                )
            if self.verifyOTP(user, otp):
                user.verified = True
                user.otp = None
                user.secret = None
                user.save()
                return Response({"message": "Verified!"}, status=status.HTTP_200_OK)
            else:
                return Response(
                    {"message": "Verification failed!"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(
            {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
        )


class OTPView(APIView, BaseOTP):
    @swagger_auto_schema(
        operation_id="auth_otp_resend",
        query_serializer=OTPResendParamsSerializer,
    )
    def get(self, request):
        """
        OTP resend api [Only for student!]
        """
        # rn, only for student!
        username = request.query_params.get("username")
        contact = request.query_params.get("contact")
        if username and contact:
            try:
                student = (
                    Student.objects.select_related("class_info__school", "account")
                    .only("class_info__school", "account")
                    .get(account__username=username)
                )
                if student:
                    school_sms_api_key = extractSchoolSMSAPIKey(
                        student.class_info.school.id
                    )
                    if school_sms_api_key:
                        otp, secret = self.generateOTP()
                        user = student.account
                        user.secret = secret
                        user.otp = otp
                        user.verified = False
                        user.created_at = timezone.now()
                        user.save()
                        send_sms(
                            contact,
                            otp,
                            school_sms_api_key,
                            school=student.class_info.school.id,
                        )
                        return Response({"message": "OTP has been sent!"})
            except Exception as e:
                # print(e)
                pass
        return Response(
            {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
        )


def caller_school_ids(request):
    """
    Schools the signed-in admin/staff account belongs to; None for a
    superadmin, who is not bound to any one school.
    """
    if isinstance(request.auth, AdminAuthToken):
        return set(
            SchoolAdmin.objects.filter(account_id=request.user.pk).values_list(
                "id", flat=True
            )
        )
    if isinstance(request.auth, StaffAuthToken):
        return set(
            Staff.objects.filter(account_id=request.user.pk).values_list(
                "school_id", flat=True
            )
        )
    return None


class PasswordChangeView(SecuredAPIView):
    # change get_authenticators method as we allow more users here!
    # Staff tokens too: a staff member whose menu opens staff profiles must be
    # able to use that profile's Account tab (see can-view-can-act). The id in
    # the payload is scoped to the caller's own school below.
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
    )
    AccountModel = None
    TokenModel = None

    def assignModels(self, role):
        if role == UserRoles.ROLE_STAFF:
            self.AccountModel = StaffAccount
            self.TokenModel = StaffAuthToken
        elif role == UserRoles.ROLE_ADMIN:
            self.AccountModel = AdminAccount
            self.TokenModel = AdminAuthToken
        return self.AccountModel and self.TokenModel

    def may_change(self, request, role, user_id):
        schools = caller_school_ids(request)
        if schools is None:  # superadmin
            return True
        if role == UserRoles.ROLE_STAFF:
            return Staff.objects.filter(
                account_id=user_id, school_id__in=schools
            ).exists()
        # a school admin account: only its owner, never a staff member
        return isinstance(request.auth, AdminAuthToken) and str(
            request.user.pk
        ) == str(user_id)

    def put(self, request):
        role = request.data.get("role")
        password = request.data.get("password")
        confirm_password = request.data.get("confirm_password")
        user_id = request.data.get("user")
        # No target id = the caller's own account. The Settings page sends
        # role "admin" + `profile.account`, and a staff profile carries no
        # `account`, so a staff member changing their own password arrived
        # here with no id and got "Invalid request!".
        if not user_id and isinstance(request.auth, (AdminAuthToken, StaffAuthToken)):
            user_id = request.user.pk
            role = (
                UserRoles.ROLE_STAFF
                if isinstance(request.auth, StaffAuthToken)
                else UserRoles.ROLE_ADMIN
            )
        assigned = self.assignModels(role)

        if (
            password
            and password == confirm_password
            and str(user_id or "").isdigit()
            and assigned
        ):
            if not self.may_change(request, role, user_id):
                return Response(
                    {"message": "You can't change this account's password!"},
                    status=status.HTTP_403_FORBIDDEN,
                )
            try:
                acc = self.AccountModel.objects.get(id=user_id)
                with transaction.atomic():
                    acc.set_password(password)
                    acc.save()
                    # a password change must end EVERY session, not just one —
                    # that is the whole point of changing it. With one token per
                    # device, deleting a single row would have left the other
                    # devices signed in on the old password.
                    self.TokenModel.objects.filter(user=user_id).delete()
                    return Response({"message": "Password changed!"})
            except self.AccountModel.DoesNotExist:
                return Response(
                    {"message": "Account not found!"},
                    status=status.HTTP_404_NOT_FOUND,
                )
            except:
                return Response(
                    {"message": "Password change failed!"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return self.RESPONSE__INVALID_REQUEST


class OwnPasswordChangeView(SecuredAPIView):
    """
    A superadmin (or the superuser, who signs in through the same portal)
    changes THEIR OWN password. The account is always the signed-in one — no
    `user` id is taken from the payload — and the current password must be
    re-entered, so a borrowed open session alone cannot lock the owner out.
    """

    authentication_classes = (
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    def put(self, request):
        current_password = request.data.get("current_password") or ""
        password = (request.data.get("password") or "").strip()
        confirm_password = (request.data.get("confirm_password") or "").strip()
        acc = request.user

        if not acc.check_password(current_password):
            return Response(
                {"message": "Current password is incorrect!"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if password != confirm_password:
            return Response(
                {"message": "Passwords do not match!"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # same rule the form enforces (strong_password in schemas/validations)
        if not (
            6 <= len(password) <= 20
            and re.search(r"[a-z]", password)
            and re.search(r"[A-Z]", password)
            and re.search(r"[0-9]", password)
            and re.search(r"[@$!%*#?&]", password)
        ):
            return Response(
                {
                    "message": "Password must be 6-20 characters with upper and lower case letters, a number and one of @$!%*#?&"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if acc.check_password(password):
            return Response(
                {"message": "New password must differ from the current one!"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            acc.set_password(password)
            acc.save()
            # end every session of this account, this one included
            type(request.auth).objects.filter(user=acc).delete()
        res = Response({"message": "Password changed! Please sign in again."})
        clear_auth_cookie(res)
        return res


class AccountView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication,)
    allowed_fields = ["sms_api"]

    def get(self, request):
        role = request.query_params.get("role")
        user_id = request.query_params.get("user")
        fields = request.query_params.getlist("fields[]")
        Account = None
        if role == UserRoles.ROLE_STAFF:
            Account = StaffAccount
        elif role == UserRoles.ROLE_ADMIN:
            Account = AdminAccount
        if (
            user_id
            and Account
            and isinstance(fields, list)
            and len(fields) > 0
            and all(field in self.allowed_fields for field in fields)
        ):
            acc = Account.objects.filter(id=user_id).values(*fields).first()
            return Response(acc)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        role = request.data.get("role")
        sms_api = request.data.get("sms_api")
        user_id = request.data.get("user")
        Account = None
        if role == UserRoles.ROLE_STAFF:
            Account = StaffAccount
        elif role == UserRoles.ROLE_ADMIN:
            Account = AdminAccount
        if user_id and Account:
            # update sms-api-key!
            if sms_api and role == UserRoles.ROLE_ADMIN:
                acc = Account.objects.get(id=user_id)
                if acc:
                    acc.sms_api = sms_api
                    acc.save()
                    return Response({"message": "Account Info updated!"})
        return self.RESPONSE__INVALID_REQUEST


class ProfileView(SecuredAPIView):
    authentication_classes = (
        StudentTokenAuthentication,
        StaffTokenAuthentication,
        AdminTokenAuthentication,
    )
    allowed_roles = [
        UserRoles.ROLE_STUDENT,
        UserRoles.ROLE_STAFF,
        UserRoles.ROLE_ADMIN,
    ]
    include_docs = True

    def get(self, request):
        """
        Get user's profile just using token.
        Requires `token` in cookie/header.
        """
        user_role = getattr(request, "user_role", None)
        if user_role in self.allowed_roles:
            profile = None
            user = getattr(request, "user", None)
            if user_role == UserRoles.ROLE_ADMIN:
                profile = (
                    SchoolAdmin.objects.filter(account=user)
                    .values(*ADMIN_PROFILE_RETURN_FIELDS)
                    .first()
                )
                with_tracking_flag(profile, (profile or {}).get("id"))
            elif user_role == UserRoles.ROLE_STAFF:
                profile = getStaffProfile(user)
            elif user_role == UserRoles.ROLE_STUDENT:
                profile = getStudentProfile(user)
            return Response(profile)
        return self.RESPONSE__INVALID_REQUEST


# ---
# DEVICE TOKEN VIEW
class DeviceTokenView(SecuredAPIView):
    """
    Update the stored firebase device token WITHOUT a re-login.

    The app must call this on `FirebaseMessaging.onTokenRefresh` (and right after
    it first obtains a token post-login). Firebase rotates tokens on its own, so
    relying only on the login payload leaves stale tokens in the DB and pushes
    silently fail. Same write the login path does (views.py login), but callable
    any time with just the auth token.
    """

    authentication_classes = (
        StudentTokenAuthentication,
        StaffTokenAuthentication,
    )
    allowed_roles = [UserRoles.ROLE_STUDENT, UserRoles.ROLE_STAFF]
    include_docs = True

    @swagger_auto_schema(
        operation_id="update_device_token",
        operation_summary="Update firebase device token (student/staff)",
        request_body=DeviceTokenPayloadSerializer,
    )
    def post(self, request):
        """
        Store a fresh device token for the authenticated student/staff.
        Requires `token` in cookie/header and `device_token` in the body.
        """
        user_role = getattr(request, "user_role", None)
        if user_role not in self.allowed_roles:
            return self.RESPONSE__INVALID_REQUEST

        new_token = (request.data.get("device_token") or "").strip()
        if not new_token:
            return self.RESPONSE__INVALID_REQUEST

        user = getattr(request, "user", None)
        if user is None:
            return self.RESPONSE__INVALID_REQUEST

        # remember it against THIS session too, so signing out here only
        # unregisters this device's push and leaves the user's other devices
        # subscribed.
        session = getattr(request, "auth", None)
        if session is not None and session.device_token != new_token:
            session.device_token = new_token
            session.save(update_fields=["device_token"])

        old_token = user.app_device_token
        if old_token == new_token:
            # already current — nothing to do (idempotent on repeated refresh).
            return Response({"message": "Device token already up to date."})

        user.app_device_token = new_token
        user.save(update_fields=["app_device_token"])

        # keep a student's school-topic subscription pointed at the live token:
        # drop the old device off the topic, add the new one.
        if user_role == UserRoles.ROLE_STUDENT:
            from main.methods.push import (
                subscribe_student_to_school,
                unsubscribe_student_from_school,
            )

            if old_token:
                unsubscribe_student_from_school(user, old_token)
            subscribe_student_to_school(user, new_token)

        return Response({"message": "Device token updated!"})


# ---
# ACCOUNT DELETION VIEW
class AccountDeletionView(SecuredAPIView):
    """
    Delete the authenticated student's/staff's mobile account (Google Play
    "delete account" requirement).

    IMPORTANT — this is a soft delete by design, NOT a row delete. The linked
    Student/Staff profile carries school-owned academic & financial records
    (invoices, marks, attendance) that the institution is the data controller
    for and is legally required to retain; those FKs also CASCADE from the
    account, so a real `account.delete()` would wipe that history. Instead we:
      - disable login (verified=False + unusable password),
      - scrub personal auth data (secret, otp, device token),
      - unsubscribe the device from push topics,
      - delete active auth-token rows (force logout on every device),
      - stamp deletion_requested_at for audit / school-admin recovery.
    The retained institutional data is disclosed in the privacy policy.
    """

    authentication_classes = (
        StudentTokenAuthentication,
        StaffTokenAuthentication,
    )
    allowed_roles = [UserRoles.ROLE_STUDENT, UserRoles.ROLE_STAFF]
    include_docs = True

    @swagger_auto_schema(
        operation_id="delete_account",
        operation_summary="Delete my account (student/staff)",
        request_body=AccountDeletionPayloadSerializer,
    )
    def post(self, request):
        """
        Disable the authenticated account and scrub its personal data.
        Requires `token` in cookie/header and `confirm: true` in the body.
        """
        user_role = getattr(request, "user_role", None)
        if user_role not in self.allowed_roles:
            return self.RESPONSE__INVALID_REQUEST

        if request.data.get("confirm") is not True:
            return self.RESPONSE__INVALID_REQUEST

        user = getattr(request, "user", None)
        if user is None:
            return self.RESPONSE__INVALID_REQUEST

        old_token = user.app_device_token

        with transaction.atomic():
            # drop the device off its school topic before clearing the token.
            if old_token and user_role == UserRoles.ROLE_STUDENT:
                from main.methods.push import unsubscribe_student_from_school

                try:
                    unsubscribe_student_from_school(user, old_token)
                except Exception:
                    # push cleanup is best-effort; never block the deletion on it.
                    pass

            # disable login two independent ways (verified gate + unusable pw)
            user.verified = False
            user.set_unusable_password()
            # scrub personal auth data
            user.secret = None
            user.otp = None
            user.app_device_token = None
            user.deletion_requested_at = timezone.now()
            user.save()

            # force logout everywhere by removing the auth token(s).
            Token = (
                StudentAuthToken
                if user_role == UserRoles.ROLE_STUDENT
                else StaffAuthToken
            )
            Token.objects.filter(user=user).delete()

        res = Response(
            {
                "message": (
                    "Your account has been deleted. Login is disabled and your "
                    "personal data has been removed. Academic and financial "
                    "records held by your institution are retained as required "
                    "by law."
                )
            },
            status=status.HTTP_200_OK,
        )
        clear_auth_cookie(res)
        return res


# ---
# LOGOUT VIEWS
class LogoutView(APIView):
    Token = None

    @swagger_auto_schema(
        operation_id="auth_logout",
        operation_summary="Role based logout",
        request_body=LogoutPayloadSerializer,
    )
    def post(self, request):
        """
        Requires `token` in cookie/header and `role` in payload.
        """
        LOGOUT_FAILED = Response(
            {"message": "Logout failed!"}, status=status.HTTP_400_BAD_REQUEST
        )
        role = request.data.get("role") or None
        token = request.COOKIES.get(COOKIE_NAME)
        if not token:
            auth = get_authorization_header(request).split()
            if len(auth) > 1:
                token = auth[1]
        #
        if not role or not token:
            return LOGOUT_FAILED
        self.findTokenModel(role)
        if not self.Token:
            return LOGOUT_FAILED
        # delete token and remove app_device_token;
        try:
            token_instance = self.Token.objects.get(key=token)
            self.removeAppDeviceToken(role, token_instance)
            token_instance.delete()
        except Exception as e:
            return LOGOUT_FAILED
        res = Response({"message": "Logout successful!"}, status=status.HTTP_200_OK)
        clear_auth_cookie(res)
        return res

    def findTokenModel(self, role):
        if role == UserRoles.ROLE_SUPERUSER:
            self.Token = UserAuthToken
        elif role == UserRoles.ROLE_SUPERADMIN:
            self.Token = SuperAdminAuthToken
        elif role == UserRoles.ROLE_ADMIN:
            self.Token = AdminAuthToken
        elif role == UserRoles.ROLE_STAFF:
            self.Token = StaffAuthToken
        elif role == UserRoles.ROLE_STUDENT:
            self.Token = StudentAuthToken

    def removeAppDeviceToken(self, role, token_instance):
        """
        Unregister push ONLY for the device that is actually signing out.

        The account holds a single `app_device_token`, so this used to clear it
        on any logout: a teacher signing out of the web portal on the office PC
        silently unregistered their phone, and notices stopped arriving on a
        device that was still logged in. A session now remembers the device
        token it signed in with, so we only clear the account's when this
        session is that same device.
        """
        if role not in [UserRoles.ROLE_STUDENT, UserRoles.ROLE_STAFF]:
            return
        try:
            user = token_instance.user
            old_token = user.app_device_token
            if not old_token or old_token != token_instance.device_token:
                # a different device (or a browser session) — leave push alone.
                return
            # drop this device off the school topic before clearing the token.
            if role == UserRoles.ROLE_STUDENT:
                from main.methods.push import unsubscribe_student_from_school

                unsubscribe_student_from_school(user, old_token)
            user.app_device_token = None
            user.save(update_fields=["app_device_token"])
        except AttributeError:
            pass
