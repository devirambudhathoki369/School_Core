"""Container-specific paths and explicit localhost HTTP support."""
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403

CSRF_TRUSTED_ORIGINS = [
    value.strip() for value in os.environ.get("CSRF_TRUSTED_ORIGINS", "").split(",")
    if value.strip()
]
DATABASE_BACKUP_DIR = os.environ.get("DATABASE_BACKUP_DIR", "/data/backup_jobs")
ROOT_URLCONF = "backend.docker_urls"

if os.environ.get("DOCKER_LOCAL_HTTP", "false").lower() == "true":
    origins = [
        value.strip() for value in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
        if value.strip()
    ]
    for origin in origins + CSRF_TRUSTED_ORIGINS:
        parsed = urlsplit(origin)
        if parsed.scheme != "http" or parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ImproperlyConfigured("DOCKER_LOCAL_HTTP only supports HTTP localhost/127.0.0.1 origins.")
    CORS_ALLOWED_ORIGINS = origins
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    CSRF_COOKIE_SAMESITE = "Lax"
    AUTH_COOKIE_SECURE = False
    AUTH_COOKIE_SAMESITE = "Lax"

# Docker collects Django errors and security events in `docker compose logs` too.
LOGGING["handlers"]["console"] = {  # noqa: F405
    "class": "logging.StreamHandler", "formatter": "verbose", "level": "WARNING",
}
for logger in LOGGING["loggers"].values():  # noqa: F405
    logger["handlers"].append("console")
