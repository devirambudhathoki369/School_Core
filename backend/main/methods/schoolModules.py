"""Reading and writing which modules (facilities) a school has.

main.SchoolModule is the only truth; everything goes through here. The API
speaks the `uses_<module>` flags (constants/school_modules.FLAG) that the
frontend, the access pages and the apps already read.

Not cached: each answer is one lookup on the table's unique (school, module)
index -- as cheap as a cache round trip -- and a switch then applies on the
very next request, in every worker, with nothing to invalidate.
"""

from django.db import transaction

from ..constants.school_modules import FLAG, MODULE_CODES
from ..models.SchoolAdmin import SchoolAdmin
from ..models.SchoolModule import SchoolModule

# The two modules that still have a column on the school, kept one release as
# a mirror for code of the previous release (see SchoolAdmin.uses_hostel).
_MIRRORED = ("hostel", "extra_billing")


def granted_modules(school_ids):
    """{school_id: {codes the school has}} for each of `school_ids`."""
    granted = {school_id: set() for school_id in school_ids}
    rows = SchoolModule.objects.filter(school_id__in=list(granted), is_active=True)
    for school_id, code in rows.values_list("school_id", "module_id"):
        granted[school_id].add(code)
    return granted


def schools_without(school_ids, code):
    """Those of `school_ids` that do not have the module `code`."""
    school_ids = set(school_ids)
    have = SchoolModule.objects.filter(
        school_id__in=school_ids, module_id=code, is_active=True
    ).values_list("school_id", flat=True)
    return school_ids - set(have)


def school_has_module(school_id, code, active_school=False):
    """Does the school have the module? `active_school` also asks that the
    school itself is not switched off (what the hostel and extra-billing gates
    have always required)."""
    try:
        school_id = int(school_id)
    except (TypeError, ValueError):
        return False
    rows = SchoolModule.objects.filter(school_id=school_id, module_id=code, is_active=True)
    if active_school:
        rows = rows.filter(school__is_active=True)
    return rows.exists()


def flags_of(codes):
    """{"uses_exams": bool, ...} for every module, from the codes granted."""
    return {FLAG[code]: code in codes for code in MODULE_CODES}


def module_flags(school_id):
    return flags_of(granted_modules([school_id])[school_id] if school_id else ())


def with_module_flags(profile, school_id):
    """The sign-in profile, told which of the school's modules to draw."""
    if isinstance(profile, dict):
        profile.update(module_flags(school_id))
    return profile


@transaction.atomic
def set_school_modules(school, chosen):
    """Give and take away modules: `chosen` is {code: bool}; a module it does
    not name is left as it is. Each switch is a save, so HistoryLog records it.
    Nothing in a module is deleted by switching it off."""
    for code, on in chosen.items():
        if code not in FLAG:
            raise ValueError(f"Unknown module: {code!r}")
        if on:
            row, created = SchoolModule.objects.get_or_create(school_id=school.pk, module_id=code)
            if not created and not row.is_active:
                row.is_active = True
                row.save(update_fields=["is_active", "updated_at"])
        else:
            for row in SchoolModule.objects.select_for_update().filter(
                school_id=school.pk, module_id=code, is_active=True
            ):
                row.is_active = False
                row.save(update_fields=["is_active", "updated_at"])
    mirror = {FLAG[code]: bool(chosen[code]) for code in _MIRRORED if code in chosen}
    if mirror:
        # a plain UPDATE: the mirror is not a record anyone reads, so not audited
        SchoolAdmin.objects.filter(pk=school.pk).update(**mirror)
