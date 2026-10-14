from rest_framework import serializers

#
from ..models.Library import Library


class LibrayPrefsDataSerializer(serializers.Serializer):
    fine_per_day = serializers.IntegerField(min_value=0, max_value=1000, default=0)
    fine_on_damage = serializers.IntegerField(min_value=0, max_value=10000, default=0)
    shared_to = serializers.CharField(required=False)


class LibrarySerializer(serializers.ModelSerializer):
    address = serializers.CharField(required=False)
    preferences = LibrayPrefsDataSerializer(required=False)

    class Meta:
        model = Library
        fields = "__all__"
