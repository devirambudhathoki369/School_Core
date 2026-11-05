"""Request bodies of the mobile API. Every field is bounded."""
import re

from rest_framework import serializers

from .guardians import normalize_email
from .models import AppSession

PLATFORMS = {"android": AppSession.ANDROID, "ios": AppSession.IOS}


class DeviceSerializer(serializers.Serializer):
    platform = serializers.ChoiceField(choices=sorted(PLATFORMS))
    label = serializers.CharField(max_length=80, required=False, allow_blank=True, default="")
    app_version = serializers.CharField(max_length=20)

    def validate_app_version(self, value):
        if not re.fullmatch(r"\d{1,4}(\.\d{1,4}){0,3}", value.strip()):
            raise serializers.ValidationError("Use numbers and dots, like 1.0.3.")
        return value.strip()


class SchoolCodeField(serializers.CharField):
    def __init__(self, **kwargs):
        super().__init__(max_length=8, **kwargs)

    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().upper()


class EmailField(serializers.CharField):
    def __init__(self, **kwargs):
        super().__init__(max_length=254, **kwargs)

    def to_internal_value(self, data):
        email = normalize_email(super().to_internal_value(data))
        if email is None:
            raise serializers.ValidationError("Enter a valid email address.")
        return email


class PasswordSignInSerializer(serializers.Serializer):
    school_code = SchoolCodeField()
    role = serializers.ChoiceField(choices=["student", "staff", "admin"])
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=1024, trim_whitespace=False)
    device = DeviceSerializer()


class ParentCodeSerializer(serializers.Serializer):
    school_code = SchoolCodeField()
    email = EmailField()


class ParentVerifySerializer(serializers.Serializer):
    school_code = SchoolCodeField()
    email = EmailField()
    code = serializers.RegexField(r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code."})
    device = DeviceSerializer()


class FamilyCodeSerializer(serializers.Serializer):
    school_code = SchoolCodeField()
    email = EmailField()
    family_code = serializers.CharField(max_length=20)


class RefreshSerializer(serializers.Serializer):
    refresh_token = serializers.CharField(max_length=200)
