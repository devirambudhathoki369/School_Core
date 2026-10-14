# Student Serializer
# Search Serializer
# Student Search Result Serializer
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from decimal import Decimal

#
from ..models.Student import (
    Student,
    StudentTransportationInfo,
    StudentDiscountInfo,
    StudentGuardianInfo,
    StudentOtherInfo,
    StudentMedicalInfo,
)
from ..models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from ..models.Fee import feeq
from .ClassInfoSerializer import ClassInfoSerializer
from ..models.FiscalYears import AcademicYear
from ..serializers.base_serializers.OtherInfoSerializer import BaseOtherInfoSerializer
from ..views.exams.ResultMigration import ResultMigrationMixin
from ..constants.payment import TRANSPORTATION
from ..methods.getCreateClass import get_or_create_class
from ..methods.carryForwardDues import carry_forward_dues_on_class_change
from ..methods.sectionChange import is_section_only_change, should_migrate_results


class StudentGuardianInfoSerializer(serializers.ModelSerializer):
    guardian_name = serializers.CharField(required=False)
    guardian_email = serializers.EmailField(required=False)
    father_occupation = serializers.IntegerField(required=False)
    mother_occupation = serializers.IntegerField(required=False)
    grandfather_occupation = serializers.IntegerField(required=False)
    guardian_location = serializers.CharField(required=False)

    class Meta:
        model = StudentGuardianInfo
        fields = "__all__"


class StudentOtherInfoSerializer(BaseOtherInfoSerializer):
    class Meta:
        model = StudentOtherInfo
        fields = "__all__"


class StudentTransportationInfoListSerializer(serializers.ListSerializer):
    def bulk_create(self):
        with transaction.atomic():
            instances = [
                StudentTransportationInfo(**data) for data in self.validated_data
            ]
            StudentTransportationInfo.objects.bulk_create(instances)

    def bulk_update(self, updates):
        with transaction.atomic():
            instances = {
                stdTsp.student: stdTsp
                for stdTsp in StudentTransportationInfo.objects.filter(
                    student__in=updates
                ).select_for_update()
            }
            updated_at = timezone.now()
            for update in self.validated_data:
                instance = instances.get(update.pop("student", None))
                if instance:
                    for attr, value in update.items():
                        setattr(instance, attr, value)
                    setattr(instance, "updated_at", updated_at)
            # print(instances.values())
            StudentTransportationInfo.objects.bulk_update(
                instances.values(), ("is_active", "updated_at")
            )


class StudentMedicalInfoSerializer(serializers.ModelSerializer):
    has_chronic_illness = serializers.BooleanField(required=False, default=False)
    chronic_illness_details = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    allergies = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    previous_surgeries = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    physical_disability = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    has_vision_problem = serializers.BooleanField(required=False, default=False)
    vision_problem_details = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    has_hearing_problem = serializers.BooleanField(required=False, default=False)
    hearing_problem_details = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    current_medication = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    remarks = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = StudentMedicalInfo
        fields = "__all__"


class StudentTransportationInfoSerializer(serializers.ModelSerializer):
    # this is used in StudentSerializer, so kept here! don't move!
    start_date = serializers.CharField(required=False)
    remarks = serializers.CharField(required=False)

    class Meta:
        model = StudentTransportationInfo
        fields = "__all__"
        list_serializer_class = StudentTransportationInfoListSerializer


class StudentListSerializer(serializers.ListSerializer):
    def bulk_create(self, academic_year, class_info):
        with transaction.atomic():
            academic_year = AcademicYear.objects.filter(id=academic_year).first()
            class_info, _ = get_or_create_class(class_info)
            if not class_info:
                return False
            #
            students = []
            guardians = [
                StudentGuardianInfo(**data.pop("guardian_info"))
                for data in self.validated_data
            ]
            guardians = StudentGuardianInfo.objects.bulk_create(guardians)
            for std, guardian in zip(self.validated_data, guardians):
                # other_info (e.g. blood_group) is optional per student; only
                # create a record when the row actually carried some data.
                other_info_data = std.pop("other_info", None)
                other_info = (
                    StudentOtherInfo.objects.create(**other_info_data)
                    if other_info_data
                    else None
                )
                students.append(
                    Student(
                        **std,
                        guardian_info=guardian,
                        other_info=other_info,
                        class_info=class_info,
                        academic_year=academic_year,
                    )
                )
            Student.objects.bulk_create(students)


