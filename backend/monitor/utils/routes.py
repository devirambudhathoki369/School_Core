"""The API's own map, read from the URLconf, for the server's front page.

Nothing here is hand-kept: every route the page lists is one Django would
actually resolve, grouped under the service it is mounted in.
"""

import re

from django.urls import URLPattern, URLResolver, get_resolver

# Each service the server mounts, in the order a reader meets them, with the
# one line that says what it is for. A mount missing here is still listed,
# under its own path.
SERVICES = {
    "auth/": ("Accounts and sign-in", "Sign-in, sessions and passwords for every role."),
    "api/mobile/v1/": ("Mobile app", "The SchoolCore app's own API: sign-in for parents, students, staff and admins."),
    "api/": ("School", "Students, staff, classes, fees, exams, attendance and reports."),
    "accounting/": ("Accounting", "Ledgers, vouchers and the financial statements."),
    "library/": ("Library", "Books, issues, returns and fines."),
    "hostel/": ("Hostel", "Rooms, residents, the mess, leave and visitors."),
    "extra-billing/": ("Extra billing", "Bills for tenants and others who are not students."),
    "canteen/": ("Canteen", "The counter, card accounts and monthly posting."),
    "rfid/": ("RFID", "Card users, registered readers and their logs."),
    "iclock/": ("Attendance readers", "Where the biometric and RFID devices send their punches."),
}
# Mounted for the people who run the server, not for the portal.
TOOLS = ("admin/", "__debug__/", "__live_usage__/")

METHODS = ("get", "post", "put", "patch", "delete")
_PARAM = re.compile(r"(<[^>]+>|\(\?P<[^>]+>[^)]*\))")


def _methods(callback):
    """The HTTP methods a route answers, or [] when the view does not say."""
    actions = getattr(callback, "actions", None)  # a DRF viewset route
    if actions:
        return [m.upper() for m in METHODS if m in actions]
    cls = getattr(callback, "view_class", None) or getattr(callback, "cls", None)
    if cls is None:
        return []
    allowed = getattr(cls, "http_method_names", METHODS)
    return [m.upper() for m in METHODS if m in allowed and callable(getattr(cls, m, None))]


def _parts(path):
    """A path split into plain text and its <parameters>, for drawing."""
    return [{"text": bit, "param": bool(_PARAM.fullmatch(bit))} for bit in _PARAM.split(path) if bit]


def _walk(patterns, prefix=""):
    """Every route under `patterns`, skipping a bare mount that only repeats
    its own "v1/" (the API answers at /api/ and /api/v1/ alike)."""
    by_conf = {}
    for p in patterns:
        if isinstance(p, URLResolver):
            by_conf.setdefault(str(p.urlconf_name), []).append(str(p.pattern))
    for p in patterns:
        if isinstance(p, URLResolver):
            here = str(p.pattern)
            if here == "" and "v1/" in by_conf.get(str(p.urlconf_name), []):
                continue
            yield from _walk(p.url_patterns, prefix + here)
        elif isinstance(p, URLPattern):
            yield prefix + str(p.pattern), p


def api_map():
    """The services, each with its versions and routes, plus the route count."""
    services, extra = {}, []
    for top in get_resolver().url_patterns:
        mount = str(top.pattern)
        if mount in TOOLS or mount.startswith("^"):  # tools, and the media route
            continue
        if not isinstance(top, URLResolver):
            continue
        routes, versions = [], set()
        for path, pattern in _walk(top.url_patterns):
            version = re.match(r"(v\d+)/", path)
            if version:
                versions.add(version.group(1))
            routes.append({
                "path": "/" + mount + path,
                "parts": _parts("/" + mount + path),
                "name": pattern.name or "",
                "methods": _methods(pattern.callback),
            })
        if not routes:
            continue
        title, line = SERVICES.get(mount, (mount.strip("/").replace("-", " ").capitalize(), ""))
        entry = {
            "mount": "/" + mount,
            "slug": mount.strip("/") or "root",
            "title": title,
            "line": line,
            "versions": sorted(versions),
            "routes": routes,
        }
        if mount in SERVICES:
            services[mount] = entry
        else:
            extra.append(entry)
    ordered = [services[m] for m in SERVICES if m in services] + extra
    return ordered, sum(len(s["routes"]) for s in ordered)
