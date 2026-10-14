from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..models.Section import Section
from ..models.ClassInfo import ClassInfo
from ..methods.referential import first_blocking_reference
from ..serializers.SectionSerializer import SectionSerializer
from .BaseViews import SecuredAPIView
from .fields import CLASS_DETAILS_FIELDS
from docs.api_docs.api.manage import SECTIONS_API

#
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema


class SectionView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    @swagger_auto_schema(**SECTIONS_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        classwise = request.query_params.get("classwise") or False
        if school_id:
            if classwise:
                data = self.classwise_sections(school_id)
                return Response(data)
            items = (
                Section.objects.filter(school__id=school_id, is_active=True)
                .values("id", "section")
                .order_by("section")
            )
            s = SectionSerializer(items, many=True)
            return Response(s.data)
        return self.RESPONSE__INVALID_REQUEST

    def classwise_sections(self, school_id):
        data = ClassInfo.objects.filter(
            school=school_id, section__isnull=False, is_active=True
        ).values(*CLASS_DETAILS_FIELDS)
        sections = {e.get("section") for e in data}
        sections = Section.objects.filter(id__in=sections).values("id", "section")
        sections = {e.get("id"): e.get("section") for e in sections}
        return {"classes": data, "sections": sections}

    @swagger_auto_schema(**SECTIONS_API["post"], request_body=SectionSerializer)
    def post(self, request):
        s = SectionSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Section saved!",
                    "section": {"id": ins.id, "section": ins.section},
                }
            )
        return Response({"message": "Failed!"})

    @swagger_auto_schema(**SECTIONS_API["put"], request_body=SectionSerializer)
    def put(self, request):
        section_id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if not section_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        section = Section.objects.get(id=section_id, school__id=school_id)
        if not section:
            return self.RESPONSE__INVALID_REQUEST
        s = SectionSerializer(section, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Section updated!"})
        return Response({"message": "Something went wrong!"})

    @swagger_auto_schema(**SECTIONS_API["delete"])
    def delete(self, request):
        id = request.query_params.get("id", None)
        school_id = request.query_params.get("school", None)
        if id and school_id:
            section = Section.objects.get(id=id, school__id=school_id)
            if section:
                # don't delete a section that ANY class uses — including soft-deleted
                # (historical) ones. No is_active filter: once used/assigned
                # anywhere, ever, it must stay. Matches the Subject rule.
                blocker = first_blocking_reference(
                    [(ClassInfo.objects.filter(section=id), "classes")]
                )
                if blocker:
                    return Response(
                        {
                            "message": (
                                f"Cannot delete: this section is still used by "
                                f"{blocker}. Remove or reassign them first."
                            )
                        },
                        status=409,
                    )
                section.is_active = False
                section.save()
                return Response({"message": "Section deleted!"})
        return self.RESPONSE__INVALID_REQUEST