class StudentSerializer(serializers.ModelSerializer, ResultMigrationMixin):
    middle_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    contact = serializers.CharField(required=False)
    #
    guardian_info = StudentGuardianInfoSerializer()
    class_info = ClassInfoSerializer(required=False)
    other_info = StudentOtherInfoSerializer(required=False)
    roll_no = serializers.CharField(required=False)
    symbol_no = serializers.CharField(required=False)
    regd_no = serializers.CharField(required=False)
    emis = serializers.IntegerField(required=False)
    image = serializers.ImageField(required=False)
    birth_certificate = serializers.ImageField(required=False, allow_null=True)
    nid = serializers.ImageField(required=False, allow_null=True)
    citizenship_front = serializers.ImageField(required=False, allow_null=True)
    citizenship_back = serializers.ImageField(required=False, allow_null=True)
    academic_year = serializers.CharField(required=False)
    #
    transportation_info = serializers.DictField(required=False, write_only=True)
    previous_school = serializers.CharField(required=False)
    remarks = serializers.CharField(required=False)
    section_change_only = serializers.BooleanField(required=False)

    class Meta:
        model = Student
        exclude = ["created_at"]
        list_serializer_class = StudentListSerializer
        extra_kwargs = {"account": {"write_only": True}}

    def create(self, validated_data):
        academic_year = validated_data.pop("academic_year", None)
        academic_year = AcademicYear.objects.filter(id=academic_year).first()
        if academic_year:
            transportation_info_data = validated_data.pop("transportation_info", None)
            guardian_info_data = validated_data.pop("guardian_info", {})
            class_info_data = validated_data.pop("class_info", {})
            other_info_data = validated_data.pop("other_info", None)
            #
            with transaction.atomic():
                guardian_info = StudentGuardianInfo.objects.create(**guardian_info_data)
                #
                class_info, _ = get_or_create_class(class_info_data)
                other_info = (
                    StudentOtherInfo.objects.create(**other_info_data)
                    if other_info_data
                    else other_info_data
                )
                #
                student = Student.objects.create(
                    **validated_data,
                    guardian_info=guardian_info,
                    class_info=class_info,
                    other_info=other_info,
                    academic_year=academic_year,
                )
                #
                if transportation_info_data:
                    # handle student transportation data!
                    school = class_info_data.get("school")  # returns school instance!
                    data = {
                        **transportation_info_data,
                        "student": student.id,
                        "school": school.id,
                    }
                    s = StudentTransportationInfoSerializer(data=data)
                    if s.is_valid():
                        s.save()
                return student

    def update(self, instance, validated_data):
        # handling student class info;
        class_info_data = validated_data.pop("class_info", None)
        # `section_change_only` is the operator's override for whether exam
        # results follow the student. Absent -> auto-detect from the two classes
        # (see should_migrate_results). Popped either way so it never leaks into
        # the model update below.
        section_change_only = validated_data.pop("section_change_only", None)
        academic_year = validated_data.pop("academic_year", None)
        previous_class_info_id = instance.class_info.id
        if class_info_data:
            with transaction.atomic():
                class_info, _ = get_or_create_class(class_info_data)
                instance.class_info = class_info
                instance.save()
                if previous_class_info_id != class_info.id:
                    if should_migrate_results(
                        section_change_only,
                        previous_class_info_id,
                        class_info.id,
                    ):
                        # Section change (or an operator-confirmed correction)
                        # -> results follow the student to the new class.
                        self.migrate(
                            [instance.id],
                            academic_year or class_info.academic_year_id,
                            previous_class_info_id,
                            class_info.id,
                        )
                    # Dues carry-forward stays keyed to the STRUCTURE of the move,
                    # not the results checkbox. A real class change — a grade,
                    # academic-year, or EDUCATION LEVEL move (e.g. class 10 -> 11
                    # crossing SCHOOL -> HIGH SCHOOL) — lands the student in a
                    # different academic year, where their old outstanding would
                    # be stranded and vanish from the single-year payment screen.
                    # Carry it forward so old dues follow. No-op when the new
                    # class resolves to the same academic year.
                    if not is_section_only_change(
                        previous_class_info_id, class_info.id
                    ):
                        carry_forward_dues_on_class_change(
                            [instance.id],
                            previous_class_info_id,
                            class_info.id,
                        )
                # transaction.set_rollback(True)
                return instance
        return super().update(instance, validated_data)


class StudentValuesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = "__all__"

    def to_representation(self, data):
        return data


