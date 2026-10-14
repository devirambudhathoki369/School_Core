from rest_framework import serializers

#
from ...choices import ETHNICITY_CHOICES, SPORT_CHOICES, BLOOD_GROUP_CHOICES


class BaseOtherInfoSerializer(serializers.ModelSerializer):
    ethnicity = serializers.ChoiceField(choices=ETHNICITY_CHOICES, required=False)
    sport = serializers.ChoiceField(choices=SPORT_CHOICES, required=False)
    blood_group = serializers.ChoiceField(choices=BLOOD_GROUP_CHOICES, required=False)
