import logging
import re

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
from ..constants.staff_permissions import ANY_STAFF, STAFF_PERMISSIONS

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


def caller_staff_permissions(request):
    """The permission ids a staff token's account holds; empty for any other."""
    cached = getattr(request, "_caller_staff_permissions", None)
    if cached is not None:
        return cached
    held = set()
    if isinstance(getattr(request, "auth", None), StaffAuthToken):
        rows = Staff.objects.filter(account_id=request.user.pk).values_list(
            "permissions", flat=True
        )
        for permissions in rows:
            for permission in permissions or ():
                try:
                    held.add(int(permission))
                except (TypeError, ValueError):
                    pass
    request._caller_staff_permissions = held
    return held


class SecuredAPIView(APIView):
    permission_classes = (permissions.IsAuthenticated,)
    # Handler names ("post", "put", ...) a STUDENT token may call that change
    # something. Empty by default — see enforce_student_boundary.
    student_write_methods = ()
    # Library views serve guest schools' borrowers as well (LibraryGuestSchool,
    # scoped by library.methods.guestSchools), so the students and staff they
    # name may belong to another school by design.
    allow_other_school_people = False
    # Other request keys this view reads as ids of school-owned records,
    # {key: (Model, path to its school)} -- checked like class_info/student/
    # staff by enforce_named_records_scope. Per view, because the same key is
    # a plain value elsewhere (a fee `title` here, a notice's there).
    scoped_fields = {}
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
        self.enforce_staff_permissions(request)
        self.enforce_named_records_scope(request)

    def enforce_staff_permissions(self, request):
        """
        A STAFF token may only make the calls its permissions' screens make.

        A school admin gives each staff member permissions (Manage > Users),
        and the menu showed them only those screens -- but every API took any
        staff token, so a teacher allowed to enter marks could post fees, void
        invoices, read the accounts or send bulk SMS by calling the endpoint.
        constants/staff_permissions.py lists, per view and method, the
        permissions whose screens make the call (generated from the frontend;
        see tools/staff_permissions). A view or method it does not list is
        the admin's alone.

        ENFORCE_STAFF_PERMISSIONS off: logged as "would refuse", not refused.
        """
        if not isinstance(getattr(request, "auth", None), StaffAuthToken):
            return
        method = request.method.lower()
        if method == "options":
            return
        if method == "head":
            method = "get"
        view = f"{type(self).__module__}.{type(self).__qualname__}"
        needed = STAFF_PERMISSIONS.get(view, {}).get(method, ())
        if needed == ANY_STAFF:
            return
        held = caller_staff_permissions(request)
        if held.intersection(needed):
            return
        enforce = getattr(settings, "ENFORCE_STAFF_PERMISSIONS", False)
        security_logger.warning(
            "staff permission %s: %s %s (%s.%s) by %s needs %s, holds %s",
            "refused" if enforce else "would refuse",
            request.method,
            request.path,
            view,
            method,
            getattr(request.user, "username", "?"),
            sorted(needed) or "admin",
            sorted(held),
        )
        if enforce:
            raise PermissionDenied("Your account does not have permission for this.")

    # Request keys that name a class / student / staff record, mapped to which.
    SCOPED_ID_KEYS = {
        "class_info": "class_info",
        "class_info_id": "class_info",
        "student": "student",
        "student_id": "student",
        "students": "student",
        "staff": "staff",
        "staff_id": "staff",
    }
    # `?class=` is a class id to the fee, fee-title, ledger and optional-subject
    # reads, which showed any school's fee structure for it. Query string only:
    # in a body `class` can be free text ("10" on a character certificate).
    SCOPED_QUERY_ID_KEYS = {**SCOPED_ID_KEYS, "class": "class_info"}
    _MAX_BODY_DEPTH = 6
    _FORM_KEY_PARTS = re.compile(r"\[([^\]]*)\]")

    @classmethod
    def scoped_kind(cls, key, keys=None):
        """
        Which record `key` names, if any.

        A multipart body flattens its rows into keys like `pairs[0][student]`
        or `data[12][class_info_id]` -- views unpack them, so the id reaches the
        database just the same -- and those keys never matched by exact name.
        Such a key is read by its last name; `student_id[]` by its own.
        """
        keys = cls.SCOPED_ID_KEYS if keys is None else keys
        kind = keys.get(key)
        if kind or not isinstance(key, str) or "[" not in key:
            return kind
        names = [
            part for part in cls._FORM_KEY_PARTS.findall(key)
            if part and not part.isdigit()
        ]
        return keys.get(names[-1] if names else key.split("[", 1)[0])

    @staticmethod
    def as_record_id(value):
        """
        The integer id `value` would become in a lookup, or None.

        Matches what Django and DRF accept, not just tidy digit strings: an
        id sent as `12.0`, "+12", " 12 ", "1_2" or "12.0" is still row 12 to the
        ORM / an IntegerField, and was slipping past a check that only counted
        `str.isdigit()`.
        """
        if isinstance(value, bool):
            return None
        rid = None
        if isinstance(value, int):
            rid = value
        elif isinstance(value, float):
            rid = int(value) if value.is_integer() else None
        elif isinstance(value, str):
            text = value.strip()
            try:
                rid = int(text)
            except ValueError:
                try:
                    number = float(text)
                except ValueError:
                    return None
                rid = int(number) if number.is_integer() else None
        # beyond a database id's range it names no row
        if rid is None or abs(rid) > 2**63 - 1:
            return None
        return rid

    @classmethod
    def _named_record_ids(cls, request, keys=None, query_keys=None):
        """
        {"class_info": ids, "student": ids, "staff": ids} for every such id the
        request names: query string (incl. `key[]` lists), the body's top level,
        and rows nested inside it (a posting's student ledgers, an attendance
        roll, marks rows) — a nested row reaches the database just the same.
        `keys` / `query_keys` swap in another {request key: kind} map.
        """
        keys = cls.SCOPED_ID_KEYS if keys is None else keys
        query_keys = cls.SCOPED_QUERY_ID_KEYS if query_keys is None else query_keys
        found = {kind: set() for kind in {*keys.values(), *query_keys.values()}}

        def take(kind, value):
            values = value if isinstance(value, (list, tuple)) else [value]
            for v in values:
                rid = cls.as_record_id(v)
                if rid is not None:
                    found[kind].add(rid)

        for key, values in request.query_params.lists():
            kind = cls.scoped_kind(key, query_keys)
            if kind:
                take(kind, values)

        def walk(node, depth):
            if depth > cls._MAX_BODY_DEPTH:
                return
            if isinstance(node, dict):
                items = node.lists() if hasattr(node, "lists") else node.items()
                for key, value in items:
                    kind = cls.scoped_kind(key, keys)
                    if kind:
                        take(kind, value)
                    if isinstance(value, (dict, list, tuple)):
                        walk(value, depth + 1)
            elif isinstance(node, (list, tuple)):
                for value in node:
                    if isinstance(value, (dict, list, tuple)):
                        walk(value, depth + 1)

        walk(request.data, 0)
        return found

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
        named = self._named_record_ids(request)
        if self.scoped_fields:
            # this view's own keys: {key: (Model, path to its school)}
            own = {key: key for key in self.scoped_fields}
            named.update(self._named_record_ids(request, own, own))
            checks += [
                (key, Model, f"{school_path}__in")
                for key, (Model, school_path) in self.scoped_fields.items()
            ]
        for key, Model, school_lookup in checks:
            ids = named[key]
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
