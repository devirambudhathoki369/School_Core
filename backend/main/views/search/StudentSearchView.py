from django.db.models import (
    Q,
    Value,
    CharField,
    Subquery,
    OuterRef,
    Sum,
    F,
    DecimalField,
    Case,
    When,
    CharField,
    QuerySet,
)
from django.db.models.functions import Coalesce, Concat, Lower, Collate
from django.core.cache import cache

#
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from django.conf import settings
from decimal import Decimal
from rest_framework import serializers
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from main.methods.bloodgroupQuery import bloodgroupQuery
from main.models.exams.Result import ClassResult, StudentResult
from main.constants.payment import OPENING_BALANCE
from main.methods.hostelRates import schoolUsesHostel
from ...models.Student import (
    Student,
    StudentTransportationInfo,
    StudentDiscountInfo,
    STUDENT_STATUS_CHOICES,
)
from ...models.Ledger import StudentLedger
from ...models.Invoice import StudentInvoice
from ...models.exams.SubjectAssignment import SubjectAssignment
from ...models.ClassPeriod import ClassPeriod
from ...models.Attendance import ClassAttendance, StudentAttendance
from ...models.ClassInfo import ClassInfo
from ...models.FiscalYears import AcademicYear
from ...methods.classSections import sibling_class_info_ids
from ...serializers.StudentSerializer import StudentDiscountInfoSerializer
from ..BaseViews import BaseSearchView
from ..fields import FOREIGN_CLASS_DETAILS_FIELDS, CHOICES_CLASS_DETAILS_FIELDS
from ..StudentViews import STUDENT_DETAILS_RETURN_FIELDS
from main.choices.BloodGroup import BLOOD_GROUP_CHOICES_DICT
from ...methods.getStudentDetail import transportation_query, getClassDetails
from library.methods.guestSchools import borrower_school_ids
from ...methods.nepaliDatetime import formatNepaliDate, nepaliToEnglishDate

student_status_options_dict = {e[0]: e[1] for e in STUDENT_STATUS_CHOICES}


class StudentSearchByAcademicYearMixin:
    def searchFromResults(
        self,
        school_id,
        class_info_id: int | list,
        academic_year_id: int,
        result: bool,
        subject_id: int | list,
        exam_id: int | list = None,
        class_result_ids: list = None,
    ):
        # will be receiving result.academic_year:pk and class_info: pk
        # get students query using results! [cause it's used for result!]
        if not subject_id:
            period_subjects = self.getClassPeriodSubjects(
                class_info_id, academic_year_id
            )
            subject_id = next(iter(period_subjects), None)
        #
        csr_q = Q(
            is_active=True,
            exam__academic_year=academic_year_id,
        )
        if not class_result_ids:
            class_info_q = Q()
            exam_q = Q()
            subject_q = Q()
            if class_info_id:
                if isinstance(class_info_id, (int, str)):
                    class_info_q &= Q(class_info=class_info_id)
                else:
                    class_info_q &= Q(class_info__in=class_info_id)
                csr_q &= class_info_q
            if exam_id:
                if isinstance(exam_id, (int, str)):
                    exam_q &= Q(exam=exam_id)
                else:
                    exam_q &= Q(exam__in=exam_id)
                csr_q &= exam_q
            if subject_id:
                if isinstance(subject_id, (int, str)):
                    subject_q &= Q(subject=subject_id)
                else:
                    subject_q &= Q(subject__in=subject_id)
                csr_q &= subject_q
            csr_id = (
                ClassResult.objects.filter(csr_q)
                .order_by("-id")
                .values_list("id", flat=True)
                .first()
            )
            class_result_ids = [csr_id]
        #
        if class_result_ids:
            student_ids = (
                StudentResult.objects.filter(
                    is_active=True,
                    class_result__in=class_result_ids,
                )
                .distinct("student_id")
                .values_list("student_id", flat=True)
            )
            if result and subject_id:
                rq = Q(
                    academic_year=academic_year_id,
                    is_active=True,
                )
                rq &= class_info_q
                rq &= subject_q
                if academic_year_id:
                    rq &= Q(academic_year=academic_year_id)
                optional_subject_students = (
                    SubjectAssignment.objects.filter(rq)
                    .order_by("-id")
                    .values("students")
                    .first()
                )
                if optional_subject_students:
                    optional_subject_students = (
                        optional_subject_students.get("students") or {}
                    )
                    optional_subject_students = set(optional_subject_students)
                    filtered_out_query = ~Q(id__in=optional_subject_students)
                    student_ids = student_ids.filter(filtered_out_query)
            return student_ids

    def getClassPeriodSubjects(self, class_info_id: int | list, academic_year_id: int):
        query = Q(is_active=True)
        if isinstance(class_info_id, (int, str)):
            query &= Q(class_info=class_info_id)
        elif isinstance(class_info_id, list):
            query &= Q(class_info__in=class_info_id)
        if academic_year_id:
            query &= Q(academic_year=academic_year_id)
        period = (
            ClassPeriod.objects.filter(query).values("subjects").order_by("-id").first()
        )
        if period:
            period = period.get("subjects")
            if isinstance(period, dict):
                period = period.values()
        return period or []


