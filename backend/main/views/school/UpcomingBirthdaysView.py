from django.db.models import F, Q, Case, When, Value, BooleanField
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from nepali_datetime import date

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from customs.Extract import ExtractDay, ExtractMonth

#
from ...models.Student import Student
from ...models.Staff import Staff
from ...models.ClassInfo import ClassInfo
from ..BaseViews import SecuredAPIView
from ...methods.nameConcat import nameConcat
from ...methods.genClassname import getClassDetails


class BirthdayPagination(CursorPagination):
    page_size = 7

    def get_ordering(self, request, queryset, view):
        return ("-is_birthday_today", "month", "day")


class UpcomingBirthdaysView(SecuredAPIView):
    """
    The two birthday tiles on the school dashboard.

    ADMIN-ONLY WAS A MISTAKE, and an expensive one. The dashboard is a
    permission-gated screen (`DASHBOARD.SUMMARY`), so a school can grant it to a
    member of staff — and every other widget on that same screen already accepts
    a staff token (`SchoolDashView`, `SchoolAttendanceTodayView`). These two did
    not, so a staff sign-in painted the dashboard and immediately took two 401s.

    On its own that would have been two empty tiles. Combined with the client's
    new "a 401 means the session is over" handling it became a reload every two
    seconds that never let the page settle — one staff account produced 1,560 of
    them in a single sitting. The client no longer trusts a lone 401 that far,
    but the honest fix is here: the roster this returns is the caller's OWN
    school, which is exactly what staff are signed in to see.

    Widening the token list does NOT widen what can be read. `school` is checked
    against the caller's own school by the authenticator's tenant boundary
    (`belongs_to_school`), so a staff token still cannot ask for school 27's
    birthdays any more than it could before.
    """

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    allowed_roles = {"student": Student, "staff": Staff}

    @method_decorator(cache_page(60 * 60 * 6))  # 6 hours
    def get(self, request, *args, **kwargs):
        school_id = request.query_params.get("school")
        count = request.query_params.get("count")
        count = self.getBooleanValue(count) or False
        role = kwargs.get("role", None)
        MODEL = self.allowed_roles.get(role)
        if school_id and MODEL:
            # `id` and `image` are here for the birthday CARD, which draws the
            # person's photo. Both models carry an `image`, and adding fields to
            # a `.values()` is backward-compatible — the dashboard tiles that
            # have always read this endpoint simply ignore the extra keys.
            _return_fields = [
                "id", "image", "name", "birth_date", "month", "day",
                "is_birthday_today",
            ]
            today = date.today()
            current_month = today.month
            current_day = today.day
            #
            data = MODEL.objects.filter(is_active=True)
            query = Q(month=current_month)
            if role == UserRoles.ROLE_STAFF:
                data = data.annotate(birth_date=F("other_info__birth_date"))
                query &= Q(school=school_id)
            elif role == UserRoles.ROLE_STUDENT:
                _return_fields.append("class_info")
                query &= Q(class_info__school=school_id)
            data = data.annotate(
                name=nameConcat(),
                month=ExtractMonth("birth_date"),
                day=ExtractDay("birth_date"),
                is_birthday_today=Case(
                    When(Q(month=current_month, day=current_day), then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
            ).filter(query)
            if count:
                data = data.filter(query, day=current_day).count()
                return Response({"count": data})
            else:
                data = data.filter(query, day__gte=current_day).values(*_return_fields)
            paginator = BirthdayPagination()
            data = paginator.paginate_queryset(data, request)
            if role == UserRoles.ROLE_STUDENT:
                class_info_ids = [e.get("class_info") for e in data]
                classnames = {
                    e.id: getClassDetails(None, False, True, False, e)[0]
                    for e in ClassInfo.objects.filter(
                        id__in=class_info_ids, is_active=True
                    )
                }
                data = [
                    {"classname": classnames.get(e.pop("class_info")), **e}
                    for e in data
                ]
            return paginator.get_paginated_response(data)
        return self.RESPONSE__INVALID_REQUEST

    classnames = {}

    def cacheClassname(self, class_info_id: int) -> str:
        if not class_info_id:
            return ""
        classname = self.classnames.get(class_info_id)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(class_info_id, False)
            self.classnames[class_info_id] = classname
        return classname
