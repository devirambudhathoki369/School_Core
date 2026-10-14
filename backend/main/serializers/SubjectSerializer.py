from ..models.Subject import Subject, CREDIT_HOURS_CONFIGS

#
from rest_framework import serializers


class SubjectSerializer(serializers.ModelSerializer):
    order = serializers.IntegerField(required=False)
    code = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    code_pr = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    subject_pr = serializers.CharField(
        required=False, allow_null=True, allow_blank=True
    )
    credit_hours_pr = serializers.DecimalField(
        **CREDIT_HOURS_CONFIGS, required=False, allow_null=True
    )

    class Meta:
        model = Subject
        fields = "__all__"
        # `is_protected` is a hard delete-lock and must NOT be flippable through the
        # public create/update API — otherwise an admin could just unprotect a
        # subject and then delete it. It is set out-of-band (DB / admin only).
        read_only_fields = ("is_protected",)

    def to_representation(self, data):
        """Convert to JSON."""
        return data
