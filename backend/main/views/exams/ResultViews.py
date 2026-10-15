from collections import defaultdict
from decimal import Decimal
from rest_framework.response import Response
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema

#
from django.db.models import Q, F, Window
from django.db.models.functions import Collate, Rank
from django.db import transaction

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)

#
from ...models.FiscalYears import AcademicYear
from ...models.exams.Result import ClassResult, StudentResult
from ...models.Student import Student
from ...models.ClassInfo import ClassInfo
from ...models.ClassPeriod import ClassPeriod
from ...models.exams.ExtraActivity import ExtraActivity, ExtraActivityEntry
from ...models.exams.GradingRules import GradingRules
from ..BaseViews import SecuredAPIView, caller_student_id, is_student_request
from ...serializers.exams.ResultSerializer import (
    ClassResultSerializer,
    ResultParamsSerializer,
)
from ...views.search.StudentSearchView import StudentSearchByAcademicYearMixin
from ...methods.genClassname import getClassDetails
from ...methods.nameConcat import nameConcat
from ...methods.plainFields import plain_fields
from ...methods.nepaliDatetime import nepaliToEnglishDate
from .ResultCalculation import ResultCalculation
from docs.api_docs.api.exam_results import RESULTS_API

STUDENT_RESULT_RETURN_VALUES = (
    "id",
    "student",
    "theory",
    "practical",
    "total",
    "attendance",
    "inclusion",
    "result",
    "absent",
)
FM, PM, FM_TH, PM_TH, FM_PR, PM_PR = "fm", "pm", "fm_th", "pm_th", "fm_pr", "pm_pr"
SUBJECT_TYPES = {1: "compulsory", 2: "optional"}
SUBJECT_RESULT_FIELDS = ("theory", "practical", "total", "absent", "result")
CLASS_RESULT_SUBJECT_RETURN_FIELDS = (
    "id",
    "exam",
    "subject",
    "subject__type",
    "subject__code",
    "subject__subject",
    "subject__credit_hours",
    "subject__code_pr",
    "subject__subject_pr",
    "subject__credit_hours_pr",
    "subject__order",
    "criteria",
)
CRITERIA_FIELDS = [FM, PM, FM_TH, PM_TH, FM_PR, PM_PR, "attendance"]
DOCS_TAGS = ["exam and results"]
DOCS_TAGS_2 = ["marks entry"]


