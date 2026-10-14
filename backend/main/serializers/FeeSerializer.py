from rest_framework import serializers
from django.db import transaction

#
from ..models.SchoolAdmin import SchoolAdmin
from ..models.Fee import FeeTitle, Fee
from ..models.ClassInfo import ClassInfo
from .ClassInfoSerializer import ClassInfoSerializer
from ..methods.getCreateClass import get_or_create_class


#
# TODO : use object.filter(school__id=context.school_id) in primary-key-related-field queryset;
class FeeTitleSerializer(serializers.ModelSerializer):
    school = serializers.PrimaryKeyRelatedField(queryset=SchoolAdmin.objects.all())
    isCashReceipt = serializers.BooleanField(default=False)

    class Meta:
        model = FeeTitle
        fields = "__all__"

    def to_representation(self, data):
        return data


class FeeSerializer(serializers.ModelSerializer):
    title = serializers.PrimaryKeyRelatedField(queryset=FeeTitle.objects.all())
    class_info = ClassInfoSerializer()

    class Meta:
        model = Fee
        fields = "__all__"

    def validate_months(self, value):
        """A class's own payable months: 1..12, no repeats, or nothing at all.

        Nothing (NULL / empty) is the normal case and means "follow the title".
        Anything else is what a class will actually be billed for, so a stray
        0, 13 or duplicate has to be refused here rather than quietly become a
        month that never gets billed (or gets billed twice).
        """
        # Empty is stored as NULL, never as `[]`: both mean "follow the title",
        # and one representation of that keeps every reader honest.
        if not value:
            return None
        if not isinstance(value, list):
            raise serializers.ValidationError("Months must be a list.")
        months = []
        for month in value:
            try:
                month = int(month)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f"'{month}' is not a month.")
            if not 1 <= month <= 12:
                raise serializers.ValidationError("Months must be between 1 and 12.")
            if month not in months:
                months.append(month)
        return sorted(months)

    def create(self, validated_data):
        class_info_data = validated_data.pop("class_info", None)
        with transaction.atomic():
            class_info, _ = get_or_create_class(class_info_data)
            fee = Fee.objects.create(**validated_data, class_info=class_info)
            return fee

    def update(self, instance, validated_data):
        class_info_data = validated_data.pop("class_info", None)
        with transaction.atomic():
            class_info, _ = get_or_create_class(class_info_data)
            instance.class_info = class_info
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            return instance

    def to_representation(self, data):
        return data
