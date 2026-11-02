"""A person's canteen profile.

  GET /canteen/profile ?school=&q=  or  &card=         find them
  GET /canteen/profile ?school=&buyer_type=&buyer=     the whole page

Read-only, and the page's own permission (PAGE_PROFILE). See methods/profile.py.
"""

from rest_framework.response import Response

from ..constants import BUYER_STAFF, BUYER_STUDENT, PAGE_ACCOUNTS, PAGE_PROFILE
from ..methods.profile import find_people, profile_of
from ..methods.settings import settings_for
from .BaseViews import CanteenBaseView


class CanteenProfileView(CanteenBaseView):
    pages_for = {"GET": (PAGE_PROFILE,)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        params = request.query_params
        settings = settings_for(school_id)
        today = self.today()
        buyer = self.int_or_none(params.get("buyer"))
        if not buyer:
            return Response({
                "people": find_people(
                    school_id, settings, today,
                    q=(params.get("q") or "").strip(), card=(params.get("card") or "").strip(),
                )
            })
        buyer_type = self.int_or_none(params.get("buyer_type")) or BUYER_STUDENT
        if buyer_type not in (BUYER_STUDENT, BUYER_STAFF):
            return self.RESPONSE__INVALID_REQUEST
        data = profile_of(school_id, settings, today, buyer_type, buyer)
        if not data:
            return self.RESPONSE__NOT_FOUND
        # The family's number stays with whoever holds Card Accounts, as it does
        # at every other buyer lookup in this module.
        if PAGE_ACCOUNTS not in self.pages_held(request, school_id):
            data["contact"] = None
        return Response(data)
