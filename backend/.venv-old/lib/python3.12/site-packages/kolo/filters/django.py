from __future__ import annotations

import os
import threading
import time
import types
from contextlib import suppress
from typing import Dict, List, Tuple

import ulid

from ..serialize import get_content, get_request_body


class DjangoFilter:
    co_names: Tuple[str, ...] = ("get_response",)
    kolo_middleware_filename = os.path.normpath("/kolo/middleware.py")

    def __init__(self, config) -> None:
        self.config = config
        self.timestamp: float
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            self.kolo_middleware_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.co_names
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        thread = threading.current_thread()
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            self.timestamp = time.time()
            request = frame.f_locals["request"]
            return {
                "body": get_request_body(request),
                "frame_id": frame_id,
                "headers": dict(request.headers),
                "method": request.method,
                "path_info": request.path_info,
                # dict(request.POST) can give confusing results due to MultivalueDict
                "post_data": dict(request.POST),
                "query_params": dict(request.GET),
                "scheme": request.scheme,
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": self.timestamp,
                "type": "django_request",
            }
        elif event == "return":  # pragma: no branch
            timestamp = time.time()
            duration = timestamp - self.timestamp
            ms_duration = round(duration * 1000, 2)

            request = frame.f_locals["request"]
            match = request.resolver_match
            if match:  # match is None if this is a 404
                url_pattern = {
                    "namespace": match.namespace,
                    "route": match.route,
                    "url_name": match.url_name,
                    "view_qualname": match._func_path,
                }
            else:
                url_pattern = None

            response = frame.f_locals["response"]
            return {
                "frame_id": self._frame_ids[id(frame)],
                "ms_duration": ms_duration,
                "status_code": response.status_code,
                "content": get_content(response),
                "headers": dict(response.items()),
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": timestamp,
                "type": "django_response",
                "url_pattern": url_pattern,
            }


class DjangoTemplateFilter:
    co_names: Tuple[str, ...] = ("render",)
    django_template_filename = os.path.normpath("django/template/backends/django.py")

    def __init__(self, config) -> None:
        self.config = config
        self.timestamp: float
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            self.django_template_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.co_names
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        timestamp = time.time()
        thread = threading.current_thread()
        context = frame.f_locals["context"]
        with suppress(AttributeError):
            context = context.flatten()
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            _type = "django_template_start"
        else:
            frame_id = self._frame_ids[id(frame)]
            _type = "django_template_end"

        return {
            "context": context,
            "frame_id": frame_id,
            "template": frame.f_locals["self"].template.name,
            "thread": thread.name,
            "timestamp": timestamp,
            "type": _type,
        }


class DjangoSetupFilter:
    co_names: Tuple[str, ...] = ("setup",)
    django_init_filename = os.path.normpath("django/__init__.py")

    def __init__(self, config) -> None:
        self.config = config
        self.timestamp: float
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            self.django_init_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.co_names
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        timestamp = time.time()
        thread = threading.current_thread()
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            _type = "django_setup_start"
        else:
            frame_id = self._frame_ids[id(frame)]
            _type = "django_setup_end"

        return {
            "frame_id": frame_id,
            "thread": thread.name,
            "timestamp": timestamp,
            "type": _type,
        }


class DjangoChecksFilter:
    co_names: Tuple[str, ...] = ("run_checks",)
    django_checks_filename = os.path.normpath("django/core/checks/registry.py")

    def __init__(self, config) -> None:
        self.config = config
        self.timestamp: float
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            self.django_checks_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.co_names
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        timestamp = time.time()
        thread = threading.current_thread()
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            _type = "django_checks_start"
        else:
            frame_id = self._frame_ids[id(frame)]
            _type = "django_checks_end"

        return {
            "frame_id": frame_id,
            "thread": thread.name,
            "timestamp": timestamp,
            "type": _type,
        }


class DjangoTestDBFilter:
    co_names: Tuple[str, ...] = ("create_test_db",)
    django_checks_filename = os.path.normpath("django/db/backends/base/creation.py")

    def __init__(self, config) -> None:
        self.config = config
        self.timestamp: float
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            self.django_checks_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.co_names
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        timestamp = time.time()
        thread = threading.current_thread()
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            _type = "django_create_test_db_start"
        else:
            frame_id = self._frame_ids[id(frame)]
            _type = "django_create_test_db_end"

        return {
            "frame_id": frame_id,
            "thread": thread.name,
            "timestamp": timestamp,
            "type": _type,
        }
