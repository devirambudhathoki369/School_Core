import datetime
from decimal import Decimal
from django.db.models import Q

#
from ..models.Invoice import (
    StaffInvoice,
    StudentInvoice,
    PAYMENT_MODES_MAPPING,
)
from ..models.Ledger import StudentLedger
from .invoiceAudit import auditOf
from .getStudentDetail import getStudentDetailForInvoice
from .getStaffDetail import getStaffDetailForInvoice
from .getFeeDetails import getFeeDetailsFromInvoice
from ..constants.payment import (
    INVOICE_DETAILS,
    OLD_DUES,
    OPENING_BALANCE,
    HOSTEL_TITLES,
    EXCEPTION_TITLES_ALTERNATIVES,
)


def getOutstandingOldDues(student_id, academic_year_id, invoice_pk, invoice_date):
    """Old dues the student carried when THIS invoice was written: every od/ob
    charge posted on or before the invoice's date, less every od/ob payment on
    earlier invoices. Bounded that way so a reprint still shows the figure the
    parent's paper copy shows, not today's balance.
    """
    if not student_id or not academic_year_id:
        return Decimal(0)
    charged = Decimal(0)
    ledger_q = Q(
        student_id=student_id,
        academic_year_id=academic_year_id,
        is_active=True,
        ledger_posting__is_active=True,
    )
    if invoice_date:
        ledger_q &= Q(date__lte=invoice_date)
    for details in StudentLedger.objects.filter(ledger_q).values_list(
        "details", flat=True
    ):
        for key in (OLD_DUES, OPENING_BALANCE):
            if key in (details or {}):
                try:
                    charged += Decimal(str(details[key]))
                except Exception:
                    pass
    paid = Decimal(0)
    invoice_q = Q(
        student_id=student_id,
        academic_year_id=academic_year_id,
        is_active=True,
        isCashReceipt=False,
    )
    if invoice_pk:
        invoice_q &= Q(id__lt=invoice_pk)
    for details in StudentInvoice.objects.filter(invoice_q).values_list(
        "details", flat=True
    ):
        for key in (OLD_DUES, OPENING_BALANCE):
            titleBill = (details or {}).get(key)
            if isinstance(titleBill, dict):
                try:
                    paid += Decimal(str(titleBill.get(INVOICE_DETAILS["AMOUNT"]) or 0))
                except Exception:
                    pass
    return charged - paid


def entryDetails(invoiceData: dict) -> dict:
    """
    cashier, entered_on, entered_time and deleted for a receipt: who entered the
    bill and when, whoever is reading it now (see invoiceAudit).
    `invoiceData` needs the invoice's own `id`; a row without `is_active` is one
    that was just saved, so it stands.
    """
    return auditOf(
        StudentInvoice, invoiceData.get("id"), invoiceData.get("is_active", True)
    )


#
def getBillDetailsFromInvoice(
    invoiceDetails: dict, class_info: dict, transportation_fee: int, hostel_rates=None
):
    """
    invoiceDetails must be a single invoice object's bill i.e. invoice['details']. \\
    returns data for showing payment details/table in a table. \\
    extracts detail i.e. {title, rate, amount} from a bill!
    """
    feeDetails = getFeeDetailsFromInvoice(
        invoiceDetails, class_info, transportation_fee, hostel_rates
    )
    # print(feeDetails)
    #
    # totalDiscount = 0
    particulars = []
    """ what's here?
    for each title from invoiceDetails (invoiceDetails.keys()) extracts title-name, title-rate, as feeDetails
    for each feeDetails, this'll list paid-amount, title-rate and title-name and return as particulars
    """
    for detail in feeDetails:
        titleBill = invoiceDetails.get(str(detail.get("title__id", "")), None)
        if not titleBill:
            continue
        title = detail.get("title__title") or ""
        rate = detail.get("fee") or ""
        paidAmt = Decimal(titleBill.get(INVOICE_DETAILS["AMOUNT"]) or 0)
        due = titleBill.get(INVOICE_DETAILS["DUE"]) or 0
        due = due if due > 0 else 0
        discount = Decimal(titleBill.get(INVOICE_DETAILS["DISCOUNT"]) or 0)
        paidAmt -= discount
        particulars.append([title, rate, paidAmt, due, discount])
    return particulars


