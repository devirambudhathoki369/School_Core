from django.db.models import Value, F, CharField
from django.db.models.functions import Concat, Cast

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.superadmin.NoticeSA import NoticeSA

LIMIT = 7


class MessagesFromOrgView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        base = request.build_absolute_uri("/")[:-1]
        qs = (
            NoticeSA.objects.order_by("-id")
            .annotate(
                src=Concat(
                    Value(base), Cast(F("file"), CharField()), output_field=CharField()
                )
            )
            .only("id", "file", "alt")
            .order_by("-id")[:LIMIT]
        )
        data = [{"id": o.id, "src": base + o.file.url, "alt": o.alt} for o in qs]
        return Response(data)
