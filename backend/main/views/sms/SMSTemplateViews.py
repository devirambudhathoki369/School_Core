from django.db.models import Q

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.SMSTemplate import SMSTemplate
from ...serializers.SMSTemplateSerializer import SMSTemplateSerializer


class SMSTemplateViews(SecuredAPIView):
    # Staff reach this page from their own menu when the school grants it, so
    # a staff token must be accepted too — admin-only answered them with a bare
    # "Unauthorized." on every load and save. The authenticator already checks
    # that the `school` sent belongs to the caller.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        template_type = request.query_params.get("type")
        if school_id:
            q = Q(school=school_id)
            if template_type:
                q &= Q(type=template_type)
            templates = (
                SMSTemplate.objects.filter(q)
                .order_by("type", "-id")
                .distinct("type")
                .values("id", "type", "template")
            )
            return Response(templates)
        return self.RESPONSE__NOT_FOUND

    def post(self, request):
        s = SMSTemplateSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "SMS Template saved!"})
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            # Scoped to the school the authenticator vouched for, so an id
            # alone cannot reach another school's template.
            template = SMSTemplate.objects.filter(id=id, school=school_id).first()
            if template:
                s = SMSTemplateSerializer(template, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "SMS Template updated!"})
            return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST
