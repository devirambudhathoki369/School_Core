import gzip
import logging
import os
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime

from django.conf import settings
from django.http import FileResponse
from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication, UserTokenAuthentication
from main.models.SchoolAdmin import SchoolAdmin
from main.services.database_backup import write_school_backup
from main.services.backup_jobs import start_backup, get_backup, BackupBusy
from ..BaseViews import SecuredAPIView

logger = logging.getLogger(__name__)


def _pg_dump_cmd(db_settings):
    pg_dump = shutil.which("pg_dump")
    if not pg_dump:
        raise RuntimeError("pg_dump is not installed on the server.")
    env = os.environ.copy()
    if db_settings.get("PASSWORD"):
        env["PGPASSWORD"] = db_settings["PASSWORD"]
    return [pg_dump, "-h", db_settings.get("HOST") or "localhost",
            "-p", str(db_settings.get("PORT") or "5432"),
            "-U", db_settings.get("USER") or "",
            "-d", str(db_settings.get("NAME") or ""),
            "--no-password", "--no-owner", "--no-privileges"], env


def write_full_backup(output, db_settings):
    engine = db_settings.get("ENGINE", "")
    # Finish and verify the dump before returning HTTP 200: a failed pg_dump
    # must never be offered to the user as a successful backup.
    with tempfile.TemporaryFile() as raw:
        if "postgresql" in engine:
            cmd, env = _pg_dump_cmd(db_settings)
            with tempfile.TemporaryFile() as errors:
                result = subprocess.run(cmd, env=env, stdout=raw, stderr=errors,
                                        timeout=1800, check=False)
                if result.returncode:
                    raise RuntimeError("Database dump failed. Check the database connection and pg_dump version.")
            extension = "sql.gz"
        elif "sqlite3" in engine:
            path = str(db_settings.get("NAME") or "")
            if not path or not os.path.isfile(path):
                raise RuntimeError("SQLite database file was not found.")
            # SQLite's backup API includes committed WAL data consistently.
            with tempfile.NamedTemporaryFile(suffix=".sqlite3") as snapshot:
                source = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
                destination = sqlite3.connect(snapshot.name)
                try:
                    source.backup(destination)
                finally:
                    destination.close()
                    source.close()
                shutil.copyfileobj(snapshot, raw)
            extension = "sqlite3.gz"
        else:
            raise RuntimeError("This database engine does not support backups.")
        raw.seek(0)
        with gzip.GzipFile(fileobj=output, mode="wb") as compressed:
            shutil.copyfileobj(raw, compressed, length=64 * 1024)
    output.seek(0)
    return extension


class DatabaseBackupView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication, UserTokenAuthentication)

    def post(self, request):
        if getattr(request, "user_role", None) not in ("superadmin", "superuser"):
            return Response({"message": "Not allowed."}, status=403)
        scope, school_id = request.data.get("scope"), request.data.get("school")
        if scope not in ("full", "school"):
            return Response({"message": "Choose a full or school backup."}, status=400)
        if scope == "school":
            try:
                school_id = int(school_id)
                if school_id <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return Response({"message": "Select a valid school."}, status=400)
            if not SchoolAdmin._base_manager.filter(pk=school_id).exists():
                return Response({"message": "School not found."}, status=404)
        elif school_id is not None:
            return Response({"message": "Use school scope when selecting a school."}, status=400)
        try:
            result = start_backup(scope, school_id)
        except BackupBusy as error:
            return Response({"message": str(error)}, status=409)
        response = Response(result, status=202)
        response["Cache-Control"] = "no-store, private"
        return response

    def get(self, request):
        if getattr(request, "user_role", None) not in ("superadmin", "superuser"):
            return Response({"message": "Not allowed."}, status=403)
        scope = request.query_params.get("scope", "full")
        if scope in ("status", "download"):
            try:
                result, path = get_backup(request.query_params.get("job"))
                if scope == "status":
                    response = Response(result)
                elif result["status"] != "ready":
                    return Response({"message": "Backup is not ready."}, status=409)
                else:
                    response = FileResponse(open(path, "rb"), as_attachment=True,
                                            filename=result["filename"], content_type=result["content_type"])
                    response["X-Content-Type-Options"] = "nosniff"
            except FileNotFoundError:
                return Response({"message": "Backup not found or expired. Please create a new backup."}, status=404)
            response["Cache-Control"] = "no-store, private"
            return response
        if scope == "schools":
            return Response({"schools": list(SchoolAdmin._base_manager.order_by("name", "pk")
                                              .values("id", "name", "is_active"))})
        if scope not in ("full", "school"):
            return Response({"message": "Choose a full or school backup."}, status=400)
        school_id = request.query_params.get("school")
        if scope == "full" and school_id is not None:
            return Response({"message": "Use school scope when selecting a school."}, status=400)
        if scope == "school":
            try:
                school_id = int(school_id)
                if school_id <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return Response({"message": "Select a valid school."}, status=400)
            if not SchoolAdmin._base_manager.filter(pk=school_id).exists():
                return Response({"message": "School not found."}, status=404)
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        output = tempfile.TemporaryFile()
        try:
            if scope == "school":
                write_school_backup(output, school_id)
                filename = f"smsysdb_school_{school_id}_{timestamp}.zip"
                content_type = "application/zip"
            else:
                extension = write_full_backup(output, settings.DATABASES["default"])
                filename = f"smsysdb_full_{timestamp}.{extension}"
                content_type = "application/gzip"
        except Exception:
            output.close()
            logger.exception("Database backup failed (scope=%s, school=%s)", scope, school_id)
            return Response({"message": "Backup could not be completed. Please ask the server administrator to check the backup logs and available disk space."}, status=500)
        response = FileResponse(output, as_attachment=True, filename=filename, content_type=content_type)
        response["Cache-Control"] = "no-store, private"
        response["X-Content-Type-Options"] = "nosniff"
        return response
