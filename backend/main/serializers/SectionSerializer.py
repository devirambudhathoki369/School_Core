from ..models.Section import Section

#
from rest_framework import serializers


class SectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Section
        fields = "__all__"

    def to_representation(self, data):
        return data
