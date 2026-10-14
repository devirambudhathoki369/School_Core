from django.db import transaction

#
from rest_framework import serializers
from ..models.SchoolAdmin import SchoolAdmin, SchoolImage, MAX_IMAGE_COUNT

#
from account.models import AdminAccount
from account.serializers import AdminAccountSerializer
from ..models.FiscalYears import EconomicYear


class SchoolPreferencesSerializer(serializers.Serializer):
    sms_on_bill_payment = serializers.BooleanField(default=False, required=False)
    birthday_sms_auto_wish = serializers.BooleanField(default=False, required=False)
    # separate from the student wish: a school may want to greet its teachers
    # without messaging every guardian, or the reverse.
    staff_birthday_sms_auto_wish = serializers.BooleanField(
        default=False, required=False
    )
    sms_on_absences = serializers.BooleanField(default=False, required=False)
    uses_shared_library = serializers.BooleanField(required=False)


class SchoolAdminSerializer(serializers.ModelSerializer):
    account = AdminAccountSerializer(write_only=True, required=False)
    economic_year = serializers.PrimaryKeyRelatedField(
        queryset=EconomicYear.objects.all(), required=False
    )
    contact = serializers.CharField(required=False)
    telephone = serializers.CharField(required=False)
    estd_date = serializers.CharField()
    renew_date = serializers.CharField()
    slogan = serializers.CharField(required=False)
    about_us = serializers.CharField(required=False)
    logo = serializers.ImageField(required=False)
    award_logo = serializers.ImageField(required=False)
    sign = serializers.ImageField(required=False)
    exam_coordinator_sign = serializers.ImageField(required=False)
    preferences = SchoolPreferencesSerializer(required=False)
    foundation = serializers.IntegerField(required=False)

    class Meta:
        model = SchoolAdmin
        fields = "__all__"
        extra_kwargs = {"account": {"write_only": True}}

    def create(self, validated_data):
        account_data = validated_data.pop("account")
        with transaction.atomic():
            account = AdminAccount.objects.create_user(**account_data)
            school_admin = SchoolAdmin.objects.create(**validated_data, account=account)
            return school_admin

    def to_representation(self, data):
        data["test_account_str"] = (
            "yes" if data.get("test_account", False) == True else "no"
        )
        data["uses_sms_str"] = "yes" if data.get("uses_sms", False) == True else "no"
        data["uses_mobile_app_str"] = (
            "yes" if data.get("uses_mobile_app", False) == True else "no"
        )
        data["time_set_required_str"] = (
            "yes" if data.get("time_set_required", False) == True else "no"
        )
        return data


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolAdmin

    def to_representation(self, data):
        return data


class SchoolImageSerializer(serializers.ModelSerializer):
    image = serializers.ImageField()

    class Meta:
        model = SchoolImage
        fields = "__all__"

    def isWithinMaxLimit(self):
        school_id = self.initial_data.get("school")
        return SchoolImage.objects.filter(school_id=school_id).count() < MAX_IMAGE_COUNT


# DOCS
class SchoolImageParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    id = serializers.IntegerField(required=False)
