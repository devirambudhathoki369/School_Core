import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser
from drf_yasg.utils import swagger_auto_schema

#
from django.db.models import Q

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from account.auth.UserRole import UserRoles

#
from ...models.SchoolAdmin import SchoolAdmin, SchoolImage
from ...serializers.SchoolAdminSerializer import (
    SchoolSerializer,
    SchoolAdminSerializer,
    SchoolImageSerializer,
    SchoolImageParamsSerializer,
)
from ..BaseViews import SecuredAPIView
from ...methods.removeImages import clearImages, requestedRemovals

TAGS = ["school admin"]
security_logger = logging.getLogger("django.security")


class SchoolsView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)
    swagger_schema = None

    def get(self, request):
        id = request.query_params.get("school", None)
        include_sign = request.query_params.get("include_sign") or False
        RETURN_FIELDS = ("id",)
        if include_sign:
            RETURN_FIELDS += ("sign", "account__username")
        else:
            RETURN_FIELDS += ("name",)
        #
        q = Q(test_account=False, is_active=True)
        if id:
            q &= Q(id=id)
        objects = (
            SchoolAdmin.objects.filter(q)
            .defer("created_at")
            .values(*RETURN_FIELDS)
            .order_by("created_at")
        )
        s = SchoolSerializer(objects, many=True)
        return Response(s.data, status=status.HTTP_200_OK)

    # The pictures a school manages for itself from its profile page.
    SCHOOL_IMAGES = ("logo", "award_logo", "sign", "exam_coordinator_sign")
    # Everything a school may change on its OWN record: those pictures and its
    # settings. The rest of the row — the renewal date, the name and PAN, the
    # SMS / mobile-app / hostel switches — is what the school is licensed for,
    # and only a superadmin sets it. In two years of history no school account
    # has ever changed anything outside this list.
    SCHOOL_OWN_FIELDS = SCHOOL_IMAGES + ("preferences",)

    def ownFieldsOnly(self, request, school):
        """The request's data, cut down to what a school may change itself.

        Anything else is dropped rather than refused: a client that sends the
        whole profile back with one setting changed keeps working, and the
        fields it had no business changing simply do not move. A dropped value
        that DIFFERS from what is stored is an attempt to change it, and is
        logged.
        """
        data = {
            key: request.data.get(key)
            for key in request.data.keys()
            if key in self.SCHOOL_OWN_FIELDS
        }
        tried = [
            key
            for key in request.data.keys()
            if key not in self.SCHOOL_OWN_FIELDS
            and key not in ("id", "school")
            and hasattr(school, key)
            and str(request.data.get(key)) != str(getattr(school, key))
        ]
        if tried:
            security_logger.warning(
                "school-scope refused: %s tried to set %s on school %s",
                getattr(request.user, "username", "?"),
                ", ".join(sorted(tried)),
                school.pk,
            )
        return data

    def ownsSchool(self, request, school_id):
        """Is this caller allowed to change THAT school's record?

        The school here is named by `id`, not by the `school` key the
        authenticator scopes on, so nothing upstream has checked it: an admin
        or staff account could address another school's record. A superadmin
        is bound to no school and may edit any.
        """
        # imported here: account.views imports this package's base view
        from account.views import caller_school_ids

        own = caller_school_ids(request)
        return own is None or school_id in own

    def isSchoolAccount(self, request):
        """An admin or staff of a school, as opposed to a superadmin."""
        from account.views import caller_school_ids

        return caller_school_ids(request) is not None

    def put(self, request):
        # Read, not popped: form data without a file is immutable, and the
        # serializer ignores `id` anyway (it is the read-only key).
        school_id = request.data.get("id")
        if isinstance(school_id, (list, tuple)):
            school_id = school_id[0] if school_id else None
        try:
            school_id = int(school_id)
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST
        if not self.ownsSchool(request, school_id):
            security_logger.warning(
                "school-scope refused: %s tried to update school %s",
                getattr(request.user, "username", "?"),
                school_id,
            )
            return Response(
                {"message": "Not permitted for this school."},
                status=status.HTTP_403_FORBIDDEN,
            )
        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            return self.RESPONSE__INVALID_REQUEST
        # Taking a logo or a signature off — see methods/removeImages.
        removals = requestedRemovals(request.data, self.SCHOOL_IMAGES)
        if removals is not None:
            if not removals:
                return self.RESPONSE__INVALID_REQUEST
            removed = clearImages(school, removals)
            return Response({"message": "Image deleted!", "removed": removed})
        data = request.data
        if self.isSchoolAccount(request):
            data = self.ownFieldsOnly(request, school)
            if not data:
                # Nothing in the request was the school's to change, so the
                # row is not touched at all — not even its updated_at.
                return Response({"message": "Profile updated!"})
        s = SchoolAdminSerializer(school, data, partial=True)
        if s.is_valid():
            school = s.save()
            response = {"message": "Profile updated!"}
            # Where each uploaded picture now lives, so the page can show the
            # saved image at once instead of waiting for the next sign-in.
            images = {
                name: str(getattr(school, name) or "")
                for name in self.SCHOOL_IMAGES
                if name in request.data
            }
            if images:
                response["images"] = images
                response["image"] = next(iter(images.values()))
            return Response(response)
        return self.RESPONSE__INVALID_REQUEST


