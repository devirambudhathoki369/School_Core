from django.db import transaction

#
from rest_framework import serializers

#
from ..models.Ledger import BaseLedger, LedgerPosting, StudentLedger, StaffLedger
from ..models.Student import Student
from .ClassInfoSerializer import ClassInfoSerializer
from ..methods.getCreateClass import get_or_create_class
from ..methods.enrichDetailsWithTitleNames import (
    enrich_details_with_title_names,
    enrich_many_details,
)

#


class BaseLedgerSerializer(serializers.ModelSerializer):
    date = serializers.CharField(required=False)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = BaseLedger
        fields = "__all__"


class StudentLedgerSerializer(BaseLedgerSerializer):
    class Meta:
        model = StudentLedger
        fields = "__all__"

    def create(self, validated_data):
        # THIS IS ALREADY IMPLEMENTED INSIDE LedgerPostingSerializer!!!
        if isinstance(validated_data, list):
            instances = [StudentLedger(**item) for item in validated_data]
            return StudentLedger.objects.bulk_create(instances)
        else:
            # Fallback for creating a single instance
            return StudentLedger.objects.create(**validated_data)

    def to_representation(self, data):
        return data


class LedgerPostingSerializer(BaseLedgerSerializer):
    class Meta:
        model = LedgerPosting
        fields = "__all__"

    def to_internal_value(self, data):
        class_info = data.get("class_info")
        if isinstance(class_info, dict):
            self.fields["class_info"] = ClassInfoSerializer()
        return super().to_internal_value(data)

    def create(self, validated_data):
        class_info = validated_data.pop("class_info", None)
        studentLedgers = validated_data.pop("studentLedgers")
        if class_info and studentLedgers:
            months = validated_data.pop("months", None)
            months = months if isinstance(months, list) else []
            ecoy = validated_data.get("economic_year")
            acay = validated_data.get("academic_year")
            date = validated_data.pop("date")
            #
            with transaction.atomic():
                if isinstance(class_info, dict):
                    # The posting's own academic year is the class's academic year.
                    # Clients that drop it from class_info (an empty value stripped
                    # before send) used to crash resolution with a 500 — fall back
                    # instead, then fail loudly if it still can't be resolved.
                    if not class_info.get("academic_year"):
                        class_info["academic_year"] = getattr(acay, "id", acay)
                    class_info, _ = get_or_create_class(class_info)
                if not class_info:
                    raise serializers.ValidationError(
                        {"message": "Could not resolve the class for this posting "
                                    "— please re-select the class and try again."}
                    )
                ledgerPosting = LedgerPosting.objects.create(
                    class_info=class_info,
                    date=date,
                    months=months,
                    # A dict (rather than a list) of student ledgers is the
                    # single-student catch-up posted from a profile. Marked so it
                    # never joins the class's offerable posting groups.
                    single_student=not isinstance(studentLedgers, list),
                    **validated_data,
                )
                #
                school_id = getattr(class_info.school, "id", None)
                if isinstance(studentLedgers, list):
                    students = {std.get("student") for std in studentLedgers}
                    students = {
                        std.id: std for std in Student.objects.filter(id__in=students)
                    }
                    # Snapshot FeeTitle names for every student-ledger row in
                    # one batched lookup before bulk_create.
                    enrich_many_details(
                        [item.get("details") for item in studentLedgers],
                        school_id=school_id,
                    )
                    instances = [
                        StudentLedger(
                            school=class_info.school,
                            student=students.get(item.pop("student")),
                            ledger_posting=ledgerPosting,
                            economic_year=ecoy,
                            academic_year=acay,
                            date=date,
                            **item,
                        )
                        for item in studentLedgers
                    ]
                    StudentLedger.objects.bulk_create(instances)
                else:
                    # Fallback for creating a single instance
                    enrich_details_with_title_names(
                        studentLedgers.get("details"), school_id=school_id
                    )
                    instance = StudentLedger(
                        school=class_info.school,
                        ledger_posting=ledgerPosting,
                        economic_year=ecoy,
                        academic_year=acay,
                        date=date,
                        **studentLedgers,
                    )
                    instance.save()
                return ledgerPosting
        return super().create(validated_data)

    def to_representation(self, data):
        return data


class StaffLedgerSerializer(BaseLedgerSerializer):
    # The column is varchar(50); the base serializer's unbounded CharField let a
    # longer note through validation and the INSERT then failed with a 500.
    remarks = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, max_length=50
    )

    class Meta:
        model = StaffLedger
        fields = "__all__"
