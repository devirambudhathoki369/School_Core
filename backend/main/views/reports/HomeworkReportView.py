from django.db.models import F

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.Homework import Homework
from ...methods.nameConcat import nameConcat
from ...methods.nepaliDatetime import nepaliToEnglishDate
from ...methods.genClassname import getClassDetails


class HomeworkReportView(SecuredAPIView):
    """
    Homework given on a single (BS) date: which teacher assigned what
    homework, to which class/subject, and when it is due.

    The `date` the admin picks is the day the homework was GIVEN. Homework
    rows stamp `created_at` (a UTC DateField) on assignment, so the chosen
    BS date is converted to its Gregorian date and matched against it. The
    UTC/NPT offset only shifts posts made between 00:00-05:45 NPT, which
    homework assignment effectively never happens at.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        date = request.data.get("date")

        if school_id and date:
            english_date = nepaliToEnglishDate(date)
            if not english_date:
                return self.RESPONSE__INVALID_REQUEST

            # Not scoped to is_active: a homework given on this date that was
            # later closed was still given on this date, so it belongs here.
            qs = (
                Homework.objects.filter(
                    school=school_id,
                    created_at=english_date,
                )
                .annotate(
                    teacher=nameConcat("staff"),
                    subject_name=F("subject__subject"),
                )
                .order_by("staff__first_name", "class_info")
                .values(
                    "id",
                    "teacher",
                    "class_info",
                    "subject_name",
                    "title",
                    "description",
                    "due_date",
                )
            )

            data = list(qs)
            for e in data:
                [classname, _] = getClassDetails(e.pop("class_info"))
                e["classname"] = classname

            return Response({"data": data})
        return self.RESPONSE__INVALID_REQUEST
