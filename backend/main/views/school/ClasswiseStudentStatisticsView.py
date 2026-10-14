from django.db.models import Count, Case, When, IntegerField, F

#
from rest_framework.response import Response

#
from account.auth.Authentication import AdminTokenAuthentication
from ..BaseViews import SecuredAPIView
from ...models.Student import Student


class ClasswiseStudentStatisticsView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication,)
    MALE = 1
    FEMALE = 2
    OTHERS = 3
    RUNNING = 1

    def count(self, gender):
        return Count(
            Case(
                When(gender=gender, then=1),
                output_field=IntegerField(),
            )
        )

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            data = (
                Student.objects.filter(
                    class_info__school=school_id,
                    class_info__is_active=True,
                    is_active=True,
                    status=self.RUNNING,
                )
                .values("class_info")
                .annotate(
                    male_count=self.count(self.MALE),
                    female_count=self.count(self.FEMALE),
                    others_count=self.count(self.OTHERS),
                    total_count=F("male_count") + F("female_count") + F("others_count"),
                )
                .values(
                    "class_info",
                    "male_count",
                    "female_count",
                    "others_count",
                    "total_count",
                )
            )
            data = {each.get("class_info"): each for each in data}
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST
