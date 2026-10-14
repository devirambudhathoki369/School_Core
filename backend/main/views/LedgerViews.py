from decimal import Decimal, ROUND_HALF_UP
from rest_framework import status
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from drf_yasg.utils import swagger_auto_schema

#
from django.db.models import Q, Value, CharField, F
from django.db.models.functions import Concat, Coalesce, Lower, Collate
from django.db import transaction

#
from collections import defaultdict
import nepali_datetime

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from customs.Extract import ExtractMonth
from ..models.Fee import feeq
from ..models.Ledger import LedgerPosting, StudentLedger
from ..models.Invoice import StudentInvoice
from ..models.Student import (
    Student,
    StudentTransportationInfo,
    STUDENT_STATUS_CHOICES,
)
from ..serializers.FeeSerializer import FeeSerializer
from ..serializers.LedgerSerializer import (
    LedgerPostingSerializer,
)
from .BaseViews import SecuredAPIView
from ..methods.genClassname import getClassDetails
from ..methods.push import notify_students
from ..methods.extractTitleIds import extractTitleIdsFromLedgers
from ..methods.getFeeDetails import getFeeTitlesFromTitleIds
from ..methods.genClassname import getClassDetails
from ..methods.getStudentLedgerDetails import formatStudentLedgerDetails
from ..methods.carriedOverPostings import carriedOverPostings
from ..methods.classPostedMonths import classPostedMonths, findClass
from ..methods.nepaliDatetime import ndt_today
from ..methods.nameConcat import nameConcat
from ..methods.hostelRates import (
    schoolUsesHostel,
    studentHostelRateMap,
    studentHostelRates,
)
from ..constants.payment import (
    EXCEPTION_TITLES,
    TRANSPORTATION,
    HOSTEL,
    HOSTEL_ADMISSION,
    HOSTEL_DEPOSIT,
    OLD_DUES,
    OPENING_BALANCE,
    LIBRARY_FINE,
    EXCEPTION_TITLES_ALTERNATIVES,
    INVOICE_DETAILS,
    TITLE_NAMES_KEY,
)
from docs.api_docs.api.payment import LEDGERS_API


class LedgerCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


date_format = "%Y-%m-%d"
BS_MONTHS = dict(enumerate(
    ("Baisakh", "Jestha", "Ashad", "Shrawan", "Bhadra", "Ashoj",
     "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"), start=1))

student_status_options_dict = {e[0]: e[1] for e in STUDENT_STATUS_CHOICES}
# Student.status for a student still attending the school.
STATUS_RUNNING = 1
TWO_PLACES = Decimal("0.01")
ROUNDING_MODE = ROUND_HALF_UP