class StudentSearchPayloadSerializer(serializers.Serializer):
    school = serializers.IntegerField(
        required=False, help_text="Required if is not searching by contact!"
    )
    contact = serializers.CharField(
        required=False,
        max_length=10,
        help_text="Search by guardian's contact",
    )
    status = serializers.IntegerField(
        required=False,
        default=1,
        help_text=str(student_status_options_dict),
    )
    include_contact = serializers.BooleanField(required=False)
    guest_schools = serializers.ListField(
        required=False,
        help_text="""School ids[] whose students should also be searched.\\
            Only schools registered as guests of `school` (library book issue) are honoured.""",
    )
    class_info = serializers.IntegerField()
    include_classinfo = serializers.BooleanField(required=False)
    include_classname = serializers.BooleanField(required=False)
    english_birth_date = serializers.BooleanField(required=False)
    transportation_fee = serializers.BooleanField(required=False)
    hostel_fee = serializers.BooleanField(required=False)
    include_station = serializers.BooleanField(required=False)
    include_discounts = serializers.BooleanField(required=False)
    discount_details = serializers.BooleanField(required=False)
    include_balance = serializers.BooleanField(required=False)
    balance_gt = serializers.FloatField(
        required=False,
        help_text="Balance greater than amount, include_balance must be true!",
    )
    balance_lt = serializers.FloatField(
        required=False,
        help_text="Balance less than amount, include_balance must be true!",
    )
    academic_year = serializers.IntegerField(required=False)
    result_academic_year = serializers.IntegerField(
        required=False,
        help_text="Will use this academic year along other args to find students from results!",
    )
    include_images = serializers.BooleanField(required=False)
    include_rfid_card = serializers.BooleanField(required=False)
    include_identities = serializers.BooleanField(
        required=False,
        help_text="Returns roll_no, symbol_no, regd_no(registration no.)",
    )
    include_attendance = serializers.BooleanField(required=False)
    id_cards = serializers.BooleanField(required=False)
    result = serializers.BooleanField(
        required=False, help_text="includes student results"
    )
    subject_id = serializers.IntegerField()
    students = serializers.ListField(help_text="Student ids[]")
    detailed = serializers.BooleanField(
        required=False, help_text="Returns detailed student informations"
    )
    count = serializers.BooleanField(required=False)
    strict = serializers.BooleanField(
        required=False,
        help_text="""If, include_station, students using transportation will only be filtered.\\
            If, include_discounts, students with discounts will only be filtered.""",
    )
    merge_sections = serializers.BooleanField(
        required=False,
        help_text="Expand a single class_info to all sibling sections of its grade.",
    )


