"""Isolated SQLite application tests; PostgreSQL migrations are not exercised.

Run with DEBUG=true and --settings=backend.test_settings. Deployment databases
and Redis are never used. Tables are built from the current models.
"""
from .settings import *  # noqa: F403

DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


class NoMigrations(dict):
    def __contains__(self, key):
        return True

    def __getitem__(self, key):
        return None


MIGRATION_MODULES = NoMigrations()
