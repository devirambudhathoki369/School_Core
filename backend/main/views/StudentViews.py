# Student View
# Student Discount View
import re
from decimal import Decimal, ROUND_HALF_UP
from django.db import transaction
from django.db.models import Q, Value, CharField, Sum
from django.db.models.functions import Concat, Lower, Collate
from django.utils import timezone
from rest_framework.response import Response
import logging

from rest_framework import status
from rest_framework.pagination import CursorPagination
from rest_framework.parsers import JSONParser, MultiPartParser

#
from account.auth.UserRole import UserRoles
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    UserTokenAuthentication,
    StudentTokenAuthentication,
)

#
from ..models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from ..models.Student import (
    Student,
    StudentGuardianInfo,
    StudentDiscountInfo,
    StudentOtherInfo,
)
from ..models.Ledger import StudentLedger, LedgerPosting
from ..models.Invoice import StudentInvoice
from ..models.FiscalYears import EconomicYear
from ..methods.academicYear import (
    get_class_academic_year,
    academic_years_aligned,
)
from ..methods.carryForwardDues import carry_forward_dues_on_class_change
from ..methods.sectionChange import is_section_only_change, should_migrate_results
from ..methods.nepaliDatetime import ndt_today
from ..methods.removeImages import clearImages, requestedRemovals
from ..serializers.StudentSerializer import (
    StudentDiscountInfoSerializer,
    StudentGuardianInfoSerializer,
    StudentOtherInfoSerializer,
    StudentSerializer,
)
from .BaseViews import SecuredAPIView
from .exams.ResultMigration import ResultMigrationMixin
from ..methods.getStudentDetail import getClassDetails
from ..constants.payment import TRANSPORTATION, OPENING_BALANCE, CARRY_FORWARD_OUT

STUDENT_DETAILS_RETURN_FIELDS = (
    "id",
    "created_at",
    "emis",
    "name",
    "gender",
    "contact",
    "location",
    "email",
    "birth_date",
    "class_info",
    "previous_school",
    "birth_certificate",
    "nid",
    "citizenship_front",
    "citizenship_back",
    "guardian_info__father_name",
    "guardian_info__mother_name",
    "guardian_info__guardian_name",
    "guardian_info__guardian_contact",
    "guardian_info__guardian_location",
)


security_logger = logging.getLogger("django.security")

class StudentCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class StudentsView(SecuredAPIView, ResultMigrationMixin):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)

    def get_authenticators(self):
        if self.request.method == "DELETE":
            return [UserTokenAuthentication()]
        return [auth() for auth in self.authentication_classes]

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            student_id = request.query_params.get("student")
            RUNNING = 1
            if student_id:
                student = Student.objects.filter(
                    id=student_id, class_info__school__id=school_id, is_active=True
                ).first()
                if student:
                    s = StudentSerializer(student)
                    #
                    # print(s.data)
                    return Response(s.data)
            else:
                """recent-enrollments.jsx;"""
                enrollments = (
                    Student.objects.filter(
                        class_info__school__id=school_id, status=RUNNING
                    )
                    .annotate(
                        name=Concat(
                            "first_name",
                            Value(" "),
                            "middle_name",
                            Value(" "),
                            "last_name",
                            output_field=CharField(),
                        )
                    )
                    .order_by(Collate("name", "und-x-icu"))
                    .values(*STUDENT_DETAILS_RETURN_FIELDS)
                )
                paginator = StudentCursorPagination()
                enrollments = paginator.paginate_queryset(enrollments, request)
                enrollments = self.formatEnrollments(enrollments)
                # print(enrollments)
                return paginator.get_paginated_response(enrollments)
        return self.RESPONSE__INVALID_REQUEST

    def formatEnrollments(self, enrollments):
        return [
            {
                "id": e.get("id"),
                "date": e.get("created_at"),
                "emis": e.get("emis"),
                "name": e.get("name"),
                "gender": e.get("gender"),
                "classname": self.cacheClassname(e.get("class_info")),
                "contact": e.get("contact"),
                "location": e.get("location"),
                "email": e.get("email"),
                "previous_school": e.get("previous_school"),
                "father_name": e.get("guardian_info__father_name"),
                "mother_name": e.get("guardian_info__mother_name"),
                "guardian_name": e.get("guardian_info__guardian_name"),
                "guardian_contact": e.get("guardian_info__guardian_contact"),
                "guardian_location": e.get("guardian_info__guardian_location"),
                "birth_date": e.get("birth_date"),
            }
            for e in enrollments
        ]

    def post(self, request):
        refused = self.refuseStudents(request)
        if refused:
            return refused
        data = request.data
        dataType = type(data)
        # print(dataType)
        if dataType not in [list, dict]:
            return self.RESPONSE__INVALID_REQUEST
        #
        """
        isSingleEnroll = dataType == dict and 'first_name' in data # from student_enrollment.jsx
        """
        isBulkEnroll = (
            dataType == dict and "students" in data
        )  # from bulk_enrollment.jsx
        isListEnroll = dataType == list and len(data) > 0  # from postman
        academic_year = data.get("academic_year", None)
        if isBulkEnroll:
            class_info = data.pop("class_info", None)
            if class_info:
                data = self.mergeData(
                    data.get("students"),
                )
                # dataType = list # always list; needed during test;
        #
        serializer = StudentSerializer(
            data=data,
            many=True if (isBulkEnroll or isListEnroll) else False,
        )
        if serializer.is_valid():
            if isBulkEnroll or isListEnroll:
                serializer.bulk_create(academic_year, class_info)
            else:
                serializer.save()
            return Response(
                {"message": "Student enrolled!"}, status=status.HTTP_201_CREATED
            )
        # else:
        #     print(serializer.errors)
        return Response(
            {"message": "Student enrollment failed!"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    def mergeData(self, students: list) -> list:
        def getGuardianInfo(std):
            return {
                key: value
                for key, value in {
                    "father_name": std.pop("father_name", ""),
                    "mother_name": std.pop("mother_name", ""),
                    "guardian_name": std.pop("guardian_name", ""),
                    "guardian_contact": std.pop("guardian_contact", ""),
                    "guardian_email": std.pop("guardian_email", ""),
                    "guardian_location": std.pop("guardian_location", ""),
                }.items()
                if value
            }

        def getOtherInfo(std):
            return {
                key: value
                for key, value in {
                    "blood_group": std.pop("blood_group", ""),
                }.items()
                if value
            }

        for std in students:
            std["guardian_info"] = getGuardianInfo(std)
            # transportation_info is not received in bulk enroll; other_info is
            # only set when there's actual data so we don't create empty records.
            other_info = getOtherInfo(std)
            if other_info:
                std["other_info"] = other_info
        return students

    # The pictures kept on a student's record: the profile photo and the
    # documents collected at admission.
    STUDENT_IMAGES = (
        "image",
        "birth_certificate",
        "nid",
        "citizenship_front",
        "citizenship_back",
    )

    def removeImages(self, request):
        """Take a photo or a document off a student — see methods/removeImages.

        For the school's own people only. This endpoint also answers student
        tokens, and a student must not be able to clear anyone's record.
        """
        if getattr(request, "user_role", None) not in (
            UserRoles.ROLE_ADMIN,
            UserRoles.ROLE_STAFF,
        ):
            return self.RESPONSE__NOT_ALLOWED
        student_id = self.formToJsonData(request.data.get("id"))
        school_id = self.formToJsonData(request.data.get("school"))
        names = requestedRemovals(request.data, self.STUDENT_IMAGES)
        if not student_id or not school_id or not names:
            return self.RESPONSE__INVALID_REQUEST
        std = Student.objects.filter(
            id=student_id, class_info__school__id=school_id
        ).first()
        if not std:
            return self.RESPONSE__INVALID_REQUEST
        removed = clearImages(std, names)
        return Response({"message": "Image deleted!", "removed": removed})

    def refuseStudents(self, request):
        """A 403 for a student's login, None for the school's own people.

        This endpoint answers student tokens so the app can READ. It never
        checked whose record a write was for, so any signed-in student could
        edit, promote or enrol students — in any school, since a student token
        is not scoped to one. No student account has ever legitimately written
        here (two years of history: none), so writing is refused outright.
        """
        if getattr(request, "user_role", None) != UserRoles.ROLE_STUDENT:
            return None
        security_logger.warning(
            "student-write refused: %s tried %s /api/students",
            getattr(request.user, "username", "?"),
            request.method,
        )
        return Response(
            {"message": "Not permitted."}, status=status.HTTP_403_FORBIDDEN
        )

    def put(self, request):
        refused = self.refuseStudents(request)
        if refused:
            return refused
        _response__ok = {"message": "Student information updated!"}
        if "id" in request.data and "remove" in request.data:
            return self.removeImages(request)
        if "id" in request.data:
            res = self.update(request.data)
            if res:
                if "image" in request.data:
                    _response__ok["image"] = str(res.image)
                # Where each uploaded picture now lives — the documents too,
                # not only the photo — so the page can show what was saved.
                images = {
                    name: str(getattr(res, name) or "")
                    for name in self.STUDENT_IMAGES
                    if name in request.data and hasattr(res, name)
                }
                if images:
                    _response__ok["images"] = images
                return Response(_response__ok)
        elif all(key in request.data for key in ["students", "from", "to"]):
            res = self.promoteClass(request.data)
            if isinstance(res, Response):
                return res  # guardrail / validation error with a message
            if res:
                return Response({"message": "Class promotion successful!"})
        else:
            res = self.bulk_update(request.data)
            if res:
                return Response(_response__ok)
        return self.RESPONSE__INVALID_REQUEST

    def formToJsonData(self, data):
        if not isinstance(data, list):
            return data
        return data[0] or ""

    def update(self, data):
        """only handles student info, guardian_info and other_info!"""
        student_id = data.pop("id", None)
        school_id = data.pop("school", None)
        student_id = self.formToJsonData(student_id)
        school_id = self.formToJsonData(school_id)
        if not student_id or not school_id:
            return False
        std = Student.objects.get(id=student_id, class_info__school__id=school_id)
        if std:
            serializer, completed = self.getSerializer(std, data)
            if serializer and completed:
                return True
            if not serializer and not completed:
                serializer = StudentSerializer(std, data=data, partial=True)
            if serializer and serializer.is_valid() and not completed:
                return serializer.save()
            # else:
            #     print(s.errors)
        return False

    def parseFormDataToJson(self, data):
        """
        Converts formdata to json \\
        specially, key like {data[student_id][attribute]: value} to \\
        data: {student_id: {attribute: value, ....}}
        """
        object = {}
        pattern = re.compile(r"\[(.*?)\]")

        for key, value in data.items():
            # print(key, value)
            if key.startswith("data["):
                student_id, attribute = pattern.findall(key)
                if "data" not in object:
                    object["data"] = {}
                if student_id not in object["data"]:
                    object["data"][student_id] = {}
                object["data"][student_id][attribute] = value
            else:
                object[key] = value
        return object

    def bulk_update(self, data):
        """
        handles bulk updates of student.
        """
        data = self.parseFormDataToJson(data)
        # print(data)
        school_id = data.pop("school", None)
        data = data.pop("data", {})
        # --- ignore these data for now!
        data.pop("updates", [])
        data.pop("transportation_info", None)
        # data.pop("guardian_info", None) # Update Implemented Below!
        # other_info is handled per-student below (bulk_update_other_info)!
        data.pop("class_info", None)
        #
        if school_id:
            student_ids = {id for id in data.keys()}
            if len(student_ids) > 0:
                attributes = {"updated_at"}
                RUNNING = 1
                updated_at = timezone.now()
                with transaction.atomic():
                    students = {
                        str(std.id): std
                        for std in Student.objects.filter(
                            id__in=student_ids,
                            class_info__school__id=school_id,
                            status=RUNNING,
                        )
                        .select_related("guardian_info", "other_info")
                        # Lock ONLY the Student rows. select_related on the
                        # nullable guardian_info/other_info FKs emits LEFT OUTER
                        # JOINs, and Postgres rejects `FOR UPDATE` on the nullable
                        # side of an outer join ("FOR UPDATE cannot be applied to
                        # the nullable side of an outer join"). of=("self",)
                        # restricts the lock to the Student table so the join is
                        # allowed.
                        .select_for_update(of=("self",))
                    }
                    # BULK UPDATE STUDENT-GUARDIAN-INFO
                    self.bulk_update_guardian_info(students, data)
                    # BULK UPDATE STUDENT-OTHER-INFO (e.g. blood_group). Returns
                    # ids of students that got a NEWLY created other_info record
                    # so the Student.other_info FK gets persisted below.
                    linked_other_info_ids = self.bulk_update_other_info(students, data)
                    student_updates = []
                    for student_id, update in data.items():
                        std = students.get(student_id)
                        if std and update:
                            changed = False
                            for attribute, value in update.items():
                                # every field is optional: a blank value means
                                # "leave it as is", never overwrite/clear+crash.
                                if value is None or value == "":
                                    continue
                                if attribute == "image":
                                    std.image.save(value.name, value, save=False)
                                else:
                                    setattr(std, attribute, value)
                                attributes.add(attribute)
                                changed = True
                            if changed:
                                setattr(std, "updated_at", updated_at)
                                student_updates.append(std)
                    # students whose other_info FK was just created still need a
                    # Student-level save to persist that link.
                    if linked_other_info_ids:
                        attributes.add("other_info")
                        for sid in linked_other_info_ids:
                            std = students.get(sid)
                            if std:
                                setattr(std, "updated_at", updated_at)
                    # print("attributes", list(attributes))
                    if student_updates or linked_other_info_ids:
                        return Student.objects.bulk_update(
                            students.values(), list(attributes)
                        )
                    return True
        return False

    def bulk_update_guardian_info(self, students, data):
        attributes = set()
        guardian_infos = []
        for student_id, update in data.items():
            std = students.get(student_id)
            update = update.pop("guardian_info", {})
            if std and update:
                guardian_info = std.guardian_info
                if guardian_info:
                    for attribute, value in update.items():
                        setattr(guardian_info, attribute, value)
                        attributes.add(attribute)
                    guardian_infos.append(guardian_info)
                # else:
                #     print(f"No guardian info found for {student_id}")
        if guardian_infos and attributes:
            StudentGuardianInfo.objects.bulk_update(guardian_infos, list(attributes))

    def bulk_update_other_info(self, students, data):
        """
        Bulk update StudentOtherInfo (e.g. blood_group). For students that don't
        have an other_info record yet, one is created and linked to the student
        (the FK is persisted by the caller). Returns the set of student-ids that
        got a newly-created+linked other_info record.
        """
        attributes = set()
        to_update = []
        linked_student_ids = set()
        for student_id, update in data.items():
            std = students.get(student_id)
            other_info_update = update.pop("other_info", {}) if update else {}
            # drop empty values so we never wipe an existing choice with blanks
            other_info_update = {k: v for k, v in other_info_update.items() if v != ""}
            if not (std and other_info_update):
                continue
            other_info = std.other_info
            if other_info:
                for attribute, value in other_info_update.items():
                    setattr(other_info, attribute, value)
                    attributes.add(attribute)
                to_update.append(other_info)
            else:
                std.other_info = StudentOtherInfo.objects.create(**other_info_update)
                linked_student_ids.add(student_id)
        if to_update and attributes:
            StudentOtherInfo.objects.bulk_update(to_update, list(attributes))
        return linked_student_ids

    def getSerializer(self, student, data):
        """
        returns serializers for foreign nested fields [guardian_info & other_info].
        """
        guardian_info_data = data.pop("guardian_info", {})
        other_info_data = data.pop("other_info", {})
        serializer, completed = None, False
        #
        # class_info_data is handled inside student.serializer.update;
        if guardian_info_data:
            serializer = StudentGuardianInfoSerializer(
                student.guardian_info, data=guardian_info_data, partial=True
            )
        if other_info_data:
            # if -> update, else -> create!
            if student.other_info:
                serializer = StudentOtherInfoSerializer(
                    student.other_info, data=other_info_data, partial=True
                )
            else:
                _serializer = StudentOtherInfoSerializer(data=other_info_data)
                if _serializer.is_valid():
                    student.other_info = _serializer.save()
                    student.save()
                    serializer = _serializer
                    completed = True
        return serializer, completed

    def delete(self, request):
        # HANDLE THIS CAREFULLY LATER! SEE self.get_authenticators at top!
        return Response({})
        student_id = request.query_params.get("id", None)
        school_id = request.query_params.get("school", None)
        if student_id and school_id:
            with transaction.atomic():
                item = Student.objects.get(
                    id=student_id, class_info__school__id=school_id
                )
                # item.class_info.delete() # MUST'NT
                item.guardian_info.delete()
                item.other_info.delete()
                item.delete()
                return Response({"message": "Student deleted!"})
        else:
            return self.RESPONSE__INVALID_REQUEST

    def promoteClass(self, data):
        RUNNING = 1
        current_status = data.pop("from_status", RUNNING)
        target_status = data.pop("to_status", RUNNING)
        current_class = data.pop("from", None)
        target_class = data.pop("to", None)
        students = data.pop("students", None)
        # `section_change_only` is the operator's override for whether exam
        # results follow. Absent -> auto-detect. It governs RESULTS ONLY: the
        # dues carry-forward and the academic-year guardrail below stay keyed to
        # the structural comparison, so a checkbox can never mix two academic
        # years into one class.
        section_change_only = data.pop("section_change_only", None)
        academic_year = data.pop("academic_year", None)
        isSectionChange = is_section_only_change(current_class, target_class)
        migrateResults = should_migrate_results(
            section_change_only, current_class, target_class
        )
        if (
            students
            and isinstance(students, list)
            and current_status
            and target_status
            and current_class
            and target_class
        ):
            # --- academic-year safety guardrail ---------------------------------
            # Promoting a student moves them into the target class, which inherits
            # the target grade's CURRENT academic year (resolved via the mapping).
            # If the target grade is still in an older academic year than the
            # source grade (the staggered-exam case: source rolled to the new year
            # but target hasn't), the move would mix two academic years' invoices/
            # ledgers/exams into one class. Block it and tell the operator to roll
            # the target class first.
            #
            # We compare academic-year PERIODS (overlapping date ranges), not raw
            # ids: a source and target can legitimately sit in different
            # AcademicYear records that still cover the same window (e.g. separate
            # school vs bachelor calendars). Those overlap and are allowed; only a
            # target rolled to a genuinely disjoint (older/newer) period is blocked.
            # Section-only moves stay within one grade/key, so they are always safe
            # and skip this check.
            if not isSectionChange:
                cls_rows = {
                    c["id"]: c
                    for c in ClassInfo.objects.filter(
                        id__in=[current_class, target_class]
                    ).values("id", "school", "batch", *CLASS_DETAILS_FIELDS)
                }
                src = cls_rows.get(int(current_class))
                dst = cls_rows.get(int(target_class))
                if src and dst:
                    src_ay = get_class_academic_year(src["school"], src)
                    dst_ay = get_class_academic_year(dst["school"], dst)
                    if not academic_years_aligned(src_ay, dst_ay):
                        return Response(
                            {
                                "message": (
                                    "Promotion blocked: the target class is in a "
                                    "different academic year than the source class. "
                                    "Roll the target class to the new academic year "
                                    "before promoting students into it."
                                )
                            },
                            status.HTTP_409_CONFLICT,
                        )
            CLASS_FIELD, STATUS_FIELD, UPDATE_DT_FIELD = (
                "class_info_id",
                "status",
                "updated_at",
            )
            updated_at = timezone.now()
            with transaction.atomic():
                students = Student.objects.filter(
                    id__in=students, class_info=current_class, status=current_status
                ).select_for_update()
                for std in students:
                    setattr(std, CLASS_FIELD, target_class)
                    setattr(std, STATUS_FIELD, target_status)
                    setattr(std, UPDATE_DT_FIELD, updated_at)
                Student.objects.bulk_update(
                    students, (CLASS_FIELD, STATUS_FIELD, UPDATE_DT_FIELD)
                )
                student_ids = [std.id for std in students]
                if migrateResults:
                    """current class will be previous class
                    and target class with be current class
                    because update has been done
                    """
                    # Results follow the student. A same-year section move keeps
                    # its academic year; an operator override on a cross-year move
                    # falls back to the target class's year when omitted.
                    section_ay = (
                        academic_year
                        or ClassInfo.objects.filter(id=target_class)
                        .values_list("academic_year_id", flat=True)
                        .first()
                    )
                    if section_ay:
                        self.migrate(
                            set(student_ids),
                            section_ay,
                            current_class,
                            target_class,
                        )
                if not isSectionChange:
                    # Real promotion (grade change), not a same-year section move:
                    # carry each promoted student's outstanding dues from their old
                    # academic year into the new year so the balance stays
                    # visible/collectible under the student's current class. Keyed
                    # to structure, independent of the results override above.
                    self.carryForwardDuesOnPromotion(
                        student_ids, current_class, target_class
                    )
                # transaction.set_rollback(True)
                return True
        return False

    def carryForwardDuesOnPromotion(
        self, student_ids, source_class_id, target_class_id
    ):
        """
        Move each promoted student's OUTSTANDING balance from their SOURCE
        academic year into their NEW academic year as an opening balance ("old
        dues") after a grade promotion that crosses academic years.

        This now delegates to the shared ``carry_forward_dues_on_class_change``
        helper so the bulk-promotion path and the individual student-edit path
        (StudentSerializer.update) share exactly one implementation. See that
        helper for the full rationale (why only the source year, idempotency,
        net-zero relocation). Runs inside the caller's atomic txn.
        """
        carry_forward_dues_on_class_change(
            student_ids, source_class_id, target_class_id
        )

    classnames = {}

    def cacheClassname(self, class_info_id: int) -> str:
        if not class_info_id:
            return ""
        classname = self.classnames.get(class_info_id)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(class_info_id, False)
            self.classnames[class_info_id] = classname
        return classname


"""
-/api/students/discounts
"""


class StudentDiscountView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    # said in so many words: "Invalid request!" left the person retyping the
    # same note, with no idea it was the length
    RESPONSE__REMARKS_TOO_LONG = Response(
        {"message": "Remarks can be at most 50 characters. Shorten the note and save again."},
        status=400,
    )

    def get(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        if student_id and school_id:
            query = Q(student__id=student_id, school=school_id)
            is_active = request.query_params.get("active") or True
            if is_active:
                query &= Q(is_active=is_active)
            #
            discounts = StudentDiscountInfo.objects.filter(query).values(
                "id",
                "student",
                "student__class_info",
                "title",
                "discount",
                "percentage",
                "remarks",
                "academic_year",
            )
            s = StudentDiscountInfoSerializer(discounts, many=True)
            return Response(s.data)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        student_id = request.data.get("student")
        raw_title = request.data.get("title")
        # transportation discounts arrive as TRANSPORTATION ('tn') and are stored
        # with a null title — normalise so the duplicate check matches them too.
        title_id = None if raw_title == TRANSPORTATION else raw_title
        # The discount is scoped to the student's current academic year (derived
        # from their class). Once they move to a new class/year the same title
        # can be discounted again; reports also group discounts by this year.
        academic_year_id = (
            Student.objects.filter(id=student_id)
            .values_list("class_info__academic_year", flat=True)
            .first()
        )
        # One active discount per (student, title, academic year). A duplicate
        # add is blocked — the user must edit the existing one instead.
        already = StudentDiscountInfo.objects.filter(
            student_id=student_id,
            title_id=title_id,
            academic_year_id=academic_year_id,
            is_active=True,
        ).exists()
        if already:
            return Response(
                {
                    "message": "A discount for this fee title already exists for this academic year. Edit the existing one instead."
                },
                status=400,
            )
        s = StudentDiscountInfoSerializer(data=request.data)
        if not s.is_valid() and "remarks" in s.errors:
            return self.RESPONSE__REMARKS_TOO_LONG
        if s.is_valid():
            ins = s.save(academic_year_id=academic_year_id)
            return Response(
                {
                    "message": "Discount saved!",
                    "discount": {
                        "id": ins.id,
                        "title": ins.title.id if ins.title else TRANSPORTATION,
                        "discount": ins.discount,
                        "percentage": ins.percentage,
                        "remarks": ins.remarks,
                    },
                }
            )
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.pop("id", None)
        student_id = request.data.pop("student", None)
        school_id = request.data.pop("school", None)
        if id and student_id and school_id:
            stdDiscount = StudentDiscountInfo.objects.get(
                id=id, student=student_id, school=school_id
            )
            if stdDiscount:
                s = StudentDiscountInfoSerializer(
                    stdDiscount, data=request.data, partial=True
                )
                if s.is_valid():
                    s.save()
                    return Response({"message": "Student discount updated!"})
                if "remarks" in s.errors:
                    return self.RESPONSE__REMARKS_TOO_LONG
        return self.RESPONSE__INVALID_REQUEST

    def delete(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        if id and student_id and school_id:
            item = StudentDiscountInfo.objects.get(
                id=id, student__id=student_id, school__id=school_id
            )
            item.is_active = False
            item.save()
            return Response({"message": "Student discount deleted!"})
        return self.RESPONSE__INVALID_REQUEST
