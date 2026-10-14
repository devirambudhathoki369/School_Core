import logging

from django.conf import settings
from rest_framework.views import APIView
from rest_framework import permissions
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from django.db.models import Q
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.serializers import BooleanField, ValidationError

#
from account.auth.AuthToken import (
    AdminAuthToken,
    StaffAuthToken,
    StudentAuthToken,
)
from ..models.ClassInfo import ClassInfo
from ..models.SchoolAdmin import SchoolAdmin
from ..models.Staff import Staff
from ..models.Student import Student
from .fields import CLASS_DETAILS_FIELDS

security_logger = logging.getLogger("django.security")

# Methods that change nothing.
READ_METHODS = ("GET", "HEAD", "OPTIONS")


def caller_school_ids(request):
    """
    The schools the signed-in account belongs to, or None when it is not bound
    to any one school (superadmin / superuser).

    The authenticator only validates a school the request NAMES (`?school=`).
    A handler that acts on a row by its id alone has to confine the lookup to
    these schools itself — otherwise any signed-in school reaches any other
    school's row by changing the id.
    """
    cached = getattr(request, "_caller_school_ids", "unset")
    if cached != "unset":
        return cached
    auth = getattr(request, "auth", None)
    user_pk = getattr(getattr(request, "user", None), "pk", None)
    if isinstance(auth, AdminAuthToken):
        ids = set(
            SchoolAdmin.objects.filter(account_id=user_pk).values_list("id", flat=True)
        )
    elif isinstance(auth, StaffAuthToken):
        ids = set(
            Staff.objects.filter(account_id=user_pk).values_list("school_id", flat=True)
        )
    elif isinstance(auth, StudentAuthToken):
        ids = set(
            Student.objects.filter(account_id=user_pk).values_list(
                "class_info__school_id", flat=True
            )
        )
    else:
        ids = None
    request._caller_school_ids = ids
    return ids


def caller_student_id(request):
    """The Student row behind a student token, else None."""
    if not isinstance(getattr(request, "auth", None), StudentAuthToken):
        return None
    cached = getattr(request, "_caller_student_id", "unset")
    if cached == "unset":
        cached = (
            Student.objects.filter(account_id=request.user.pk)
            .values_list("id", flat=True)
            .first()
        )
        request._caller_student_id = cached
    return cached


def is_student_request(request):
    return isinstance(getattr(request, "auth", None), StudentAuthToken)


class SecuredAPIView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    # Handler names ("post", "put", ...) a STUDENT token may call that change
    # something. Empty by default — see enforce_student_boundary.
    student_write_methods = ()
    # Library views serve guest schools' borrowers as well (LibraryGuestSchool,
    # scoped by library.methods.guestSchools), so the students and staff they
    # name may belong to another school by design.
    allow_other_school_people = False
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

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.enforce_student_boundary(request)
        self.enforce_named_records_scope(request)

    @staticmethod
    def _named_ids(request, key):
        """Integer ids the request names under `key` (query string or body)."""
        values = [request.query_params.get(key)]
        values += request.query_params.getlist(f"{key}[]")
        data = request.data
        if hasattr(data, "get"):
            body = data.get(key)
            values += body if isinstance(body, (list, tuple)) else [body]
        ids = set()
        for value in values:
            if isinstance(value, bool):
                continue
            if isinstance(value, int) or (
                isinstance(value, str) and value.strip().isdigit()
            ):
                ids.add(int(value))
        return ids

    def enforce_named_records_scope(self, request):
        """
        The class, student and staff ids a request names must be the caller's
        own school's.

        The authenticator proves the caller owns the `school` a request names —
        but most handlers then act on a `class_info`, `student` or `staff` id
        without re-checking it against that school, and many name no school at
        all. A staff login could read or rewrite another school's timetable,
        exam schedule, marks, fees or pupils by sending that school's ids. This
        closes the gap once, for every handler, on the three ids nearly all of
        them take. Superadmin/superuser tokens are not bound to a school.
        """
        schools = caller_school_ids(request)
        if schools is None:
            return
        checks = [("class_info", ClassInfo, "school__in")]
        if not self.allow_other_school_people:
            checks += [
                ("student", Student, "class_info__school__in"),
                ("staff", Staff, "school__in"),
            ]
        for key, Model, school_lookup in checks:
            ids = self._named_ids(request, key)
            if ids and (
                Model.objects.filter(id__in=ids)
                .exclude(**{school_lookup: schools})
                .exists()
            ):
                security_logger.warning(
                    "school-scope refused: %s %s by %s named %s %s",
                    request.method,
                    request.path,
                    getattr(request.user, "username", "?"),
                    key,
                    sorted(ids),
                )
                if getattr(settings, "ENFORCE_SCHOOL_SCOPE", True):
                    raise PermissionDenied("Not permitted for this school.")

    def enforce_student_boundary(self, request):
        """
        What a STUDENT token may do, decided once for every endpoint.

        Student tokens are accepted by two dozen views so the mobile app can
        READ — and almost none of those views asked who was writing. Any
        signed-in student (and student accounts are self-registered) could save
        exam marks, record a fee payment, delete a fee charge, grant a
        discount, post a school-wide notice, or edit the fee structure, simply
        by sending the POST/PUT/DELETE the admin screen sends.

        So, for a student token:
          · a write is refused unless the view lists that handler in
            `student_write_methods` (homework submission, bus-alert settings,
            device token, the read-only searches that happen to use POST);
          · a `student` named anywhere in the request must be the caller's own
            record — one student never reads or writes another's ledger,
            invoices, results or profile.
        """
        if not is_student_request(request):
            return
        handler = request.method.lower()
        if request.method not in READ_METHODS and handler not in self.student_write_methods:
            self._refuse_student(request, "write")
        own = caller_student_id(request)
        if own is None:
            self._refuse_student(request, "no student record")
        named = [request.query_params.get("student")]
        data = request.data
        if hasattr(data, "get"):
            named.append(data.get("student"))
        for value in named:
            if isinstance(value, (list, tuple)) and len(value) == 1:
                value = value[0]
            if value in (None, ""):
                continue
            if str(value).strip() != str(own):
                self._refuse_student(request, f"student {value!r}")

    def _refuse_student(self, request, reason):
        security_logger.warning(
            "student request refused: %s %s by %s (%s)",
            request.method,
            request.path,
            getattr(request.user, "username", "?"),
            reason,
        )
        raise PermissionDenied("Not permitted.")

    def scope_to_caller(self, queryset, request, field="school"):
        """
        Confine `queryset` to the caller's own school(s).

        For handlers that look a row up by id: the id is the caller's to
        choose, so the school has to come from the token, not the request.
        Superadmin/superuser tokens are not bound to a school and pass through.
        """
        schools = caller_school_ids(request)
        if schools is None:
            return queryset
        return queryset.filter(**{f"{field}__in": schools})

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
