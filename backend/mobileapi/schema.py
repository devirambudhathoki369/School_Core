"""The OpenAPI 3 schema of /api/mobile/v1/ and the answers of the sign-in and
account endpoints (mobile/SPEC.md §5).

The app's TypeScript types are generated from this schema
(`mobile/src/api/schema.d.ts`, `npm run api-types`), so the app and the
server cannot drift apart unnoticed. Each answer here has its own serializer.
"""
from django.urls import include, path
from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.utils import extend_schema
from drf_spectacular.views import SpectacularAPIView
from rest_framework import serializers


class MobileBearer(OpenApiAuthenticationExtension):
    target_class = "mobileapi.auth.MobileTokenAuthentication"
    name = "MobileBearer"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "mv1.<session>.<expiry>.<signature>"}


class ErrorBodyOut(serializers.Serializer):
    code = serializers.CharField()
    message = serializers.CharField()
    fields = serializers.DictField(child=serializers.CharField(), required=False)
    retry_after = serializers.IntegerField(required=False)


class ErrorOut(serializers.Serializer):
    error = ErrorBodyOut()


class SchoolOut(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()
    address = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)


class SignInMethodsOut(serializers.Serializer):
    parent = serializers.CharField(help_text="email_code")
    student = serializers.CharField(help_text="password")
    staff = serializers.CharField(help_text="password")
    admin = serializers.CharField(help_text="password")


class SchoolLookupOut(serializers.Serializer):
    school = SchoolOut()
    sign_in = SignInMethodsOut()


class TokensOut(serializers.Serializer):
    access_token = serializers.CharField()
    access_expires_at = serializers.IntegerField(help_text="Unix seconds")
    refresh_token = serializers.CharField()
    token_type = serializers.ChoiceField(choices=["Bearer"])


class ProfileOut(serializers.Serializer):
    id = serializers.IntegerField(required=False)
    name = serializers.CharField()
    username = serializers.CharField(required=False)
    email = serializers.CharField(required=False, allow_null=True)
    phone_last_digits = serializers.CharField(required=False)
    class_name = serializers.CharField(required=False)
    roll_no = serializers.CharField(required=False, allow_null=True)
    designation = serializers.CharField(required=False)
    photo_url = serializers.CharField(required=False, allow_null=True)


class MeChildOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    class_name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)


class MeOut(serializers.Serializer):
    role = serializers.ChoiceField(choices=["parent", "student", "staff", "admin"])
    session_id = serializers.CharField()
    school = SchoolOut()
    profile = ProfileOut()
    children = MeChildOut(many=True, required=False, help_text="Parents only")
    permissions = serializers.ListField(child=serializers.IntegerField(), required=False, help_text="Staff only")


class SignedInOut(serializers.Serializer):
    tokens = TokensOut()
    me = MeOut()


class RefreshedOut(serializers.Serializer):
    tokens = TokensOut()


class CodeSentOut(serializers.Serializer):
    sent_to = serializers.CharField()
    resend_after = serializers.IntegerField(help_text="Seconds")
    expires_in = serializers.IntegerField(help_text="Seconds")


class PhoneSessionOut(serializers.Serializer):
    id = serializers.CharField()
    platform = serializers.ChoiceField(choices=["android", "ios"], allow_null=True)
    device_label = serializers.CharField()
    app_version = serializers.CharField()
    created_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField()
    current = serializers.BooleanField()


class PhoneListOut(serializers.Serializer):
    items = PhoneSessionOut(many=True)


class CloseAccountIn(serializers.Serializer):
    confirm = serializers.BooleanField(help_text="Must be true")


class ClosedOut(serializers.Serializer):
    message = serializers.CharField()


class MobileSchemaView(SpectacularAPIView):
    """The schema covers this API only, not the portal's."""

    authentication_classes = ()
    permission_classes = ()
    custom_settings = {
        "TITLE": "SchoolCore mobile API",
        "VERSION": "1",
        "DESCRIPTION": "The SchoolCore app's own API. See mobile/SPEC.md.",
        "SCHEMA_PATH_PREFIX": "/api/mobile/v1",
        "SCHEMA_PATH_PREFIX_TRIM": True,
        "COMPONENT_SPLIT_REQUEST": True,
        "ENUM_NAME_OVERRIDES": {
            "DayStatusEnum": ["present", "absent", "not_taken"],
            "MarkStatusEnum": ["present", "absent"],
            "HandInStatusEnum": ["checked", "received"],
            "RoleEnum": ["parent", "student", "staff", "admin"],
            "PasswordRoleEnum": ["student", "staff", "admin"],
        },
    }

    @extend_schema(exclude=True)
    def get(self, request, *args, **kwargs):
        from . import urls

        self.patterns = [path("api/mobile/v1/", include(urls.urlpatterns))]
        return super().get(request, *args, **kwargs)
