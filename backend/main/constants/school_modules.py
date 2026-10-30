"""
The facilities (modules) a superadmin gives a school, and the API views each
one owns.

A MODULE is a whole branch of the product a school has or has not been given
(Setup > School/Admin, when the school is added or edited). A staff PERMISSION
is a different question -- what one member of staff may do inside a branch
their school already has (constants/staff_permissions.py). The two stay
separate mechanisms: a school gets a facility from its provider, never by
ticking a box on one of its own staff.

STORAGE (main/models/SchoolModule.py):

    SchoolAdmin 1 ──── 0..* SchoolModule 0..* ──── 1 Module

main.Module is the catalog of the modules below, kept in step with MODULES on
every `migrate`; main.SchoolModule is each school's grant of one. The API
speaks `uses_<module>` booleans (FLAG below) -- the names the frontend, the
access pages and the apps already read; the grants are the only truth.

ENFORCEMENT. Hiding the menu is decoration -- a page is still one URL away. The
server refuses every view in MODULE_VIEWS to a school without that module
(SecuredAPIView.enforce_school_modules). The frontend mirrors the same flags in
configs/moduleGates.js. Keep the two in step.

ADDING A MODULE: a line in MODULES and its views in MODULE_VIEWS; `migrate`
adds it to the catalog. If existing schools are to have it, write a data
migration that creates its catalog row (get_or_create -- post_migrate runs
after it) and grants it to them; a new school gets it by DEFAULT_ON.
"""

from functools import lru_cache

# code (stored), flag (API), label, ON for a new school unless chosen otherwise
MODULES = (
    ("exams", "uses_exams", "Exams & results", True),
    ("payroll", "uses_payroll", "Payroll", True),
    ("accounting", "uses_accounting", "Accounting", True),
    ("library", "uses_library", "Library", True),
    ("inventory", "uses_inventory", "Inventory", True),
    # sold separately: off until the provider switches them on
    ("hostel", "uses_hostel", "Hostel", False),
    ("extra_billing", "uses_extra_billing", "Extra billing", False),
    ("canteen", "uses_canteen", "Canteen", False),
)

MODULE_CODES = tuple(code for code, _, _, _ in MODULES)
FLAG = {code: flag for code, flag, _, _ in MODULES}
CODE_OF_FLAG = {flag: code for code, flag, _, _ in MODULES}
LABEL = {code: label for code, _, label, _ in MODULES}
DEFAULT_ON = frozenset(code for code, _, _, on in MODULES if on)

# The views each module owns, by dotted path prefix ("<module>.<qualname>",
# the same key constants/staff_permissions.py uses). A prefix ending in "."
# takes the whole package, so a view added there later is gated with it.
#
# Chosen from the screens' own calls (tools/staff_permissions): every view
# here is called only by its own module's screens. Shared reads -- courses,
# sections, subjects, staff -- are every school's and are not listed.
#
# Hostel, extra billing and the canteen are not here: every view of theirs
# already calls its own gate first (hostel/views/BaseViews.py, extra_billing/
# views/BaseViews.py, canteen/views/BaseViews.py), which reads this same table.
MODULE_VIEWS = {
    "exams": (
        "main.views.exams.",
        # the character certificate list (Exam and result > Character Certificate)
        "main.views.search.CertificateSearchView.",
    ),
    "payroll": (
        "main.views.InvoiceViewsStaff.",
        "main.views.LedgerViewsStaff.",
        # NOT main.views.closing.PayrollYearCloseView: a read-only preview the
        # ACCOUNTING year-close screen shows, which a school keeping its books
        # here needs whether or not it runs payroll here.
    ),
    "accounting": ("accounting.views.",),
    "library": ("library.views.",),
    "inventory": ("main.views.inventory.",),
}

# Inside a module's package, but needed by every school.
OPEN_VIEWS = frozenset(
    {
        # The accounting years load on every sign-in for the header's year
        # picker (contexts/AppContext.jsx), and the superadmin sets them per
        # school (Setup > School Academic/Accounting Years).
        "accounting.views.AccountingEconomicYearView.AccountingEconomicYearView",
    }
)


@lru_cache(maxsize=None)
def module_for_view(view):
    """The module code `view` ("<module>.<qualname>") needs, or None."""
    if view in OPEN_VIEWS:
        return None
    for code, prefixes in MODULE_VIEWS.items():
        if view.startswith(prefixes):
            return code
    return None
