from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from drf_yasg.utils import swagger_auto_schema
from django.db import IntegrityError

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from ..models.Fee import Fee, FeeTitle, feeq
from ..models.ClassInfo import ClassInfo
from ..serializers.FeeSerializer import FeeSerializer, FeeTitleSerializer
from .BaseViews import SecuredAPIView
from ..methods.genClassname import getClassDetails
from docs.api_docs.api.manage import FEES_API, FEE_TITLES_API
from .fields import CLASS_DETAILS_FIELDS


class FeeView(SecuredAPIView):
    scoped_fields = {"title": (FeeTitle, "school")}
    """
    - Save fee setups i.e. title and amount along with class details; \\
    - Get fee setups, or fee setup for specific student(extracting student's grade detail) and school
    """

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    @swagger_auto_schema(**FEES_API["get"])
    def get(self, request):
        """
        get fee-details by class-info-id and school-id
        or, by school-id only.
        or, [].
        -- search fee-details by grade details is implemented in ./SearchViews.py.
        """
        school_id = request.query_params.get("school")
        class_info_id = request.query_params.get("class")
        if school_id:
            if class_info_id:
                if "v2" in self.request.resolver_match.namespaces:
                    fees = self.listFeesV2(class_info_id, school_id)
                else:
                    fees = self.listFees(class_info_id, school_id)
                # print(fees)
                return Response(fees)
        return self.RESPONSE__INVALID_REQUEST

    # `months` rides along so the setup screen can show, and re-edit, a class
    # that pays a title in different months from the rest of the school. NULL is
    # the normal case and means "the title's months" — the client shows the
    # title's list for those rather than inventing one.
    LIST_FIELDS = ("id", "title", "fee", "months")

    def listFees(self, class_info_id, school_id):
        query = Q(
            class_info=class_info_id, class_info__school=school_id, is_active=True
        )
        fees = Fee.objects.filter(query).values(*self.LIST_FIELDS)
        data = []
        for fee in fees:
            feeId = fee.get("id")
            titleId = fee.get("title")
            data.append(
                [feeId, titleId, fee.get("fee", 0), fee.get("months") or []]
            )
        return data

    def listFeesV2(self, class_info_id, school_id):
        query = Q(
            class_info=class_info_id, class_info__school=school_id, is_active=True
        )
        fees = Fee.objects.filter(query).values(*self.LIST_FIELDS)
        return fees

    @swagger_auto_schema(**FEES_API["post"], request_body=FeeSerializer)
    def post(self, request):
        s = FeeSerializer(data=request.data)
        if s.is_valid():
            try:
                ins = s.save()
                [className, classDetails] = getClassDetails(ins.class_info.id)
                return Response(
                    {
                        "message": "Fee saved!",
                        "fee": {
                            "id": ins.id,
                            "class_info": classDetails,
                            "classname": className,
                            "title_id": ins.title.id,
                            "fee": ins.fee,
                            "months": ins.months or [],
                        },
                    }
                )
            except IntegrityError:
                return Response(
                    {"message": "Failed duplicate setup!"},
                    status=status.HTTP_409_CONFLICT,
                )
        return Response(
            {"message": "Fee save failed!"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    @swagger_auto_schema(**FEES_API["put"], request_body=FeeSerializer)
    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("class_info", {}).get("school")
        if id and school_id:
            fee = Fee.objects.get(id=id, class_info__school__id=school_id)
            s = FeeSerializer(instance=fee, data=request.data, partial=True)
            if s.is_valid():
                ins = s.save()
                [className, classDetails] = getClassDetails(ins.class_info.id)
                return Response(
                    {
                        "message": "Fee updated!",
                        "update": {
                            "id": ins.id,
                            "class_info": classDetails,
                            "classname": className,
                            "title_id": ins.title.id,
                            "fee": ins.fee,
                            "months": ins.months or [],
                        },
                    }
                )
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(auto_schema=None)
    def delete(self, request):
        return Response({})
        fee_id = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not fee_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        fee = Fee.objects.get(id=fee_id, class_info__school__id=school_id)
        fee.is_active = False
        fee.save()
        return Response({"message": "Fee deletion completed!"})


class FeeTitleView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    def getClassDetails(self, class_id):
        cls = (
            ClassInfo.objects.filter(id=class_id)
            .values(*CLASS_DETAILS_FIELDS, "school")
            .first()
        )
        return cls

    @swagger_auto_schema(
        **FEE_TITLES_API["get"], responses={200: FeeTitleSerializer(many=True)}
    )
    def get(self, request):
        school_id = request.query_params.get("school")
        as_options = request.query_params.get("as_options") or False
        class_id = request.query_params.get("class")
        items = []
        if school_id:
            if class_id:
                class_details = self.getClassDetails(class_id)
                sec = class_details.pop("section", None)
                # `title__months` rides along so a caller can work out what a
                # title is actually billable for. The profile's ledger tab needs
                # it to reproduce a class posting for a student who enrolled
                # after it: without the months it can only guess, and a title
                # billed in a month it isn't payable in is a wrong charge.
                items = feeq(
                    class_details,
                    sec,
                    ("id", "fee", "title__id", "title__title", "title__months"),
                )
            else:
                VALUES = ("id", "title") if as_options else ("id", "title", "months")
                items = FeeTitle.objects.filter(
                    school__id=school_id, is_active=True
                ).values(*VALUES)
            s = FeeTitleSerializer(items, many=True)
            return Response(s.data)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**FEE_TITLES_API["post"], request_body=FeeTitleSerializer)
    def post(self, request):
        s = FeeTitleSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Fee title saved successfully!",
                    "title": {"id": ins.id, "title": ins.title, "months": ins.months},
                }
            )
        return Response({"message": "Fee title save failed!"})

    @swagger_auto_schema(**FEE_TITLES_API["put"], request_body=FeeTitleSerializer)
    def put(self, request):
        id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if id and school_id:
            ins = FeeTitle.objects.get(id=id, school__id=school_id)
            s = FeeTitleSerializer(instance=ins, data=request.data, partial=True)
            if s.is_valid():
                s.save()
                return Response({"message": "Fee title update completed!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(auto_schema=None)
    def delete(self, request):
        return Response({})
        id = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if id and school_id:
            item = FeeTitle.objects.get(id=id, school__id=school_id)
            item.is_active = False
            item.save()
            return Response({"message": "Fee title deletion completed!"})
        return self.RESPONSE__INVALID_REQUEST
