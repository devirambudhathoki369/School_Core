from django.db.models import Value, CharField, F
from django.db.models.functions import Concat

#
from main.models.Student import Student

STUDENT_PROFILE_RETURN_FIELDS = (
    "id",
    "class_info",
    "image",
    "gender",
    "email",
    "contact",
    "location",
)


def getStudentProfile(user):
    return (
        Student.objects.filter(account=user)
        .values(*STUDENT_PROFILE_RETURN_FIELDS)
        .annotate(
            name=Concat(
                "first_name",
                Value(" "),
                "middle_name",
                Value(" "),
                "last_name",
                output_field=CharField(),
            ),
            father_name=F("guardian_info__father_name"),
            mother_name=F("guardian_info__mother_name"),
            guardian_name=F("guardian_info__guardian_name"),
            guardian_contact=F("guardian_info__guardian_contact"),
            guardian_location=F("guardian_info__guardian_location"),
            school=F("class_info__school"),
            school_name=F("class_info__school__name"),
            school_uname=F("class_info__school__account__username"),
            school_address=F("class_info__school__address"),
            school_contact=F("class_info__school__contact"),
            school_telephone=F("class_info__school__telephone"),
            school_estd_date=F("class_info__school__estd_date"),
            school_pan_no=F("class_info__school__pan_no"),
            school_email=F("class_info__school__email"),
            school_logo=F("class_info__school__logo"),
            school_award_logo=F("class_info__school__award_logo"),
            school_sign=F("class_info__school__sign"),
            school_slogan=F("class_info__school__slogan"),
            economic_year=F("class_info__school__economic_year"),
            economic_year__name=F("class_info__school__economic_year__name"),
            renew_date=F("class_info__school__renew_date"),
        )
        .first()
    )
