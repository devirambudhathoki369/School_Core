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
