from rest_framework import serializers
from ..models.Device import Device


class DeviceSerializer(serializers.ModelSerializer):
    alias = serializers.CharField(required=False, allow_blank=True)
    ip_address = serializers.CharField(required=False, allow_blank=True)
    firmware = serializers.CharField(required=False, allow_blank=True)
    push_version = serializers.CharField(required=False, allow_blank=True)
    device_type = serializers.CharField(required=False, allow_blank=True)
    push_comm_key = serializers.CharField(required=False, allow_blank=True)
    last_seen = serializers.DateTimeField(required=False)

    class Meta:
        model = Device
        fields = "__all__"
