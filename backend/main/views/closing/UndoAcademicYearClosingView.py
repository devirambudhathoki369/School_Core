from django.db import transaction
from django.db.models import Q, F
from django.contrib.postgres.aggregates import ArrayAgg

#
from rest_framework.response import Response
from account.auth.Authentication import SuperAdminTokenAuthentication

#
from ..BaseViews import SecuredAPIView
from ...models.FiscalYears import AcademicYear, AcademicYearMapping
from ...models.Ledger import LedgerPosting, StudentLedger
from ...models.Invoice import StudentInvoice
from ...constants.payment import OPENING_BALANCE
from .AcademicYearCloseView import AcademicYearClassSearchMixin


class UndoAcademicYearClosingView(SecuredAPIView, AcademicYearClassSearchMixin):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            closed_years = (
                AcademicYearMapping.objects.filter(
                    school=school_id,
                )
                .values("academic_year")
                .annotate(
                    keys=ArrayAgg("key"),
                )
                .values(
                    "academic_year",
                    "keys",
                )
            )
            ids = {yr.get("academic_year") for yr in closed_years}
            mappings = (
                AcademicYearMapping.objects.filter(
                    academic_year__in=ids,
                    previous_academic_year__closed=True,
                )
                .distinct("academic_year")
                .annotate(
                    academic_year_name=F("academic_year__name"),
                    previous_academic_year_name=F("previous_academic_year__name"),
                )
                .values(
                    "academic_year",
                    "previous_academic_year",
                    "academic_year_name",
                    "previous_academic_year_name",
                )
            )
            mappings = {_map.get("academic_year"): _map for _map in mappings}
            # merging
            closed_years = [
                {
                    **yr,
                    **academic_info,
                }
                for yr in closed_years
                if (academic_info := mappings.get(yr.get("academic_year")))
            ]
            return Response(closed_years)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        school_id = request.data.pop("school")
        current_academic_year_id = request.data.pop("academic_year")
        previous_academic_year_id = request.data.pop("previous_academic_year")
        classes_key_details = request.data.get("classes")
        if school_id and current_academic_year_id and previous_academic_year_id:
            with transaction.atomic():
                mapping = AcademicYearMapping.objects.filter(
                    academic_year=current_academic_year_id,
                    previous_academic_year=previous_academic_year_id,
                    school=school_id,
                ).values("academic_year")
                if mapping.exists():
                    # ----- SAFETY: refuse to undo once the new academic year
                    # has real activity. Undo HARD-DELETES every ledger in the
                    # new year and the year itself; if billing/payments have
                    # happened since the close, that would destroy real records
                    # and orphan new-year invoices. The only ledgers a close
                    # legitimately creates are opening balances (details has the
                    # OPENING_BALANCE key) — anything beyond that is post-close
                    # activity that must block the undo.
                    has_invoices = StudentInvoice.objects.filter(
                        academic_year=current_academic_year_id, is_active=True
                    ).exists()
                    has_real_ledgers = (
                        StudentLedger.objects.filter(
                            academic_year=current_academic_year_id, is_active=True
                        )
                        .exclude(details__has_key=OPENING_BALANCE)
                        .exists()
                    )
                    if has_invoices or has_real_ledgers:
                        return Response(
                            {
                                "message": (
                                    "Undo blocked: the new academic year already "
                                    "has activity (invoices or ledger entries "
                                    "beyond opening balances). Undoing now would "
                                    "delete real financial records."
                                )
                            },
                            status=409,
                        )
                    # print(current_academic_year_id, previous_academic_year_id)
                    # ----- delete all new sudent-ledgers.
                    ledgers_query = Q(academic_year=current_academic_year_id)
                    StudentLedger.objects.filter(ledgers_query).delete()
                    # ----- delete all new class-ledgers.
                    LedgerPosting.objects.filter(ledgers_query).delete()
                    # ----- update mapping's academic year to previous!
                    mapping.update(
                        academic_year=previous_academic_year_id,
                        previous_academic_year=None,
                    )
                    # ----- update classes' academic year to previous!
                    class_info_keys, classes_query = self.handleKeyDetails(
                        classes_key_details
                    )
                    classes = self.getClasses(school_id, classes_query)
                    classes.update(academic_year=previous_academic_year_id)
                    # ----- delete new academic year
                    AcademicYear.objects.filter(id=current_academic_year_id).delete()
                    # ----- reactivate old academic year
                    AcademicYear.objects.filter(id=previous_academic_year_id).update(
                        closed=False
                    )
                    #
                    # transaction.set_rollback(True)
                    return Response({"message": "Undo academic year close succeed!"})
        return self.RESPONSE__INVALID_REQUEST
