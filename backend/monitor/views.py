from django.contrib.admin.views.decorators import staff_member_required
from django.template.response import TemplateResponse
from django.utils.timezone import now

from monitor.utils.media_folders import (
    BASE_DIR,
    get_custom_folders_usage_summary,
    get_media_folders_usage_summary,
)
from monitor.utils.system import get_system_info, is_process_running


CUSTOM_FOLDER_PATHS = [
    # {"name": "", "path": str(BASE_DIR / "")},
]
SERVICES = ["gunicorn", "postgresql"]


@staff_member_required
def live_system_monitor(request):
    media_folders = get_media_folders_usage_summary()
    custom_folders = get_custom_folders_usage_summary(CUSTOM_FOLDER_PATHS)
    system = get_system_info()
    system["services"] = {service: is_process_running(service) for service in SERVICES}

    context = {
        "title": "Resource Monitor",
        "media_folders": sorted(media_folders, key=lambda x: (x["entity"], x["year"])),
        "custom_folders": custom_folders,
        "system": system,
        "now": now(),
    }

    return TemplateResponse(request, "views/live_usage.html", context)
