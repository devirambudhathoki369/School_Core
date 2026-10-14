"""Tax invoice numbering.

  POST /api/tax_invoice   {school, source_key, student?, date?}  -> {invoice_id}

Called when a tax invoice is printed. The first call for a posting mints the
next serial number for the school's current fiscal year and stores it; every
later call for the same posting returns the number already stored, so reprints
match the paper already issued. See StudentTaxInvoice for the numbering rules.
"""

from rest_framework.response import Response
from rest_framework import status
from django.db import transaction, IntegrityError

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from .BaseViews import SecuredAPIView
from ..models.TaxInvoice import StudentTaxInvoice
from ..models.FiscalYears import EconomicYear
from ..methods.nepaliDatetime import ndt_today

# Two cashiers can hit "print" at the same instant. The unique constraint makes
# the loser fail rather than duplicate, so retry a couple of times to pick up
# the next free number instead of showing an error.
MAX_MINT_ATTEMPTS = 5


class TaxInvoiceView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        source_key = (request.data.get("source_key") or "").strip()
        student_id = request.data.get("student") or None
        date = request.data.get("date") or ndt_today()
        if not school_id or not source_key:
            return self.RESPONSE__INVALID_REQUEST

        existing = StudentTaxInvoice.objects.filter(
            school_id=school_id, source_key=source_key
        ).first()
        if existing:
            return Response({"invoice_id": existing.invoice_id, "date": existing.date})

        economic_year = (
            EconomicYear.objects.filter(closed=False).order_by("-id").first()
        )
        if not economic_year:
            return self.RESPONSE__INVALID_REQUEST

        for _ in range(MAX_MINT_ATTEMPTS):
            try:
                with transaction.atomic():
                    invoice_id = self._next_number(school_id, economic_year.id)
                    created = StudentTaxInvoice.objects.create(
                        invoice_id=invoice_id,
                        school_id=school_id,
                        economic_year_id=economic_year.id,
                        student_id=student_id,
                        source_key=source_key,
                        date=date,
                    )
                return Response({"invoice_id": created.invoice_id, "date": created.date})
            except IntegrityError:
                # Either another print won the number (retry for the next one)
                # or it beat us to this same posting (return what it stored).
                existing = StudentTaxInvoice.objects.filter(
                    school_id=school_id, source_key=source_key
                ).first()
                if existing:
                    return Response(
                        {"invoice_id": existing.invoice_id, "date": existing.date}
                    )
        return Response(
            {"message": "Could not issue a tax invoice number, please retry."},
            status=status.HTTP_409_CONFLICT,
        )

    def _next_number(self, school_id, economic_year_id):
        # Same rule as the receipt number: max+1 within the fiscal year,
        # restarting at 1 when the fiscal year rolls over. select_for_update
        # serialises concurrent printers against existing rows; the unique
        # constraint covers the first-row-of-the-year case.
        prev = (
            StudentTaxInvoice.objects.select_for_update()
            .filter(school_id=school_id, economic_year_id=economic_year_id)
            .values("invoice_id")
            .order_by("-invoice_id")
            .first()
        )
        return (prev.get("invoice_id") + 1) if prev else 1
