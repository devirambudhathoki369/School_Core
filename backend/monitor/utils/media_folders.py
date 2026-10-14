from pathlib import Path
import os
from django.conf import settings

BASE_DIR = Path(settings.BASE_DIR)
MEDIA_BASE = Path(settings.MEDIA_ROOT)


def get_folder_size(path: Path) -> int:
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except:
                continue
    return total


def get_media_folders_usage_summary():
    folders = []
    for entity in MEDIA_BASE.iterdir():
        if entity.is_dir():
            for year in entity.iterdir():
                if year.is_dir():
                    size = get_folder_size(year)
                    folders.append(
                        {
                            "entity": entity.name,
                            "year": year.name,
                            "size_mb": round(size / (1024 * 1024), 2),
                            "large": size > (1000 * 1024 * 1024),  # 1GB threshold
                        }
                    )
    return folders


def get_custom_folders_usage_summary(paths):
    folders = []
    for path_item in paths:
        path = Path(path_item["path"])
        if not path.exists():
            continue
        total_size = 0
        file_count = 0
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    total_size += os.path.getsize(fp)
                    file_count += 1
                except:
                    continue
        folders.append(
            {
                "name": path_item["name"],
                "file_count": file_count,
                "size_mb": round(total_size / (1024 * 1024), 2),
            }
        )
    return folders
