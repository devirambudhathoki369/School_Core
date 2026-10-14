from rest_framework.response import Response
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from rest_framework.pagination import CursorPagination

#
from ...models.exams.Certificate import CharacterCertificate
from ..BaseViews import SecuredAPIView
from ...serializers.exams.CertificateSerializer import CharacterCertificateSerializer


class CharacterCertificateCursorPagination(CursorPagination):
    page_size = 15
    ordering = "-serial_no"


class CharacterCertificateView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            student_id = request.query_params.get("student")
            if student_id:
                return Response([])
            #
            certificates = CharacterCertificate.objects.filter(school=school_id).values(
                "serial_no", "data"
            )
            paginator = CharacterCertificateCursorPagination()
            certificates = paginator.paginate_queryset(certificates, request)
            certificates = [
                {"serial_no": cert.get("serial_no"), **(cert.get("data") or {})}
                for cert in certificates
            ]
            return paginator.get_paginated_response(certificates)

    def post(self, request):
        s = CharacterCertificateSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Character certificate saved!",
                    "data": {"serial_no": ins.serial_no},
                }
            )
        # print(s.errors)
        return self.RESPONSE__INVALID_REQUEST
