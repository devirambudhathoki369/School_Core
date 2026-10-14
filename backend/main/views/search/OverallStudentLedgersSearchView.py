from django.db.models import (
    Q,
    Sum,
    OuterRef,
    Subquery,
    F,
    Case,
    When,
    Value,
    CharField,
    DecimalField,
)
from django.db.models.functions import Concat, Coalesce, Lower, Collate
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import BaseSearchView
from ...models.Student import Student
from ...models.ClassInfo import ClassInfo
from ...models.Ledger import StudentLedger
from ...models.Invoice import StudentInvoice
from ..fields import FOREIGN_CLASS_DETAILS_FIELDS, CHOICES_CLASS_DETAILS_FIELDS
from ...methods.getDateRange import getDateRange
from ...methods.genClassname import getClassDetails

STATUS_RUNNING = 1


# TODO : make academic year wise and update balance calculation!
class OverallStudentLedgersSearchView(BaseSearchView):
    """
    returns {
        student -> name, location, guardian_info__name, contact
        debit -> StudentLedger
        credti -> StudentInvoice
    }
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    swagger_schema = None

    def prepareStudentsQuery(self, data, status):
        class_info = data.pop("class_info", {})
        school_id = class_info.pop("school", None)
        if not school_id:
            return [None, None]
        q = Q(class_info__school=school_id, status=status, is_active=True)
        isClassWiseSearch = False
        if "education_level" in class_info:
            isClassWiseSearch = True
            q &= self.query(
                fields=FOREIGN_CLASS_DETAILS_FIELDS,
                data=class_info,
                fieldType="foreign",
                parent="class_info",
                useNull=True,
            )
            q &= self.query(
                fields=CHOICES_CLASS_DETAILS_FIELDS,
                data=class_info,
                fieldType="choices",
                parent="class_info",
                useNull=True,
            )
        return [q, school_id, isClassWiseSearch]

    def prepareLedgerQuery(self, data, school_id, status):
        q = Q(school=school_id, is_active=True, student__status=status)
        #
        acay = data.pop("academic_year", None)
        raw_range = data.pop("date_range", [])  # [from, to] BS dates
        date_range = raw_range
        q &= Q(academic_year=acay)
        if raw_range and isinstance(raw_range, list) and len(raw_range) == 2:
            date_range = getDateRange(*raw_range)
            q &= Q(date__range=date_range)
        # keep the raw (BS) range + academic year for downstream aggregation
        return [q, date_range, acay, raw_range]

    def post(self, request):
        status = request.data.pop("status", STATUS_RUNNING)
        [STUDENTS_QUERY, school_id, isClassWiseSearch] = self.prepareStudentsQuery(
            request.data, status
        )
        if not STUDENTS_QUERY:
            return self.RESPONSE__INVALID_REQUEST
        [LEDGER_QUERY, dateRange, acay, rawRange] = self.prepareLedgerQuery(
            request.data, school_id, status
        )
        if not STUDENTS_QUERY or not LEDGER_QUERY:
            return self.RESPONSE__INVALID_REQUEST
        # print(">>", STUDENTS_QUERY)
        # print(">>", LEDGER_QUERY)
        #
        data = (
            Student.objects.filter(STUDENTS_QUERY)
            .values("id", "class_info")
            .annotate(
                guardian_name=Coalesce(
                    F("guardian_info__guardian_name"),
                    F("guardian_info__father_name"),
                    F("guardian_info__mother_name"),
                    default=Value(""),
                    output_field=CharField(),
                )
            )
            .annotate(
                name=Concat(
                    "first_name",
                    Value(" "),
                    "middle_name",
                    Value(" "),
                    "last_name",
                    output_field=CharField(),
                ),
                contact=Case(
                    When(contact__isnull=False, then=F("contact")),
                    When(contact="", then=F("guardian_info__guardian_contact")),
                    default=F("guardian_info__guardian_contact"),
                    output_field=CharField(),
                ),
                location=Case(
                    When(location__isnull=False, then=F("location")),
                    When(contact="", then=F("guardian_info__guardian_location")),
                    default=F("guardian_info__guardian_location"),
                    output_field=CharField(),
                ),
                debit_amount=Subquery(
                    StudentLedger.objects.filter(
                        LEDGER_QUERY,
                        ledger_posting__is_active=True,
                        student=OuterRef("pk"),
                    )
                    .values("student")
                    .annotate(amount=Sum("total"))
                    .values("amount")[:1],
                    output_field=DecimalField(),
                ),
                # TODO keep these two fields in a single subquery!
                discount_amount=Subquery(
                    StudentInvoice.objects.filter(
                        LEDGER_QUERY,
                        isCashReceipt=False,
                        student=OuterRef("pk"),
                    )
                    .values("student")
                    .annotate(amount=Sum("total_discount"))
                    .values("amount")[:1],
                    output_field=DecimalField(),
                ),
                paid_amount=Subquery(
                    StudentInvoice.objects.filter(
                        LEDGER_QUERY,
                        isCashReceipt=False,
                        student=OuterRef("pk"),
                    )
                    .values("student")
                    .annotate(amount=Sum("total_paid"))
                    .values("amount")[:1],
                    output_field=DecimalField(),
                ),
                credit_amount=F("paid_amount") + F("discount_amount"),
            )
            .order_by(Collate("name", "und-x-icu"))
        )
        classname = None
        dates = {"from": str(dateRange[0]), "to": str(dateRange[1])}
        if len(data) > 0:
            class_info_ids = {e.get("class_info") for e in data}
            class_infos = {
                e.id: getClassDetails(None, False, True, False, e)
                for e in ClassInfo.objects.filter(id__in=class_info_ids, is_active=True)
            }
            for ledger in data:
                class_info_id = ledger.pop("class_info")
                clsname = class_infos.get(class_info_id)
                ledger["classname"] = clsname[0] if clsname else ""
            if isClassWiseSearch:
                classname = data[0].get("classname")
        # print(data)
        return Response({"data": data, "classname": classname, "dates": dates})
