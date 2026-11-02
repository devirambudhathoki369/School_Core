from __future__ import annotations

import logging
import mimetypes
import os
import sqlite3
import sys
import threading
from itertools import chain
from typing import Awaitable, Callable

from asgiref.sync import iscoroutinefunction
from django.conf import settings
from django.http import (
    FileResponse,
    HttpRequest,
    HttpResponse,
    HttpResponseNotFound,
    JsonResponse,
)

from .config import load_config
from .db import list_traces_from_db, setup_db
from .profiler import KoloProfiler
from .serialize import monkeypatch_queryset_repr
from .web.home import kolo_web_home

logger = logging.getLogger("kolo")

DjangoView = Callable[[HttpRequest], HttpResponse]
DjangoAsyncView = Callable[[HttpRequest], Awaitable[HttpResponse]]


class KoloMiddleware:
    sync_capable = True
    async_capable = True

    def __init__(self, get_response: DjangoView | DjangoAsyncView) -> None:
        self._is_coroutine = iscoroutinefunction(get_response)
        self._get_response = get_response
        self.config = load_config()
        self.enabled = self.should_enable()
        if self.enabled:
            self.db_path = setup_db()

            # TODO: Put the full URL here not just the /_kolo/ path
            if self.config.get("web_experience", False):
                print("\nView recent requests at /_kolo/")

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if self._is_coroutine:
            # TODO: Handle _kolo/ for asgi???
            get_response = self.aget_response
        else:
            if request.path.startswith("/_kolo/"):
                return kolo_web_router(request)

            get_response = self.get_response  # type: ignore

        # WARNING: Because Django's runserver uses threading, we need
        # to be careful about thread safety here.
        if not self.enabled or self.check_for_third_party_profiler():
            return get_response(request)  # type: ignore

        filter_config = self.config.get("filters", {})
        ignore_request_paths = filter_config.get("ignore_request_paths", [])
        for path in ignore_request_paths:
            if path in request.path:
                return get_response(request)  # type: ignore

        # Don't store the KoloProfiler on self to avoid threadsafety
        # bugs. If a different thread gets this instance of KoloProfiler
        # at the wrong time, we lose the original profiler's trace.
        profiler = KoloProfiler(
            self.db_path, config=self.config, source="kolo.middleware.KoloMiddleware"
        )

        monkeypatch_queryset_repr()
        if self._is_coroutine:
            return self.aprofile_response(request, profiler)
        else:
            return self.profile_response(request, profiler)

    def profile_response(self, request, profiler):
        with profiler:
            response = self.get_response(request)
        self.save_trace(profiler)
        return response

    async def aprofile_response(self, request, profiler):
        with profiler:
            response = await self.aget_response(request)
        self.save_trace(profiler)
        return response

    async def aget_response(self, request: HttpRequest) -> HttpResponse:
        response = await self._get_response(request)  # type: ignore
        return response

    def get_response(self, request: HttpRequest) -> HttpResponse:
        response = self._get_response(request)
        return response  # type: ignore

    @staticmethod
    def save_trace(profiler):
        name = "kolo-save_request_in_db"
        threading.Thread(target=profiler.save_request_in_db, name=name).start()

    def check_for_third_party_profiler(self) -> bool:
        profiler = sys.getprofile()
        if profiler:
            logger.warning("Profiler %s is active, disabling KoloMiddleware", profiler)
            return True
        if self.config.get("threading", False):
            try:
                profiler = threading.getprofile()  # type: ignore[attr-defined]
            except AttributeError:
                profiler = threading._profile_hook
            if profiler:  # pragma: no branch
                logger.warning(
                    "Profiler %s is active, disabling KoloMiddleware", profiler
                )
                return True
        return False

    def should_enable(self) -> bool:
        if settings.DEBUG is False:
            logger.debug("DEBUG mode is off, disabling KoloMiddleware")
            return False

        if os.environ.get("KOLO_DISABLE", "false").lower() not in ["false", "0"]:
            logger.debug("KOLO_DISABLE is set, disabling KoloMiddleware")
            return False

        if self.check_for_third_party_profiler():
            return False

        return True


def kolo_web_router(request: HttpRequest) -> HttpResponse:
    path = request.path
    if path == "/_kolo/":
        return kolo_web_home(request)
    elif path.startswith("/_kolo/static/"):
        static_dir = os.path.join(os.path.dirname(__file__), "web", "static")
        file_path = os.path.join(static_dir, request.path[len("/_kolo/static/") :])

        if os.path.exists(file_path):
            mime_type, encoding = mimetypes.guess_type(file_path)
            return FileResponse(  # type: ignore # seems iffy and difficult to fix with little benefit
                open(file_path, "rb"),
                content_type=mime_type or "application/octet-stream",
            )
        else:
            return HttpResponseNotFound("File not found")
    elif path.startswith("/_kolo/api/generate-test/"):
        return kolo_web_api_generate_test(request)
    elif path.startswith("/_kolo/api/traces/"):
        return kolo_web_api_get_trace(request)
    elif path.startswith("/_kolo/api/latest-traces/"):
        return kolo_web_api_latest_traces(request)
    else:
        return HttpResponseNotFound("Kolo Web: Not Found")


def kolo_web_api_generate_test(request: HttpRequest) -> HttpResponse:
    trace_id = request.path.replace("/_kolo/api/generate-test/", "").replace("/", "")

    from .generate_tests import generate_from_trace_id

    test_code = generate_from_trace_id(trace_id, "MyTestCase", "test_my_view")

    return JsonResponse({"test_code": test_code})


def kolo_web_api_get_trace(request: HttpRequest) -> HttpResponse:
    trace_id = request.path.replace("/_kolo/api/traces/", "").replace("/", "")

    from .db import load_trace_from_db

    db_path = setup_db()

    msgpack_data, json_data = load_trace_from_db(db_path, trace_id)
    if json_data:
        return HttpResponse(json_data, content_type="application/json")
    else:
        return HttpResponse(msgpack_data, content_type="application/msgpack")


def kolo_web_api_latest_traces(request: HttpRequest) -> HttpResponse:
    from .db import db_connection

    db_path = setup_db()

    with db_connection(db_path) as connection:
        cursor = connection.execute("SELECT id FROM traces ORDER BY id desc LIMIT 10")

        rows = cursor.fetchall()

        traces = list(chain.from_iterable(rows))

    return JsonResponse({"traces": traces})
