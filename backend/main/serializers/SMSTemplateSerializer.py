from rest_framework import serializers

#
from ..models.SMSTemplate import SMSTemplate


class SMSTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SMSTemplate
        fields = "__all__"
