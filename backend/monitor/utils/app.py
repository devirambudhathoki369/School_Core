import psutil
import os


def get_django_process_usage():
    current = psutil.Process(os.getpid())
    return {
        "cpu_percent": current.cpu_percent(interval=0.1),
        "memory_percent": round(current.memory_percent(), 2),
        "rss": round(current.memory_info().rss / (1024**2), 2),
    }
