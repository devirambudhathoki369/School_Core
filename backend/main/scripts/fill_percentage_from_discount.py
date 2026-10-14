"""ONE TIME USE
Fills discount percentage in StudentDiscountInfo
using discount-amount and title-rate
"""

import sys
import os
import django


current_path = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_path, "../../"))
if project_root not in sys.path:
    sys.path.append(project_root)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()
#
from django.db import transaction
from rest_framework import serializers
from decimal import Decimal
from main.models.Student import StudentDiscountInfo, StudentTransportationInfo
from main.models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from main.models.Fee import feeq

student_status_running = 1
TRANSPORTATION = "tn"


class StudentDiscountPercentageMixin:
    classwise_fee_details = {}
    student_station_fee_details = {}

    def getStudentsFeeDetails(self, student_ids):
        tspFees = StudentTransportationInfo.objects.filter(
            student__in=student_ids,
            # is_active=True, # this issues transportation-service inactive but discount given for later use if required!
            student__is_active=True,
            student__status=student_status_running,
        ).values("student", "bus_station__fee")
        self.student_station_fee_details = {
            e.get("student"): e.get("bus_station__fee") for e in tspFees
        }

    def getClasswiseFeeDetails(self, class_info_ids, titles=[]):
        class_infos = ClassInfo.objects.filter(
            id__in=class_info_ids, is_active=True
        ).values("id", *CLASS_DETAILS_FIELDS)
        for class_info in class_infos:
            class_info_id = class_info.pop("id")
            section = class_info.pop("section")
            # print(class_info)
            fee_details = feeq(
                class_info,
                section,
                ["title", "fee", "class_info"],
                titles,
            )
            classes = {e.get("class_info") for e in fee_details}
            fee_details = {e.get("title"): e.get("fee") for e in fee_details}
            # print(class_info_id, classes, fee_details, []) # [] inplace of titles
            for cls in classes:
                # one of student, one where fees are set, might be both or both be same.
                self.classwise_fee_details[cls] = fee_details
                self.classwise_fee_details[class_info_id] = fee_details
        # print(self.classwise_fee_details, "\n")

    def getDiscountPercentage(self, data):
        title = data.title
        student = data.student
        student_class_info = data.student.class_info
        percentage = data.percentage  # or 50
        discountAmount = data.discount or 0
        if percentage:
            print(f"[!] Percentage already set {percentage} for {student}")
            return None, None
        if title is None:
            # transportation discount
            stdTsp = self.student_station_fee_details.get(student.id) or {}
            if not stdTsp:
                print(
                    f">> {student} {student.class_info.id} {student.class_info.school} > TransportationDetails Not Preloaded!!! \t [LOADING...]"
                )
                print(title, percentage, discountAmount)
                exit()
                field_name = "bus_station__fee"
                stdTsp = (
                    StudentTransportationInfo.objects.filter(
                        student=student,
                        is_active=True,
                        student__is_active=True,
                        student__status=student_status_running,
                    )
                    .values(field_name, "bus_station")
                    .first()
                )
                if stdTsp:
                    stdTsp = stdTsp.get(field_name)
                    if stdTsp:
                        return self.calculateDiscountPercentage(
                            discountAmount, stdTsp or 0
                        )
                return None, None
            else:
                return self.calculateDiscountPercentage(discountAmount, stdTsp or 0)
        else:
            # fee title discount
            title = title.id
            stdTsp = 0
            fee_details = self.classwise_fee_details.get(student.class_info.id)
            if not fee_details:
                print(
                    f">> {student} {student.class_info.id} {student.class_info.school} > TitleDetails Not Preloaded!!! \t [LOADING...]"
                )
                print(title, percentage, discountAmount)
                exit()
                class_info = (
                    ClassInfo.objects.filter(id=student_class_info.id, is_active=True)
                    .values(*CLASS_DETAILS_FIELDS)
                    .first()
                )
                if class_info:
                    section = class_info.pop("section")
                    fee_details = feeq(
                        class_info, section, ["title", "fee"], [title.id]
                    )
                    fee_details = {e.get("title"): e.get("fee") for e in fee_details}
                    self.classwise_fee_details[student_class_info] = fee_details
            if fee_details:
                stdTsp = fee_details.get(title)
            return self.calculateDiscountPercentage(discountAmount, stdTsp or 0)

    def calculateDiscountPercentage(self, amount, rate):
        # print(amount, rate)
        per = Decimal(amount / (rate or 1)) * 100
        return round(per, 2), rate


class StudentDiscountInfoListSerializer(
    serializers.ListSerializer, StudentDiscountPercentageMixin
):
    def to_representation(self, data):
        student_ids = set()
        class_info_ids = set()
        unique_titles = set()
        for e in data:
            title = e.title
            if title is None:
                student_id = e.student
                student_ids.add(student_id)
            else:
                class_info_id = e.student.class_info.id
                class_info_ids.add(class_info_id)
                unique_titles.add(title.id)
        self.getStudentsFeeDetails(student_ids)
        self.getClasswiseFeeDetails(class_info_ids, unique_titles)
        to_be_updated = []
        for e in data:
            per, rate = self.getDiscountPercentage(e)
            if per:
                setattr(e, "percentage", per)
                setattr(e, "rate", rate)
                # if e.title is None:
                #     setattr(e, "title_id", TRANSPORTATION)
                to_be_updated.append(e)
            else:
                print("[x] EXCLUDED")
                self.log(e, per, rate)
        return to_be_updated

    def log(self, instance, per, rate):
        print(
            "ID",
            instance.id,
            "Title",
            instance.title.id if instance.title else "000",
            instance.title,
            "Student",
            instance.student,
            instance.student.class_info.id,
            "School",
            instance.school,
            "%",
            per,
            "Amt",
            instance.discount,
            "Rate",
            rate,
            f"\t[{instance.discount}/{rate}*100]",
        )
        print(self.classwise_fee_details.get(instance.student.class_info.id) or {})
        print("\n")


class StudentDiscountInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentDiscountInfo
        fields = "__all__"
        list_serializer_class = StudentDiscountInfoListSerializer


def fill_percentage_v2():
    with transaction.atomic():
        student_discounts = (
            StudentDiscountInfo.objects.filter(
                is_active=True,
                student__is_active=True,
                student__status=student_status_running,
                # title__isnull=True,
                # school__in=[7],
            )
            .only(
                "id",
                "school",
                "student",
                "student__class_info",
                "title",
                "discount",
                "percentage",
            )
            .order_by("school")
            .select_for_update()
        )
        print("Total : ", len(student_discounts))
        s = StudentDiscountInfoSerializer(student_discounts, many=True)
        """
        serializer takes instances (not .values)
        then calculates percentage and update attribute percentage for all of them
        those instances are updated below!!!
        """
        count = len(s.data)
        print(f'Updating "{count}" items!')
        if count > 0:
            for instance in s.data:
                per = instance.percentage
                rate = instance.rate
                if per > 100:
                    print("[!] INCORRECT")
                    s.log(instance, per, rate)
                    exit()
        # StudentDiscountInfo.objects.bulk_update(s.data, ["percentage"])


if __name__ == "__main__":
    fill_percentage_v2()
