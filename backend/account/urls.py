from django.urls import path

#
from .views import (
    LoginView,
    PasswordChangeView,
    OwnPasswordChangeView,
    AccountView,
    SuperAdminRegistrationView,
    AdminLoginView,
    SuperAdminLoginView,
    SuperAdminListView,
    ObtainView,
    SuperAdminObtainView,
    AdminObtainView,
    StaffRegistrationView,
    StaffObtainView,
    StaffLoginView,
    StudentRegistrationView,
    StudentLoginView,
    CanteenLoginView,
    CanteenObtainView,
    ProfileView,
    DeviceTokenView,
    AccountDeletionView,
    OTPVerificationView,
    OTPView,
    LogoutView,
)

#
# /auth + ...
urlpatterns = [
    path("signin", LoginView.as_view(), name="role-based-login-route"),
    path(
        "change_password",
        PasswordChangeView.as_view(),
        name="role-based-password-change-route",
    ),
    path(
        "my_password",
        OwnPasswordChangeView.as_view(),
        name="own-password-change-route",
    ),
    path("profile", ProfileView.as_view(), name="profile"),
    path("device-token", DeviceTokenView.as_view(), name="device-token-update"),
    path("account/delete", AccountDeletionView.as_view(), name="account-delete"),
    path(
        "account_update",
        AccountView.as_view(),
        name="role-based-account-update",
    ),
    path("obtain", ObtainView.as_view(), name="role based obtain view"),
    path(
        "superadmin/obtain",
        SuperAdminObtainView.as_view(),
        name="superadmin-token-login-or-validation",
    ),
    path(
        "admin/obtain",
        AdminObtainView.as_view(),
        name="admin-token-login-or-validation",
    ),
    path(
        "staff/obtain",
        StaffObtainView.as_view(),
        name="staff-token-login-or-validation",
    ),
    # --- superadmin-account-registration-and-signin
    path("superadmins", SuperAdminListView.as_view(), name="superadmin-list-view"),
    path(
        "superadmin/register",
        SuperAdminRegistrationView.as_view(),
        name="superadmin-account-signup",
    ),
    path(
        "superadmin/signin",
        SuperAdminLoginView.as_view(),
        name="superadmin-account-signin",
    ),
    # --- admin-acc-login
    path("admin/signin", AdminLoginView.as_view(), name="admin-signin"),
    # --- student-acc
    path("student/register", StudentRegistrationView.as_view(), name="student-signup"),
    path("student/signin", StudentLoginView.as_view(), name="student-signin"),
    # --- staff-acc-login
    path("staff/register", StaffRegistrationView.as_view(), name="staff-signup"),
    path("staff/signin", StaffLoginView.as_view(), name="staff-signin"),
    # --- canteen-acc-login: the canteen only (canteen/models/Users.py)
    path("canteen/signin", CanteenLoginView.as_view(), name="canteen-signin"),
    path(
        "canteen/obtain",
        CanteenObtainView.as_view(),
        name="canteen-token-login-or-validation",
    ),
    # OTP
    path("otp/verify", OTPVerificationView.as_view(), name="otp-verification"),
    path("otp/resend", OTPView.as_view(), name="otp-resend"),
    # --- logout
    path("logout", LogoutView.as_view(), name="logout"),
]
