from main.methods.collections import collection_totals
from rest_framework.response import Response
from django.db.models import (
    IntegerField,
    Sum,
    F,
    Value,
    DecimalField,
    Count,
    Q,
    Case,
    When,
)
from django.db.models.functions import Coalesce
from django.apps import apps
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page

#
from customs.Extract import ExtractYear, ExtractMonth

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

#
from ...models.BusStation import BusStation
from ...models.Course import Course
from ...models.Invoice import StudentInvoice
from ...models.Student import Student, StudentDiscountInfo, StudentTransportationInfo
from ...models.Staff import Staff
from ...models.Attendance import StudentAttendance, StaffAttendance
from ...models.exams.Result import ClassResult
from ...methods.nepaliDatetime import ndt_today
from ...views.BaseViews import SecuredAPIView


def _attendance_block(total, present):
    """Shape one roster's attendance counts; present can't exceed the roster."""
    present = min(present, total)
    return {
        "total": total,
        "present": present,
        "absent": max(total - present, 0),
    }


class SchoolDashView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    STATUS_RUNNING = 1
    STATUS_EMPLOYED = 1

    # Real-time dashboard: no page cache. The counts/aggregations are per-school
    # and the dashboard loads once per page open (no polling), so a stale 6-hour
    # snapshot (e.g. Total Students lagging behind reality) isn't worth the load
    # saving. Re-add a short cache_page here only if load ever demands it.
    def get(self, request):
        school_id = request.query_params.get("school")
        statistics = request.query_params.get("statistics") or False
        ecoy = request.query_params.get("economic_year")
        #
        if not school_id or not (ecoy or statistics):
            return self.RESPONSE__INVALID_REQUEST
        if statistics:
            return self._statistics(school_id)
        # --- counts
        MALE, FEMALE, OTHERS = 1, 2, 3
        students = (
            Student.objects.filter(
                class_info__school__id=school_id,
                status=self.STATUS_RUNNING,
                is_active=True,
            )
            .values("id")
            .aggregate(
                total_male=Count("id", filter=Q(gender=MALE)),
                total_female=Count("id", filter=Q(gender=FEMALE)),
                total_others=Count("id", filter=Q(gender=OTHERS)),
            )
        )
        total_student_discounts_count = StudentDiscountInfo.objects.filter(
            school=school_id,
            is_active=True,
        ).count()
        staffs = (
            Staff.objects.filter(
                school__id=school_id,
                status=self.STATUS_EMPLOYED,
                is_active=True,
            )
            .values("id")
            .aggregate(
                total_male=Count("id", filter=Q(other_info__gender=MALE)),
                total_female=Count("id", filter=Q(other_info__gender=FEMALE)),
                total_others=Count("id", filter=Q(other_info__gender=OTHERS)),
            )
        )
        #
        total_no_of_stations = BusStation.objects.filter(
            school__id=school_id, is_active=True
        ).count()
        total_no_of_courses = Course.objects.filter(
            school__id=school_id, is_active=True
        ).count()
        # --- collections by months
        q = Q(is_active=True, school=school_id)
        if ecoy:
            q &= Q(economic_year=ecoy)
        collections = collection_totals(q, "month")
        collections = {
            "months": list(collections.keys()),
            "data": list(collections.values()),
        }
        #
        transportation_services = (
            StudentTransportationInfo.objects.filter(school=school_id, is_active=True)
            .values("bus_station")
            .annotate(count=Count("id"), station_name=F("bus_station__station"))
        )
        transportation_services = {
            ts["station_name"]: ts["count"] for ts in transportation_services
        }
        transportation_services = {
            "stations": list(transportation_services.keys()),
            "data": list(transportation_services.values()),
        }
        total_transportation_enrollments = sum(transportation_services["data"])
        #
        published_results_count = (
            ClassResult.objects.filter(
                class_info__school=school_id,
                is_active=True,
                published_date__isnull=False,
            )
            .order_by("class_info", "exam", "-id")
            .distinct("class_info", "exam")
            .values("id")
            .count()
        )
        #
        return Response(
            {
                "total": {
                    "male_students": students.get("total_male") or 0,
                    "female_students": students.get("total_female") or 0,
                    "others_students": students.get("total_others") or 0,
                    "student_discounts_count": total_student_discounts_count,
                    "male_staffs": staffs.get("total_male") or 0,
                    "female_staffs": staffs.get("total_female") or 0,
                    "others_staffs": staffs.get("total_others") or 0,
                    "bus_stations": total_no_of_stations,
                    "transportation_enrollments": total_transportation_enrollments,
                    "courses": total_no_of_courses,
                    "published_results": published_results_count,
                },
                "collections": collections,
                "transportation_services": transportation_services,
            }
        )

    def _statAggregate(self, app_label, model, query):
        return (
            apps.get_model(app_label, model)
            .objects.filter(query)
            .aggregate(
                deleted=Count(
                    Case(When(is_active=False, then=1), output_field=IntegerField())
                ),
                active=Count(
                    Case(When(is_active=True, then=1), output_field=IntegerField())
                ),
            )
        )

    def _statistics(self, school_id):
        q = Q(school=school_id)
        q2 = Q(class_info__school=school_id)
        # CLASS : active
        classes = apps.get_model("main", "ClassInfo").objects.filter(q).count()
        classes = {"active": classes, "deleted": 0}
        # BUS STATION : deleted, active
        stations = self._statAggregate("main", "BusStation", q)
        # PERIOD :
        periods = self._statAggregate("main", "ClassPeriod", q2)
        # COURSE : deleted, active
        courses = self._statAggregate("main", "Course", q)
        # SECTION
        sections = self._statAggregate("main", "Section", q)
        # FEE : deleted, active
        fees = self._statAggregate("main", "Fee", q2)
        # FEETITLE : deleted, active
        fee_titles = self._statAggregate(
            "main",
            "FeeTitle",
            q,
        )
        # ACADEMIC YEAR : deleted, active
        academic_years = self._statAggregate("main", "AcademicYear", q)
        # STUDENT INVOICE : deleted, active
        invoices = self._statAggregate("main", "StudentInvoice", q)
        extra_invoices = self._statAggregate("extra_billing", "ExtraInvoice", q)
        invoices = {key: value + extra_invoices[key] for key, value in invoices.items()}
        # STUDENT LEDGER : deleted, active
        ledgers = self._statAggregate("main", "StudentLedger", q)
        # SUBJECT
        subjects = self._statAggregate("main", "Subject", q)

        # STUDENT: deleted, active, running, passed_out, dropped_out, male, female, others
        RUNNING, PASSED_OUT, DROPPED_OUT = 1, 2, 3
        MALE, FEMALE, OTHERS = 1, 2, 3
        students = (
            apps.get_model("main", "Student")
            .objects.filter(q2)
            .aggregate(
                deleted=Count(
                    Case(When(is_active=False, then=1), output_field=IntegerField())
                ),
                active=Count(
                    Case(When(is_active=True, then=1), output_field=IntegerField())
                ),
                running=Count(
                    Case(When(status=RUNNING, then=1), output_field=IntegerField())
                ),
                passed_out=Count(
                    Case(When(status=PASSED_OUT, then=1), output_field=IntegerField())
                ),
                dropped_out=Count(
                    Case(When(status=DROPPED_OUT, then=1), output_field=IntegerField())
                ),
                male=Count(
                    Case(When(gender=MALE, then=1), output_field=IntegerField())
                ),
                female=Count(
                    Case(When(gender=FEMALE, then=1), output_field=IntegerField())
                ),
                others=Count(
                    Case(When(gender=OTHERS, then=1), output_field=IntegerField())
                ),
            )
        )
        student_transportations = self._statAggregate(
            "main", "StudentTransportationInfo", q
        )
        student_discounts = self._statAggregate("main", "StudentDiscountInfo", q)
        # STAFF : deleted, active, employed, departed, retired, on_leave
        EMPLOYED, DEPARTED, RETIRED, ON_LEAVE = 1, 2, 3, 4
        staffs = (
            apps.get_model("main", "Staff")
            .objects.filter(q)
            .aggregate(
                deleted=Count(
                    Case(When(is_active=False, then=1), output_field=IntegerField())
                ),
                active=Count(
                    Case(When(is_active=True, then=1), output_field=IntegerField())
                ),
                employed=Count(
                    Case(When(status=EMPLOYED, then=1), output_field=IntegerField())
                ),
                departed=Count(
                    Case(When(status=DEPARTED, then=1), output_field=IntegerField())
                ),
                retired=Count(
                    Case(When(status=RETIRED, then=1), output_field=IntegerField())
                ),
                on_leave=Count(
                    Case(When(status=ON_LEAVE, then=1), output_field=IntegerField())
                ),
                male=Count(
                    Case(
                        When(other_info__gender=MALE, then=1),
                        output_field=IntegerField(),
                    )
                ),
                female=Count(
                    Case(
                        When(other_info__gender=FEMALE, then=1),
                        output_field=IntegerField(),
                    )
                ),
                others=Count(
                    Case(
                        When(other_info__gender=OTHERS, then=1),
                        output_field=IntegerField(),
                    )
                ),
            )
        )
        #
        exams = self._statAggregate("main", "Exam", q)
        class_results = (
            apps.get_model("main", "ClassResult")
            .objects.filter(q2)
            .values_list("id", flat=True)
        )
        student_results = self._statAggregate(
            "main", "StudentResult", Q(class_result__in=class_results)
        )
        class_results = {"active": len(class_results), "deleted": 0}
        exam_schedules = self._statAggregate("main", "ExamSchedule", q2)
        extra_activities = self._statAggregate("main", "ExtraActivity", q)
        extra_activity_entries = self._statAggregate("main", "ExtraActivityEntry", q2)
        certificates = self._statAggregate("main", "CharacterCertificate", q)
        #
        data = {
            "classes": classes,
            "periods": periods,
            "students": students,
            "student_transportations": student_transportations,
            "student_discounts": student_discounts,
            "staffs": staffs,
            "subjects": subjects,
            "stations": stations,
            "courses": courses,
            "sections": sections,
            "fees": fees,
            "fee_titles": fee_titles,
            "academic_years": academic_years,
            "invoices": invoices,
            "ledgers": ledgers,
            "exams": exams,
            "class_results": class_results,
            "student_results": student_results,
            "exam_schedules": exam_schedules,
            "extra_activities": extra_activities,
            "extra_activity_entries": extra_activity_entries,
            "certificates": certificates,
        }
        # print(data)
        return Response(data)


