from rest_framework import serializers

#
from ...models.exams.ExtraActivity import ExtraActivity, ExtraActivityEntry


class ExtraActivitySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ExtraActivity
        fields = "__all__"


class ExtraActivityEntrySerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = ExtraActivityEntry
        fields = "__all__"