class StudentDiscountAmountMixin:
    classwise_fee_details = {}
    student_station_fee_details = {}
    student_status_running = 1

    def getStudentsFeeDetails(self, student_ids):
        tspFees = StudentTransportationInfo.objects.filter(
            student__in=student_ids,
            is_active=True,
            student__is_active=True,
            student__status=self.student_status_running,
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
            fee_details = feeq(class_info, section, ["title", "fee"], titles)
            fee_details = {e.get("title"): e.get("fee") for e in fee_details}
            self.classwise_fee_details[class_info_id] = fee_details

    def getDiscountAmount(self, data):
        """
        there're two types of discounts [StudentDiscountInfo].
        1. transportation discount
        - discount with title None
        2. fee title discount
        - discount with title [fee_title__id].

        # LOGIC
        if title is None:
            amount = percentage of [StudentTransportationInfo.bus_station.fee]

            # here, it'll be better to fetch student-transportation-fee-details in bulk and use.
        else:
            amount = percentage of [fee_q(class_info)]

            where,
            Fee.feeq(class_details, section, RETURN_FIELDS, TITLE_IDS=[])
            returns fee titles and details unqiuely giving priority to titles in section then in class.

            # here, discounts are fetched classwise, so no need to cache feeq results.
        """

        title = data.get("title")
        student = data.get("student")
        student_class_info = data.pop("student__class_info")
        percentage = data.get("percentage")  # or 50
        discountAmount = data.get("discount") or 0
        # print(student, student_class_info, percentage, discountAmount)
        if percentage is None:
            return discountAmount
        if title is None:
            # transportation discount
            stdTsp = self.student_station_fee_details.get(student)
            if not stdTsp:
                field_name = "bus_station__fee"
                stdTsp = (
                    StudentTransportationInfo.objects.filter(
                        student=student,
                        is_active=True,
                        student__is_active=True,
                        student__status=self.student_status_running,
                    )
                    .values(field_name, "bus_station")
                    .first()
                )
                if stdTsp:
                    stdTsp = stdTsp.get(field_name)
            return self.calculateDiscountAmount(percentage, stdTsp or 0)
        else:
            # fee title discount
            stdTsp = 0
            fee_details = self.classwise_fee_details.get(student_class_info)
            if not fee_details:
                class_info = (
                    ClassInfo.objects.filter(id=student_class_info, is_active=True)
                    .values(*CLASS_DETAILS_FIELDS)
                    .first()
                )
                if class_info:
                    section = class_info.pop("section")
                    fee_details = feeq(class_info, section, ["title", "fee"], [title])
                    fee_details = {e.get("title"): e.get("fee") for e in fee_details}
                    self.classwise_fee_details[student_class_info] = fee_details
            if fee_details:
                stdTsp = fee_details.get(title)
            return self.calculateDiscountAmount(percentage, stdTsp or 0)

    def calculateDiscountAmount(self, percentage, rate):
        # print(
        #     "CALCULATING DISCOUNT AMOUNT",
        #     f"Percentage : [{percentage}], Rate : [{rate}]",
        # )
        return Decimal(percentage / 100) * rate


class StudentDiscountInfoListSerializer(
    serializers.ListSerializer, StudentDiscountAmountMixin
):
    def to_representation(self, data):
        student_ids = set()
        class_info_ids = set()
        unique_titles = set()
        for e in data:
            title = e.get("title")
            if title is None:
                student_id = e.get("student")
                student_ids.add(student_id)
            else:
                class_info_id = e.get("student__class_info")
                class_info_ids.add(class_info_id)
                unique_titles.add(title)
        self.getStudentsFeeDetails(student_ids)
        self.getClasswiseFeeDetails(class_info_ids, unique_titles)
        for e in data:
            e["old_discount"] = e.get("discount")
            e["discount"] = self.getDiscountAmount(e)
            if e.get("title") is None:
                e["title"] = TRANSPORTATION
        return data


class StudentDiscountInfoSerializer(
    serializers.ModelSerializer, StudentDiscountAmountMixin
):
    discount = serializers.DecimalField(max_digits=10, decimal_places=2)
    percentage = serializers.DecimalField(max_digits=10, decimal_places=2)
    # The column is varchar(50). Unbounded here, a longer note passed
    # validation and the save then failed with a 500.
    remarks = serializers.CharField(required=False, max_length=50)
    # title, discount, percentage values are required to calculate discount_amount
    # student, student__class_info are must!!!

    class Meta:
        model = StudentDiscountInfo
        fields = "__all__"
        list_serializer_class = StudentDiscountInfoListSerializer

    def to_internal_value(self, data):
        if data.get("title") == TRANSPORTATION:
            data["title"] = None  # Convert 'tn' to None
        return super().to_internal_value(data)

    def to_representation(self, data):
        """
        # data["discount"] = self.getDiscountAmount(data)
        self.getDiscountAmount is not required in single serialization
        cause this is used only is post,put which gets correct discount-amount
        cause it's been generated recently.
        """
        if data.get("title") is None:
            data["title"] = TRANSPORTATION
        return data


class SearchSerializer(serializers.Serializer):
    # both requires academic details
    # for student
    first_name = serializers.CharField(required=False)
    middle_name = serializers.CharField(required=False)
    last_name = serializers.CharField(required=False)
    # for fee details
    section = serializers.IntegerField(required=False)
    education_level = serializers.IntegerField(required=False)
    grade = serializers.IntegerField(required=False)
    faculty = serializers.IntegerField(required=False)
    course = serializers.IntegerField(required=False)
    year = serializers.IntegerField(required=False)
    semester = serializers.IntegerField(required=False)
    #
    school = serializers.IntegerField()
    student = serializers.IntegerField(required=False)


class StudentSearchResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = "__all__"

    def to_representation(self, data):
        """Convert to JSON."""
        return data
