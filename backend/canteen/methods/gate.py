"""Does this school have the canteen module?

Lives apart from the views so anything outside them (the canteen user's
sign-in, its profile) can ask without importing a view of this app.
"""

from main.methods.schoolModules import school_has_module


def school_has_canteen(school_id):
    # One lookup on SchoolModule's unique index -- no cache, so a switch by the
    # superadmin applies on the very next request (main/methods/schoolModules.py).
    return school_has_module(school_id, "canteen", active_school=True)