def generateInvoiceData(
    invoiceId: int, invoiceDate: datetime.date, invoiceData: dict, school_id: int
) -> dict:
    """ 
    generates data to be send for student bill/invoice; \\
    returns invoice_id, date, student_name, guardian_name, class, payment_month, details : [[title, rate, amount], ...], total : {paid, due, discount};
    """
    student_id = invoiceData.get("student_id")
    if not student_id:
        student_id = invoiceData.get("student")
        if student_id:
            student_id = student_id.id
        else:
            return
    # When reprinting an old invoice, resolve the class the student was in
    # during the invoice's AY (LedgerPosting snapshot) instead of their
    # current class. For fresh payments this is the same — the AY matches now.
    academic_year_id = invoiceData.get("academic_year_id")
    if not academic_year_id:
        ay = invoiceData.get("academic_year")
        if ay is not None:
            academic_year_id = getattr(ay, "id", ay)
    invoiceDetails = invoiceData.get("details") or {}
    # Only fetch hostel rates for a receipt that actually has a hostel line on
    # it. That is both the cheap answer for the schools without the module and
    # the CORRECT one for a reprint years later — see getStudentDetailForInvoice.
    [student_name, guardian_name, class_info, transportation_fee, hostel_rates] = (
        getStudentDetailForInvoice(
            student_id,
            school_id,
            academic_year_id,
            want_hostel=any(t in invoiceDetails for t in HOSTEL_TITLES),
        )
    )
    className, class_details = class_info
    particulars = getBillDetailsFromInvoice(
        invoiceDetails, class_details, transportation_fee, hostel_rates
    )
    # The receipt is the only statement most guardians ever get, so a carried
    # forward balance should not be invisible just because this payment did not
    # touch it. Show it as its own line (nothing paid, the whole amount due).
    # Skipped when the invoice already carries an od/ob line — that is money
    # actually collected against old dues and is already in `particulars`.
    if not any(key in invoiceDetails for key in (OLD_DUES, OPENING_BALANCE)):
        outstandingOldDues = getOutstandingOldDues(
            student_id, academic_year_id, invoiceData.get("id"), invoiceDate
        )
        if outstandingOldDues > 0:
            particulars.insert(
                0,
                [
                    EXCEPTION_TITLES_ALTERNATIVES[OLD_DUES],
                    "",
                    Decimal(0),
                    outstandingOldDues,
                    Decimal(0),
                ],
            )
    #
    data = {}
    data["student_id"] = student_id
    data["invoice_id"] = invoiceId
    data["date"] = invoiceDate
    data["student_name"] = student_name
    data["guardian_name"] = guardian_name
    data["class"] = className
    data["payment_mode"] = (
        PAYMENT_MODES_MAPPING.get(invoiceData.get("mode") or "") or ""
    )
    data["payment_month"] = invoiceData.get("payment_month") or ""
    data["particulars"] = particulars
    data["total_paid"] = invoiceData.get("total_paid") or 0
    total_due = invoiceData.get("total_due") or 0
    data["total_due"] = total_due if total_due > 0 else 0
    data["total_discount"] = (
        invoiceData.get("total_discount") or 0
    )  # adding total_discount
    data["remarks"] = invoiceData.get("remarks")
    data["isCashReceipt"] = invoiceData.get("isCashReceipt")
    data.update(entryDetails(invoiceData))
    return data


