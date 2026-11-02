from __future__ import annotations

import os
import types

KOLO_PATHS = (
    "/kolo/config.py",
    "/kolo/db.py",
    "/kolo/django_schema.py",
    "/kolo/filters/",
    "/kolo/generate_tests/",
    "/kolo/git.py",
    "/kolo/__init__.py",
    "/kolo/__main__.py",
    "/kolo/middleware.py",
    "/kolo/profiler.py",
    "/kolo/pytest_plugin.py",
    "/kolo/serialize.py",
    "/kolo/utils.py",
    "/kolo/version.py",
)
KOLO_PATHS = tuple(os.path.normpath(path) for path in KOLO_PATHS)


def kolo_filter(frame: types.FrameType, event: str, arg: object) -> bool:
    """Don't profile kolo code"""
    filename = frame.f_code.co_filename
    return any(path in filename for path in KOLO_PATHS)
