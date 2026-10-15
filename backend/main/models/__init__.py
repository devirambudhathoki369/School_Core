# Models defined in modules that aren't already pulled in transitively by
# existing view/serializer imports must be re-exported here so Django's app
# registry discovers them during makemigrations.
from .PendingStudentPhoto import PendingStudentPhoto  # noqa: F401
from .Notification import NotificationHistory  # noqa: F401
from .exams.SeatPlan import (  # noqa: F401
    SeatPlanRoom,
    SeatPlanRoomClass,
    SeatAllocation,
)
from .inventory.Inventory import (  # noqa: F401
    InventoryCategory,
    InventoryItem,
    InventoryTransaction,
)
from .superadmin.SplashNotice import SplashNotice  # noqa: F401
from .superadmin.SchoolEducationLevel import SchoolHiddenEducationLevel  # noqa: F401
from .superadmin.Shareholder import Shareholder  # noqa: F401
from .superadmin.DocumentStyle import DocumentStyle  # noqa: F401
from .superadmin.IDCardTemplate import IDCardTemplate  # noqa: F401
from .BirthdayTemplate import BirthdayTemplate  # noqa: F401
from .superadmin.HelpContent import (  # noqa: F401
    SupportInfo,
    GuideCategory,
    Guide,
)
from .superadmin.AppListing import SchoolAppListing  # noqa: F401
from .Batch import Batch  # noqa: F401
from .TaxInvoice import StudentTaxInvoice  # noqa: F401
from .SMSLog import SMSLog  # noqa: F401
from .PayrollClose import StaffPayrollClose  # noqa: F401
from .SchoolModule import Module, SchoolModule  # noqa: F401