def generateCashReceiptData(invoiceId, date, invoiceData):
    """
    for cash receipt;
    """
    data = {}
    data["invoice_id"] = invoiceId
    data["date"] = date
    extra_info = invoiceData.get("extra_info") or {}
    data["student_name"] = extra_info.get("name") or ""
    data["student_address"] = extra_info.get("address") or ""
    data["payment_mode"] = (
        PAYMENT_MODES_MAPPING.get(invoiceData.get("mode") or "") or ""
    )
    data["payment_month"] = invoiceData.get("payment_month") or ""
    data["particulars"] = invoiceData.get("details", [])
    data["total_paid"] = invoiceData.get("total_paid") or 0
    data["remarks"] = invoiceData.get("remarks")
    data["isCashReceipt"] = invoiceData.get("isCashReceipt")
    data.update(entryDetails(invoiceData))
    return data


def generateInvoiceDataById(invoiceId: int, studentId: int, schoolId: int) -> dict:
    q = Q(id=invoiceId, school=schoolId)
    if studentId:
        q &= Q(student=studentId, isCashReceipt=False)
    else:
        q &= Q(isCashReceipt=True)
    inv = StudentInvoice.objects.filter(q).first()
    if inv.isCashReceipt:
        return generateCashReceiptData(inv.invoice_id, inv.date, inv.__dict__)
    return generateInvoiceData(inv.invoice_id, inv.date, inv.__dict__, schoolId)


def getStaffInvoiceDetails(invoiceData):
    details = invoiceData.get("details") or {}
    if not details:
        total_paid = invoiceData.get("total_paid") or 0
        total_deduction = invoiceData.get("total_deduction") or 0
        pf_deduction = invoiceData.get("pf_deduction") or 0
        insurance_deduction = invoiceData.get("insurance_deduction") or 0
        extra_info = invoiceData.get("extra_info") or {}
        deduction_percentage = extra_info.get("tds_percent")
        # gross salary settled = net cash + every amount withheld from it
        details["salary"] = {
            "amt": total_paid + total_deduction + pf_deduction + insurance_deduction,
            "tdsp": deduction_percentage or "",
            "tdsa": total_deduction,
        }
    return details


def generateStaffInvoiceData(
    invoiceId: int, invoiceDate: datetime.date, invoiceData: dict, school_id: int
) -> dict:
    staff_id = invoiceData.get("staff_id")
    if not staff_id:
        staff_id = invoiceData.get("staff")
        if staff_id:
            staff_id = staff_id.id
        else:
            return
    [staff_name, designation] = getStaffDetailForInvoice(staff_id, school_id)
    data = {}
    data["staff_id"] = staff_id
    data["invoice_id"] = invoiceId
    data["date"] = invoiceDate
    data["staff_name"] = staff_name
    data["designation"] = designation
    data["payment_mode"] = (
        PAYMENT_MODES_MAPPING.get(invoiceData.get("mode") or "") or ""
    )
    data["payment_month"] = invoiceData.get("payment_month") or ""
    data["details"] = getStaffInvoiceDetails(invoiceData)
    data["total_paid"] = invoiceData.get("total_paid") or 0
    data["total_deduction"] = invoiceData.get("total_deduction") or 0
    data["pf_deduction"] = invoiceData.get("pf_deduction") or 0
    data["insurance_deduction"] = invoiceData.get("insurance_deduction") or 0
    # gross earnings = net cash paid + all withholdings (tds, pf, insurance)
    data["total"] = (
        data["total_paid"]
        + data["total_deduction"]
        + data["pf_deduction"]
        + data["insurance_deduction"]
    )
    data["remarks"] = invoiceData.get("remarks")
    # Who paid it and when, as on a student receipt: the slip was signed with
    # the name and designation of whoever happened to be reading it.
    data.update(
        auditOf(StaffInvoice, invoiceData.get("id"), invoiceData.get("is_active", True))
    )
    return data


def generateStaffInvoiceDataById(invoiceId: int, staffId: int, schoolId: int) -> dict:
    q = Q(id=invoiceId, school=schoolId, staff=staffId)
    inv = StaffInvoice.objects.filter(q).first()
    return generateStaffInvoiceData(inv.invoice_id, inv.date, inv.__dict__, schoolId)
