"""
What the API answers when a view raises.

Most exceptions a view raises come from what it was sent: a word where an id
belongs, a key left out. Those are the caller's to fix, so they are a 400 and not
the server's 500. A write the database refuses is a 409. Each is still logged as
an error with its traceback, so a real bug does not hide behind the 400.
"""

import logging

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import DataError, IntegrityError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger("django.request")

REFUSED_BY_THE_DATABASE = (
    "This could not be saved, because it would duplicate a record or link to another school's. "
    "Refresh the page and try again."
)
FROM_THE_REQUEST = (ValueError, KeyError, TypeError, AttributeError, ObjectDoesNotExist, ValidationError, DataError)


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        return response
    view = type(context.get("view")).__name__
    if isinstance(exc, IntegrityError):
        logger.error("Refused by the database in %s", view, exc_info=exc)
        return Response({"message": REFUSED_BY_THE_DATABASE}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, FROM_THE_REQUEST):
        logger.error("Bad request reached %s", view, exc_info=exc)
        return Response({"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST)
    return None