class SchoolImageView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)
    # Reading is for everyone in the school — the app shows these to students.
    # Changing them is for the school's admin and the staff whose menu opens
    # the page. This list used to name the admin alone and was never applied
    # (see check_permission), so a student's login could add, replace and
    # delete any school's slide-show pictures.
    allowed_user_roles = {
        # "get": ["admin", "student", "staff"],
        "post": [UserRoles.ROLE_ADMIN, UserRoles.ROLE_STAFF],
        "put": [UserRoles.ROLE_ADMIN, UserRoles.ROLE_STAFF],
        "delete": [UserRoles.ROLE_ADMIN, UserRoles.ROLE_STAFF],
    }
    include_docs = True

    @swagger_auto_schema(tags=TAGS, query_serializer=SchoolImageParamsSerializer)
    def get(self, request):
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        if school_id:
            query = Q(school=school_id)
            if id:
                query &= Q(id=id)
            images = SchoolImage.objects.filter(query).values("id", "image", "school")
            return Response(images)
        return self.RESPONSE__INVALID_REQUEST

    def getImage(self, instance):
        return {
            "id": instance.id,
            "school": instance.school_id,
            "image": instance.image.url if instance.image else "",
        }

    @swagger_auto_schema(tags=TAGS, request_body=SchoolImageSerializer)
    def post(self, request):
        allowed = self.check_permission(request)
        if not allowed:
            return self.RESPONSE__NOT_ALLOWED
        serializer = SchoolImageSerializer(data=request.data)
        if not serializer.isWithinMaxLimit():
            return Response({"message": "Limit exceeded!"})
        if serializer.is_valid():
            ins = serializer.save()
            return Response(
                {
                    "message": "Image uploaded!",
                    "image": self.getImage(ins),
                }
            )
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=TAGS, request_body=SchoolImageSerializer)
    def put(self, request):
        allowed = self.check_permission(request)
        if not allowed:
            return self.RESPONSE__NOT_ALLOWED
        school_id = request.data.get("school")
        id = request.data.get("id")
        if id and school_id:
            instance = SchoolImage.objects.get(id=id, school=school_id)
            if instance:
                serializer = SchoolImageSerializer(
                    instance, data=request.data, partial=True
                )
                if serializer.is_valid():
                    ins = serializer.save()
                    return Response(
                        {
                            "message": "Image uploaded!",
                            "image": self.getImage(ins),
                        }
                    )
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=TAGS, query_serializer=SchoolImageParamsSerializer)
    def delete(self, request):
        allowed = self.check_permission(request)
        if not allowed:
            return self.RESPONSE__NOT_ALLOWED
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        if id and school_id:
            instance = SchoolImage.objects.get(id=id, school=school_id)
            if instance:
                instance.delete()
                return Response({"message": "Image deleted!", "image": None})
        return self.RESPONSE__INVALID_REQUEST
