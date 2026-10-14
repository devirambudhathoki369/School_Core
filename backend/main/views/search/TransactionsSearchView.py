from django.contrib.contenttypes.models import ContentType
from account.models import StaffAccount
from extra_billing.models.Billing import ExtraInvoice
from extra_billing.models.Party import BillingTitle
from extra_billing.methods.balances import detail_rows
from extra_billing.constants import TITLE_NAMES_KEY, OPENING_DUE

from django.db.models import Q, Value, CharField, Case, When, F, JSONField
from django.db.models.functions import Concat, Lower
from django.db.models.expressions import RawSQL
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import BaseSearchView
from ...models.Invoice import StudentInvoice, cashier_sq
from ...models.ClassInfo import ClassInfo
from ...models.FiscalYears import AcademicYear
from ...models.Ledger import StudentLedger
from ...models.history_log.HistoryLog import HistoryLog
from ...models.Staff import Staff
from ..fields import FOREIGN_CLASS_DETAILS_FIELDS, CHOICES_CLASS_DETAILS_FIELDS
from ...methods.getStudentDetail import getClassDetails
from ...methods.extractTitleIds import extractTitleIdsFromInvoice
from ...methods.getFeeDetails import getFeeTitlesFromTitleIds
from ...constants.payment import (
    EXCEPTION_TITLES_ALTERNATIVES,
    OPENING_BALANCE,
)
from ...methods.getDateRange import getDateRange
from ...methods.invoiceAudit import invoiceAudit


STUDENT_INVOICE_RETURN_FIELDS = (
    "id",
    "date",
    "invoice_id",
    "mode",
    #
    "student",
    "student__class_info",
    # Snapshot of the class at payment time (added in migration 0050).
    # Preferred over student__class_info / historical_class_map when present
    # so transactions render the original class even after a mid-AY promote
    # or section change.
    "class_info",
    "isCashReceipt",
    "name",
    "invoice_details",
    "extra_info",  # used for cashreceipt
    "remarks",
    "academic_year_name",
)


