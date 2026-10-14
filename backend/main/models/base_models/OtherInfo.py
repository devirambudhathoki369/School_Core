from django.db.models import Model, IntegerField
from ...choices import ETHNICITY_CHOICES, SPORT_CHOICES, BLOOD_GROUP_CHOICES


class BaseOtherInfo(Model):
    ethnicity = IntegerField(choices=ETHNICITY_CHOICES, null=True, blank=True)
    sport = IntegerField(choices=SPORT_CHOICES, null=True, blank=True)
    blood_group = IntegerField(choices=BLOOD_GROUP_CHOICES, null=True, blank=True)

    class Meta:
        abstract = True
