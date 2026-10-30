"""The canteen user's token, and the tenant boundary for it.

Only the /canteen endpoints list this authenticator (views/BaseViews.CANTEEN_AUTH),
so a canteen user's token opens nothing else in the product: every other view
looks the key up in its own token tables, finds nothing, and refuses it.
"""

from account.auth.Authentication import BaseTokenAuthentication
from account.auth.UserRole import UserRoles

from .models import CanteenUserToken


class CanteenUserTokenAuthentication(BaseTokenAuthentication):
    model = CanteenUserToken
    role = UserRoles.ROLE_CANTEEN
    # Read the school a request names, so `belongs_to_school` can hold the
    # account to its own one — the same boundary staff and admins have.
    SchoolValidationRequiredRoles = BaseTokenAuthentication.SchoolValidationRequiredRoles + (
        UserRoles.ROLE_CANTEEN,
    )

    def belongs_to_school(self, user, school_id):
        try:
            school_id = int(school_id)
        except (TypeError, ValueError):
            # Not a number: the view's own filter refuses it.
            return True
        return user.school_id == school_id