class TransactionsSearchView(BaseSearchView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STRING_FIELDS = ("first_name", "middle_name", "last_name")
    """ 
        RETURN_COLUMS = (
            "invoice_date",
            "invoice_no",
            "particular",
            "class",
            "student_name",
            "total",
        ) 
    """

    def classInfoOwnQuery(self, school_id, data):
        """Class-info matchers applied directly on ClassInfo (no parent prefix).
        Used to resolve historical class IDs for closed-AY roster derivation via
        StudentLedger ⋈ LedgerPosting.class_info."""
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

    def prepareQuery(self, data):
        school_id = data.pop("school", None)
        if not school_id:
            return [None, None, None, {}]
        is_active = data.get("is_active") if "is_active" in data else True
        q = Q(school=school_id, is_active=is_active)
        if data.get("mode") not in (None, ""):
            q &= Q(mode=data["mode"])
        # academic year — resolve first so we know whether to take the historical roster path.
        # If the caller has supplied an explicit date_range we skip the AY filter on the
        # invoice query: the date range becomes the sole temporal constraint. Otherwise an
        # invoice falling outside the active AY's calendar window (a common case when the
        # user picks a custom range) would AND-out to zero results.
        academic_year = data.pop("academic_year", None)
        has_explicit_date_range = (
            isinstance(data.get("date_range"), list) and len(data.get("date_range")) == 2
        )
        is_historical_view = False
        if academic_year:
            if not has_explicit_date_range:
                q &= Q(academic_year=academic_year)
            ay = (
                AcademicYear.objects.filter(id=academic_year, school=school_id)
                .only("closed")
                .first()
            )
            if ay and ay.closed:
                is_historical_view = True
        historical_class_map = {}
        if "education_level" in data:
            if is_historical_view:
                # Student.class_info points to the CURRENT class (post-promotion),
                # so for a closed AY we derive the roster from immutable
                # StudentLedger.ledger_posting.class_info snapshots instead.
                class_info_q = self.classInfoOwnQuery(school_id, data)
                class_ids = list(
                    ClassInfo.objects.filter(class_info_q).values_list(
                        "id", flat=True
                    )
                )
                if not class_ids:
                    return [None, None, None, {}]
                # Exclude opening-balance ledger rows. They're created when an
                # AY is closed: stored under the NEW AY but carrying the
                # PREVIOUS AY's class_info. Including them would let invoices
                # from students who already left/graduated leak into the new
                # AY's roster for their old class.
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
                student_ids = list(historical_class_map.keys())
                if not student_ids:
                    return [None, None, None, {}]
                q &= Q(student__in=student_ids)
            else:
                # useNull=False so that picking only education_level (without
                # grade/section/course) does not force grade__isnull=True etc.,
                # which would suppress every SCHOOL/BACHELOR row whose class
                # legitimately has those fields populated.
                q &= self.query(
                    fields=FOREIGN_CLASS_DETAILS_FIELDS,
                    data=data,
                    fieldType="foreign",
                    parent="student__class_info",
                    useNull=False,
                )
                q &= self.query(
                    fields=CHOICES_CLASS_DETAILS_FIELDS,
                    data=data,
                    fieldType="choices",
                    parent="student__class_info",
                    useNull=False,
                )
        # date range
        date_range = data.pop("date_range", [])
        if isinstance(date_range, list) and len(date_range) == 2:
            date_range = getDateRange(*date_range)  # [from, to]
            if date_range:
                q &= Q(date__range=date_range)
            else:
                # if requesting with date, but date is invalid, invalid-request!
                return [None, None, None, {}]
        # title
        title = data.pop("title", None)  # expects 1-n or id
        if title:
            q &= Q(details__has_key=str(title))
        # print(q)
        return [q, school_id, title, historical_class_map]

    def getTransactionsByUser(self, user_id, model=StudentInvoice):
        CREATE, UPDATE = 1, 3
        USER_TYPE_ID = ContentType.objects.get_for_model(StaffAccount).pk
        STUDENT_INVOICE_TYPE_ID = ContentType.objects.get_for_model(model).pk
        transactions = HistoryLog.objects.filter(
            user_id=user_id,
            user_type_id=USER_TYPE_ID,
            object_type=STUDENT_INVOICE_TYPE_ID,
            action__in=(CREATE,),
        )
        object_ids = transactions.values_list("object_id", flat=True)
        return object_ids

    def post(self, request):
        # I must return all required data even if it's cash-receipt or not!!!
        filters = request.data.copy()
        [QUERY, school_id, title, historical_class_map] = self.prepareQuery(
            request.data.copy()
        )
        if not QUERY:
            return self.RESPONSE__INVALID_REQUEST
        isCashReceipt = request.data.get("isCashReceipt")
        user = request.data.get("user")
        # {id, invoice_id, date, classname, details, name, student [optional]}
        #
        if isCashReceipt is not None:
            QUERY &= Q(isCashReceipt=isCashReceipt)
        if user:
            transactions_id = self.getTransactionsByUser(user)
            QUERY &= Q(id__in=transactions_id)
        # The list of deleted bills says who deleted each one, and when.
        deleted = request.data.get("is_active") is False
        response = self.getStudentInvoices(
            school_id, QUERY, title, historical_class_map, deleted
        )
        extra_rows, extra_titles = self.getExtraInvoices(school_id, filters, deleted)
        rows = list(response.data["data"]) + extra_rows
        response.data["data"] = rows
        response.data["titles"].update(extra_titles)
        if rows:
            response.data["info"] = {
                "date": {"from": min(r["date"] for r in rows), "to": max(r["date"] for r in rows)},
                "invoice_no": {"from": min(r["invoice_id"] for r in rows), "to": max(r["invoice_id"] for r in rows)},
            }
        return response

    @staticmethod
    def stampDeletion(row, audit):
        """deleted_by / deleted_on of a deleted bill, blank where the log has
        no record of it."""
        gone = (audit or {}).get("deleted") or {}
        row["deleted_by"] = gone.get("by") or ""
        row["deleted_on"] = " ".join(filter(None, (gone.get("on"), gone.get("time"))))

    def getExtraInvoices(self, school_id, filters, deleted=False):
        # Student-only filters must not bring unrelated party payments into a report.
        if (filters.get("isCashReceipt") is not None or filters.get("title")
                or any(filters.get(key) for key in (
                    "education_level", "grade", "section", "course", "faculty",
                    "year", "semester", "student"
                ))):
            return [], {}
        query = Q(school_id=school_id, is_active=filters.get("is_active", True))
        if filters.get("mode") not in (None, ""):
            query &= Q(mode=filters["mode"])
        date_range = filters.get("date_range")
        if isinstance(date_range, list) and len(date_range) == 2:
            bounds = getDateRange(*date_range)
            if not bounds:
                return [], {}
            query &= Q(date__range=bounds)
        elif filters.get("academic_year"):
            year = AcademicYear.objects.filter(pk=filters["academic_year"], school_id=school_id).first()
            if not year:
                return [], {}
            query &= Q(date__range=(year.start_date, year.end_date))
        if filters.get("economic_year"):
            query &= Q(economic_year_id=filters["economic_year"])
        if filters.get("user"):
            query &= Q(id__in=self.getTransactionsByUser(filters["user"], ExtraInvoice))
        receipts = ExtraInvoice.objects.filter(query).annotate(cashier=cashier_sq(ExtraInvoice)).values(
            "id", "invoice_id", "date", "details", "party__name", "remarks", "cashier", "mode"
        )
        staffs = self.getSchoolStaffsMapped(school_id)
        fallback_titles = dict(BillingTitle.objects.filter(school_id=school_id).values_list("id", "title"))
        rows, titles = [], {}
        audit = {}
        if deleted:
            receipts = list(receipts)
            ids = [receipt["id"] for receipt in receipts]
            audit = invoiceAudit(ExtraInvoice, ids, ids)
        for receipt in receipts:
            if deleted:
                self.stampDeletion(receipt, audit.get(receipt["id"]))
            details = receipt.pop("details") or {}
            names = details.get(TITLE_NAMES_KEY) or {}
            formatted = {}
            for key, amount in detail_rows(details):
                # Separate namespaces prevent collisions with student fee-title IDs.
                title_key = f"extra:{key}"
                titles[title_key] = (
                    names.get(key)
                    or fallback_titles.get(int(key) if key.isdigit() else key)
                    or ("Old dues" if key == OPENING_DUE else key)
                )
                formatted[title_key] = {"amt": str(amount)}
            receipt.update(
                id=f"extra:{receipt['id']}",
                extra_invoice_id=receipt["id"],
                source="extra_billing",
                name=receipt.pop("party__name"),
                classname="Extra billing",
                academic_year_name="",
                details=formatted,
                cashier=staffs.get(receipt["cashier"]) or "admin",
            )
            rows.append(receipt)
        return rows, titles

    def getStudentInvoices(
        self, school_id, QUERY, title, historical_class_map=None, deleted=False
    ):
        invoices = StudentInvoice.objects.filter(QUERY).annotate(
            academic_year_name=F("academic_year__name"),
            name=Case(
                When(
                    Q(isCashReceipt=True),
                    then=Value(""),  # TODO: get name from jsonb field!!!
                ),
                When(
                    Q(isCashReceipt=False, student__isnull=False),
                    then=Concat(
                        "student__first_name",
                        Value(" "),
                        "student__middle_name",
                        Value(" "),
                        "student__last_name",
                        output_field=CharField(),
                    ),
                ),
                default=Value(""),
                output_field=CharField(),
            ),
            invoice_details=Case(
                When(
                    Q(details__has_key=str(title), isCashReceipt=False),
                    then=RawSQL(
                        f"JSONB_BUILD_OBJECT('{title}', details -> '{title}')", []
                    ),
                ),
                default=F("details"),
                output_field=JSONField(),
            ),
        )
        invoices = invoices.values(*STUDENT_INVOICE_RETURN_FIELDS)
        invoices = invoices.annotate(cashier=cashier_sq())
        #
        if len(invoices) < 1:
            return Response({"data": [], "titles": {}})
        #
        class_info_ids = {inv.get("student__class_info") for inv in invoices}
        # Include invoice-time class snapshots so cacheClassname can resolve
        # them from the same prefetched ClassInfo map.
        class_info_ids.update(inv.get("class_info") for inv in invoices)
        if historical_class_map:
            class_info_ids.update(historical_class_map.values())
        class_info_ids.discard(None)
        class_infos = ClassInfo.objects.filter(id__in=class_info_ids)
        class_infos = {cls.id: cls for cls in class_infos}
        #
        title_ids = set()
        info = {
            "date": {
                "from": invoices[0]["date"],
                "to": invoices[0]["date"],
            },
            "invoice_no": {
                "from": invoices[0]["invoice_id"],
                "to": invoices[0]["invoice_id"],
            },
        }
        staffs = self.getSchoolStaffsMapped(school_id)
        audit = {}
        if deleted:
            ids = [inv["id"] for inv in invoices]
            audit = invoiceAudit(StudentInvoice, ids, ids)
        for inv in invoices:
            if deleted:
                self.stampDeletion(inv, audit.get(inv["id"]))
            cashier = inv.get("cashier")
            cashier = staffs.get(cashier) or "admin"
            inv["cashier"] = cashier
            date, invoice_id = inv.get("date"), inv.get("invoice_id")
            if date < info["date"]["from"]:
                info["date"]["from"] = date
            elif date > info["date"]["to"]:
                info["date"]["to"] = date
            if invoice_id < info["invoice_no"]["from"]:
                info["invoice_no"]["from"] = invoice_id
            elif invoice_id > info["invoice_no"]["to"]:
                info["invoice_no"]["to"] = invoice_id
            #
            details = inv.pop("details", {}) or inv.pop("invoice_details", {})
            student_class = inv.pop("student__class_info", None)
            if historical_class_map:
                hist_class = historical_class_map.get(inv.get("student"))
                if hist_class:
                    student_class = hist_class
            # Invoice-time snapshot wins over both the student's CURRENT class
            # and the LedgerPosting-derived historical_class_map — it captures
            # the class the student was in WHEN this payment was recorded.
            invoice_class_snapshot = inv.pop("class_info", None)
            if invoice_class_snapshot:
                student_class = invoice_class_snapshot
            # checking if fetched receipt is a cash-receipt or normal receipt!
            isInvCashReceipt = inv.pop("isCashReceipt", False)
            extra_info = inv.pop("extra_info", {})
            if isInvCashReceipt:
                "NORMAL RECEIPT"
                details = self.handleCashReceiptDetails(details)
                name = extra_info.pop("name", "")
                inv["name"] = name
            else:
                """CASH RECEIPT"""
                inv["classname"] = self.cacheClassname(
                    inv.get("student__class_info") or None,
                    cls=class_infos.get(student_class),
                )
                ids = (
                    {title}
                    if title and title not in EXCEPTION_TITLES_ALTERNATIVES
                    else extractTitleIdsFromInvoice(details)
                )
                title_ids.update(ids)
            #
            inv["details"] = details
        #
        titles = {
            **getFeeTitlesFromTitleIds(title_ids),
            **EXCEPTION_TITLES_ALTERNATIVES,
        }
        return Response({"data": invoices, "titles": titles, "info": info})

    def handleCashReceiptDetails(self, details):
        # FROM :> [{AMT: 1000, PAR: "test 1"}, {AMT: 200, PAR: "test 2"}]
        # TO :> {15: {amt: 3160}, 16: {amt: 480}}
        returnDetails = {}
        if isinstance(details, list):
            for detail in details:
                AMT = detail.get("AMT") or 0  # AMOUNT
                PAR = detail.get("PAR") or ""  # PARTICULAR
                PAR = PAR.lower()
                returnDetails[PAR] = {"amt": AMT}
            return returnDetails
        return {}

    def getSchoolStaffsMapped(seld, school_id):
        return {
            staff.get("account"): staff.get("name")
            for staff in Staff.objects.filter(
                school=school_id, is_active=True, account__isnull=False
            )
            .values("account")
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
        }

    classnames = {}

    def cacheClassname(self, class_info_id: int, cls=None) -> str:
        key = class_info_id or getattr(cls, "id", None)
        if not key:
            return ""
        classname = self.classnames.get(key)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(
                class_info_id, include_details=False, cls=cls
            )
            self.classnames[key] = classname
        return classname


"""
Needs optimizations;
* cashier names and titles are already available in web/search forms.

params:
- include_cashier (returns cashier name else just cashier-id)
- include_titles (returns titles else {})
- include_classname (returns classname else classinfo-id)
"""
