"""People who sign in to the canteen, and to nothing else.

    CanteenUser         a sign-in of its own at /canteen: a counter hand, the
                        canteen's manager, a contractor's cashier
      CanteenUserToken    one per signed-in device

WHY NOT A MEMBER OF STAFF
-------------------------
The people behind a canteen counter are often not the school's staff at all —
a contractor's cashier, a cook who also takes the money. Making them staff
would put them in the staff list, the payroll, the attendance register and the
staff app, and a staff token opens every page of the school a permission is
ticked for. A canteen user is none of those things: its token is accepted by
the /canteen endpoints alone (canteen/auth.py), every other endpoint of the
product refuses it, and its pages are the canteen's pages it was given
(`permissions`, the same numbers a member of staff's page list uses).

The school admin adds them at Canteen > Canteen Users; so may anyone holding
that page, but only with pages they hold themselves (views/UserViews.py).

Switching a user off keeps the row: their sales and receipts name them, and
the name on a slip must still mean someone. Their sessions end at once.
"""

from django.db.models import CASCADE, BooleanField, ForeignKey, JSONField

from account.auth.AuthToken import AuthToken
from account.models import BaseAccount
from main.models.BaseModel import CustomCharField, _allow_empty


class CanteenUser(BaseAccount):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_users")
    full_name = CustomCharField(min_length=2, max_length=60)
    contact = CustomCharField(min_length=1, max_length=20, **_allow_empty)
    # The canteen pages this person may open: constants.PAGE_* numbers.
    permissions = JSONField(default=list)
    # Off = cannot sign in, and every session already open is refused by the
    # authenticator on its next request (it reads `is_active`).
    is_active = BooleanField(default=True)
    # Who added them, as their name read then.
    created_by = CustomCharField(min_length=1, max_length=80, **_allow_empty)

    def __str__(self):
        return f"{self.school_id} > canteen user {self.username}"


class CanteenUserToken(AuthToken):
    user = ForeignKey("canteen.CanteenUser", on_delete=CASCADE, related_name="tokens")