class SchoolAttendanceTodayView(SecuredAPIView):
    """Today's present/absent headcount for a school — students AND staff.

    Kept separate from SchoolDashView because that view is cached for 6 hours;
    attendance changes through the day and must not be served stale. Read-only.

    GET ?school=<id>  ->
        { "date", "students": {total, present, absent},
                   "staff":    {total, present, absent} }

    "present" = a member who has at least one present (status=True) attendance
    record today (any RFID punch counts). "absent" = active roster minus present.
    """

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    STATUS_RUNNING = 1
    STATUS_EMPLOYED = 1

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        today = ndt_today()

        students_total = Student.objects.filter(
            class_info__school__id=school_id,
            status=self.STATUS_RUNNING,
            is_active=True,
        ).count()
        students_present = (
            StudentAttendance.objects.filter(
                class_attendance__school__id=school_id,
                class_attendance__date=today,
                status=True,
                is_active=True,
                student__is_active=True,
                student__status=self.STATUS_RUNNING,
            )
            .values("student")
            .distinct()
            .count()
        )

        staff_total = Staff.objects.filter(
            school__id=school_id,
            status=self.STATUS_EMPLOYED,
            is_active=True,
        ).count()
        staff_present = (
            StaffAttendance.objects.filter(
                school__id=school_id,
                date=today,
                status=True,
                is_active=True,
                staff__is_active=True,
                staff__status=self.STATUS_EMPLOYED,
            )
            .values("staff")
            .distinct()
            .count()
        )

        return Response(
            {
                "date": today,
                "students": _attendance_block(students_total, students_present),
                "staff": _attendance_block(staff_total, staff_present),
            }
        )
