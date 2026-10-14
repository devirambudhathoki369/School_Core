from rest_framework import status
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from .BaseViews import SecuredAPIView
from ..models.FiscalYears import EconomicYear, AcademicYear, AcademicYearMapping
from ..models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from ..methods.academicYear import gen_class_key
from account.auth.Authentication import (
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from ..serializers.FiscalYearSerializers import (
    EconomicYearSerializer,
    AcademicYearSerializer,
    AcademicYearMappingSerializer,
    #
    AcademicYearParamsSerializer,
)

#
from django.db.models import Case, When, Value, CharField, Q

RETURN_FIELDS = ("id", "name", "start_date", "end_date", "status")

FISCAL_YEARS_TAGS = ["fiscal years"]


class AcademicYearKeyGenMixin:
    def genKeyFromClassInfo(self, class_info):
        # single source of truth lives in methods.academicYear.gen_class_key
        return gen_class_key(class_info)

    def genAcademicYearKeysFromClasses(self, school_id: int, classes: list) -> dict:
        academic_year_mappings = {
            mapping.get("key"): mapping.get("academic_year")
            for mapping in AcademicYearMapping.objects.filter(school=school_id)
            .values("key", "academic_year")
            .order_by("-id")
        }
        classes_academic_years = {
            clsId: academic_year_mappings.get(key) or None
            for clsId, (_, class_info, _) in classes.items()
            if (key := self.genKeyFromClassInfo(class_info)) is not None
            and key in academic_year_mappings
        }
        return classes_academic_years


class FiscalYearView:
    YearModel = None
    YearSerializer = None
    RESPONSE__INVALID_REQUEST = Response({"message": "Invalid request!"})
    status_annot = Case(
        When(closed=True, then=Value("closed")),
        default=Value("open"),
        output_field=CharField(),
    )

    # WHO MAY CREATE A YEAR.
    #
    # Creating a fiscal year is a superadmin act; a school moves into its next
    # year through the CLOSING flow, which creates the year itself and carries
    # the balances across in the same transaction.
    #
    # The standalone "add a year" form the schools used to have is what
    # produced the rows we keep retiring by hand: a second `SCHOOL 2083`
    # alongside the real one (school 51, school 67), years ending 2083-03-31
    # when Ashad has 32 days, years nobody ever mapped to a class-group. None
    # of it is recoverable by the school — every one of those needed a DB-level
    # repair — so the create path is closed at the API, not merely hidden in
    # the UI.
    #
    # GET is untouched: every role still reads the year list it needs.
    CREATOR_ROLES = (UserRoles.ROLE_SUPERADMIN, UserRoles.ROLE_SUPERUSER)
    RESPONSE__CREATE_NOT_ALLOWED = Response(
        {
            "message": "Only the system administrator can create a new year. "
            "Use the year-closing flow to move into the next year, "
            "or contact support."
        },
        status=status.HTTP_403_FORBIDDEN,
    )

    def canCreateYear(self, request):
        return getattr(request, "user_role", None) in self.CREATOR_ROLES

    def getYearsBySchoolId(self, request):
        school_id = request.query_params.get("school")
        closed = request.query_params.get("closed") or False
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        q = Q(school__id=school_id, is_active=True)
        # `closed=all` -> return BOTH open and closed years (needed so past
        # fiscal years can be selected for viewing reports / transaction history).
        # Any other value keeps the old default: open-only unless closed is truthy.
        if str(closed).lower() != "all":
            # Normalize to a real bool. The query param arrives as a raw string;
            # Django's BooleanField rejects lowercase "true"/"false" (only "True"/
            # "1"/"t"), so filtering with the raw value 500s. Parse it ourselves.
            closed = str(closed).lower() in ("true", "1", "t", "yes")
            q &= Q(closed=closed)
        years = (
            self.YearModel.objects.filter(q)
            .annotate(status=self.status_annot)
            .values(*RETURN_FIELDS)
            .order_by("-id")
        )
        return Response(years)

    def getYears(self):
        years = (
            self.YearModel.objects.annotate(status=self.status_annot)
            .values(*RETURN_FIELDS)
            .order_by("-id")
        )
        return Response(years)

    def saveYear(self, request):
        s = self.YearSerializer(data=request.data)

        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Year saved!",
                    "year": self.getYearDict(ins),
                }
            )
        # Say WHAT was wrong, at a status the client reads as a failure. This
        # used to answer a flat `{"message": "Invalid request!"}` with NO status
        # — i.e. 200 — so a rejected year cleared the form and looked saved.
        # The serializer's duplicate-name and date-order rules are only useful
        # if the operator gets to read them.
        return Response(
            {"message": self.getSerializationError(s)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def getYearDict(self, instance):
        return {
            "id": instance.id,
            "name": instance.name,
            "start_date": instance.start_date,
            "end_date": instance.end_date,
            "status": "closed" if instance.closed else "open",
        }


class EconomicYearView(SecuredAPIView, FiscalYearView):
    authentication_classes = (
        AdminTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    YearModel = EconomicYear
    YearSerializer = EconomicYearSerializer
    swagger_schema = None

    def get(self, request):
        return self.getYears()

    def post(self, request):
        if not self.canCreateYear(request):
            return self.RESPONSE__CREATE_NOT_ALLOWED
        return self.saveYear(request)


class AcademicYearView(SecuredAPIView, FiscalYearView, AcademicYearKeyGenMixin):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        UserTokenAuthentication,
        StudentTokenAuthentication,
        SuperAdminTokenAuthentication,
    )
    YearModel = AcademicYear
    YearSerializer = AcademicYearSerializer
    include_docs = True

    @swagger_auto_schema(
        tags=FISCAL_YEARS_TAGS, query_serializer=AcademicYearParamsSerializer
    )
    def get(self, request):
        class_info_id = request.query_params.get("class_info")
        if class_info_id:
            return self.getAcademicYearByClassId(class_info_id)
        return self.getYearsBySchoolId(request)

    academic_year_mapping_fields = ("id", "name", "start_date", "end_date", "closed")

    def getAcademicYearByClassId(self, class_info_id):
        cls = (
            ClassInfo.objects.filter(id=class_info_id)
            .values(*CLASS_DETAILS_FIELDS, "school", "batch")
            .first()
        )
        if cls:
            school_id = cls.get("school")
            key = self.genKeyFromClassInfo(cls)
            if key and school_id:
                item = (
                    AcademicYearMapping.objects.filter(key=key, school=school_id)
                    .select_related("academic_year")
                    .only(
                        *(
                            f"academic_year__{f}"
                            for f in self.academic_year_mapping_fields
                        )
                    )
                    .order_by("-id")
                    .first()
                )
                if item:
                    data = self.getYearDict(item.academic_year)
                    return Response([data])
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        tags=FISCAL_YEARS_TAGS, query_serializer=AcademicYearSerializer
    )
    def post(self, request):
        # Superadmin only — see FiscalYearView.CREATOR_ROLES. The academic-year
        # CLOSING flow does not come through here: AcademicYearCloseView builds
        # the next year itself, inside the same transaction that rolls the
        # balances, so schools keep closing exactly as before.
        if not self.canCreateYear(request):
            return self.RESPONSE__CREATE_NOT_ALLOWED
        return self.saveYear(request)


class AcademicYearMappingView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        UserTokenAuthentication,
        SuperAdminTokenAuthentication,
    )
    swagger_schema = None

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            data = (
                AcademicYearMapping.objects.filter(school=school_id)
                .values("id", "key", "academic_year")
                .order_by("-id")
            )
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = AcademicYearMappingSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Academic year assigned!",
                    "year": {
                        "id": ins.id,
                        "key": ins.key,
                        "academic_year": ins.academic_year.id,
                    },
                }
            )
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.get("id")
        if id:
            # by id alone, any school could re-point another school's classes
            # to a different academic year
            ins = self.scope_to_caller(
                AcademicYearMapping.objects.filter(id=id), request
            ).first()
            if ins:
                s = AcademicYearMappingSerializer(ins, data=request.data, partial=True)
                if s.is_valid():
                    ins = s.save()
                    return Response(
                        {
                            "message": "Academic year re-assigned!",
                            "year": {
                                "id": ins.id,
                                "academic_year": ins.academic_year.id,
                            },
                        }
                    )
        return self.RESPONSE__INVALID_REQUEST