class ResultView(SecuredAPIView, StudentSearchByAcademicYearMixin, ResultCalculation):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    include_docs = True
    gr_type_number = 1
    gr_type_grading = 2
    gr_type_division = 4
    student_status_running = 1

    @swagger_auto_schema(tags=DOCS_TAGS, query_serializer=ResultParamsSerializer)
    def get(self, request):
        self.school_id = request.query_params.get("school")
        class_info_id: int = request.query_params.get("class_info")
        publish = request.query_params.get("publish") or False  # view::results-publish
        publish = self.getBooleanValue(publish)
        if (
            not class_info_id or not isinstance(class_info_id, (str, int))
        ) and not publish:
            class_info_id: list = request.query_params.getlist("class_info[]")
            if len(class_info_id) < 1:
                return self.RESPONSE__INVALID_REQUEST
            class_info_id = [int(id) for id in class_info_id]
        #
        academic_year_id = request.query_params.get("academic_year")
        exam_id = request.query_params.get("exam")
        subject_id = request.query_params.get("subject")
        student_id = request.query_params.get("student")
        # The raw param (may be None). Marks-entry must NOT fall back to
        # RUNNING -- see the marks-entry branch below.
        requested_student_status = request.query_params.get("student_status")
        student_status = requested_student_status or self.student_status_running
        include_extra_activities = request.query_params.get("extra_activities") or False
        school_info = request.query_params.get("school_info") or False
        result_type = request.query_params.get("type") or "number"
        is_ledger = request.query_params.get("ledger") or False
        published_only = (
            request.query_params.get("published_only")
            if "published_only" in request.query_params
            else (True if request.user_role == "student" else False)
        )
        if is_student_request(request):
            # A student sees their own PUBLISHED marks. `published_only=` (empty)
            # showed unpublished results, and leaving `student` out returned
            # every pupil's marks for the class.
            published_only = True
            student_id = caller_student_id(request)
            # `subject` opens the marks-entry sheet: the whole class, unpublished
            subject_id = None
        self.v2 = "v2" in request.resolver_match.namespaces
        #
        if exam_id and publish:
            if is_student_request(request):
                return self.RESPONSE__NOT_ALLOWED
            # for result-to-be-published! -- the caller's own classes; the exam
            # id alone listed any school's classes and publish dates
            results = (
                self.scope_to_caller(
                    ClassResult.objects.all(), request, "class_info__school"
                )
                .filter(exam=exam_id, is_active=True)
                .order_by("class_info", "-id")
                .distinct("class_info")
                .values("class_info", "published_date")
            )
            class_ids = {e.get("class_info") for e in results}
            classes = {
                e.id: getClassDetails(None, False, True, False, e)[0]
                for e in ClassInfo.objects.filter(id__in=class_ids, is_active=True)
            }
            results = [
                {"classname": classes.get(e.get("class_info")) or "", **e}
                for e in results
            ]
            return Response(results)
        # ---
        isFinalResult = bool(not exam_id) and bool(academic_year_id)
        if isFinalResult and self.school_id:
            exam_id, exams = self.getExamsForFinalResult(
                self.school_id, academic_year_id
            )  # exams id and details
            # print(exam_id, exams)
        if class_info_id and exam_id:
            if subject_id:
                # For marks-entry>update
                class_result = (
                    ClassResult.objects.filter(
                        class_info=class_info_id,
                        exam=exam_id,
                        subject=subject_id,
                        is_active=True,
                    )
                    .order_by("-id")
                    .first()
                )
                if class_result:
                    # Serialize the instance
                    class_result_serializer = ClassResultSerializer(class_result)
                    #
                    # Marks entry is keyed by the class result, so the
                    # student's CURRENT status says nothing about which marks
                    # were recorded. Defaulting to RUNNING here blanked every
                    # mark of a closed year (the whole class has since passed
                    # out, status=2), while the result/marksheet -- which drops
                    # the status filter for a closed year -- kept showing them.
                    # Honour the filter only when the caller asks for one.
                    marks_q = Q(class_result=class_result.id, is_active=True)
                    if requested_student_status:
                        marks_q &= Q(student__status=requested_student_status)
                    student_results = (
                        StudentResult.objects.filter(marks_q)
                        .order_by("student", "-id")
                        .distinct("student")
                        .values(*STUDENT_RESULT_RETURN_VALUES)
                    )
                    return Response(
                        {
                            "class_result": class_result_serializer.data,
                            "student_results": student_results,
                        }
                    )
                else:
                    return self.RESPONSE__NOT_FOUND
            elif student_id:
                student_result = self.getStudentResult(
                    result_type,
                    class_info_id,
                    academic_year_id,
                    exam_id,
                    student_id,
                    published_only,
                    include_extra_activities,
                    isFinalResult,
                    student_status,
                )
                if student_result:
                    if school_info:
                        student_result["school_info"] = self.getSchoolInfo(
                            class_info_id
                        )
                    if self.v2:
                        student_result["remarks"] = self.remarks
                        student_result["divisions"] = self.divisions
                    student_result["subject_types"] = SUBJECT_TYPES
                    if isFinalResult:
                        student_result["exams"] = exams
                else:
                    student_result = {
                        "message": "No result found!",
                        "status": status.HTTP_404_NOT_FOUND,
                    }
                    return Response(student_result, status=status.HTTP_404_NOT_FOUND)
                return Response(student_result)
            else:
                if isinstance(class_info_id, (int, str)):
                    class_info_id = [int(class_info_id)]
                class_result = self.getClassResult(
                    result_type,
                    class_info_id,
                    exam_id,
                    academic_year_id,
                    not is_ledger,
                    published_only,
                    include_extra_activities,
                    isFinalResult,
                    student_status,
                )
                if class_result:
                    if school_info:
                        class_result["school_info"] = self.getSchoolInfo(
                            class_info_id[0]
                        )
                    if self.v2:
                        class_result["remarks"] = self.remarks
                        class_result["divisions"] = self.divisions
                    class_result["subject_types"] = SUBJECT_TYPES
                    if isFinalResult:
                        class_result["exams"] = exams
                else:
                    class_result = {
                        "message": "No result found!",
                        "status": status.HTTP_404_NOT_FOUND,
                    }
                    return Response(class_result, status=status.HTTP_404_NOT_FOUND)
                return Response(class_result)
        return self.RESPONSE__INVALID_REQUEST

    def getExamsForFinalResult(self, school_id: int, academic_year_id: int):
        """
        returns exams_id, exams
        """
        from ...models.exams.Exam import Exam

        exams = Exam.objects.filter(
            school=school_id,
            academic_year=academic_year_id,
            inclusion__isnull=False,
            is_active=True,
        ).values("id", "name", "inclusion", "attendance_inclusion")
        exams = {e.get("id"): e for e in exams}
        return exams.keys(), exams

    def getSchoolInfo(self, class_info_id):
        SCHOOL_INFO_FIELDS = (
            "name",
            "address",
            "contact",
            "telephone",
            "estd_date",
            "pan_no",
            "email",
            "logo",
            "slogan",
        )
        if class_info_id:
            school_info = ClassInfo.objects.filter(
                id=class_info_id, is_active=True
            ).values()
            school_info = (
                school_info.annotate(
                    **{field: F(f"school__{field}") for field in SCHOOL_INFO_FIELDS}
                )
                .values(*SCHOOL_INFO_FIELDS)
                .first()
            )
            return school_info
        return {}

    def assignedStudents(
        self, class_info_id: int | list, academic_year_id: int, subjects: list
    ):
        from ...models.exams.SubjectAssignment import SubjectAssignment

        query = Q(subject__in=subjects, is_active=True)
        if isinstance(class_info_id, (int, str)):
            query &= Q(class_info=class_info_id)
        elif isinstance(class_info_id, list):
            query &= Q(class_info__in=class_info_id)
        if academic_year_id:
            query &= Q(academic_year=academic_year_id)
        assigns = SubjectAssignment.objects.filter(query).values("subject", "students")
        if assigns.exists():
            data = defaultdict(lambda: [])
            for e in assigns:
                data[e.get("subject")] = e.get("students")
            return data
        return {}

    def getFirstProbeSubject(self, period_subjects, class_subject_results):
        """The subject whose criteria carries the class's attendance total.
        Prefers the first period subject, but a class can have results without
        any periods at all (an old year whose routine was never kept), so fall
        back to the first recorded subject rather than leaving it unset.
        """
        if period_subjects and len(period_subjects) > 0:
            return next(iter(period_subjects))
        for each in class_subject_results:
            subjectId = each.get("subject")
            if subjectId:
                return subjectId
        return None

    def extractSubjects(self, class_subject_results, fps, isFinalResult: bool = False):
        subjects_data = {}
        class_results_ids = set()
        DEFAULT, attendance_total = "default", {}
        fm_total, pm_total = 0, 0
        fps = int(fps) if fps else None
        for each in class_subject_results:
            class_results_ids.add(each.get("id"))
            criteria = each.get("criteria")
            att_total = criteria.get("attendance") or ""
            subjectId = each.get("subject")
            exam = each.get("exam")
            if att_total and fps and subjectId == fps:
                att_total = int(att_total)
                if isFinalResult:
                    attendance_total[exam] = att_total
                else:
                    attendance_total[DEFAULT] = att_total
            #
            criteria = {
                key: Decimal(value) if value else ""
                for key in CRITERIA_FIELDS
                if (value := criteria.get(key))
            }
            #
            _fm = criteria.get(FM) or 0
            _pm = criteria.get(PM) or 0
            subj_type = each.get("subject__type")
            fm_total += Decimal(_fm) if subj_type == 1 else (Decimal(_fm) / 2)
            pm_total += Decimal(_pm) if subj_type == 1 else (Decimal(_pm) / 2)
            #
            if subjectId not in subjects_data:
                subjects_data[subjectId] = {
                    "ri": each.get("id"),
                    "order": each.get("subject__order"),
                    "type": subj_type,
                    "code": each.get("subject__code"),
                    "subject": each.get("subject__subject"),
                    "criteria": {exam: criteria} if isFinalResult else criteria,
                    "credit_hours": each.get("subject__credit_hours"),
                    "code_pr": each.get("subject__code_pr"),
                    "subject_pr": each.get("subject__subject_pr"),
                    "credit_hours_pr": each.get("subject__credit_hours_pr"),
                }
            elif isFinalResult:
                subjects_data[subjectId]["criteria"][exam] = criteria
        # print(attendance_total)
        attendance_total = (
            attendance_total if isFinalResult else attendance_total.get(DEFAULT)
        )
        return subjects_data, fm_total, class_results_ids, attendance_total

    def getStudentResult(
        self,
        result_type: str,
        class_info_id: int,
        academic_year_id: int,
        exam_ids: int | list,
        student_id: int,
        published_only: bool,
        include_extra_activities: bool,
        isFinalResult: bool = False,
        student_status=None,
    ):
        """
        returns:
        subject : [{subject, credit_hours}]
        student_results: {id: {theory, practical, total}}
        result, remarks
        """
        period_subjects = self.getClassPeriodSubjects(class_info_id, academic_year_id)
        assigned_students = self.assignedStudents(
            class_info_id, academic_year_id, period_subjects
        )
        #
        # NOT gated on the class's current periods: a result must show the
        # subjects it was actually recorded with. The timetable is edited every
        # year, so gating on it silently drops marks that were entered under a
        # subject since removed from the routine — worst in a closed year,
        # where the routine has moved on but the result must not.
        cr_q = Q(
            class_info=class_info_id,
            # exam__in=exam_ids,
            is_active=True,
        )
        if isFinalResult:
            cr_q &= Q(exam__in=exam_ids)
        else:
            cr_q &= Q(exam=exam_ids)
        if published_only:
            cr_q &= Q(published_date__isnull=False)
        class_subject_results = (
            ClassResult.objects.filter(cr_q)
            .order_by("exam", "subject", "-id")
            .distinct("exam", "subject")
            .values(*CLASS_RESULT_SUBJECT_RETURN_FIELDS)
        )
        student_results = []
        if class_subject_results:
            fps = self.getFirstProbeSubject(period_subjects, class_subject_results)
            subjects_data, fm_total, class_results_ids, attendance_total = (
                self.extractSubjects(class_subject_results, fps, isFinalResult)
            )
            # Columns come from what was recorded, ordered by the subject's own
            # order (the periods no longer decide which columns exist).
            period_subjects = sorted(
                subjects_data.keys(),
                # `or 0`: subject order is nullable, and None vs int raises.
                key=lambda id: (subjects_data.get(id) or {}).get("order") or 0,
            )
            #
            student_results = (
                StudentResult.objects.filter(
                    is_active=True,
                    class_result__is_active=True,
                    class_result__in=class_results_ids,
                    student=student_id,
                    student__status=student_status,
                )
                .annotate(
                    exam=F("class_result__exam"),
                    rank=Window(
                        expression=Rank(),
                        partition_by=[
                            F("student"),
                            F("class_result__subject"),
                            F("exam"),
                        ],
                        order_by=F("id").desc(),
                    ),
                )
                .filter(rank=1)
                .values(
                    "id",
                    "exam",
                    "theory",
                    "practical",
                    "total",
                    "attendance",
                    "absent",
                    "result",
                    "class_result__subject",
                )
            )
            attendances = None  # None | defaultdict(dict)
            student_details = self.getStudentDetails({student_id}, True, student_status)
            student = student_details[0] if student_details else {}
            if self.v2:
                data = defaultdict(list)
            elif isFinalResult:
                data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
                attendances = defaultdict(lambda: dict)
            else:
                data = defaultdict(lambda: defaultdict(dict))
            for stdResult in student_results:
                subject_ids = (
                    set()
                )  # used to track if subject is already added in results or not (only for v2)
                #
                subjectId = stdResult.get("class_result__subject")
                attend_ = stdResult.get("attendance")
                exam = stdResult.get("exam")
                if attend_ and subjectId == fps:
                    if isFinalResult:
                        attendances[exam] = attend_
                    else:
                        attendances = attend_
                #
                if subjectId in assigned_students:
                    if int(student_id) in assigned_students.get(subjectId):
                        subj_result = self.prepSubjectResult(
                            stdResult,
                            result_type,
                            subjectId,
                            subjects_data.get(subjectId),
                        )
                        if self.v2 and subjectId not in subject_ids:
                            data["marksObtained"].append(subj_result)
                            subject_ids.add(subjectId)
                        else:
                            if isFinalResult:
                                _exam = stdResult.get("exam")
                                data[_exam][subjectId] = subj_result
                            else:
                                data[subjectId] = subj_result
                else:
                    subj_result = self.prepSubjectResult(
                        stdResult,
                        result_type,
                        subjectId,
                        subjects_data.get(subjectId),
                    )
                    if self.v2 and subjectId not in subject_ids:
                        data["marksObtained"].append(subj_result)
                        subject_ids.add(subjectId)
                    else:
                        if isFinalResult:
                            _exam = stdResult.get("exam")
                            data[_exam][subjectId] = subj_result
                        else:
                            data[subjectId] = subj_result
            if self.v2:
                # DOESN'T WORK FOR FINAL RESULTS in v2!
                self.loadGradingRules(class_info_id, result_type)
                data = self.summarizeStudentResults(
                    result_type, {student_id: data}, subjects_data, fm_total
                )
            extra_activities, extra_activities_entries = {}, {}
            # if include_extra_activities:
            [extra_activities, extra_activities_entries] = self.getExtraActivities(
                [student_id], exam_ids, class_info_id
            )
            [_classname, _] = getClassDetails(class_info_id, include_details=False)
            return {
                "fm_total": fm_total,
                "subjects": period_subjects,
                "subjects_data": subjects_data,
                "result": data.get(student_id) if self.v2 else data,
                "student": student,
                "attendance": attendances,
                "attendance_total": attendance_total,
                "extra_activities": extra_activities,
                "extra_activities_entries": extra_activities_entries,
                "classname": _classname,
            }
        return {}

    def getClassResult(
        self,
        result_type: str,
        class_info_id: list,
        exam_id: int | list,
        academic_year_id: int,
        image: bool,
        published_only: bool,
        include_extra_activities: bool,
        isFinalResult: bool = False,
        student_status=None,
    ):
        period_subjects = self.getClassPeriodSubjects(class_info_id, academic_year_id)
        assigned_students = self.assignedStudents(
            class_info_id, academic_year_id, period_subjects
        )
        # print("subjects", period_subjects)
        # print("OSS", assigned_students)
        #
        # See getStudentResult: columns follow the recorded results, not the
        # class's current periods.
        cr_q = Q(
            class_info__in=class_info_id,
            # exam__in=exam_ids,
            is_active=True,
        )
        if isFinalResult:
            cr_q &= Q(exam__in=exam_id)
        else:
            cr_q &= Q(exam=exam_id)
        if published_only:
            cr_q &= Q(published_date__isnull=False)
        class_subject_results = (
            ClassResult.objects.filter(cr_q)
            .order_by("exam", "class_info", "subject", "-id")
            .distinct("exam", "class_info", "subject")
            .values(*CLASS_RESULT_SUBJECT_RETURN_FIELDS)
        )
        student_results = []
        if class_subject_results:
            # ---
            fps = self.getFirstProbeSubject(period_subjects, class_subject_results)
            subjects_data, fm_total, class_results_ids, attendance_total = (
                self.extractSubjects(class_subject_results, fps, isFinalResult)
            )
            period_subjects = sorted(
                subjects_data.keys(),
                # `or 0`: subject order is nullable, and None vs int raises.
                key=lambda id: (subjects_data.get(id) or {}).get("order") or 0,
            )
            # ---
            q = Q(
                is_active=True,
                class_result__is_active=True,
                class_result__in=class_results_ids,
                # student__status=student_status, # applied below conditionally;
                # student__class_info__in=class_info_id,  # COMMENT THIS LINE;
                # student__in=[1361],
            )
            #
            if class_info_id and academic_year_id:
                isAcademicYearClosed = AcademicYear.objects.filter(
                    is_active=True, closed=True, id=academic_year_id
                ).exists()
                if isAcademicYearClosed:
                    """old result search via academic year id!"""
                    _student_ids = self.searchFromResults(
                        None,
                        class_info_id,
                        academic_year_id,
                        False,
                        fps,
                        exam_id,
                        class_results_ids,
                    )
                    if _student_ids:
                        # print("academic students", len(_student_ids))
                        q &= Q(student__in=_student_ids)
                    """if is old result, student_status=Any"""
                    student_status = None
            #
            ssq = Q(student__status=student_status) if student_status else Q()
            student_results = (
                StudentResult.objects.filter(q, ssq)
                .annotate(
                    exam=F("class_result__exam"),
                    class_id=F("class_result__class_info"),
                    rank=Window(
                        expression=Rank(),
                        partition_by=[
                            F("exam"),
                            F("class_id"),
                            F("class_result__subject"),
                            F("student"),
                        ],
                        order_by=F("id").desc(),
                    ),
                )
                .filter(rank=1)
                .values(
                    "id",
                    "exam",
                    "student",
                    "theory",
                    "practical",
                    "total",
                    "attendance",
                    "absent",
                    "result",
                    "class_result__subject",
                )
            )
            #
            attendances = {}
            student_ids = set()
            #
            if self.v2:
                data = defaultdict(lambda: defaultdict(list))
            elif isFinalResult:
                data = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
                attendances = defaultdict(lambda: defaultdict(lambda: dict))
            else:
                data = defaultdict(lambda: defaultdict(dict))
            for stdResult in student_results:
                subject_ids = (
                    set()
                )  # used to track if subject is already added in results or not (only for v2)
                #
                student = stdResult.get("student")
                student_ids.add(student)
                attend_ = stdResult.get("attendance")
                exam = stdResult.get("exam")
                if attend_:
                    if isFinalResult:
                        attendances[exam][student] = attend_
                    else:
                        attendances[student] = attend_
                #
                subjectId = stdResult.get("class_result__subject")
                if subjectId in assigned_students:
                    if student in assigned_students.get(subjectId):
                        subj_result = self.prepSubjectResult(
                            stdResult,
                            result_type,
                            subjectId,
                            subjects_data.get(subjectId),
                        )
                        if self.v2 and subjectId not in subject_ids:
                            data[student]["marksObtained"].append(subj_result)
                            subject_ids.add(subjectId)
                        else:
                            if isFinalResult:
                                _exam = stdResult.get("exam")
                                data[_exam][student][subjectId] = subj_result
                            else:
                                data[student][subjectId] = subj_result
                else:
                    subj_result = self.prepSubjectResult(
                        stdResult,
                        result_type,
                        subjectId,
                        subjects_data.get(subjectId),
                    )
                    if self.v2 and subjectId not in subject_ids:
                        data[student]["marksObtained"].append(subj_result)
                        subject_ids.add(subjectId)
                    else:
                        if isFinalResult:
                            _exam = stdResult.get("exam")
                            data[_exam][student][subjectId] = subj_result
                        else:
                            data[student][subjectId] = subj_result
                # --- summarizing student-result!
            if self.v2:
                # DOESN'T WORK FOR FINAL RESULTS in v2!
                self.loadGradingRules(class_info_id[0], result_type)
                data = self.summarizeStudentResults(
                    result_type, data, subjects_data, fm_total
                )
            #
            students = self.getStudentDetails(student_ids, image, student_status)
            #
            extra_activities, extra_activities_entries = {}, {}
            # if include_extra_activities:
            [extra_activities, extra_activities_entries] = self.getExtraActivities(
                student_ids, exam_id, class_info_id
            )
            #
            return {
                "fm_total": fm_total,
                "subjects": period_subjects,
                "subjects_data": subjects_data,
                "student_results": data,
                "students": students,
                "attendances": attendances,
                "attendance_total": attendance_total,
                "extra_activities": extra_activities,
                "extra_activities_entries": extra_activities_entries,
            }
        return {}

    def getCriteriaKey(self, field):
        if field == "theory":
            return FM_TH, "gp_th"
        elif field == "practical":
            return FM_PR, "gp_pr"
        elif field == "total":
            return FM, "gp"

    def prepSubjectResult(self, stdResult, resultType, subjectId, subjectData):
        subjResult = {}
        criteria = subjectData.get("criteria") or {}
        if resultType == "letter" and self.v2:
            credit_hours = subjectData.get("credit_hours") or 0
            credit_hours_pr = subjectData.get("credit_hours_pr") or 0
            for field in SUBJECT_RESULT_FIELDS:
                subjResult["subject"] = subjectId
                score = stdResult.get(field)
                isFail = stdResult["absent"] == True or (
                    bool(stdResult["result"]) == False
                )
                match field:
                    case "theory" | "practical":
                        if score and score > 0:
                            criteria_name, gp_name = self.getCriteriaKey(field)
                            percentage = self.calculatePercentage(
                                score, criteria.get(criteria_name)
                            )
                            subjResult[field] = self.getGrading(percentage)
                            subjResult[gp_name] = self.getGradePoint(percentage)
                    case "total":
                        subjResult["total"] = score
                        #
                        criteria_name, gp_name = self.getCriteriaKey(field)
                        gp_th = subjResult.get("gp_th") or 0
                        gp_pr = subjResult.get("gp_pr") or 0
                        final_gp = None
                        if gp_th and gp_pr and credit_hours and credit_hours_pr:
                            final_gp = (
                                0
                                if isFail
                                else self.finalGradePoint(
                                    gp_th, gp_pr, credit_hours, credit_hours_pr
                                )
                            )
                        else:
                            percentage = (
                                0
                                if isFail
                                else self.calculatePercentage(
                                    score, criteria.get(criteria_name)
                                )
                            )
                            final_gp = self.getGradePoint(percentage)
                        subjResult[gp_name] = final_gp
                        subjResult["final_grade"] = self.getGPGrading(final_gp)
                    case _:
                        subjResult[field] = score
        else:
            for field in SUBJECT_RESULT_FIELDS:
                subjResult["subject"] = subjectId
                subjResult[field] = stdResult.get(field)
        return subjResult

    def summarizeStudentResults(
        self, result_type: str, data: dict, subjects_data: dict, fm_total: int
    ):
        for stdId, stdResult in data.items():
            total = 0
            for subj_result in stdResult.get("marksObtained") or []:
                try:
                    if isinstance(subj_result, dict):
                        subj_result = subj_result.get("total") or 0
                    else:
                        subj_result = Decimal(subj_result) or 0
                    total += Decimal(subj_result) or 0
                except:
                    pass
            # print(total)
            percentage = self.calculatePercentage(total, fm_total)
            data[stdId]["total"] = total
            data[stdId]["percentage"] = percentage
            #
            if result_type == "number":
                hasFailed = set()
                try:
                    for subj_result in stdResult.get("marksObtained") or []:
                        if isinstance(subj_result, dict):
                            hasFailed.add(
                                subj_result.get("absent") == True
                                or subj_result.get("result") == False
                            )
                except:
                    pass
                hasFailed = any(hasFailed)
                data[stdId]["division"] = self.getRemarks(
                    0 if hasFailed else percentage, self.divisions
                )
            elif result_type == "letter":
                sum_of_weighted_grade_point = 0
                sum_of_credit_hours = 0
                hasFailed = set()
                #
                for subj_result in stdResult.get("marksObtained") or []:
                    subjectId = subj_result.get("subject")
                    if isinstance(subj_result, dict):
                        hasFailed.add(
                            subj_result.get("absent") == True
                            or subj_result.get("result") == False
                        )
                        subj_data = subjects_data.get(subjectId)
                        credit_hours = Decimal(subj_data.get("credit_hours") or 0)
                        credit_hours_pr = Decimal(subj_data.get("credit_hours_pr") or 0)
                        gp = subj_result.get("gp") or 0
                        #
                        total_credit_hours = credit_hours + credit_hours_pr
                        sum_of_credit_hours += total_credit_hours
                        sum_of_weighted_grade_point += gp * total_credit_hours
                    #
                hasFailed = any(hasFailed)
                data[stdId]["isFail"] = hasFailed
                _gpa = (
                    0
                    if hasFailed
                    else self.calculateGPA(
                        sum_of_weighted_grade_point, sum_of_credit_hours
                    )
                )
                data[stdId]["gpa"] = _gpa
                data[stdId]["remarks"] = self.getRemarks(_gpa, self.remarks)
        return data

    def loadGradingRules(self, class_info_id: int, type: int):
        if not self.school_id:
            cls = (
                ClassInfo.objects.filter(id=class_info_id, is_active=True)
                .values("school")
                .first()
            )
            self.school_id = cls.get("school")
        gr_type = self.gr_type_number
        if type == "letter":
            gr_type = self.gr_type_grading
        remarks = (
            GradingRules.objects.filter(
                school=self.school_id, type=gr_type, is_active=True
            )
            .values("rules")
            .first()
        )
        divisions = (
            GradingRules.objects.filter(
                school=self.school_id, type=self.gr_type_division, is_active=True
            )
            .values("rules")
            .first()
            if gr_type == self.gr_type_number
            else None
        )
        self.remarks = remarks.get("rules") if remarks else []
        self.divisions = divisions.get("rules") if divisions else []

    def getStudentDetails(self, student_ids, image=False, student_status=None):
        RETURN_VALUES = ("id", "roll_no", "symbol_no", "regd_no")
        if image:
            RETURN_VALUES += ("image", "birth_date")
        #
        stud_q = Q(id__in=student_ids, is_active=True)
        stud_q &= Q(status=student_status) if student_status else Q()
        details = (
            Student.objects.filter(stud_q)
            .values(*RETURN_VALUES)
            .annotate(name=nameConcat())
            .order_by(Collate("name", "und-x-icu"))
        )

        if image:
            """
            No english dob were stored,
            store english dob, and reduce these extra computations!
            """
            details = [
                {
                    "english_birth_date": nepaliToEnglishDate(
                        e.get("birth_date") or ""
                    ),
                    **e,
                }
                for e in details
            ]
        return details

    def order_keys_by_date(self, keys, date_dict):
        str_keys = []
        missing_keys = []
        for key in keys:
            key = str(key)
            if key in date_dict:
                str_keys.append(key)
            else:
                missing_keys.append(key)
        sorted_keys = sorted(str_keys, key=lambda x: date_dict[x])
        sorted_keys = [int(key) if key.isdigit() else key for key in sorted_keys]
        sorted_keys.extend(missing_keys)
        return sorted_keys

    def getExtraActivities(
        self,
        student_ids: list,
        exam_id: int | list,
        class_info_id: int | list,
        isFinalResult: bool = False,
    ):
        query = Q(
            student__in=student_ids,
            is_active=True,
        )
        if isinstance(exam_id, (int, str)):
            query &= Q(exam=exam_id)
        elif isinstance(exam_id, list):
            query &= Q(exam__in=exam_id)
        if isinstance(class_info_id, (int, str)):
            query &= Q(class_info=class_info_id)
        elif isinstance(class_info_id, list):
            query &= Q(class_info__in=class_info_id)
        entries = ExtraActivityEntry.objects.filter(query).values(
            "student", "extra_activities", "exam"
        )
        extra_activities_ids = set()
        if isFinalResult:
            extra_activities_entries = defaultdict(
                lambda: defaultdict(lambda: defaultdict(dict))
            )
        else:
            extra_activities_entries = defaultdict(lambda: defaultdict(dict))
        for entry in entries:
            exam = entry.get("exam")
            extra_activities = entry.get("extra_activities") or {}
            student = entry.get("student")
            if isFinalResult:
                extra_activities_entries[exam][student] = extra_activities
            else:
                extra_activities_entries[student] = extra_activities
            extra_activities_ids.update(extra_activities.keys())
        #
        extra_activities = ExtraActivity.objects.filter(
            id__in=extra_activities_ids, is_active=True
        ).values("id", "name")
        return [extra_activities, extra_activities_entries]

    @swagger_auto_schema(tags=DOCS_TAGS_2, request_body=ClassResultSerializer)
    def post(self, request):
        student_results = request.data.pop("student_marks", [])
        class_result_data = request.data
        if student_results and class_result_data:
            s = ClassResultSerializer(
                data=class_result_data, context={"student_results": student_results}
            )
            if s.is_valid():
                _, created = s.save()
                if created:
                    return Response({"message": "Marks saved!"})
                else:
                    # was missing its `return`, so an already-entered subject
                    # fell through and answered "Invalid request!".
                    return self.RESPONSE__ALREADY_EXISTS
            else:
                # a rejected subject must say WHY: "Invalid request!" reads as a
                # glitch and the entry gets retried until it lands somewhere.
                return Response(
                    {"message": self.getSerializationError(s)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=DOCS_TAGS_2)
    def put(self, request):
        school_id = request.data.pop("school", None)
        exam_id = request.data.pop("exam", None)
        class_info_id = request.data.pop("class_info", None)
        if school_id and exam_id and class_info_id:
            result_id = request.data.pop("id", None)
            if result_id:
                # ----- MARKS UPDATE
                criteria = request.data.pop("criteria", None)
                student_marks = request.data.pop("student_marks", None)
                return self.updateClassResult(
                    school_id,
                    exam_id,
                    class_info_id,
                    result_id,
                    criteria,
                    student_marks,
                )
            # ----- CLASS RESULT PUBLISH
            publish = request.data.pop("publish", None)
            published_date = request.data.pop("published_date", None)
            if publish and published_date:
                instances = list(
                    ClassResult.objects.filter(
                        exam=exam_id, class_info=class_info_id, is_active=True
                    ).order_by("-id")
                )
                if instances:
                    for ins in instances:
                        ins.published_date = published_date
                    with transaction.atomic():
                        ClassResult.objects.bulk_update(instances, ("published_date",))
                        return Response({"message": "Result has been published!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=DOCS_TAGS_2)
    def delete(self, request):
        """Delete a marks header (ClassResult) for a class+exam+subject.

        The gradesheet builds its subject columns from the active ClassResult
        rows, so a subject whose marks were cleared but whose header survives
        keeps showing (as an empty/NG column). This removes that header along
        with its student-result rows, so the subject drops off the marksheet.
        """
        school_id = request.query_params.get("school")
        exam_id = request.query_params.get("exam")
        class_info_id = request.query_params.get("class_info")
        result_id = request.query_params.get("id")
        if not (school_id and exam_id and class_info_id and result_id):
            return self.RESPONSE__INVALID_REQUEST
        crq = Q(id=result_id, exam=exam_id, class_info=class_info_id, is_active=True)
        class_result = ClassResult.objects.filter(crq).order_by("-id").first()
        if not class_result:
            return self.RESPONSE__NOT_FOUND
        user_role = getattr(request, "user_role", None)
        # Students never delete results; staff must not touch a published header
        # (mirrors the update guard).
        if user_role == "student" or (
            user_role == "staff" and class_result.published_date is not None
        ):
            return Response(
                {"message": "Results delete not allowed!"},
                status=status.HTTP_403_FORBIDDEN,
            )
        # Delete every active header for this class+exam+subject (a subject can
        # carry more than one), so an older row can't resurface as the column.
        class_results = ClassResult.objects.filter(
            exam=exam_id,
            class_info=class_info_id,
            subject=class_result.subject_id,
            is_active=True,
        )
        with transaction.atomic():
            class_result_ids = list(class_results.values_list("id", flat=True))
            StudentResult.objects.filter(
                class_result__in=class_result_ids, is_active=True
            ).update(is_active=False)
            class_results.update(is_active=False)
        return Response({"message": "Marks header deleted!"})

    def updateClassResult(
        self, school_id, exam_id, class_info_id, result_id, criteria, student_marks
    ):
        crq = Q(id=result_id, exam=exam_id, class_info=class_info_id, is_active=True)
        # The header has to be this class's (and so this school's) for every
        # role. Only staff were checked, inside a bare try/except, so an admin
        # could send another school's result id with their own class and
        # rewrite that school's marks.
        if getattr(self.request, "user_role", None) == "staff":
            crq &= Q(published_date__isnull=True)
        if not ClassResult.objects.filter(crq).exists():
            return Response(
                {"message": "Results Update not allowed!"},
                status=status.HTTP_403_FORBIDDEN,
            )
        marks_fields = plain_fields(StudentResult)
        with transaction.atomic():
            try:
                if criteria and isinstance(criteria, dict):
                    class_result = (
                        ClassResult.objects.filter(crq).order_by("-id").first()
                    )
                    if class_result:
                        class_result.criteria = criteria
                        class_result.save()
                if student_marks and isinstance(student_marks, list):
                    # update;
                    result_ids = {e.get("id") for e in student_marks}
                    results = {
                        e.id: e
                        for e in StudentResult.objects.filter(
                            id__in=result_ids, class_result=result_id, is_active=True
                        ).select_for_update()
                    }
                    # A row with no id means "this student has no marks yet".
                    # The page decides that from what it loaded, so a stale tab,
                    # a re-opened sheet or a double-submit all sent it for a
                    # student who DOES have a row — and it was inserted anyway,
                    # leaving one student two marks rows for one subject. Every
                    # reader then has to pick a winner. Look the student up
                    # instead, and only insert when there is genuinely nothing.
                    existing_by_student = {
                        e.student_id: e
                        for e in StudentResult.objects.filter(
                            class_result=result_id,
                            is_active=True,
                            student_id__in={
                                e.get("student")
                                for e in student_marks
                                if isinstance(e, dict) and not e.get("id")
                            },
                        )
                        # ascending, so where history left a student two rows
                        # the newest one — the one every reader shows — wins.
                        .order_by("student_id", "id")
                        .select_for_update()
                    }
                    updated_fields = set()
                    toBeCreated = {}
                    for e in student_marks:
                        if isinstance(e, dict):
                            id = e.pop("id", None)
                            student_id = e.pop("student", None)
                            # marks only: a row's class_result_id / student_id
                            # would re-point it, or a new row, elsewhere
                            e = {k: v for k, v in e.items() if k in marks_fields}
                            result = results.get(id) if id else None
                            if result is None and student_id is not None:
                                result = existing_by_student.get(student_id)
                            if result is not None:
                                results[result.id] = result
                                for field, value in e.items():
                                    setattr(result, field, value)
                                    updated_fields.add(field)
                            elif student_id is not None:
                                # last write wins within one payload, so a page
                                # that repeats a student cannot double-insert.
                                toBeCreated[student_id] = {
                                    "student_id": student_id,
                                    "class_result_id": result_id,
                                    **e,
                                }
                    if len(updated_fields) > 0:
                        StudentResult.objects.bulk_update(
                            results.values(), list(updated_fields)
                        )
                    # new result entry;
                    if toBeCreated:
                        StudentResult.objects.bulk_create(
                            [
                                StudentResult(**each_std_result)
                                for each_std_result in toBeCreated.values()
                            ]
                        )
                return Response({"message": "Marks updated"})
            except Exception as e:
                # print(e)
                pass
            return self.RESPONSE__INVALID_REQUEST
