"""Errors of the mobile API: always {"error": {"code", "message", "fields"?}}."""
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class MobileError(exceptions.APIException):
    def __init__(self, code: str, message: str, http_status: int = status.HTTP_400_BAD_REQUEST, fields=None):
        self.error_code = code
        self.status_code = http_status
        self.fields = fields
        super().__init__(detail=message)


def _first(value):
    if isinstance(value, (list, tuple)) and value:
        return _first(value[0])
    if isinstance(value, dict):
        return {key: _first(item) for key, item in value.items()}
    return str(value)


def mobile_exception_handler(exc, context):
    if isinstance(exc, MobileError):
        body = {"code": exc.error_code, "message": str(exc.detail)}
        if exc.fields:
            body["fields"] = exc.fields
        return Response({"error": body}, status=exc.status_code)

    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, exceptions.ValidationError):
        fields = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
        body = {"code": "invalid", "message": "Check the highlighted fields.", "fields": _first(fields)}
    elif isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        body = {"code": "unauthenticated", "message": "Please sign in again."}
    elif isinstance(exc, exceptions.PermissionDenied):
        body = {"code": "forbidden", "message": "This is not available for your account."}
    elif isinstance(exc, exceptions.NotFound):
        body = {"code": "not_found", "message": "Nothing was found."}
    elif isinstance(exc, exceptions.Throttled):
        body = {"code": "rate_limited", "message": "Too many tries. Please wait and try again."}
        if exc.wait:
            body["retry_after"] = int(exc.wait)
    elif isinstance(exc, exceptions.MethodNotAllowed):
        body = {"code": "method_not_allowed", "message": "This action is not supported here."}
    else:
        body = {"code": "error", "message": "The request could not be completed."}
    headers = {k: v for k, v in response.items() if k in ("WWW-Authenticate", "Retry-After")}
    return Response({"error": body}, status=response.status_code, headers=headers)