class ContactSearchThrottle(AnonRateThrottle):
    scope = "student_contact_search"

    def get_rate(self):
        return getattr(settings, "CONTACT_SEARCH_RATE", "60/hour")

    def get_cache_key(self, request, view):
        # counted per client whether or not a session cookie rides along
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class StudentSearchView(BaseSearchView, StudentSearchByAcademicYearMixin):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    """
    POST: /api/search/students
    allowed search fields:
        - first_name, middle_name, last_name, [used by payment>student-search]
        - education_level, grade, faculty[grade=11/12], section[all-grade], course, year, semester ["]
            - used by all student searches!
        - include_station &
        - include_discounts
            - both are used by ledger-posting only!
            - station: return [bus_station.fee, start_date]
            - discounts: return data["discounts"]= {student_id: {title, discount}, ...}
        - transportation_services
            - only used by bulk-student-update > transportation!
            - return [bus_station, start_date, transportation_services]
    """
    # search fields
    STRING_FIELDS = ("first_name", "middle_name", "last_name")
    # return fields
    RETURN_FIELDS = ("id", "name", "class_info")
    include_docs = True
    STUDENT_STATUS_RUNNING = 1

    def initial(self, request, *args, **kwargs):
        if request.method == "POST" and "contact" in request.data:
            # The self-registration lookup runs WITHOUT authentication, and
            # returning early here also skipped every throttle: phone number
            # in, children's names, photos and school out, as fast as a script
            # could ask. A parent registering asks a few times.
            throttle = ContactSearchThrottle()
            if not throttle.allow_request(request, self):
                self.throttled(request, throttle.wait())
            return
        super().initial(request, *args, **kwargs)

    #
    @swagger_auto_schema(
        tags=["students"],
        operation_summary="advanced students search",
        request_body=StudentSearchPayloadSerializer,
    )
    def post(self, request):
        contact = request.data.get("contact")
        if contact:
            """
            Search by contact
            For, student registration!
            """
            search_by_contact_query = Q(is_active=True)
            search_by_contact_query &= Q(contact=contact) | Q(
                guardian_info__guardian_contact=contact
            )
            students = self.getStudentsDetails(
                search_by_contact_query, ("id", "name", "image")
            )
            students = students.annotate(school=F("class_info__school"))
            return Response(students)
        #
        school_id = request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        student_status = request.data.get("status") or self.STUDENT_STATUS_RUNNING
        include_guardian_name = request.data.pop("include_guardian_name", False)
        include_father_name = request.data.pop("include_father_name", False)
        include_contact = request.data.pop("include_contact", False)
        include_classinfo = request.data.pop("include_classinfo", False)
        english_birth_date = request.data.pop("english_birth_date", False)
        transportation_fee = request.data.pop("transportation_fee", False)
        hostel_fee = request.data.pop("hostel_fee", False)
        include_station = request.data.pop("include_station", False)
        include_discounts = request.data.pop("include_discounts", False)
        discount_details = request.data.pop("discount_details", False)
        include_balance = request.data.pop("include_balance", False)
        balance_gt = request.data.pop("balance_gt", None)
        balance_lt = request.data.pop("balance_lt", None)
        academic_year = request.data.pop("academic_year", None)
        result_academic_year = request.data.pop("result_academic_year", None)
        include_images = request.data.pop("include_images", False)
        include_rfid_card = request.data.pop("include_rfid_card", False)
        include_identities = request.data.pop("include_identities", False)
        include_attendance = request.data.pop("include_attendance", False)
        id_cards = request.data.pop("id_cards", False)
        count = request.data.pop("count", False)
        detailed = request.data.pop("detailed", False)
        result = request.data.pop("result", False)
        subject_id = request.data.pop("subject", None)
        strict = request.data.pop("strict", False)
        # When true, a single class_info is expanded to every sibling section of
        # its grade (used by the photo-matching pool — see classSections.py).
        merge_sections = request.data.pop("merge_sections", False)
        student_ids_in = request.data.pop("students", [])
        includes_education_level = "education_level" in request.data
        """
        strict, \\
        is used to get filtered students those \\
        if using transportation_service [include_station] OR has discounts [include_discounts]!
        """
        #
        self.include_classname = request.data.pop("include_classname", False)
        #
        searchByClassInfo = False  # class-info-details or class-info-id!
        class_info = request.data.get("class_info")
        # A student id identifies exactly one student, so it is answered on its
        # own — no name and no class needed (the library desk types the number
        # printed on the ID card).
        student_id = request.data.pop("student_id", None)
        # A library may serve other schools' students (Library > Book
        # Issue/Return > guest schools). Only schools actually registered as
        # guests of `school_id` are honoured — anything else is dropped.
        guest_schools = request.data.pop("guest_schools", None)
        search_school_ids = [int(school_id)]
        if guest_schools:
            search_school_ids = borrower_school_ids(school_id, guest_schools)
        students_query = Q(class_info__school__id__in=search_school_ids)
        if student_id:
            students_query &= Q(id=student_id)
        if student_ids_in:
            """Search by given student ids only!"""
            students_query &= Q(id__in=student_ids_in)
        searched_from_results = False
        if school_id and result_academic_year and isinstance(class_info, int):
            """
            Search students to access result [search them from results!]
            """
            # The roster comes from the recorded results of a PAST academic
            # year, so it is a historical view: the students sat that exam but
            # have since been promoted / passed out.
            searched_from_results = True
            student_ids = self.searchFromResults(
                school_id,
                class_info,
                result_academic_year,
                result,
                subject_id,
            )
            # print(student_ids)
            if student_ids:
                students_query &= Q(id__in=set(student_ids))
            else:
                return self.RESPONSE__NOT_FOUND
        elif (
            subject_id
            and result
            and isinstance(class_info, int)
            and (academic_year or result_academic_year)
        ):
            """
            Students assigned to optional subjects!
            """
            opt_sub_student_ids = self.getOptionalSubjectAssignedStudents(
                result_academic_year or academic_year, class_info, subject_id
            )
            if opt_sub_student_ids:
                students_query &= Q(id__in=set(opt_sub_student_ids))
            else:
                searchByClassInfo = True
        elif (
            school_id and academic_year and not includes_education_level and not result
        ):
            """
            Search by academic year only [new admissions report]
            """
            students_query &= Q(academic_year=academic_year)
        else:
            searchByClassInfo = True

        is_historical_view = searched_from_results
        historical_class_map = {}
        if searchByClassInfo:
            """
            search using class-info details or class-info>id.
            """
            if any(field in request.data for field in self.STRING_FIELDS):
                students_query &= self.query(
                    fields=self.STRING_FIELDS, data=request.data, fieldType="string"
                )
                # here, academic year can't be determined, and will be generated using student's class-info-id!
                academic_year = None
            #
            # Detect whether the user is asking for a historical (closed) academic year.
            # For past AYs, Student.class_info points to the CURRENT class (post-promotion),
            # so we must derive the roster from immutable StudentLedger snapshots instead.
            if academic_year and includes_education_level:
                ay = (
                    AcademicYear.objects.filter(id=academic_year, school=school_id)
                    .only("closed")
                    .first()
                )
                if ay and ay.closed:
                    is_historical_view = True
            #
            if is_historical_view:
                class_info_q = self.classInfoOwnQuery(school_id, request.data)
                class_ids = list(
                    ClassInfo.objects.filter(class_info_q).values_list(
                        "id", flat=True
                    )
                )
                if not class_ids:
                    return self.RESPONSE__NOT_FOUND
                # Build historical-class map: for each student in the roster,
                # take the LATEST ledger posting in this AY (largest id) — that
                # is their class at the end of the period. If a student moved
                # sections mid-year we still pick one deterministic class to
                # display, matching what a roll-call at year-end would say.
                # Exclude opening-balance ledger rows. They're created when an
                # AY is closed: stored under the NEW AY but carrying the
                # PREVIOUS AY's class_info. Including them would put students
                # who have already left/graduated back into the new AY's roster
                # for their old class.
                historical_rows = list(
                    StudentLedger.objects.filter(
                        academic_year=academic_year,
                        ledger_posting__class_info__in=class_ids,
                        is_active=True,
                        ledger_posting__is_active=True,
                    )
                    .exclude(details__has_key=OPENING_BALANCE)
                    .order_by("student", "-id")
                    .distinct("student")
                    .values_list("student", "ledger_posting__class_info")
                )
                historical_class_map = {row[0]: row[1] for row in historical_rows}
                roster_ids = list(historical_class_map.keys())
                if not roster_ids:
                    return self.RESPONSE__NOT_FOUND
                students_query &= Q(id__in=set(roster_ids))
            else:
                if isinstance(class_info, int):
                    if merge_sections:
                        # roster spans every section of this grade
                        class_ids = sibling_class_info_ids(class_info) or [class_info]
                        students_query &= Q(class_info__in=class_ids)
                    else:
                        students_query &= Q(class_info=class_info)
                elif includes_education_level:
                    # TODO: recheck this value useNull=False!
                    """
                    ledger_posting: useNull=True
                    search: useNull=False
                    """
                    useNull = request.data.get("ledger_posting", False) is True
                    students_query &= self.byClassInfoQuery(
                        search_school_ids, request.data, useNull
                    )
        #
        # For historical views, don't auto-apply the RUNNING status filter — students
        # may have since passed out / dropped out but were still in the class at that time.
        # The user can still narrow by status explicitly via the form's status dropdown.
        if not (is_historical_view and not request.data.get("status")):
            students_query &= Q(status=student_status)
        # When the user filters by a non-RUNNING status (passed-out / dropped-out)
        # together with an academic year, constrain to students whose last class
        # belongs to that AY — otherwise the result mixes in students who passed
        # out / dropped out in prior years (their class_info still matches the
        # selected education-level but at a different AY).
        if (
            academic_year
            and student_status != self.STUDENT_STATUS_RUNNING
            and not is_historical_view
        ):
            students_query &= Q(class_info__academic_year=academic_year)
        students = self.getStudentsDetails(students_query, None, count)
        # ---
        """
        Multiple student based information subqueries!
        """
        RETURN_FIELDS = list()
        # academic-year!
        students = students.annotate(
            class_academic_year=F("class_info__academic_year"),
        )
        RETURN_FIELDS.append("class_academic_year")
        if len(search_school_ids) > 1:
            # the borrower list mixes schools — say which one each student is from.
            students = students.annotate(
                student_school=F("class_info__school"),
                school_name=F("class_info__school__name"),
            )
            RETURN_FIELDS.extend(["student_school", "school_name"])
        if include_classinfo:
            # for automatic academic year switching.
            students = self._includeClassInfo(students)
            RETURN_FIELDS.extend(["education_level", "grade", "year", "semester"])
        # for bulk-student-update/transportation
        if include_father_name:
            # father_name lives on the related StudentGuardianInfo, not Student.
            students = students.annotate(
                father_name=F("guardian_info__father_name")
            )
            RETURN_FIELDS.append("father_name")
        if include_contact:
            students = students.annotate(
                self_contact=F("contact"),
                guardian_contact=F("guardian_info__guardian_contact"),
            )
            RETURN_FIELDS.extend(["self_contact", "guardian_contact"])
        if include_station:
            station_id = request.data.pop("station", None)
            station_name = request.data.pop("station_name", False)
            RETURN_FIELDS.extend(["bus_station", "start_date"])
            students = self._includeStation(
                school_id, students, station_id, strict, station_name
            )
        if include_images:
            RETURN_FIELDS.append("image")
        if include_rfid_card:
            RETURN_FIELDS.append("rfid_card")
        if include_identities:
            RETURN_FIELDS.extend(["roll_no", "symbol_no", "regd_no"])
        if include_guardian_name:
            RETURN_FIELDS.append("guardian_name")
            students = self._include_guardian_name(students)
        #
        if id_cards:
            RETURN_FIELDS.extend(
                [
                    "image",
                    "birth_date",
                    "guardian_name",
                    "guardian_contact",
                    "guardian_location",
                    "blood_group",
                    "emis",
                ]
            )
            students = self._idCards(students)
        # FOR ledger-posting
        if transportation_fee:
            RETURN_FIELDS.extend(["transportation_fee", "transportation_date"])
            students = self._includeTransportationFee(school_id, students)
        if hostel_fee:
            RETURN_FIELDS.extend(["hostel_fee", "hostel_date"])
            students = self._includeHostelFee(school_id, students)
        #
        if include_balance:
            students = self._includeBalance(school_id, students, academic_year)
            RETURN_FIELDS.append("balance")
            # filter by balance!
            if balance_gt:
                try:
                    balance_gt = Decimal(balance_gt)
                    students = students.filter(balance__gte=balance_gt)
                except:
                    pass
            if balance_lt:
                try:
                    balance_lt = Decimal(balance_lt)
                    students = students.filter(balance__lte=balance_lt)
                except:
                    pass
        #
        if not count:
            if detailed:
                # only used by CHARACTER CERTIFICATE and ENROLLMENT HISTORY!
                RETURN_FIELDS.extend(STUDENT_DETAILS_RETURN_FIELDS)
                if include_images:
                    RETURN_FIELDS.append("image")
                # raw blood_group choice code (not the display text) so the bulk
                # student-update editor can prefill its dropdown.
                students = students.annotate(
                    blood_group=F("other_info__blood_group")
                )
                RETURN_FIELDS.append("blood_group")
                students = students.values(*RETURN_FIELDS)
                # In historical view, override each student's class_info with
                # the class they were actually in during the selected AY (from
                # LedgerPosting snapshots). Without this, the CLASSNAME column
                # would show the student's CURRENT class — confusing because
                # students promoted out would appear under their new grade.
                if is_historical_view and historical_class_map:
                    students = list(students)
                    for s in students:
                        hist_class = historical_class_map.get(s.get("id"))
                        if hist_class:
                            s["class_info"] = hist_class
                students = self.formatEnrollments(students, english_birth_date)
            else:
                RETURN_FIELDS.extend(self.RETURN_FIELDS)
                # only for payment/student-search, handle balance field before using in another one too.
                students = students.values(*RETURN_FIELDS)
                # Same historical-class override for the non-detailed code path
                # (used by Payment > Student search and similar).
                if is_historical_view and historical_class_map:
                    students = list(students)
                    for s in students:
                        hist_class = historical_class_map.get(s.get("id"))
                        if hist_class:
                            s["class_info"] = hist_class
        #
        if include_discounts:
            ids = {std["id"] for std in students}
            students = self._includeDiscounts(
                school_id, ids, students, strict, discount_details
            )
        if include_attendance:
            date = request.data.get("date")
            if date:
                students, class_attendance = self._includeAttendance(
                    students, school_id, class_info, date
                )
                if class_attendance:
                    return Response(
                        {
                            "attendances": students,
                            "class_attendance": class_attendance,
                        }
                    )
                else:
                    return self.RESPONSE__NOT_FOUND
        # print(students)
        if isinstance(students, list) or isinstance(students, QuerySet):
            for std in students:
                # TODO: merge this loop inside self.formatEnrollments.
                # REFIX classname's use.
                if self.include_classname and "classname" not in std:
                    std["classname"] = self.cacheClassname(std.get("class_info"))
        #
        # print(students)
        return Response(students)

    def formatEnrollments(self, enrollments, english_birth_date):
        return [
            {
                "date": e.pop("created_at"),
                "classname": (
                    e.get("classname")
                    or (
                        self.cacheClassname(e.pop("class_info"))
                        if self.include_classname
                        else ""
                    )
                ),
                "father_name": e.pop("guardian_info__father_name"),
                "mother_name": e.pop("guardian_info__mother_name"),
                "guardian_name": e.pop("guardian_info__guardian_name"),
                "guardian_contact": e.pop("guardian_info__guardian_contact"),
                "guardian_location": e.pop("guardian_info__guardian_location"),
                "english_birth_date": (
                    nepaliToEnglishDate(e.get("birth_date") or "")
                    if english_birth_date
                    else ""
                ),
                **e,
            }
            for e in enrollments
        ]

    def _includeTransportationFee(self, school_id, students):
        # returns bus_station.fee, student_transportation.start_date
        query = transportation_query(school_id, False, True, True)
        return students.annotate(
            transportation_fee=Coalesce(query.values("bus_station__fee"), Value(None)),
            transportation_date=Coalesce(query.values("start_date"), Value(None)),
        )

    def _includeHostelFee(self, school_id, students):
        """The boarder's monthly hostel rate and the day they moved in.

        Mirrors `_includeTransportationFee` exactly, and feeds the same place:
        the class-wide ledger-posting screen, which needs a per-student rate for
        the "hostel" column the way it already does for "transportation".

        The hostel app is imported HERE rather than at module scope. Student
        search is on the hot path for schools that will never buy the hostel
        module, and an unavailable app must degrade to "nobody is a boarder"
        rather than to a 500.
        """
        # A school without the hostel module gets the columns as constant NULLs
        # — no subquery, no join, no cost. Student search is the hottest query
        # in the product and it runs for every school, almost none of which will
        # ever have a hostel.
        if not schoolUsesHostel(school_id):
            return students.annotate(
                hostel_fee=Value(None, output_field=DecimalField()),
                hostel_date=Value(None, output_field=CharField()),
            )
        try:
            from hostel.constants import ALLOC_ACTIVE
            from hostel.models.Allocation import HostelAllocation
        except Exception:
            return students.annotate(
                hostel_fee=Value(None, output_field=DecimalField()),
                hostel_date=Value(None, output_field=CharField()),
            )
        query = HostelAllocation.objects.filter(
            school=school_id,
            student=OuterRef("pk"),
            status=ALLOC_ACTIVE,
            is_active=True,
        ).values("monthly_fee", "check_in_date")[:1]
        return students.annotate(
            hostel_fee=Coalesce(query.values("monthly_fee"), Value(None)),
            hostel_date=Coalesce(query.values("check_in_date"), Value(None)),
        )

    def _includeStation(
        self, school_id, students, station_id, strict, station_name=False
    ):
        # returns bus_station.station, student_transportation.start_date
        query = transportation_query(school_id, True, False, True, station_id)
        _station_field = "bus_station__station" if station_name else "bus_station"
        students = students.annotate(
            bus_station=Coalesce(query.values(_station_field), Value(None)),
            start_date=Coalesce(query.values("start_date"), Value(None)),
        )
        if strict:
            students = students.filter(~Q(bus_station=None))
        return students

    def _includeDiscounts(self, school_id, studentIds, data, strict, detailed=False):
        discountsByStudentId = self._mapDiscountsByStudentId(
            school_id, studentIds, detailed
        )
        students_with_discount = []
        for e in data:
            stdId = e.get("id", None)
            if stdId:
                discounts = discountsByStudentId.get(stdId, None)
                if discounts:
                    e["discounts"] = discounts
                if not strict or (strict and discounts):
                    students_with_discount.append(e)
        return students_with_discount

    def _mapDiscountsByStudentId(self, school_id, studentIds, detailed=False):
        _return_fields = [
            "student",
            "student__class_info",
            "title",
            "discount",
            "percentage",
        ]
        if detailed:
            _return_fields.extend(["created_at", "remarks"])
        #
        discounts = StudentDiscountInfo.objects.filter(
            student__id__in=studentIds, school__id=school_id, is_active=True
        ).values(*_return_fields)
        s = StudentDiscountInfoSerializer(discounts, many=True)
        data = {}
        for e in s.data:
            stdId = e.pop("student", None)
            if stdId:
                title = (
                    e.get("title") or "tn"
                )  # title id or "tn" i.e. "transportation"!
                percentage = e.get("percentage", None)
                discount = e.get("discount", None)
                old_discount = e.get("old_discount", None)
                _discount = {
                    "discount": discount,
                    "old_discount": old_discount,
                    "percentage": percentage,
                }
                if detailed:
                    _discount["created_at"] = e.get("created_at")
                    _discount["updated_at"] = e.get("updated_at")
                    _discount["remarks"] = e.get("remarks")
                if stdId in data:
                    data[stdId][title] = _discount
                else:
                    data[stdId] = {title: _discount}
        return data

    def _includeBalance(self, school_id: int, students: Q, academic_year: int = None):
        q = Q(school=school_id, student=OuterRef("pk"), is_active=True)
        if academic_year:
            q &= Q(academic_year=academic_year)
        else:
            q &= Q(academic_year=OuterRef("class_academic_year"))
        ledger_total_sq = (
            StudentLedger.objects.filter(q, ledger_posting__is_active=True)
            .values("student_id")
            .annotate(total=Sum("total"))
            .values("total")[:1]
        )
        invoice_totals_sq = (
            StudentInvoice.objects.filter(q, isCashReceipt=False)
            .values("student_id")
            .annotate(
                paid_total=Sum("total_paid"), discount_total=Sum("total_discount")
            )
            .values("paid_total", "discount_total")[:1]
        )
        #
        return students.annotate(
            total_credit=Coalesce(
                ledger_total_sq, Value(0), output_field=DecimalField()
            ),
            total_debit=Coalesce(
                invoice_totals_sq.values("paid_total"),
                Value(0),
                output_field=DecimalField(),
            ),
            total_discount=Coalesce(
                invoice_totals_sq.values("discount_total"),
                Value(0),
                output_field=DecimalField(),
            ),
            balance=Coalesce(
                (F("total_credit") - F("total_debit")) - F("total_discount"),
                Value(0),
                output_field=DecimalField(),
            ),
        )

    def _idCards(self, students):
        students = self._include_guardian_name(students)
        students = students.annotate(
            guardian_contact=Case(
                When(
                    guardian_info__guardian_contact__isnull=False,
                    then=F("guardian_info__guardian_contact"),
                ),
                default=F("contact"),
                output_field=CharField(),
            ),
            guardian_location=Case(
                When(
                    guardian_info__guardian_location__isnull=False,
                    then=F("guardian_info__guardian_location"),
                ),
                default=F("location"),
                output_field=CharField(),
            ),
            blood_group=bloodgroupQuery(),
        ).select_related("class_info")
        return students

    def _includeAttendance(self, students, school, class_info, date):
        date = formatNepaliDate(date)
        student_ids = {student.get("id") for student in students}
        class_attendance = (
            ClassAttendance.objects.filter(
                school=school, class_info=class_info, date=date
            )
            .values("id")
            .first()
        )
        if class_attendance:
            class_attendance = class_attendance.get("id")
            attendances = {
                attd.get("student"): attd
                for attd in (
                    StudentAttendance.objects.filter(
                        class_attendance=class_attendance,
                        student__in=student_ids,
                    )
                    .order_by("class_attendance")
                    .distinct("class_attendance", "student")
                    .values("id", "class_attendance", "status", "reason", "student")
                )
            }
            for std in students:
                student_id = std.pop("id")
                attd = attendances.get(student_id) or {}
                std.update(attd)
                if not attd:
                    std.update(
                        {
                            "class_attendance": class_attendance,
                            "student": student_id,
                            "class_info": class_info,
                        }
                    )
            return students, class_attendance
        return students, None

    def getOptionalSubjectAssignedStudents(
        self,
        academic_year_id: int,
        class_info_id: int,
        subject_id: int,
    ):
        if academic_year_id:
            instance = (
                SubjectAssignment.objects.filter(
                    is_active=True,
                    academic_year=academic_year_id,
                    class_info=class_info_id,
                    subject=subject_id,
                )
                .values("students")
                .first()
            )
            if instance:
                return instance.get("students")
        return None

    def byClassInfoQuery(self, school_id, data, useNull=True):
        # school_id may be a list — a library search spanning guest schools.
        school_ids = (
            list(school_id) if isinstance(school_id, (list, tuple, set)) else [school_id]
        )
        return (
            self.query(
                fields=FOREIGN_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="foreign",
                parent="class_info",
                useNull=useNull,
            )
            & self.query(
                fields=CHOICES_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="choices",
                parent="class_info",
                useNull=useNull,
            )
            & Q(class_info__school__id__in=school_ids)
        )

    def classInfoOwnQuery(self, school_id, data):
        """Same matching logic as byClassInfoQuery but applied directly on ClassInfo
        (no 'class_info__' prefix). Used to resolve historical class IDs for closed-AY
        roster derivation via StudentLedger ⋈ LedgerPosting.class_info."""
        return (
            self.query(
                fields=FOREIGN_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="foreign",
                parent=None,
                useNull=False,
            )
            & self.query(
                fields=CHOICES_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="choices",
                parent=None,
                useNull=False,
            )
            & Q(school__id=school_id, is_active=True)
        )

    classnames = {}

    def cacheClassname(self, class_info_id: int) -> str:
        # FIX these methods, get these from cache, as names are already stored via /classes api!
        if not class_info_id:
            return ""
        KEY = f"classnames:v2:{class_info_id}"
        classname = cache.get(KEY) or self.classnames.get(class_info_id)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(class_info_id, False)
            self.classnames[class_info_id] = classname
        return classname

    def start_date_subquery(self, q):
        return Subquery(
            StudentTransportationInfo.objects.filter(q).values("start_date")[:1],
            output_field=CharField(),
        )

    def getStudentsDetails(self, query, RETURN_FIELDS=None, count=False):
        students = Student.objects.filter(query)
        if not count:
            students = students.annotate(
                name=Concat(
                    "first_name",
                    Value(" "),
                    "middle_name",
                    Value(" "),
                    "last_name",
                    output_field=CharField(),
                ),
                name_sort=Lower(
                    Concat(
                        "first_name",
                        Value(" "),
                        "middle_name",
                        Value(" "),
                        "last_name",
                        output_field=CharField(),
                    )
                ),
            ).order_by(Collate("name_sort", "und-x-icu"))
            if RETURN_FIELDS:
                students = students.values(*RETURN_FIELDS)
        else:
            students = students.count()
        return students

    def _include_guardian_name(self, students):
        return students.annotate(
            guardian_name=Coalesce(
                F("guardian_info__guardian_name"),
                F("guardian_info__father_name"),
                F("guardian_info__mother_name"),
                default=Value(""),
                output_field=CharField(),
            )
        )

    def _includeClassInfo(self, students):
        # TODO: instead cache class-details alongside classname and return it.
        return students.annotate(
            education_level=F("class_info__education_level"),
            grade=F("class_info__grade"),
            year=F("class_info__year"),
            semester=F("class_info__semester"),
        )
