# Re-exported so Django's app registry discovers every model during
# makemigrations, the way extra_billing's and hostel's do.
from .Setup import CanteenCategory, CanteenClassRate, CanteenItem, CanteenSettings  # noqa: F401
from .Accounts import CanteenAccount, CanteenTransaction  # noqa: F401
from .Sales import CanteenSale, CanteenSaleLine  # noqa: F401
from .Plans import CanteenEnrollment, CanteenPlan, CanteenPlanCharge, CanteenPosting  # noqa: F401
from .Users import CanteenUser, CanteenUserToken  # noqa: F401
from .Lines import CanteenPostingPlan, CanteenTransactionLine, CanteenUserPage  # noqa: F401
