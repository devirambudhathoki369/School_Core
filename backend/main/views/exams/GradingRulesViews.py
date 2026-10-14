from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.exams.GradingRules import GradingRules
from ...serializers.exams.GradingRulesSerializer import GradingRulesSerializer
from docs.api_docs.api.exam_results import GRADING_RULES_API


class GradingRulesView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    @swagger_auto_schema(**GRADING_RULES_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        type = request.query_params.get("type")
        if school_id and type:
            rules = (
                GradingRules.objects.filter(school=school_id, type=type)
                .values("id", "rules")
                .first()
            )
            if rules:
                return Response(rules)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **GRADING_RULES_API["post"], request_body=GradingRulesSerializer
    )
    def post(self, request):
        s = GradingRulesSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Exam grading rules saved!"})
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **GRADING_RULES_API["put"], request_body=GradingRulesSerializer
    )
    def put(self, request):
        id = request.data.get("id")
        if id:
            # by id alone, any school could rewrite another school's grading
            rule = self.scope_to_caller(
                GradingRules.objects.filter(id=id), request
            ).first()
            if rule:
                s = GradingRulesSerializer(
                    instance=rule, data=request.data, partial=True
                )
                if s.is_valid():
                    s.save()
                    return Response({"message": "Exam grading rules updated!"})
        return self.RESPONSE__INVALID_REQUEST
