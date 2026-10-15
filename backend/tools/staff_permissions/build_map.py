"""
Write main/constants/staff_permissions.py from a frontend trace.

    cd backend
    node tools/staff_permissions/trace_frontend.js ../frontend /tmp/trace.json
    python tools/staff_permissions/build_map.py /tmp/trace.json

Each view a staff token can reach gets, per HTTP method, the staff permission
ids whose screens make that call, "any" when every staff session makes it, or
an empty list when no staff screen does (admins only). Re-run it when screens,
menus or their API calls change, and review the diff.
"""
import os
import pprint
import sys
from collections import defaultdict
from pathlib import Path

import json

BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

import django  # noqa: E402

django.setup()

from django.urls import Resolver404, URLPattern, URLResolver, get_resolver, resolve  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from account.auth.Authentication import StaffTokenAuthentication  # noqa: E402

ANY = "any"
OUT = BACKEND / "main" / "constants" / "staff_permissions.py"

# URLs the trace cannot see: passed down as JSX props or computed from state.
ENTRY_API = {
    "income": "/accounting/income_entry",
    "expense": "/accounting/expense_entry",
    "journal": "/accounting/journal_entry",
    "contra": "/accounting/contra_entry",
}
DYNAMIC_URLS = {
    "components/views/accounting/RecentEntriesView.jsx": lambda screen: [
        api for kind, api in ENTRY_API.items() if f".{kind}-entr" in screen
    ],
    "components/views/accounting/reports/ledger_reports/VoucherDetailModal.jsx":
        lambda screen: list(ENTRY_API.values()),
    "components/views/enrollments/bulk/student_update/index.jsx": lambda screen: [
        "/api/students", "/api/students/transportations",
    ],
}
# A staff member's own account, and modules with no permission of their own
# (homework is every teacher's): reached from the mobile app and the account
# menu rather than from a permission-gated screen.
SELF_SERVICE = {
    "account.views.ProfileView": ("get",),
    "account.views.DeviceTokenView": ("post",),
    "account.views.AccountDeletionView": ("post",),
    "account.views.PasswordChangeView": ("put",),
    "main.views.notifications.MyNotificationsView.MyNotificationsView": ("get",),
    "main.views.MyAttendanceView.MyAttendanceReportView": ("post",),
    "main.views.alerts.BusAlertViews.BusAlertSettingsPostView": ("post",),
    "main.views.HomeworkViews.HomeworkView": ("get", "post", "put", "delete"),
    "main.views.HomeworkViews.HomeworkSubmissionView": ("get", "post", "put", "delete"),
    "main.views.CalendarEventViews.CalendarEventView": ("get",),
}
# Reachable from a screen staff can open, but offered there to admins only
# (the trace sees the call, not the role check around it).
ADMIN_ONLY = {
    "main.views.school.SchoolsView.SchoolsView": ("put",),
    # StaffProfile's context defines it; only Manage > Users (admin) uses it
    "account.views.StaffRegistrationView": ("post",),
}


def view_of(url):
    url = "/" + url.split("?")[0].lstrip("/")
    for fill in ("1", "staff"):
        try:
            match = resolve(url.replace("{}", fill))
        except Resolver404:
            continue
        cls = getattr(match.func, "cls", None) or getattr(match.func, "view_class", None)
        if cls is not None:
            return f"{cls.__module__}.{cls.__qualname__}"
        return f"{match.func.__module__}.{match.func.__name__}"
    return None


def screen_calls(screen, calls):
    for call in calls:
        method, _, url = call.partition(" ")
        if url.startswith("?"):
            for dynamic in DYNAMIC_URLS.get(url[1:], lambda s: [])(screen):
                yield method, dynamic
        else:
            yield method, url


def staff_views():
    def walk(patterns):
        for p in patterns:
            if isinstance(p, URLResolver):
                yield from walk(p.url_patterns)
            elif isinstance(p, URLPattern):
                yield p.callback

    views = {}
    for callback in walk(get_resolver().url_patterns):
        cls = getattr(callback, "cls", None)
        if cls and issubclass(cls, APIView) and StaffTokenAuthentication in (
            cls.authentication_classes or ()
        ):
            views[f"{cls.__module__}.{cls.__qualname__}"] = [
                m for m in ("get", "post", "put", "patch", "delete") if hasattr(cls, m)
            ]
    return views


def main(trace_path):
    trace = json.load(open(trace_path))
    rules = defaultdict(lambda: defaultdict(set))
    unresolved = set()

    def grant(method, url, who):
        view = view_of(url)
        if view is None:
            unresolved.add(f"{method} {url}")
        else:
            rules[view][method.lower()].add(who)

    for call in trace["global"]:
        method, _, url = call.partition(" ")
        if not url.startswith("?"):
            grant(method, url, ANY)
    for screen, access in trace["viewAccess"].items():
        for method, url in screen_calls(screen, trace["screens"].get(screen, [])):
            for who in access:
                grant(method, url, ANY if who == "ALL" else who)

    table = {}
    for view, methods in sorted(staff_views().items()):
        row = {}
        for m in methods:
            who = set(rules.get(view, {}).get(m, ()))
            if m in SELF_SERVICE.get(view, ()):
                who = {ANY}
            if m in ADMIN_ONLY.get(view, ()):
                who = set()
            row[m] = ANY if ANY in who else tuple(sorted(who))
        table[view] = row

    body = pprint.pformat(table, width=88, sort_dicts=True)
    OUT.write_text(
        '"""\n'
        "The staff permissions each endpoint needs, per HTTP method.\n\n"
        "GENERATED by tools/staff_permissions/build_map.py from the frontend's menus\n"
        "and the API calls their screens make -- edit those, or the overrides in\n"
        "build_map.py, and re-run it; do not hand-edit this table.\n\n"
        "A staff token passes when it holds ANY of the listed ids. ANY_STAFF: every\n"
        "staff session makes the call. An empty tuple: no staff screen makes it,\n"
        "so it is the school admin's alone. See SecuredAPIView.enforce_staff_permissions.\n"
        '"""\n\n'
        f"ANY_STAFF = {ANY!r}\n\n"
        f"STAFF_PERMISSIONS = {body}\n"
    )
    print(f"wrote {OUT.relative_to(BACKEND)}: {len(table)} views")
    if unresolved:
        print("calls that resolve to no backend route:", *sorted(unresolved), sep="\n  ")


if __name__ == "__main__":
    main(sys.argv[1])
