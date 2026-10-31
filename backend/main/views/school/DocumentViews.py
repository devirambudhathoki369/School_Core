import mimetypes

from django.core.signing import BadSignature
from django.http import FileResponse, Http404
from rest_framework.views import APIView

from main.methods.uploads import PrivateDocumentStorage


class StudentDocumentView(APIView):
    """
    One identity document, for whoever holds a signed link to it. The link is the
    permission: only a screen allowed to read the student gets one, and it expires.
    """

    authentication_classes = ()
    permission_classes = ()
    swagger_schema = None

    def get(self, request, token):
        try:
            name = PrivateDocumentStorage.name_from_link(token)
        except BadSignature:
            raise Http404
        storage = PrivateDocumentStorage()
        try:
            response = FileResponse(
                storage.open(name, "rb"),
                content_type=mimetypes.guess_type(name)[0] or "application/octet-stream",
            )
        except FileNotFoundError:
            raise Http404
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "default-src 'none'"
        return response
