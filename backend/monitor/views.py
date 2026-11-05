import os
import platform
import time
from zoneinfo import ZoneInfo

import django
from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.db import connection
from django.http import JsonResponse
from django.template.response import TemplateResponse
from django.utils.timezone import now
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from monitor.utils.media_folders import (
    BASE_DIR,
    get_custom_folders_usage_summary,
    get_media_folders_usage_summary,
)
from monitor.utils.routes import api_map
from monitor.utils.system import get_system_info, is_process_running


CUSTOM_FOLDER_PATHS = [
    # {"name": "", "path": str(BASE_DIR / "")},
]
SERVICES = ["gunicorn", "postgresql"]
NEPAL = ZoneInfo("Asia/Kathmandu")


def _database():
    """Whether the database answers, and how fast."""
    try:
        started = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return {"ok": True, "ms": round((time.perf_counter() - started) * 1000, 1)}
    except Exception:  # the page must still render to say so
        return {"ok": False, "ms": None}


def _pending_migrations():
    """How many migrations the database is behind the code, or None."""
    try:
        from django.db.migrations.executor import MigrationExecutor

        executor = MigrationExecutor(connection)
        return len(executor.migration_plan(executor.loader.graph.leaf_nodes()))
    except Exception:
        return None


def _portal_url():
    """Where people sign in: PORTAL_URL, else the first origin CORS trusts."""
    url = os.environ.get("PORTAL_URL", "").strip()
    if url:
        return url
    origins = list(getattr(settings, "CORS_ALLOWED_ORIGINS", ()) or ())
    return origins[0] if origins else ""


@require_safe
@never_cache
def server_home(request):
    """The page at the server's root.

    Anyone sees that the API is up and where the portal is. The map of every
    route, the database's name and the software versions show only on a
    development server or to staff signed in to the admin, so a production
    server tells a stranger nothing it does not need to.
    """
    database = _database()
    status = "ok" if database["ok"] else "degraded"

    wants_json = request.GET.get("format") == "json" or (
        "application/json" in request.headers.get("Accept", "")
        and "text/html" not in request.headers.get("Accept", "")
    )
    if wants_json:
        return JsonResponse(
            {"service": "SchoolCore API", "status": status, "database": "ok" if database["ok"] else "unreachable"},
            status=200 if database["ok"] else 503,
        )

    detailed = settings.DEBUG or (request.user.is_authenticated and request.user.is_staff)
    context = {
        "status": status,
        "database": database,
        "portal_url": _portal_url(),
        "debug": settings.DEBUG,
        "detailed": detailed,
        "is_staff": request.user.is_authenticated and request.user.is_staff,
        "now_local": now().astimezone(NEPAL),
        "host": request.get_host(),
        "page": "home",
    }
    if detailed:
        services, route_count = api_map()
        db = settings.DATABASES["default"]
        context.update(
            {
                "services": services,
                "route_count": route_count,
                "pending_migrations": _pending_migrations(),
                "db_vendor": connection.display_name,
                "db_name": db.get("NAME"),
                "versions": {
                    "django": django.get_version(),
                    "python": platform.python_version(),
                },
            }
        )
    return TemplateResponse(request, "server/home.html", context, status=200 if database["ok"] else 503)


def _level(percent):
    """How a meter reads: calm, worth a look, or act now."""
    if percent is None:
        return "calm"
    return "high" if percent >= 90 else "warn" if percent >= 75 else "calm"


@staff_member_required
def live_system_monitor(request):
    media_folders = sorted(get_media_folders_usage_summary(), key=lambda x: (x["entity"], x["year"]))
    custom_folders = get_custom_folders_usage_summary(CUSTOM_FOLDER_PATHS)
    system = get_system_info()
    system["services"] = {service: is_process_running(service) for service in SERVICES}

    biggest = max((f["size_mb"] for f in media_folders), default=0) or 1
    for folder in media_folders:
        folder["share"] = round(folder["size_mb"] / biggest * 100, 1)

    meters = [
        {"label": "Processor", "value": system["cpu_percent"], "note": f"{system['process_count']} processes"},
        {"label": "Memory", "value": system["ram_percent"], "note": "of the server's RAM"},
        {
            "label": "Disk",
            "value": system["disk_percent"],
            "note": f"{system['disk_used']} of {system['disk_total']} GB, {system['disk_free']} GB free",
        },
        {
            "label": "This app",
            "value": system["django"]["memory_percent"],
            "note": f"{system['django']['rss']} MB resident, {system['django']['cpu_percent']}% processor",
        },
    ]
    for meter in meters:
        meter["level"] = _level(meter["value"])

    context = {
        "title": "System monitor",
        "media_folders": media_folders,
        "media_total": round(sum(f["size_mb"] for f in media_folders), 2),
        "custom_folders": custom_folders,
        "system": system,
        "meters": meters,
        "debug": settings.DEBUG,
        "detailed": True,
        "is_staff": True,
        "now_local": now().astimezone(NEPAL),
        "host": request.get_host(),
        "page": "monitor",
    }

    return TemplateResponse(request, "views/live_usage.html", context)


def show_debug_toolbar(request):
    """The debug toolbar's usual rule, minus the server's front page."""
    from debug_toolbar.middleware import show_toolbar

    return request.path != "/" and show_toolbar(request)
