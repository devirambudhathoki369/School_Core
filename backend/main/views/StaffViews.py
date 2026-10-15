import logging

from django.db.models import Value, CharField, Q
from django.db.models.functions import Concat, Lower, Collate

#
from rest_framework.response import Response
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from rest_framework.parsers import JSONParser, MultiPartParser

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

from account.auth.UserRole import UserRoles

#
from .BaseViews import SecuredAPIView
from ..methods.removeImages import clearImages, requestedRemovals
from ..models.Staff import StaffRole, Staff
from ..serializers.StaffSerializer import (
    StaffOtherInfoSerializer,
    StaffRoleSerializer,
    StaffSerializer,
)
from docs.api_docs.api.manage import STAFF_API

security_logger = logging.getLogger("django.security")

STAFF_DETAILS_RETURN_FIELDS = (
    "id",
    "name",
    "account",
    # TODO: add other field_names here!
)


class StaffView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    parser_classes = (JSONParser, MultiPartParser)

    def withoutPermissionGrants(self, request):
        """
        Drop `permissions` from a STAFF login's write.

        The staff serializer takes every field, so any staff login could set
        `permissions` on any colleague's record -- its own included -- or
        enrol a new staff with all of them, and so grant itself whatever the
        admin had withheld. Only the school admin assigns permissions (Manage
        > Users, an admin-only page); a value a staff login sends is ignored.
        """
        if getattr(request, "user_role", None) != UserRoles.ROLE_STAFF:
            return
        if "permissions" in request.data:
            security_logger.warning(
                "staff permission grant dropped: %s %s by %s",
                request.method,
                request.path,
                getattr(request.user, "username", "?"),
            )
            request.data.pop("permissions")

    @swagger_auto_schema(**STAFF_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        staff_id = request.query_params.get("staff")
        include_account = request.query_params.get("include_account")
        EMPLOYEED = 1
        if staff_id:
            staff = Staff.objects.filter(
                id=staff_id,
                school__id=school_id,
                is_active=True,
            ).first()
            if staff:
                s = StaffSerializer(staff, context={"include_account": include_account})
                #
                # print(s.data)
                return Response(s.data)
            else:
                return self.RESPONSE__NOT_FOUND
        else:
            RETURN_FIELDS = ("id", "name")
            with_accounts_only = request.query_params.get("with_accounts_only")
            as_options = request.query_params.get("as_options") or False
            if not as_options:
                RETURN_FIELDS += STAFF_DETAILS_RETURN_FIELDS
            q = Q(school=school_id, status=EMPLOYEED)
            if with_accounts_only:
                q &= Q(account__isnull=False)
            data = (
                Staff.objects.filter(q)
                .annotate(
                    name=Concat(
                        "first_name",
                        Value(" "),
                        "middle_name",
                        Value(" "),
                        "last_name",
                        output_field=CharField(),
                    )
                )
                .order_by(Collate("name", "und-x-icu"))
                .values(*RETURN_FIELDS)
            )
            return Response(data)

    @swagger_auto_schema(**STAFF_API["post"], request_body=StaffSerializer)
    def post(self, request):
        self.withoutPermissionGrants(request)
        s = StaffSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Staff enrolled!"})
        else:
            if "account" in s.errors and "username" in s.errors["account"]:
                return Response(
                    {"message": "Username already exists!"},
                    status=status.HTTP_409_CONFLICT,
                )
            # print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    # The one picture kept on a staff record.
    STAFF_IMAGES = ("image",)

    def removeImages(self, request):
        """Take the profile photo off a staff member — see methods/removeImages."""
        staff_id = self.formToJsonData(request.data.get("id"))
        school_id = self.formToJsonData(request.data.get("school"))
        names = requestedRemovals(request.data, self.STAFF_IMAGES)
        if not staff_id or not school_id or not names:
            return self.RESPONSE__INVALID_REQUEST
        staff = Staff.objects.filter(id=staff_id, school__id=school_id).first()
        if not staff:
            return self.RESPONSE__INVALID_REQUEST
        removed = clearImages(staff, names)
        return Response({"message": "Image deleted!", "removed": removed})

    @swagger_auto_schema(**STAFF_API["put"])
    def put(self, request):
        self.withoutPermissionGrants(request)
        _response__ok = {"message": "Staff information updated!"}
        if "id" in request.data and "remove" in request.data:
            return self.removeImages(request)
        if "id" in request.data:
            res = self.update(request.data)
            if res:
                if "image" in request.data:
                    _response__ok["image"] = str(res.image)
                return Response(_response__ok)
        else:
            return Response({"message": "Bulk update not implemented!"})
            # res = self.bulk_update(request.data)
            # if res:
            #     return Response(_response__ok)
        return self.RESPONSE__INVALID_REQUEST

    def formToJsonData(self, data):
        if not isinstance(data, list):
            return data
        return data[0] or ""

    def update(self, data):
        """only handles staff info, and other_info!"""
        staff_id = data.pop("id", None)
        school_id = data.pop("school", None)
        staff_id = self.formToJsonData(staff_id)
        school_id = self.formToJsonData(school_id)
        if not staff_id or not school_id:
            return False
        staff = Staff.objects.get(id=staff_id, school__id=school_id)
        if staff:
            s = self.getSerializer(staff, data)
            if not s:
                s = StaffSerializer(staff, data=data, partial=True)
            if s.is_valid():
                return s.save()
            else:
                # print(s.errors)
                pass
        return False

    def getSerializer(self, staff, data):
        """
        returns serializers for foreign nested fields [other_info].
        """
        other_info_data = data.pop("other_info", {})
        #
        if other_info_data:
            return StaffOtherInfoSerializer(
                staff.other_info, data=other_info_data, partial=True
            )
        return None


# STAFF-ROLE


class StaffRoleView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    swagger_schema = None

    def get(self, request):
        data = StaffRole.objects.values("id", "role")
        return Response(data)

    def post(self, request):
        sr = StaffRoleSerializer(data=request.data)
        if sr.is_valid():
            ins = sr.save()
            return Response(
                {
                    "message": "Saved staff-role",
                    "role": {"id": ins.id, "role": ins.role},
                }
            )
        # else:
        # print(sr.errors)
        return self.RESPONSE__INVALID_REQUEST
