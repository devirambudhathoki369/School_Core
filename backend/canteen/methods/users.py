"""Canteen users: who may sign in, which pages they hold, and the profile the
portal is drawn from."""

from main.models.SchoolAdmin import SchoolAdmin

from ..constants import PAGES
from .gate import school_has_canteen


def clean_pages(values):
    """The canteen page numbers in `values`, in the menu's order, each once.
    Anything else — another module's permission, a typo — is dropped."""
    held = set()
    for value in values if isinstance(values, (list, tuple, set)) else ():
        try:
            held.add(int(value))
        except (TypeError, ValueError):
            continue
    return [page for page in PAGES if page in held]


def refusal(user):
    """Why this canteen user may not be signed in now, or None.

    Asked at sign-in and whenever the portal checks the session, so switching
    a user off — or the superadmin switching the school's canteen off — ends
    their sessions rather than leaving a portal open whose every request fails.
    """
    if not getattr(user, "is_active", False):
        return "This sign-in has been switched off. Ask the school's office."
    # The gate asks for an active school too: an inactive one has no canteen.
    if not school_has_canteen(user.school_id):
        return "The canteen is not enabled for this school."
    return None


# The school's own details a canteen page prints or shows: the slip, the office
# receipt, the bills, the header. Named the way a member of staff's profile
# names them (account/methods/getStaffProfile.py), so every page that already
# reads `school_name`/`school_logo` works for a canteen user unchanged.
SCHOOL_FIELDS = {
    "school_name": "name",
    "school_address": "address",
    "school_contact": "contact",
    "school_telephone": "telephone",
    "school_estd_date": "estd_date",
    "school_pan_no": "pan_no",
    "school_email": "email",
    "school_logo": "logo",
    "school_award_logo": "award_logo",
    "school_slogan": "slogan",
    "ui_theme": "ui_theme",
    "renew_date": "renew_date",
    "economic_year": "economic_year",
    "economic_year__name": "economic_year__name",
}


def canteen_user_profile(user):
    school = (
        SchoolAdmin.objects.filter(id=user.school_id).values(*SCHOOL_FIELDS.values()).first() or {}
    )
    profile = {key: school.get(field) for key, field in SCHOOL_FIELDS.items()}
    profile.update({
        # the flag the portal draws the canteen from (configs/moduleGates.js);
        # only this one -- the rest of the school's modules are not theirs
        "uses_canteen": school_has_canteen(user.school_id),
        "id": user.id,
        "school": user.school_id,
        "school_id": user.school_id,
        "name": user.full_name,
        "designation": "Canteen",
        "primary_contact": user.contact,
        "location": school.get("address"),
        "permissions": clean_pages(user.permissions),
    })
    return profile
