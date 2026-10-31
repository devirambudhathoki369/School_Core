from django.db import transaction

#
from rest_framework import serializers


#
from main.methods.nepaliDatetime import ndt_today
from main.methods.uploads import reject_non_homework
from ..models.Homework import (
    Homework,
    HomeworkFile,
    HomeworkSubmission,
    HomeworkSubmissionFile,
    HW_SUBMISSION_STATUS_CHOICES,
)


class HomeworkSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(required=False, default=True)
    files = serializers.ListField(
        required=False,
        default=list,
    )

    class Meta:
        model = Homework
        fields = "__all__"

    def validate_files(self, files):
        refused = reject_non_homework(files)
        if refused:
            raise serializers.ValidationError(
                f"This file type is not allowed: {', '.join(refused)}"
            )
        return files

    def create(self, validated_data):
        files = validated_data.pop("files", None)
        hasFiles = len(files) > 0 and files[0] != ""
        with transaction.atomic():
            homework_ins = super().create(validated_data)
            if homework_ins and hasFiles:
                hw_files = [
                    HomeworkFile(homework=homework_ins, file=file) for file in files
                ]
                HomeworkFile.objects.bulk_create(hw_files)
            return homework_ins


class HomeworkSubmissionSerializer(serializers.ModelSerializer):
    is_active = serializers.BooleanField(required=False, default=True)
    files = serializers.ListField(default=list)
    submitted_date = serializers.CharField(required=False, default=ndt_today)
    status = serializers.ChoiceField(
        required=False,
        default=1,
        choices=HW_SUBMISSION_STATUS_CHOICES,
        help_text='Homework submission status i.e. {1: "Received", 2: "Checked"}',
    )
    remarks = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        model = HomeworkSubmission
        fields = "__all__"

    def create(self, validated_data):
        files = validated_data.pop("files", None)
        hasFiles = len(files) > 0 and files[0] != ""
        with transaction.atomic():
            homework_submission_ins = super().create(validated_data)
            if homework_submission_ins and hasFiles:
                hw_submission_files = [
                    HomeworkSubmissionFile(
                        homework_submission=homework_submission_ins, file=file
                    )
                    for file in files
                ]
                HomeworkSubmissionFile.objects.bulk_create(hw_submission_files)
            return homework_submission_ins

    def validate_files(self, files):
        hasFiles = len(files) > 0 and files[0] != ""
        if not hasFiles:
            raise serializers.ValidationError("Files must be submitted.")
        refused = reject_non_homework(files)
        if refused:
            raise serializers.ValidationError(
                f"This file type is not allowed: {', '.join(refused)}"
            )
        return files

    def validate(self, attrs):
        homework = attrs.get("homework")
        submitted_date = attrs.get("submitted_date")

        if submitted_date > homework.due_date:
            raise serializers.ValidationError("Submission is late.")

        return attrs


"""DOCS"""


#
class HomeworkParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    class_info = serializers.IntegerField(
        required=False, help_text="Filter by class-info id"
    )
    staff = serializers.IntegerField(required=False)
    subject = serializers.IntegerField(required=False)
    status = serializers.BooleanField(
        required=False, default=True, help_text="Filter by active status"
    )


#
class HomeworkSubmissionParamsSerializer(serializers.Serializer):
    homework = serializers.IntegerField(help_text="Homework's pk")
    student = serializers.IntegerField(required=False, help_text="Student's pk")
    status = serializers.ChoiceField(
        default=1,
        help_text='Homework submission status i.e. {1: "Received", 2: "Checked"}',
        choices=HW_SUBMISSION_STATUS_CHOICES,
    )


class HomeworkSubmissionUpdateSerializer(serializers.Serializer):
    id = serializers.IntegerField(
        help_text="Homework Submission's (Submitted homwork) pk"
    )
    status = serializers.ChoiceField(
        default=1,
        help_text='Homework submission status i.e. {1: "Received", 2: "Checked"}',
        choices=HW_SUBMISSION_STATUS_CHOICES,
    )
    remarks = serializers.CharField(required=False, help_text="Teacher's review")
