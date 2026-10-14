from django.db import transaction

#
from rest_framework import serializers

#
from account.models import StaffAccount
from account.serializers import StaffAccountSerializer
from ..models.Staff import StaffRole, Staff, StaffOtherInfo, STAFF_STATUS_CHOICES
from ..models.Subject import Subject
from ..serializers.base_serializers.OtherInfoSerializer import BaseOtherInfoSerializer


class StaffRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffRole
        fields = "__all__"


class StaffOtherInfoSerializer(BaseOtherInfoSerializer, serializers.ModelSerializer):
    email = serializers.EmailField(required=False)
    qualification = serializers.CharField(required=False)
    experience = serializers.CharField(required=False)
    joined_date = serializers.CharField(required=False)
    # optional, and clearable: an admin who mistyped it must be able to blank it.
    citizenship_no = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )
    # FINANCE_FIELDS
    pan_no = serializers.CharField(required=False)

    class Meta:
        model = StaffOtherInfo
        fields = "__all__"


class StaffSerializer(serializers.ModelSerializer):
    middle_name = serializers.CharField(required=False, allow_blank=True)
    # primary_subject = serializers.CharField(required=False)
    # secondary_subject = serializers.CharField(required=False)
    secondary_contact = serializers.CharField(required=False)
    image = serializers.ImageField(required=False)
    other_info = StaffOtherInfoSerializer()
    account = StaffAccountSerializer(required=False, write_only=True, allow_null=True)
    username = serializers.SerializerMethodField()
    account_id = serializers.SerializerMethodField()

    class Meta:
        model = Staff
        fields = "__all__"
        extra_kwargs = {"account": {"write_only": True}}

    def create(self, validated_data):
        # primary_subject = validated_data.pop("primary_subject", None)
        # secondary_subject = validated_data.pop("secondary_subject", None)
        account_data = validated_data.pop("account", None)
        other_info_data = validated_data.pop("other_info", None)
        with transaction.atomic():
            # subjects = Subject.objects.filter(
            #     id__in=[primary_subject, secondary_subject]
            # )
            # subjects = {str(sub.id): sub for sub in subjects}
            #
            staff_account = None
            if account_data:
                staff_account = StaffAccount.objects.create_user(**account_data)
            #
            staff_other_info = StaffOtherInfo.objects.create(**other_info_data)
            staff = Staff.objects.create(
                **validated_data,
                # primary_subject=subjects.get(str(primary_subject)) or None,
                # secondary_subject=subjects.get(str(secondary_subject)) or None,
                account=staff_account,
                other_info=staff_other_info
            )
            return staff

    def get_username(self, obj):
        return (
            obj.account.username
            if obj.account and self.context.get("include_account")
            else None
        )

    def get_account_id(self, obj):
        return obj.account.id if obj.account else None


# DOCS
class StaffSearchPayloadSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    status = serializers.ChoiceField(
        default=1,
        choices=STAFF_STATUS_CHOICES,
        required=False,
        help_text=str({e[0]: e[1] for e in STAFF_STATUS_CHOICES}),
    )
    class_info = serializers.IntegerField(
        required=False, help_text="search by class-id"
    )
    include_images = serializers.BooleanField(default=False, required=False)
    include_rfid_card = serializers.BooleanField(
        default=False, required=False, help_text="get staffs stored RFID card no."
    )
    contact = serializers.BooleanField(
        default=False,
        required=False,
        help_text="get staffs primary and secondary contacts",
    )
    address = serializers.BooleanField(
        default=False, required=False, help_text="get staffs address"
    )
    finance = serializers.BooleanField(
        default=False, required=False, help_text="get staffs financial informations"
    )
    designation = serializers.BooleanField(
        default=False, required=False, help_text="get staffs designations/positions"
    )
    include_balance = serializers.BooleanField(
        default=False, required=False, help_text="get staffs balances"
    )
    economic_year = serializers.IntegerField(
        required=False,
        help_text="must provide economic-year-id if include_balance is true",
    )
