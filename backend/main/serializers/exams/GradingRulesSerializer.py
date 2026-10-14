from rest_framework import serializers

#
from ...models.exams.GradingRules import GradingRules


class GradingRulesSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradingRules
        fields = "__all__"
