from django.db.models import Q
from django.db import transaction
from django.utils import timezone

from rest_framework.response import Response
from account.auth.Authentication import SuperAdminTokenAuthentication

from ..BaseViews import SecuredAPIView
from ...models.Ledger import LedgerPosting, StudentLedger


class LedgerManageView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def put(self, request):
        school_id = request.data.get("school")
        class_info_id = request.data.get("class_info")
        academic_year_id = request.data.get("academic_year")
        posting_ids = request.data.get("posting_ids")
        remarks = request.data.get("remarks")
        updated_at = timezone.now()

        if school_id and class_info_id and academic_year_id and posting_ids:
            base_q = Q(
                is_active=True,
                academic_year=academic_year_id,
            )
            postings_q = base_q & Q(class_info=class_info_id, id__in=posting_ids)
            ledgers_q = base_q & Q(
                school=school_id,
                ledger_posting__in=posting_ids,
            )
            with transaction.atomic():
                postings = LedgerPosting.objects.filter(postings_q)
                if postings.exists():
                    StudentLedger.objects.filter(ledgers_q).delete()
                    #
                    postings.update(
                        is_active=False,
                        updated_at=updated_at,
                        remarks=remarks,
                    )
                    return Response({"message": "Postings deleted!"})
                else:
                    return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST
