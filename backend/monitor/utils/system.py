import psutil
import datetime

from monitor.utils.app import get_django_process_usage


def get_system_uptime():
    boot_time = datetime.datetime.fromtimestamp(psutil.boot_time())
    now = datetime.datetime.now()
    uptime = now - boot_time
    return str(uptime).split(".")[0]  # strip microseconds


def get_running_process_count():
    return len(psutil.pids())


def get_network_stats():
    net_io = psutil.net_io_counters()
    return {
        "bytes_sent": round(net_io.bytes_sent / (1024**2), 2),
        "bytes_recv": round(net_io.bytes_recv / (1024**2), 2),
        "packets_sent": net_io.packets_sent,
        "packets_recv": net_io.packets_recv,
    }


def is_process_running(name):
    for proc in psutil.process_iter(["name", "cmdline"]):
        try:
            if name.lower() in proc.info["name"].lower():
                return True
            if any(name.lower() in part.lower() for part in proc.info["cmdline"]):
                return True
        except Exception:
            continue
    return False


# -----
def get_system_info():
    disk_usage = psutil.disk_usage("/")
    return {
        "cpu_percent": psutil.cpu_percent(interval=0.5),
        "ram_percent": psutil.virtual_memory().percent,
        "uptime": get_system_uptime(),
        "process_count": get_running_process_count(),
        "disk_total": round(disk_usage.total / (1024**3), 2),
        "disk_used": round(disk_usage.used / (1024**3), 2),
        "disk_free": round(disk_usage.free / (1024**3), 2),
        "disk_percent": disk_usage.percent,
        "net": get_network_stats(),
        "django": get_django_process_usage(),
    }
