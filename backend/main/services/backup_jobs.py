"""Local backup jobs: polling avoids proxy/worker timeouts during generation."""
import fcntl
import json
import logging
import os
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import close_old_connections

logger = logging.getLogger(__name__)
_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="database-backup")
TTL = 3600


class BackupBusy(Exception):
    pass


def directory():
    root = Path(getattr(settings, "DATABASE_BACKUP_DIR", Path(tempfile.gettempdir()) / "smsys-database-backups"))
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    return root


def _save(root, job, data):
    temporary = root / f"{job}.json.tmp"
    temporary.write_text(json.dumps(data))
    temporary.replace(root / f"{job}.json")


def _cleanup(root):
    for path in root.glob("*.json"):
        if time.time() - path.stat().st_mtime > TTL:
            job = path.stem
            for suffix in (".json", ".data", ".partial"):
                (root / f"{job}{suffix}").unlink(missing_ok=True)


def start_backup(scope, school_id):
    root = directory()
    lock = open(root / "generation.lock", "a+b")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise BackupBusy("Another backup is being prepared. Please try again after it finishes.")
    try:
        _cleanup(root)
        job = uuid.uuid4().hex
        info = {"job": job, "status": "preparing", "scope": scope, "school": school_id,
                "created_at": time.time()}
        _save(root, job, info)
        _EXECUTOR.submit(_generate, root, job, info, lock)
        return info
    except Exception:
        lock.close()
        raise


def _generate(root, job, info, lock):
    close_old_connections()
    try:
        from main.services.database_backup import write_school_backup
        from main.views.superadmin.DatabaseBackupView import write_full_backup
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        with open(root / f"{job}.partial", "w+b") as output:
            if info["scope"] == "school":
                manifest = write_school_backup(output, info["school"])
                info["filename"] = f"smsysdb_school_{info['school']}_{timestamp}.zip"
                info["content_type"] = "application/zip"
                info["missing_files"] = len(manifest["missing_files"])
                info["records"] = sum(manifest["record_counts"].values())
                info["files"] = len(manifest["files"])
            else:
                extension = write_full_backup(output, settings.DATABASES["default"])
                info["filename"] = f"smsysdb_full_{timestamp}.{extension}"
                info["content_type"] = "application/gzip"
            info["bytes"] = os.fstat(output.fileno()).st_size
        (root / f"{job}.partial").replace(root / f"{job}.data")
        info["status"] = "ready"
        info["expires_at"] = time.time() + TTL
        _save(root, job, info)
    except Exception:
        logger.exception("Backup job failed (scope=%s, school=%s)", info["scope"], info["school"])
        (root / f"{job}.partial").unlink(missing_ok=True)
        info.update(status="failed", message="Backup could not be completed. Please ask the server administrator to check the backup logs and available disk space.")
        _save(root, job, info)
    finally:
        close_old_connections()
        lock.close()


def get_backup(job):
    if not isinstance(job, str) or len(job) != 32:
        raise FileNotFoundError
    try:
        if uuid.UUID(hex=job).hex != job:
            raise ValueError
    except ValueError:
        raise FileNotFoundError
    root = directory()
    data = json.loads((root / f"{job}.json").read_text())
    if time.time() > data.get("expires_at", data["created_at"] + TTL):
        raise FileNotFoundError
    return data, root / f"{job}.data"
