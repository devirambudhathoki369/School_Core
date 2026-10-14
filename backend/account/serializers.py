from rest_framework import serializers
from django.db import transaction

#
from .models import AdminAccount, SuperAdminAccount, StaffAccount, StudentAccount
from main.models.Student import Student
from main.models.Staff import Staff
from .methods.extractSchoolSMSAPIKey import extractSchoolSMSAPIKey
from .auth.OTP import BaseOTP
from .utils.send_sms import send_sms


class AdminAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = AdminAccount
        fields = "__all__"
        extra_kwargs = {"password": {"write_only": True}}


class SuperAdminAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = SuperAdminAccount
        fields = "__all__"
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        super_admin = SuperAdminAccount.objects.create_user(**validated_data)
        return super_admin


class AppCredsSerializer(serializers.Serializer):
    app_device_token = serializers.CharField(required=False)

    class Meta:
        fields = "__all__"


class StaffAccountSerializer(serializers.ModelSerializer, AppCredsSerializer):
    staff = serializers.IntegerField(required=False)

    class Meta:
        model = StaffAccount
        fields = "__all__"
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        validated_data.pop("otp_verification")
        staff_id = validated_data.pop("staff", None)
        if staff_id:
            staff = Staff.objects.get(id=staff_id, account__isnull=True)
            if staff:
                staff_acc = StaffAccount.objects.create_user(**validated_data)
                staff.account = staff_acc
                staff.save()
                return staff_acc


def contact_on_file(student, contact):
    """
    Is `contact` a number the school already holds for this student?

    Self-registration and OTP resend are unauthenticated, and both used to send
    the verification code to whatever number the caller typed. That made the
    OTP prove nothing: anyone could register an account for ANY student id
    (the ids are sequential), receive the code on their own phone, verify, and
    sign in as that child — and the registration re-linked the student to the
    new account, cutting off the real one. The code now only ever goes to a
    number on the student's record: the same two numbers the registration
    screen's search-by-contact matches on.
    """
    contact = str(contact or "").strip()
    if not contact or student is None:
        return False
    on_file = {
        str(student.contact or "").strip(),
        str(getattr(student.guardian_info, "guardian_contact", "") or "").strip(),
    }
    on_file.discard("")
    return contact in on_file


class StudentAccountSerializer(
    serializers.ModelSerializer, AppCredsSerializer, BaseOTP
):
    student = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(), required=True
    )
    contact = serializers.CharField()

    class Meta:
        model = StudentAccount
        fields = "__all__"
        extra_kwargs = {"password": {"write_only": True}}
        # Server-owned. `fields = "__all__"` let the registering client set
        # them — `verified: true`, its own OTP `secret`, a backdated
        # `created_at` to dodge expiry.
        read_only_fields = (
            "verified",
            "secret",
            "otp",
            "last_login",
            "created_at",
            "deletion_requested_at",
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not contact_on_file(attrs.get("student"), attrs.get("contact")):
            raise serializers.ValidationError(
                {"contact": "This number is not on the student's record."}
            )
        return attrs

    def create(self, validated_data):
        student = validated_data.pop("student")
        student_contact = validated_data.pop("contact")
        otp_verification = validated_data.pop("otp_verification", False)
        if otp_verification:
            school = student.class_info.school.id
            school_sms_api_key = extractSchoolSMSAPIKey(school)
            if school_sms_api_key:
                otp, secret = self.generateOTP()
                # print(otp, secret)
                validated_data["otp"] = otp
                validated_data["secret"] = secret
                validated_data["verified"] = False
                #
                send_sms(student_contact, otp, school_sms_api_key, school=school)
        with transaction.atomic():
            student_acc = StudentAccount.objects.create_user(**validated_data)
            if student_acc:
                student.account = student_acc
                student.save()
            return student_acc


# DOCS
class LoginPayloadSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()
    role = serializers.CharField(help_text="Specify the role: student or staff")
    device_token = serializers.CharField(
        required=False, help_text="Device token id for firebase!"
    )


class LogoutPayloadSerializer(serializers.Serializer):
    role = serializers.CharField(
        help_text="Specify the role: admin or student or staff"
    )


class DeviceTokenPayloadSerializer(serializers.Serializer):
    device_token = serializers.CharField(
        help_text="Fresh firebase device token to store for push notifications."
    )


class AccountDeletionPayloadSerializer(serializers.Serializer):
    confirm = serializers.BooleanField(
        help_text=(
            "Must be true. Explicit confirmation that the account holder wants "
            "their account deleted (login disabled, personal data scrubbed)."
        )
    )


class OTPVerificationPayloadSerializer(serializers.Serializer):
    username = serializers.CharField()
    otp = serializers.CharField()


class OTPResendParamsSerializer(serializers.Serializer):
    username = serializers.CharField()
    contact = serializers.CharField(help_text="Autofill from student's information.")
