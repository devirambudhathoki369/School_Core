from django.db.models import Case, When, Value, CharField
from ..choices.BloodGroup import BLOOD_GROUP_CHOICES_DICT


def bloodgroupQuery():
    return Case(
        When(
            other_info__blood_group__isnull=False,
            then=Case(
                *[
                    When(other_info__blood_group=key, then=Value(value))
                    for key, value in BLOOD_GROUP_CHOICES_DICT.items()
                ],
                default=Value(""),
                output_field=CharField(),
            ),
        ),
        default=Value(""),
        output_field=CharField(),
    )
