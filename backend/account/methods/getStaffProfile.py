from main.methods.busTracking import with_tracking_flag
from main.methods.schoolModules import with_module_flags
from django.db.models import Value, CharField, F
from django.db.models.functions import Concat

#
from main.models.Staff import Staff

STAFF_PROFILE_RETURN_FIELDS = (
    "id",
    "school",
    "role",
    "location",
    "primary_contact",
    "secondary_contact",
    "image",
    "permissions",
)


def getStaffProfile(user):
    profile = (
        Staff.objects.filter(account=user)
        .values(*STAFF_PROFILE_RETURN_FIELDS)
        .annotate(
            name=Concat(
                "first_name",
                Value(" "),
                "middle_name",
                Value(" "),
                "last_name",
                output_field=CharField(),
            ),
            designation=F("role__role"),
            school_id=F("school"),
            school_name=F("school__name"),
            school_uname=F("school__account__username"),
            school_address=F("school__address"),
            school_contact=F("school__contact"),
            school_telephone=F("school__telephone"),
            school_estd_date=F("school__estd_date"),
            school_pan_no=F("school__pan_no"),
            school_email=F("school__email"),
            school_logo=F("school__logo"),
            school_award_logo=F("school__award_logo"),
            school_sign=F("school__sign"),
            school_exam_coordinator_sign=F("school__exam_coordinator_sign"),
            school_slogan=F("school__slogan"),
            # Staff see their school's interface theme too — a school's look
            # must be the same whoever signs in.
            ui_theme=F("school__ui_theme"),
            economic_year=F("school__economic_year"),
            economic_year__name=F("school__economic_year__name"),
            renew_date=F("school__renew_date"),
        )
        .first()
    )
    # Staff see bus tracking exactly when their school has a bus to track; whether
    # this member of staff may open it is then their own permission (511).
    with_tracking_flag(profile, (profile or {}).get("school_id"))
    # Staff see a module (hostel, exams, payroll, ...) exactly when their school
    # has it; which pages inside it they may open is then their own permissions.
    with_module_flags(profile, (profile or {}).get("school_id"))
    return profile