class LedgerView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
        SuperAdminTokenAuthentication,
    )

    def studentTransportationRate(
        self, student_id: int, school_id: int, student_ids: list = None, status=None
    ):
        if student_id:
            q = Q(student=student_id, school=school_id, is_active=True)
            if status:
                q &= Q(status=status)
            return (
                StudentTransportationInfo.objects.filter(q)
                .values("bus_station__fee")
                .first()
            )
        elif student_ids:
            q = Q(student__in=student_ids, school__id=school_id, is_active=True)
            return {
                e["student"]: e["bus_station__fee"]
                for e in (
                    StudentTransportationInfo.objects.filter(q).values(
                        "student", "bus_station__fee"
                    )
                )
            }

    def studentHostelRate(self, student_id: int, school_id: int):
        """This student's hostel rates, or None if they are not a boarder.

        Mirrors `studentTransportationRate` above, and for the same reason: the
        rate belongs to the student's current allocation, not to their class.
        The query itself lives in `methods/hostelRates` so the reminder bill,
        the receipt and this screen cannot drift apart.
        """
        return studentHostelRates(student_id, school_id)

    def calculateStudentLedger(self, ledgers, invoices, reminder, **kwargs):
        # print("---ledgers---\n", ledgers)
        # print("---invoices---\n", invoices)
        #
        remainings = kwargs.get("remainings") or {}
        balance = defaultdict(Decimal)  # bill_amount
        for ledger in ledgers:  # each ledger_posting for the student's class on a year;
            ledgerDetails = (ledger.get("details") or ledger).items()
            for title, total in ledgerDetails:
                # skip the FeeTitle-name snapshot map (not a real title row)
                if title == TITLE_NAMES_KEY:
                    continue
                # opening balance == old dues!
                if title == OPENING_BALANCE:
                    title = OLD_DUES
                try:
                    total = Decimal(total)
                except:
                    total = 0
                balance[title] += total
        # print(balance)
        # ---
        # actual remaining to be paid in a title = ledger_title_total - title_total_paid
        # simply, total - paid
        for invoice in invoices:
            invoiceDetails = invoice.get("details") or invoice or {}
            for title, titleDetails in invoiceDetails.items():
                # skip the FeeTitle-name snapshot map (not a real title row)
                if title == TITLE_NAMES_KEY:
                    continue
                paid_amount = Decimal(titleDetails.get(INVOICE_DETAILS["AMOUNT"]) or 0)
                discount_amount = Decimal(
                    titleDetails.get(INVOICE_DETAILS["DISCOUNT"]) or 0
                )
                actual_paid = paid_amount - discount_amount
                # opening balance == old dues!
                if title == OPENING_BALANCE:
                    title = OLD_DUES
                if title not in balance:
                    balance[title] = 0
                balance[title] -= actual_paid
                balance[title] -= discount_amount
                # print(">>", title, balance[title])
        # NOTE: when a cashier drops a lump into the always-present "old dues"
        # row (see getFeeDetails) without an old-dues balance to match, this
        # bucket goes negative while the titles that money really paid still
        # read as fully due. The grand total stays correct. Spreading the
        # surplus over those titles was tried and reverted: which titles a
        # lump settled is the school's call, not a rule we can infer, and
        # guessing it silently rewrites what the counter shows. The lump is
        # prevented at entry instead (StudentPayment.payStudentFee).
        # QUANTIZATION
        for title in balance:
            balance[title] = balance[title].quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
        # ---
        total = sum([total for _, total in balance.items()])
        return balance, total, remainings

    def mergeStudentLedgers(
        self, student_id: int, class_id: int, school_id: int, academic_year_id: int
    ):
        """student-payment/title-selection
        1. get all student ledgers
        2. get all student payments
        3. store total posted amount from all ledgers according to title in mergedLedgers
        ```
        mergedLedgers[titleId] = sum_of_posted_amount(titleId)
        ```
        4. calculate total paid amount of each titleId then subtract this amount from mergedLedgers[titleId]
        ```
        mergedLedgers[titleId] -= sum_of_paid_amount(titleId)
        ```
        5. get all fee_titles associated with student's class_info_id
        6. add transportation in fee_titles and in mergedLedgers if not there.
        7. add old_dues in fee_titles if in mergedLedgers
        """
        #
        fee_titles, fee_rates, _ = self.getFeeDetails(school_id, class_id, False)
        student_tsp_fee = self.studentTransportationRate(student_id, school_id)
        if student_tsp_fee:
            fee_rates[TRANSPORTATION] = student_tsp_fee.get("bus_station__fee")
        # Skipped outright for a school without the module — no query, no rate,
        # no title.
        student_hostel = (
            self.studentHostelRate(student_id, school_id)
            if schoolUsesHostel(school_id)
            else None
        )
        if student_hostel:
            # All three, so a cashier posting a boarder's check-in charges from
            # the profile gets the agreed figures pre-filled instead of typing
            # them from the allocation screen.
            fee_rates[HOSTEL] = student_hostel.get("monthly_fee")
            fee_rates[HOSTEL_ADMISSION] = student_hostel.get("admission_fee")
            fee_rates[HOSTEL_DEPOSIT] = student_hostel.get("security_deposit")
        #
        q = Q(
            student__id=student_id,
            school__id=school_id,
            is_active=True,
        )
        if academic_year_id:
            q &= Q(academic_year=academic_year_id)
        ledgers = list(
            StudentLedger.objects.filter(q, ledger_posting__is_active=True)
            .values("details")
            .order_by("id")
        )
        invoices = list(
            StudentInvoice.objects.filter(q, isCashReceipt=False)
            .values("details")
            .order_by("id")
        )
        mergedLedgers, total, _ = self.calculateStudentLedger(ledgers, invoices, False)
        # ---
        for title in fee_titles.keys():
            if str(title) not in mergedLedgers:
                mergedLedgers[title] = 0
        return {
            "bill_amount": mergedLedgers,
            "total": total,
            "titles": fee_titles,
            "rates": fee_rates,
        }

    def getReminderBils(
        self,
        class_id: int,
        school_id: int,
        academic_year_id: int,
        student_id: int,
        selected_months=None,
    ):
        """
        reminder-bills

        `selected_months` pins the bill to one posted period instead of the
        student's newest posting — a tax invoice has to be reprintable for the
        month it was issued for, not only for the last month billed.

        without months (confused ledgers) and payment guide!
        Aaja vanda agadi post without months, Old dues before this bill.
        Aaja post with months, this bill.
        Aaja/voli payment, payment after this posting.
        Aaja/voli posting without months, other adjustments.

        Total amount on this bill : last post vako monthko balaance [current_dues from recent posting]
        Old dues before this bill : yeo post hunu vanda agadiko balance
        Payment rec. after this Post : last post vako paxi pay gareko balance
        Other adjustments : post vaisakepaxi ko profile bata gareko ledgers posting.
        """
        q = Q(
            school__id=school_id,
            is_active=True,
            student__class_info=class_id,
        )
        if student_id:
            q &= Q(student=student_id)
        if academic_year_id:
            q &= Q(academic_year=academic_year_id)
        # ---
        ledgers = (
            StudentLedger.objects.filter(q, ledger_posting__is_active=True)
            .values("details", "student", "ledger_posting__months", "date")
            .annotate(month=ExtractMonth("date"))
            .order_by("id")
        )
        invoices = (
            StudentInvoice.objects.filter(q, isCashReceipt=False)
            .values("details", "student", "date")
            .annotate(month=ExtractMonth("date"))
            .order_by("id")
        )
        #
        # print(ledgers, "\n")
        # print(invoices, "\n")
        if ledgers or invoices:
            #
            student_balance = defaultdict(
                lambda: defaultdict(lambda: {"ledgers": [], "invoices": []})
            )
            adjustments = defaultdict(lambda: {"ledgers": []})
            postedMonths = (
                {}
            )  # every selected months links to a key in student_balance!
            recentPostedMonths = None
            student_ids = set()
            confusedLedgers = (
                []
            )  # ledgers posted from profile majorly without selecting months
            unrecognizedInvoices = defaultdict(lambda: [])
            dates = {}
            students_with_dues = None  # set or None
            #
            for led in ledgers:
                # print(led)
                months = led.get("ledger_posting__months")
                months_index = ""  # those ledgers with months selected!
                # print("[+] ledger-months ::",months or "!! nlpms", led.get("month"))
                if not months or len(months) == 0:
                    month = led.get("month")
                    # months = [led.get("month")]
                    # assign index for 1st month as index cause empty months means old_dues;
                    for _monthsIndex in postedMonths.values():
                        if _monthsIndex:
                            splittedmonthsIndex = _monthsIndex.split("__")
                            if month in splittedmonthsIndex:
                                months_index = _monthsIndex
                            else:
                                months_index = None
                else:
                    months_index = "__".join(map(str, months))
                    dates[months_index] = self.toNepaliDate(led.get("date"))
                # print("home-key :: ",months_index)
                #
                if months_index:
                    student, details = led["student"], led["details"]
                    student_balance[months_index][student]["ledgers"].append(details)
                    postedMonths.update(dict.fromkeys(months, months_index))
                    student_ids.add(student)
                else:
                    confusedLedgers.append(led)
            #
            # print(dates)
            # print(postedMonths, "\n")
            # `dates` is consumed below (popitem); keep an untouched copy so a
            # tax invoice can print the date the fees were actually posted
            # instead of the day the bill happens to be printed.
            postingDates = dict(dates)
            firstPostingKey = next(iter(dates.keys()))
            lastPostingKey, lastPostingDate = dates.popitem()  # recently major posting!
            # print(firstPostingKey, lastPostingKey, lastPostingDate)
            for led in confusedLedgers:
                student, details = led["student"], led["details"]
                date = self.toNepaliDate(led.get("date"))
                if date > lastPostingDate:
                    adjustments[student]["ledgers"].append(details)
                else:
                    # date <= lastPostingDate, send to first posting!
                    student_balance[firstPostingKey][student]["ledgers"].append(details)
                student_ids.add(student)
            #
            for inv in invoices:
                # print(inv)
                inv_key = None
                student = inv["student"]
                payment_month = inv.get("month") or None
                if payment_month and payment_month > 0:
                    date = self.toNepaliDate(inv.get("date"))
                    # print(payment_month, date, lastPostingDate, lastPostingKey)
                    if date >= lastPostingDate:
                        inv_key = lastPostingKey
                    elif lastPostingKey != firstPostingKey:
                        inv_key = postedMonths.get(payment_month)
                    if inv_key:
                        student_balance[inv_key][student]["invoices"].append(
                            inv["details"]
                        )
                    else:
                        unrecognizedInvoices[student].append(inv["details"])
            # print(dict(student_balance), "\n")
            # print(dict(adjustments), "\n")
            # print(confusedLedgers, "\n")
            # print(dict(unrecognizedInvoices), "\n")
            # print(postedMonths)
            postedMonths = list(student_balance.keys())
            # A tax invoice may be asked for a period other than the newest one
            # (see `months` on the GET). Resolve the request against the groups
            # this class's students actually hold.
            selectedMonthsKey = self.matchPostedMonthsKey(postedMonths, selected_months)
            if selected_months and not selectedMonthsKey:
                # The picker is built from the class's LedgerPostings, which can
                # include a period none of the CURRENT roster holds (it was
                # posted for students who have since moved class). Answering with
                # the newest posting instead would print invoices for a month
                # nobody asked for, so say there is nothing there.
                return {}
            if postedMonths:
                dues = {}
                students_with_dues = set()
                postedMonthsNewToOld = postedMonths[::-1]  # reversed list!
                if selectedMonthsKey:
                    # Old dues are what was charged BEFORE the selected posting,
                    # so the groups after it drop out of that sum too.
                    recentPostedMonths = selectedMonthsKey
                    postedMonths = postedMonths[: postedMonths.index(selectedMonthsKey)]
                else:
                    recentPostedMonths = (
                        postedMonths.pop() or ""
                    )  # last one must be popped out to prevent miscalculation in old dues!
                for stdId in student_ids:
                    if selectedMonthsKey:
                        # Only the students that posting actually charged; a
                        # student who joined later has no invoice for it.
                        stdRecentPostedMonths = (
                            selectedMonthsKey
                            if stdId in student_balance[selectedMonthsKey]
                            else None
                        )
                    else:
                        stdRecentPostedMonths = next(
                            (
                                months_index
                                for months_index in postedMonthsNewToOld
                                if stdId in student_balance[months_index]
                            ),
                            None,
                        )  # last posted months for every student!
                    if not stdRecentPostedMonths:
                        continue
                    # current dues
                    # print(">>>", stdId)
                    stdData = student_balance.get(stdRecentPostedMonths)
                    mergedLedgers, current_dues, adjustedTotal, paid_after_posting = (
                        {},
                        0,
                        0,
                        0,
                    )
                    old_dues = 0
                    if stdData:
                        # print(stdData)
                        stdData = stdData.get(stdId)
                        # print(stdData)
                        if stdData:
                            mergedLedgers, current_dues = self.mergeLedgers(
                                stdData.get("ledgers")
                            )
                            paid_after_posting = self.calculateTotalPaid(
                                stdData.get("invoices")
                            )
                    adjustedData = adjustments.get(stdId)
                    if adjustedData:
                        _, adjustedTotal = self.mergeLedgers(
                            adjustedData.get("ledgers")
                        )
                    # old dues
                    total_old_dues, old_paid, unrecognized_paid = 0, 0, 0
                    # current one is already calculated,
                    # here, we calculate all previous ones
                    old_ledgers = []
                    old_invoices = []
                    for index in postedMonths:
                        stdData = student_balance.get(index)
                        if stdData:
                            stdData = stdData.get(stdId)
                            if stdData:
                                old_ledgers.extend(stdData.get("ledgers") or [])
                                old_invoices.extend(stdData.get("invoices") or [])
                    _, total_old_dues = self.mergeLedgers(old_ledgers)
                    old_paid = self.calculateTotalPaid(old_invoices)
                    #
                    unrecognizedStudentInvoices = (
                        unrecognizedInvoices.get(stdId) or None
                    )
                    if unrecognizedStudentInvoices:
                        unrecognized_paid = self.calculateTotalPaid(
                            unrecognizedStudentInvoices
                        )
                    old_dues = round(total_old_dues - old_paid - unrecognized_paid, 2)
                    grand_dues = round(
                        (current_dues + old_dues + adjustedTotal) - paid_after_posting,
                        2,
                    )  # (current_dues+old_dues+adjusted)-paid
                    # print("total current dues : ", current_dues)
                    # print("total old dues : ", total_old_dues)
                    # print("adjusted total : ", adjustedTotal)
                    # print("old paid :", old_paid)
                    # print("unrecog. paid : ", unrecognized_paid)
                    # print("old dues : ", old_dues)
                    # print("grand dues : ", grand_dues)
                    # A settled bill is still a bill that was issued, so an
                    # explicitly picked period lists everyone it charged. Only
                    # the "newest posting" default hides the paid-up students —
                    # that view exists to chase money.
                    if grand_dues > 0 or selectedMonthsKey:
                        dues[stdId] = {
                            "mergedLedgers": mergedLedgers,  # particulars
                            "total": current_dues,  # Total Amount (This Bill Only)
                            "old_dues": old_dues,  # Old dues (Before this bill)
                            "adjusted": adjustedTotal,  # Other adjustments
                            "paid": paid_after_posting,  # Payment received after this posting
                            "total_dues": grand_dues,  # Total dues
                            "months": stdRecentPostedMonths.split("__"),
                            # date of the posting this bill is built from;
                            # printed as the date on the tax invoice.
                            "posted_date": self.formatNepaliDate(
                                postingDates.get(stdRecentPostedMonths)
                            ),
                        }
                        students_with_dues.add(stdId)
            #
            student_details = []
            fee_titles, fee_rates, classname = {}, {}, ""
            if students_with_dues:
                student_details = self.getStudentDetails(
                    students_with_dues, school_id, class_id
                )
                fee_titles, fee_rates, classname = self.getFeeDetails(
                    school_id, class_id, True
                )
            #
            return {
                "data": dues,
                "student_details": student_details,
                "titles": fee_titles,
                "rates": fee_rates,
                "classname": classname,
                "date": ndt_today(),
                "posted_date": self.formatNepaliDate(
                    postingDates.get(selectedMonthsKey) or lastPostingDate
                ),
                "months": (recentPostedMonths or "").split("__"),
            }
        return {}

    @staticmethod
    def matchPostedMonthsKey(posted_keys: list, selected_months):
        """Which posted group the caller asked for.

        The picker sends the months it was shown ("1,2,3" / "1__2__3"), which is
        not necessarily the order they were stored in, so groups are compared as
        sets of months. Two groups can cover the same months (a class-wide
        posting and a later catch-up); the newest wins, which is the group the
        default path would have chosen anyway.
        """
        if not selected_months:
            return None
        wanted = {
            m.strip()
            for m in str(selected_months).replace("__", ",").split(",")
            if m.strip()
        }
        if not wanted:
            return None
        for key in reversed(posted_keys):
            if set(key.split("__")) == wanted:
                return key
        return None

    def toNepaliDate(self, date):
        return nepali_datetime.datetime.strptime(date, date_format).date()

    def formatNepaliDate(self, date):
        return date.strftime(date_format) if date else ""

    def mergeLedgers(self, ledgers):
        mergedLedgers = {}
        totalDues = 0
        for led in ledgers:
            for title, total in led.items():
                # skip the FeeTitle-name snapshot map (not a real title row)
                if title == TITLE_NAMES_KEY:
                    continue
                total_val = Decimal(0)
                if title == OPENING_BALANCE:
                    title = OLD_DUES
                try:
                    total_val = Decimal(total)
                    mergedLedgers[title] = (
                        mergedLedgers.get(title) or Decimal(0)
                    ) + total_val
                    totalDues += total_val
                except Exception:
                    pass
        return mergedLedgers, Decimal(totalDues)

    def calculateTotalPaid(self, invoices):
        total_sum = 0
        for invoice in invoices:
            invoiceDetails = invoice.get("details") or invoice or {}
            for key, details in invoiceDetails.items():
                # skip the FeeTitle-name snapshot map (not a real title row)
                if key == TITLE_NAMES_KEY or not isinstance(details, dict):
                    continue
                paid_amount = Decimal(details.get(INVOICE_DETAILS["AMOUNT"]) or 0)
                total_sum += paid_amount
        # print(total_sum)
        return total_sum

    def getStudentDetails(self, student_ids: list, school_id: int, class_id: int):
        student_transportation_rates = self.studentTransportationRate(
            None, school_id, student_ids, STATUS_RUNNING
        )
        # The hostel rate travels with the reminder bill and the tax invoice for
        # the same reason transportation does: both documents print a RATE
        # column, and a per-student service has no rate in the class fee table
        # to print. One query for the whole class.
        student_hostel_rates = (
            studentHostelRateMap(student_ids, school_id)
            if schoolUsesHostel(school_id)
            else {}
        )
        student_details = [
            {
                **std,
                "transportation_rate": student_transportation_rates.get(std.get("id"))
                or 0,
                "hostel_rate": (
                    student_hostel_rates.get(std.get("id"), {}) or {}
                ).get("monthly_fee")
                or 0,
                "id": std.pop("id"),
            }
            for std in (
                Student.objects.filter(
                    id__in=student_ids,
                    class_info=class_id,
                    is_active=True,
                    status=STATUS_RUNNING,
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
                    guardian_name=Coalesce(
                        F("guardian_info__guardian_name"),
                        F("guardian_info__father_name"),
                        F("guardian_info__mother_name"),
                        default=Value(""),
                        output_field=CharField(),
                    ),
                )
                .order_by(Collate("name", "und-x-icu"))
                .values("id", "name", "guardian_name")
            )
        ]
        return student_details

    def getFeeDetails(
        self, school_id: int, class_id: int, include_classname: bool = False
    ):
        classname, class_details = getClassDetails(
            class_id, True, include_classname, False, None
        )
        # print(classname, class_details)
        #
        class_details.pop("id", None)
        sec = class_details.pop("section", None)
        fees = feeq(
            class_details,
            sec,
            ("title__id", "title__title", "fee"),
        )
        fee_s = FeeSerializer(fees, many=True)
        fee_titles = {fee["title__id"]: fee["title__title"] for fee in fee_s.data}
        fee_rates = {fee["title__id"]: fee["fee"] for fee in fee_s.data}
        #
        fee_titles[TRANSPORTATION] = EXCEPTION_TITLES_ALTERNATIVES[TRANSPORTATION]
        # ONLY for a school that has the hostel module. Every other school's
        # title dropdown stays exactly as long as it was — three extra rows on
        # the ledger screen of every school that will never run a hostel is a
        # feature made worse for everyone by one school's purchase.
        if schoolUsesHostel(school_id):
            fee_titles[HOSTEL] = EXCEPTION_TITLES_ALTERNATIVES[HOSTEL]
            fee_titles[HOSTEL_ADMISSION] = EXCEPTION_TITLES_ALTERNATIVES[HOSTEL_ADMISSION]
            fee_titles[HOSTEL_DEPOSIT] = EXCEPTION_TITLES_ALTERNATIVES[HOSTEL_DEPOSIT]
        fee_titles[OLD_DUES] = EXCEPTION_TITLES_ALTERNATIVES[OLD_DUES]
        fee_titles[LIBRARY_FINE] = EXCEPTION_TITLES_ALTERNATIVES[LIBRARY_FINE]
        return fee_titles, fee_rates, classname

    @swagger_auto_schema(**LEDGERS_API["get"])
    def get(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        ledger_posting_id = request.query_params.get("ledger")
        class_id = request.query_params.get("class")
        acay = request.query_params.get("academic_year")
        reminder = request.query_params.get("reminder") or False
        opening_balance_report = (
            request.query_params.get("opening_balance_report") or False
        )
        month = request.query_params.get("month") or request.query_params.getlist(
            "month[]"
        )
        # One posted period, as the month picker shows it ("1,2,3"). Only the
        # reminder/tax-invoice branch reads it; empty means "the newest posting".
        selected_months = request.query_params.get("months")
        # Explicit flag, checked before the student branch below: sending a
        # student alone means "merge this student's ledgers", which is a
        # different question from "which of this class's postings does this
        # student already have".
        posted_months = request.query_params.get("posted_months") or False

        if school_id:
            if posted_months:
                # Asking for posted months is answered ONLY here. Falling through
                # to the student-merge branch below (which happens whenever the
                # caller's academic year has not resolved yet) returned a payload
                # with no `months` key at all, and the profile's ledger tab read
                # that as "this class has never been posted" — for classes with
                # dozens of postings. A missing parameter must fail loudly, not
                # borrow another endpoint's answer.
                if class_id and acay:
                    return Response(
                        self.getClassLedgers(
                            class_id, acay, student_id, offerable_only=True
                        )
                    )
                return self.RESPONSE__INVALID_REQUEST
            if student_id and not reminder:
                """bill-title-selection.jsx
                #payment.student#student.ledger
                """
                data = self.mergeStudentLedgers(student_id, class_id, school_id, acay)
                return Response(data)

            elif ledger_posting_id:
                """recent_postings?posting_id
                get student ledgers matching ledger_posting_id
                """
                data = self.getStudentLedgers(school_id, ledger_posting_id, acay)
                return Response(data)
            elif opening_balance_report and acay:
                # A separate flag rather than a richer payload: the report's
                # response has always been a plain list, and backend and
                # frontend do not land in the same second.
                if request.query_params.get("waived"):
                    return Response(self.getWaivedOpeningBalances(school_id, acay))
                data = self.getOpeningBalanceReport(
                    school_id,
                    acay,
                    request.query_params.get("status"),
                    request.query_params.get("include_zero"),
                )
                return Response(data)
            elif class_id and acay:
                """remainder bills"""
                data = []
                if reminder:
                    data = self.getReminderBils(
                        class_id, school_id, acay, student_id, selected_months
                    )
                else:
                    data = self.getClassLedgers(class_id, acay)
                return Response(data)
            elif acay and month:
                data = self.titleWiseMonthlyLedgers(school_id, acay, month)
                return Response(data)
            else:
                """recent-postings.jsx"""
                data = self.getRecentlyPostedLedgers(school_id, request)
                return data  # is a paginated response!
        return self.RESPONSE__INVALID_REQUEST

    def getOpeningBalanceReport(
        self, school_id, academic_year_id, status=None, include_zero=None
    ):
        """Opening balances a school still carries in an academic year.

        Scoped to RUNNING students by default. A close writes an opening balance
        for everyone who was in the class that year, so years later the report
        was summing students who have long since passed out or dropped out --
        at Great Araniko, 1,186 leavers were carrying Rs 13.97 lakh of a
        Rs 19.01 lakh "total", three quarters of a figure the school reads as
        money it is still owed. Leavers' balances are real and still reachable
        (pass status=2/3, or 0 for every status), they are just not the answer
        to "what is outstanding this year".

        Zero rows are dropped for the same reason: a close stamps one per
        student whether or not they owed anything, and 709 of Araniko's 1,744
        rows were zero. Pass include_zero=true to keep them.
        """
        try:
            status = int(status)
        except (TypeError, ValueError):
            status = STATUS_RUNNING
        keep_zero = str(include_zero).lower() in ("1", "true", "yes")
        status_q = Q(student__status=status) if status else Q()
        zero_q = Q() if keep_zero else ~Q(total=0)
        rows = list(
            StudentLedger.objects.filter(
                status_q,
                zero_q,
                school=school_id,
                academic_year=academic_year_id,
                details__has_key=OPENING_BALANCE,
                is_active=True,
                ledger_posting__is_active=True,
            )
            .annotate(
                student_name=nameConcat("student"),
            )
            .values(
                "student_name",
                "total",
                "student__status",
                # The class the opening balance was posted against, i.e. the
                # student's class in THAT academic year -- not the class they
                # sit in today (they may since have been promoted).
                "ledger_posting__class_info",
            )
        )
        # Resolve each distinct class once; getClassDetails is cached per id.
        classnames = {
            class_info_id: getClassDetails(class_info_id, False)[0]
            for class_info_id in {
                row["ledger_posting__class_info"]
                for row in rows
                if row["ledger_posting__class_info"]
            }
        }
        for row in rows:
            class_info_id = row.pop("ledger_posting__class_info", None)
            row["classname"] = classnames.get(class_info_id, "")
            row["status"] = student_status_options_dict.get(
                row.pop("student__status", None), ""
            )
        rows.sort(key=lambda row: (row["classname"], row["student_name"] or ""))
        return rows

    def getWaivedOpeningBalances(self, school_id, academic_year_id):
        """Opening balances that were cleared by hand, with the reason given.

        Staff waive a carried balance by deleting its opening-balance row, so
        the amount silently leaves this year while the closed year it came from
        still shows it -- which is exactly why a school's closing and opening
        figures stop agreeing, with nothing on screen to say why. 886 rows worth
        Rs 28.7 lakh have been cleared this way across 35 schools.

        The money is deliberately NOT resurrected here: a waiver is the school's
        decision. It is only made visible, so the difference between the two
        years can be read instead of guessed at.
        """
        rows = list(
            StudentLedger.objects.filter(
                school=school_id,
                academic_year=academic_year_id,
                details__has_key=OPENING_BALANCE,
                is_active=False,
            )
            .annotate(student_name=nameConcat("student"))
            .values(
                "student_name",
                "total",
                "remarks",
                "updated_at",
                "student__status",
                "ledger_posting__class_info",
            )
        )
        classnames = {
            class_info_id: getClassDetails(class_info_id, False)[0]
            for class_info_id in {
                row["ledger_posting__class_info"]
                for row in rows
                if row["ledger_posting__class_info"]
            }
        }
        for row in rows:
            class_info_id = row.pop("ledger_posting__class_info", None)
            row["classname"] = classnames.get(class_info_id, "")
            row["status"] = student_status_options_dict.get(
                row.pop("student__status", None), ""
            )
            waived_on = row.pop("updated_at", None)
            row["waived_on"] = waived_on.strftime(date_format) if waived_on else ""
            row["remarks"] = row.get("remarks") or ""
        rows.sort(key=lambda row: (row["classname"], row["student_name"] or ""))
        return rows

    def titleWiseMonthlyLedgers(self, school_id: int, academic_year_id: int, month):
        # NOT USED!!!
        query = Q(is_active=True, school=school_id)
        if isinstance(month, int):
            query &= Q(month=month)
        elif isinstance(month, list):
            query &= Q(month__in=month)
        if academic_year_id:
            query &= Q(academic_year=academic_year_id)
        ledgers = (
            StudentLedger.objects.annotate(month=ExtractMonth("date"))
            .filter(query)
            .annotate(
                name=Concat(
                    "student__first_name",
                    Value(" "),
                    "student__middle_name",
                    Value(" "),
                    "student__last_name",
                    output_field=CharField(),
                )
            )
            # .order_by("month")
            .order_by(Collate("name", "und-x-icu"))
            .values("name", "details", "total")
        )
        summary = defaultdict(lambda: 0)
        total = 0
        for led in ledgers:
            total += led.get("total")
            details = led.pop("details") or {}
            discounts = details.pop("discounts", {})
            led.update(details)
            for k, v in details.items():
                discount = discounts.get(k) or 0
                summary[k] += v - discount
        title_ids = {key for key in summary.keys() if key not in EXCEPTION_TITLES}
        titles = getFeeTitlesFromTitleIds(title_ids)
        titles.update(EXCEPTION_TITLES_ALTERNATIVES)
        #
        if len(title_ids) > 0:
            summary["name"] = "TOTAL"
            summary["total"] = total
            return {
                "ledgers": ledgers,
                "summary": summary,
                "titles": titles,
            }
        return None

    def getClassLedgers(
        self,
        class_id: int,
        academic_year_id: int,
        student_id: int = None,
        offerable_only: bool = False,
    ):
        q = Q(
            class_info__id=class_id,
            is_active=True,
        )
        if academic_year_id:
            q &= Q(academic_year=academic_year_id)
        ledgers = list(
            LedgerPosting.objects.filter(q)
            .values("id", "date", "months", "single_student")
            .order_by("id")
        )
        if offerable_only:
            # Periods this class was billed under a class row it has since moved
            # off (a mid-year section split). They belong on the list: without
            # them a student whose Baishakh entry was removed cannot be given
            # Baishakh back, and the cashier picks whatever month IS offered.
            carried = [
                {**led, "carried_over": True}
                for led in carriedOverPostings([class_id], academic_year_id).values(
                    "id", "date", "months", "single_student"
                )
            ]
            if carried:
                ledgers = sorted(ledgers + carried, key=lambda led: led["id"])
            # Every catch-up posted from a student's profile also writes a
            # LedgerPosting against the class, so the raw list is mostly one-off
            # rows — 73,282 of 83,836 school-wide. Offering them back made the
            # same month appear several times over ("Ashad" twice: once class-
            # wide, once from a profile). Only genuine class-wide postings are a
            # period the rest of the class actually owes.
            # A class-wide posting carrying no months is not a period anyone can
            # be billed for, so it must not count as "the class has a class-wide
            # posting" — 130 class/year groups across 24 schools each had exactly
            # one such empty shell, which passed this filter and left the profile
            # ledger tab showing a single unselectable entry. That is why a newly
            # admitted student could not be caught up on the months they missed.
            class_wide = [
                led
                for led in ledgers
                if not led["single_student"] and led["months"]
            ]
            # ...unless the class has never had one. Some classes are billed
            # purely per-student; dropping to an empty picker there would take
            # away the only way they post at all, so they keep what they have.
            #
            # But what they keep is NOT a class period, and offering it unmarked
            # is what makes the picker "show months that were never posted": in
            # 431 of the 1,117 class/year groups that land here, fewer than half
            # the class holds any ledger at all — often a single student — so the
            # months on offer are one person's catch-up, not something the class
            # owes. They stay selectable (a cashier may well need them) and are
            # flagged instead, so the tab can say what they actually are.
            if class_wide:
                ledgers = class_wide
            else:
                ledgers = [led for led in ledgers if led["months"]]
                for led in ledgers:
                    led["not_class_wide"] = True
        for led in ledgers:
            led.pop("single_student", None)
        if not student_id:
            return ledgers
        # Which months this student already carries. The profile's ledger tab
        # exists to fill in a month the student MISSED, so a month they already
        # hold must not be offered again — posting it twice bills the same period
        # twice and there is no warning anywhere that it happened.
        #
        # Matched by MONTH, not by posting: a student caught up from their
        # profile holds the month on a posting of their own, so comparing
        # posting-to-posting would call the class-wide group untaken and offer
        # the very month they were just billed for.
        billed_months = set()
        student_months = StudentLedger.objects.filter(
            student__id=student_id,
            is_active=True,
            ledger_posting__is_active=True,
        )
        if academic_year_id:
            student_months = student_months.filter(academic_year=academic_year_id)
        for months in student_months.values_list("ledger_posting__months", flat=True):
            billed_months.update(months or [])
        for led in ledgers:
            led["taken"] = bool(set(led["months"] or []) & billed_months)
        return ledgers

    def getStudentLedgers(
        self, school_id: int, ledger_posting_id: int, academic_year_id: int
    ):
        q = Q(
            school=school_id,
            is_active=True,
            ledger_posting=ledger_posting_id,
            ledger_posting__is_active=True,
        )
        if academic_year_id:
            q &= Q(academic_year=academic_year_id)
        data = (
            StudentLedger.objects.filter(q)
            .values(
                "details",
                "total",
            )
            .annotate(
                name=Concat(
                    "student__first_name",
                    Value(" "),
                    "student__middle_name",
                    Value(" "),
                    "student__last_name",
                    output_field=CharField(),
                )
            )
        )
        titleIds = extractTitleIdsFromLedgers(data)
        titles = getFeeTitlesFromTitleIds(titleIds)
        titles.update(EXCEPTION_TITLES_ALTERNATIVES)
        data = formatStudentLedgerDetails(data, titles, False, ["name"])
        return {"data": data, "titles": titles}

    def getRecentlyPostedLedgers(self, school_id: int, request):
        ledgers = (
            # Class-wide postings only. Profile catch-ups (one row each) and
            # deleted postings buried them: a school doing a few dozen
            # catch-ups a day saw pages of those and no class posting at all.
            LedgerPosting.objects.filter(
                class_info__school__id=school_id,
                is_active=True,
                single_student=False,
            )
            .values("id", "date", "class_info", "months")
            .order_by("-id")
        )
        paginator = LedgerCursorPagination()
        page = paginator.paginate_queryset(ledgers, request)
        if page is not None:
            ledgers = [
                {
                    "id": led.get("id"),
                    "date": led.get("date") or "",
                    "className": self.cacheClassname(led.get("class_info")),
                    "months": led.get("months"),
                }
                for led in page
            ]
            return paginator.get_paginated_response(ledgers)
        return Response({"results": []})

    def cacheClassname(self, class_info_id: int) -> str:
        [classname, _] = getClassDetails(class_info_id, False)
        return classname

    @swagger_auto_schema(**LEDGERS_API["post"])
    def post(self, request):
        """request.data
        -- class-wise ledger-posting [ledger_posting.jsx]
        {
            ledgerPosting: {months: [],class_info: int};
            studentLedgers: [],
            economic_year, academic_year
        }
        -- single student ledger-posting [student_profile__ledger_posting.jsx]
        {
            student, school, ledgers:[], ledger_posting, total
        }
        """
        data = request.data
        if "ledgerPosting" in data:
            """
            Here, ledgerPosting is LedgerPosting `object` including {months:[], class_info:{}}
            """
            error = self.validateStudentLedgers(data.get("studentLedgers"))
            if error:
                return Response(
                    {"message": error}, status=status.HTTP_400_BAD_REQUEST
                )
            reposted = self.alreadyPostedMonths(data)
            if reposted:
                return Response(
                    {
                        "message": f"{', '.join(reposted)} already posted for "
                        "this class. To bill a student more for that period, "
                        "post it from the student's profile (Ledger tab)."
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            duplicates = self.dropDuplicateCharges(data)
            self.dropEmptyCharges(data)
            if not data.get("studentLedgers"):
                return Response(
                    {
                        "message": "Nothing to post — every student here is "
                        "already billed for the selected month(s), or no fee "
                        "title of this class is payable in them."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            posting = self.handleClassLedgerPosting(data)
            if posting:
                message = "Ledgers saved!"
                if duplicates:
                    message += (
                        f" {duplicates} student(s) were already billed for part "
                        "of this and were not charged twice."
                    )
                return Response({"message": message})
        elif "student" in data:
            """
            Here, ledger_posting is ledger_posting.id
            """
            if not self.rowBillsSomething({"details": data.get("details")}):
                return Response(
                    {
                        "message": "Nothing to post — this entry charges no fee "
                        "title. Enter an amount against at least one title."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            posting = self.handleStudentLedgerPosting(data)
            if posting:
                return Response({"message": "Student Ledger saved!"})
        return self.RESPONSE__INVALID_REQUEST

    # Fields a client may send per student-ledger row. Anything else would reach
    # StudentLedger(**item) as an unexpected kwarg and blow up with a TypeError
    # (a 500) instead of telling the user what's wrong.
    STUDENT_LEDGER_FIELDS = {"student", "details", "total", "remarks", "extra_info"}

    def validateStudentLedgers(self, studentLedgers):
        """Reject a posting the DB would only reject as a 500.

        `student` and `total` are NOT NULL on StudentLedger, so a row missing
        either one (a NaN total serialises to JSON null, a stale student id
        resolves to None) used to surface as an opaque
        "Request failed with status code 500" mid-posting. Return a message
        naming the offending row instead. None == payload is fine.
        """
        if not isinstance(studentLedgers, list):
            return None  # single-student payload — handled by its own path
        for index, item in enumerate(studentLedgers):
            if not isinstance(item, dict):
                return f"Invalid ledger row at position {index + 1}!"
            unknown = set(item.keys()) - self.STUDENT_LEDGER_FIELDS
            if unknown:
                return (
                    f"Unexpected field(s) {', '.join(sorted(unknown))} "
                    f"in ledger row {index + 1}!"
                )
            if not item.get("student"):
                return f"Missing student on ledger row {index + 1}!"
            total = item.get("total")
            if total is None or total == "":
                return (
                    f"Could not calculate the total for student "
                    f"{item.get('student')} — please re-check that row's "
                    "fee/discount amounts and search again."
                )
            try:
                Decimal(str(total))
            except (ArithmeticError, TypeError, ValueError):
                return (
                    f"Invalid total '{total}' for student {item.get('student')}!"
                )
        return None

    def alreadyPostedMonths(self, data):
        """Names of the requested months this class already has a class-wide
        posting for. A period is bulk-posted once; anything more for it goes on
        from the student's profile. Month-less postings (old dues, opening
        balances) name no period and are never blocked."""
        posting = data.get("ledgerPosting") or {}
        months = posting.get("months") or []
        if not isinstance(months, list) or not months:
            return []
        class_info = findClass(posting.get("class_info"))
        if not class_info:
            return []  # a class that doesn't exist yet has no postings
        posted = classPostedMonths([class_info.id], data.get("academic_year"))
        clash = []
        for month in months:
            try:
                month = int(month)
            except (TypeError, ValueError):
                continue
            if month in posted:
                clash.append(month)
        return [BS_MONTHS.get(m, str(m)) for m in sorted(set(clash))]

    @staticmethod
    def rowBillsSomething(row):
        """True when this student-ledger row actually charges a fee title.

        `details` is {title_id: amount}. The FeeTitle-name snapshot under
        TITLE_NAMES_KEY is bookkeeping, not a charge, so a row holding nothing
        but that key bills nobody for anything.
        """
        details = row.get("details") if isinstance(row, dict) else None
        if not isinstance(details, dict):
            return False
        return any(title != TITLE_NAMES_KEY for title in details)

    def dropEmptyCharges(self, data):
        """Never store a ledger row that bills nothing.

        The posting screen builds one row per student in the class and zeroes
        every title the student cannot be charged for in the selected months —
        a title whose fee months exclude the period, or one they already hold
        from an earlier posting. When that leaves nothing, the row still went
        out with `details: {}` and `total: 0`, and landed in the student's
        ledger as a dated entry with no particulars and no amount. School 69
        (Divine Pathshala Dang) collected 2,393 of them; 10,303 exist across
        all schools. They change no balance, but a parent reading the ledger
        sees a page of phantom charges and a cashier reads them as a double
        posting.

        The client no longer sends them (methods/payment/ledger.js), and this
        is the other half of that fix: a bundle still open in somebody's tab
        cannot write them either.

        Returns how many rows were dropped.
        """
        ledgers = data.get("studentLedgers")
        if not isinstance(ledgers, list):
            return 0
        kept = [row for row in ledgers if self.rowBillsSomething(row)]
        dropped = len(ledgers) - len(kept)
        if dropped:
            data["studentLedgers"] = kept
        return dropped

    def dropDuplicateCharges(self, data):
        """Never charge a student the same fee title for the same month twice.

        The month picker used to guarantee this by blocking any month the class
        had ever been posted — including months only ONE student had been caught
        up on from their profile, which locked the other 50 out of the period
        entirely (see LedgerPostingSearchView). Now that the month stays open,
        this is what keeps the caught-up student from being billed again: the
        client leaves them out, and a client that doesn't (an old bundle still
        open in a tab) is corrected here.

        Per TITLE, not per month: posting the same month again for a different
        title is a normal second charge — schools bill title by title, and 164
        of the last 400 class-wide postings did exactly that. Only a title the
        student already holds for EVERY month of this posting is a duplicate;
        that title is dropped from their row (and its amount off their total),
        and a row left with nothing to charge is dropped altogether.

        Returns how many students were adjusted.
        """
        posting = data.get("ledgerPosting") or {}
        months = {m for m in (posting.get("months") or []) if isinstance(m, int)}
        ledgers = data.get("studentLedgers")
        if not months or not isinstance(ledgers, list) or not ledgers:
            return 0
        student_ids = [row.get("student") for row in ledgers if row.get("student")]
        if not student_ids:
            return 0
        query = StudentLedger.objects.filter(
            student__id__in=student_ids,
            is_active=True,
            ledger_posting__is_active=True,
        )
        academic_year = data.get("academic_year")
        if academic_year:
            query = query.filter(academic_year=academic_year)
        # {student: {title: months already billed}}
        billed = defaultdict(lambda: defaultdict(set))
        for student_id, posted_months, details in query.values_list(
            "student__id", "ledger_posting__months", "details"
        ):
            if not posted_months or not isinstance(details, dict):
                continue
            for title in details:
                if title == TITLE_NAMES_KEY:
                    continue
                billed[student_id][str(title)].update(posted_months)
        #
        adjusted, kept = 0, []
        for row in ledgers:
            held = billed.get(row.get("student"))
            details = row.get("details")
            if not held or not isinstance(details, dict):
                kept.append(row)
                continue
            duplicated = [
                title
                for title in details
                if title != TITLE_NAMES_KEY and months <= held.get(str(title), set())
            ]
            if not duplicated:
                kept.append(row)
                continue
            adjusted += 1
            total = Decimal(str(row.get("total") or 0))
            for title in duplicated:
                total -= Decimal(str(details.pop(title) or 0))
            if not details:
                continue  # nothing left to bill this student for
            row["total"] = total
            kept.append(row)
        if adjusted:
            data["studentLedgers"] = kept
        return adjusted

    def handleClassLedgerPosting(self, data):
        ecoy = data.get("economic_year")
        acay = data.get("academic_year")
        if not ecoy or not acay:
            return False
        #
        ledgerPostingData = {
            **(data.get("ledgerPosting") or {}),
            "economic_year": ecoy,
            "academic_year": acay,
            "date": data.get("date", ndt_today()),
        }
        ledgerPostingSerializer = LedgerPostingSerializer(data=ledgerPostingData)
        if ledgerPostingSerializer.is_valid():
            studentLedgersData = data.get("studentLedgers")
            posting = ledgerPostingSerializer.save(studentLedgers=studentLedgersData)
            # app push to each student whose ledger was just posted (free, stored).
            try:
                student_ids = [
                    sl.get("student")
                    for sl in (studentLedgersData or [])
                    if sl.get("student")
                ]
                notify_students(
                    posting.class_info.school_id,
                    student_ids,
                    "शुल्क पोस्ट गरियो",
                    "तपाईंको खातामा नयाँ शुल्क थपिएको छ। "
                    "कृपया आफ्नो बाँकी रकम जाँच गर्नुहोस्।",
                    "ledger",
                )
            except Exception:
                pass
            return posting
        return False

    # A single-student (profile) posting may be month-less on purpose. A monthly
    # fee should name its period, but this same entry also charges one-off items
    # — a tie, a belt, a lost book, old dues — that belong to no billing period,
    # so the month is asked for, not required. (It was mandatory between
    # 2026-07-21 and 2026-08-07; that blocked the one-off case.)
    def handleStudentLedgerPosting(self, data):
        student_id = data.get("student")
        school_id = data.get("school")
        ecoy = data.get("economic_year")
        acay = data.get("academic_year")
        #
        if student_id and school_id and ecoy and acay:
            # A catch-up that charges no title is not a posting — see
            # dropEmptyCharges. Stop it here too, so the profile screen can't
            # write the phantom entry the class screen no longer can.
            if not self.rowBillsSomething({"details": data.get("details")}):
                return False
            ledgerPostingData = {
                "months": data.pop("months"),
                "class_info": data.pop("class_info"),
                "date": data.pop("date"),
                "academic_year": data.get("academic_year"),
                "economic_year": data.get("economic_year"),
            }
            ledgerPostingSerializer = LedgerPostingSerializer(data=ledgerPostingData)
            if ledgerPostingSerializer.is_valid():
                studentLedgers = {
                    "student": Student.objects.get(id=student_id),
                    "details": data.pop("details", {}),
                    "total": data.pop("total", 0),
                    "remarks": (data.pop("remarks", None) or None),
                }  # single student ledger
                posting = ledgerPostingSerializer.save(studentLedgers=studentLedgers)
                # app push to the single student whose ledger was posted (stored).
                notify_students(
                    school_id,
                    [student_id],
                    "शुल्क पोस्ट गरियो",
                    "तपाईंको खातामा नयाँ शुल्क थपिएको छ। "
                    "कृपया आफ्नो बाँकी रकम जाँच गर्नुहोस्।",
                    "ledger",
                )
                return posting
        return False

    @swagger_auto_schema(**LEDGERS_API["put"])
    def put(self, request):
        return self._delete(request)

    def _delete(self, request):
        school_id = request.data.get("school")
        id = request.data.get("id")
        delete_reason = request.data.get("remarks")
        if id and school_id:
            with transaction.atomic():
                item = StudentLedger.objects.get(id=id, school=school_id)
                ledger_posting_id = item.ledger_posting.id
                if item:
                    item.is_active = False
                    if delete_reason:
                        item.remarks = delete_reason
                    item.save()
                    #
                    # try to delete class-ledger-posting if it's student-ledgers.count == 0!
                    if not StudentLedger.objects.filter(
                        school=school_id,
                        ledger_posting=item.ledger_posting,
                        is_active=True,
                    ).exists():
                        LedgerPosting.objects.filter(id=ledger_posting_id).update(
                            is_active=False
                        )
                    return Response({"message": "Ledger deleted!"})
        return self.RESPONSE__INVALID_REQUEST
