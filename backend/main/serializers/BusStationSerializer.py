from ..models.BusStation import BusStation, location_configs

#
from rest_framework import serializers


class BusStationSerializer(serializers.ModelSerializer):
    latitude = serializers.DecimalField(**location_configs, required=False)
    longitude = serializers.DecimalField(**location_configs, required=False)

    class Meta:
        model = BusStation
        fields = "__all__"
        read_only_fields = ["is_active"]

    def to_representation(self, data):
        """Convert to JSON."""
        return data


# DOCS
class BusStationParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
