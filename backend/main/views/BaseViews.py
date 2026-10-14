from rest_framework.views import APIView
from rest_framework import permissions
from rest_framework.exceptions import AuthenticationFailed
from django.db.models import Q
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.serializers import BooleanField, ValidationError

#
from ..models.ClassInfo import ClassInfo
from .fields import CLASS_DETAILS_FIELDS


class SecuredAPIView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    # authentication_classes=()
    RESPONSE__INVALID_REQUEST = Response(
        {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
    )
    RESPONSE__NOT_FOUND = Response(
        {"message": "Not Found!"}, status=status.HTTP_404_NOT_FOUND
    )
    RESPONSE__ALREADY_EXISTS = Response(
        {"message": "Record already exists!"}, status=status.HTTP_409_CONFLICT
    )
    RESPONSE__NOT_ALLOWED = Response(
        {"message": "Not allowed!"}, status=status.HTTP_405_METHOD_NOT_ALLOWED
    )
    parser_classes = (JSONParser,)
    include_docs = False
    allowed_user_roles = {}

    def __init__(self, **kwargs) -> None:
        include_docs = getattr(self, "include_docs")
        if not include_docs:
            setattr(self, "swagger_schema", None)
        super().__init__(**kwargs)

    def perform_authentication(self, request):
        authentications = []
        if len(self.authentication_classes) > 1:
            for authenticator in self.get_authenticators():
                try:
                    user_auth = authenticator.authenticate(request)
                    if user_auth is not None:
                        authentications.append(user_auth)
                        setattr(request, "user_role", authenticator.role)
                        break
                except AuthenticationFailed:
                    # Handle failed authentication
                    # For instance, you might want to continue, log an error, or raise an exception
                    pass
            if not authentications:
                raise AuthenticationFailed("Authentication failed!")
            # Optionally, you might want to set request.user and request.auth
            # to the results of the first successful authentication, as an example
            request.user, request.auth = authentications[0]
            # If you need to do something with the results of the second authentication,
            # you can access it from the authentications list, if it exists
        else:
            return super().perform_authentication(request)

    def key(self, fieldType, field, parent=None, isNull=False):
        """samples;
        first_name__icontains [string]
        class_info__faculty [foreign]
        education_level [choices]
        """
        #
        field = f"{parent}__{field}" if parent else f"{field}"
        if fieldType == "string":
            field += "__isnull" if isNull else "__istartswith"
        elif fieldType == "foreign":
            field += "__isnull" if isNull else "__id"
        elif fieldType == "choices":
            if isNull:
                field += "__isnull"
        return field

    def query(self, fields, data, fieldType, parent=None, useNull=False):
        q = Q()
        for field in fields:
            if field in data:
                value = data.get(field)
                if not value:
                    data[field] = None
                filter = self.key(fieldType, field, parent)
                q &= Q(**{filter: data[field]})
            elif useNull:
                filter = self.key(fieldType, field, parent, True)
                q &= Q(**{filter: True})
        return q

    def getClassInfoQuery(self, class_info_id, class_only=False):
        # VIEWS USING SUCH APPROACH MUST BE PASSED CLASS_INFO_DETAILS INSTEAD OF ID!
        class_info = (
            ClassInfo.objects.filter(id=class_info_id, is_active=True)
            .values(*CLASS_DETAILS_FIELDS, "school")
            .first()
        )
        if class_info:
            class_info.pop("section")
            class_info = {f"class_info__{k}": v for k, v in class_info.items() if v}
            rquery = Q(**class_info)
            if class_only:
                rquery &= Q(class_info__section__isnull=True)
            return rquery
        return Q()

    def check_permission(self, request):
        # `request.method` is upper case ("PUT") and the lists are keyed in
        # lower case ("put"): looked up as it came, nothing ever matched and
        # every role was let through.
        request_method = request.method
        _roles = self.allowed_user_roles.get(
            request_method
        ) or self.allowed_user_roles.get(request_method.lower())
        _user_role = getattr(request, "user_role", None)
        if _roles and _user_role:
            return _user_role in _roles
        return True

    def getBooleanValue(self, value):
        if not value:
            return None
        try:
            boolean_field = BooleanField()
            status_value = boolean_field.to_internal_value(value)
            return status_value
        except ValidationError:
            return None

    def getSerializationError(self, serializer):
        errors = serializer.errors.values()
        if len(errors) > 0:
            return next(iter(errors))[0]
        return "Something went wrong!"


class BaseSearchView(SecuredAPIView):
    permission_classes = (permissions.IsAuthenticated,)
