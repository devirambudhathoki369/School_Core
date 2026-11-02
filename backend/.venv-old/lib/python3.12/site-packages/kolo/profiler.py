from __future__ import annotations

import inspect
import logging
import sys
import threading
import time
import types
from collections import defaultdict
from collections.abc import Mapping
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Dict, List, Protocol, TypeVar, overload

import msgpack
import ulid

from .config import load_config
from .db import save_trace_in_sqlite, setup_db
from .filters.attrs import attrs_filter
from .filters.celery import CeleryFilter
from .filters.core import (
    FrameFilter,
    FrameProcessor,
    build_frame_filter,
    exec_filter,
    frozen_filter,
    library_filter,
)
from .filters.django import (
    DjangoChecksFilter,
    DjangoFilter,
    DjangoSetupFilter,
    DjangoTemplateFilter,
    DjangoTestDBFilter,
)
from .filters.exception import ExceptionFilter
from .filters.httpx import HttpxFilter
from .filters.huey import HueyFilter
from .filters.kolo import kolo_filter
from .filters.logging import LoggingFilter
from .filters.pypy import pypy_filter
from .filters.pytest import PytestFilter
from .filters.requests import ApiRequestFilter
from .filters.sql import SQLQueryFilter
from .filters.unittest import UnitTestFilter
from .filters.urllib import UrllibFilter
from .filters.urllib3 import Urllib3Filter
from .git import COMMIT_SHA
from .serialize import (
    UserCodeCallSite,
    dump_msgpack,
    frame_path,
    monkeypatch_queryset_repr,
)
from .version import __version__

logger = logging.getLogger("kolo")


class KoloLocals(threading.local):
    def __init__(self):
        self.call_frames = []
        self._frame_ids = {}


class KoloProfiler:
    """
    Collect runtime information about code to view in VSCode.

    include_frames can be passed to enable profiling of standard library
    or third party code.

    ignore_frames can also be passed to disable profiling of a user's
    own code.

    The list should contain fragments of the path to the relevant files.
    For example, to include profiling for the json module the include_frames
    could look like ["/json/"].

    The list may also contain frame filters. A frame filter is a function
    (or other callable) that takes the same arguments as the profilefunc
    passed to sys.setprofile and returns a boolean representing whether
    to allow or block the frame.

    include_frames takes precedence over ignore_frames. A frame that
    matches an entry in each list will be profiled.
    """

    def __init__(
        self, db_path: Path, config=None, one_trace_per_test=False, *, source
    ) -> None:
        self.db_path = db_path
        self.source = source
        self.one_trace_per_test = one_trace_per_test
        trace_id = ulid.new()
        self.trace_id = f"trc_{trace_id}"
        self.start_test_index = 0
        self.start_test_indices: Dict[int, int] = {}
        self.frames_of_interest: List[str] = []
        self.frames: defaultdict = defaultdict(list)
        self.config = config if config is not None else {}
        filter_config = self.config.get("filters", {})
        include_frames = filter_config.get("include_frames", ())
        ignore_frames = filter_config.get("ignore_frames", ())
        self.include_frames = list(map(build_frame_filter, include_frames))
        self.ignore_frames = list(map(build_frame_filter, ignore_frames))
        # The order here matters for the Rust implementation, which accesses
        # entries by index.
        self._default_include_frames: List[FrameProcessor] = [
            DjangoFilter(self.config),
            DjangoTemplateFilter(self.config),
            CeleryFilter(self.config),
            HueyFilter(self.config),
            ApiRequestFilter(self.config),
            UrllibFilter(self.config),
            Urllib3Filter(self.config),
            ExceptionFilter(
                self.config,
                ignore_frames=self.ignore_frames,
                include_frames=self.include_frames,
            ),
            LoggingFilter(self.config),
            SQLQueryFilter(self.config),
            UnitTestFilter(self.config),
            PytestFilter(self.config),
            HttpxFilter(self.config),
            DjangoSetupFilter(self.config),
            DjangoChecksFilter(self.config),
            DjangoTestDBFilter(self.config),
        ]

        self.default_include_frames: Dict[str, List[FrameProcessor]] = {}
        for filter in self._default_include_frames:
            for co_name in filter.co_names:
                self.default_include_frames.setdefault(co_name, []).append(filter)

        self.default_ignore_frames: List[FrameFilter] = [
            library_filter,
            frozen_filter,
            pypy_filter,
            kolo_filter,
            exec_filter,
            attrs_filter,
        ]
        self.thread_locals = KoloLocals()
        self.timestamp = time.time()
        self.rust_profiler = None
        self.main_thread_id = threading.main_thread().native_id

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> None:
        if event in ["c_call", "c_return"]:
            return

        for frame_filter in self.include_frames:
            try:
                if frame_filter(frame, event, arg):
                    self.process_frame(frame, event, arg)
                    return
            except Exception as e:
                logger.warning(
                    "Unexpected exception in include_frames: %s",
                    frame_filter,
                    exc_info=e,
                )
                continue

        for frame_filter in self.ignore_frames:
            try:
                if frame_filter(frame, event, arg):
                    return
            except Exception as e:
                logger.warning(
                    "Unexpected exception in ignore_frames: %s",
                    frame_filter,
                    exc_info=e,
                )
                continue

        co_name = frame.f_code.co_name

        # Execute only the filters listening for this co_name
        for frame_filter in self.default_include_frames.get(co_name, ()):
            try:
                if frame_filter(frame, event, arg):
                    frame_data = frame_filter.process(
                        frame, event, arg, self.thread_locals.call_frames
                    )
                    if frame_data:  # pragma: no branch
                        data = dump_msgpack(frame_data)
                        if (
                            self.one_trace_per_test
                            and frame_data["type"] == "start_test"
                        ):
                            self.start_test()  # pragma: no cover

                        if self.config.get("threading", False):  # pragma: no cover
                            thread = threading.current_thread()
                            if thread.native_id == self.main_thread_id:
                                self.frames_of_interest.append(data)
                            else:  # pragma: no cover
                                self.frames[thread.native_id].append(data)
                        else:
                            self.frames_of_interest.append(data)

                        if self.one_trace_per_test and frame_data["type"] == "end_test":
                            self.end_test()  # pragma: no cover
                    return
            except Exception as e:
                logger.warning(
                    "Unexpected exception in default_include_frames: %s",
                    frame_filter,
                    exc_info=e,
                )
                continue

        for frame_filter in self.default_ignore_frames:
            try:
                if frame_filter(frame, event, arg):
                    return
            except Exception as e:
                logger.warning(
                    "Unexpected exception in default_ignore_frames: %s",
                    frame_filter,
                    exc_info=e,
                )
                continue

        try:
            self.process_frame(frame, event, arg)
        except Exception as e:
            logger.warning(
                "Unexpected exception in KoloProfiler.process_frame",
                exc_info=e,
            )

    def start_test(self):
        self.trace_id = f"trc_{ulid.new()}"
        self.start_test_index = len(self.frames_of_interest)
        self.start_test_indices = {
            thread_id: len(frames) for thread_id, frames in self.frames.items()
        }

    def end_test(self):
        test_frames = {
            thread_id: frames[self.start_test_indices.get(thread_id, 0) :]
            for thread_id, frames in self.frames.items()
        }
        self.save_request_in_db(
            self.frames_of_interest[self.start_test_index :],
            test_frames,
        )

    def __enter__(self) -> None:
        if self.config.get("use_rust", True):
            try:
                from ._kolo import register_profiler
            except ImportError:
                sys.setprofile(self)
                if self.config.get("threading", False):
                    threading.setprofile(self)
            else:
                register_profiler(self)
        else:
            sys.setprofile(self)
            if self.config.get("threading", False):
                threading.setprofile(self)

    def __exit__(self, *exc) -> None:
        sys.setprofile(None)
        if self.config.get("threading", False):
            threading.setprofile(None)

    def save_request_in_db(self, frames=None, thread_frames=None) -> None:
        if self.rust_profiler:
            self.rust_profiler.save_request_in_db()
            return

        timeout = self.config.get("sqlite_busy_timeout", 60)
        timestamp = self.timestamp
        data = {
            "command_line_args": sys.argv,
            "current_commit_sha": COMMIT_SHA,
            "main_thread_id": self.main_thread_id,
            "meta": {
                "version": __version__,
                "source": self.source,
                "use_frame_boundaries": True,
            },
            "timestamp": timestamp,
            "trace_id": self.trace_id,
        }

        frames = self.frames_of_interest if frames is None else frames
        thread_frames = self.frames if thread_frames is None else thread_frames

        data["frames_of_interest"] = [
            msgpack.unpackb(f, strict_map_key=False) for f in frames
        ]
        data["frames"] = {
            thread_id: [msgpack.unpackb(f, strict_map_key=False) for f in frames]
            for thread_id, frames in thread_frames.items()
        }
        serialized_data = dump_msgpack(data)
        save_trace_in_sqlite(
            self.db_path, self.trace_id, msgpack=serialized_data, timeout=timeout
        )

    def process_frame(self, frame: types.FrameType, event: str, arg: object) -> None:
        user_code_call_site: UserCodeCallSite | None
        if event == "call" and self.thread_locals.call_frames:
            call_frame, call_frame_id = self.thread_locals.call_frames[-1]
            user_code_call_site = {
                "call_frame_id": call_frame_id,
                "line_number": call_frame.f_lineno,
            }
        else:
            # If we are a return frame, we don't bother duplicating
            # information for the call frame.
            # If we are the first call frame, we don't have a callsite.
            user_code_call_site = None

        co_name = frame.f_code.co_name
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self.thread_locals._frame_ids[id(frame)] = frame_id
            self.thread_locals.call_frames.append((frame, frame_id))
        elif event == "return":  # pragma: no branch
            self.thread_locals.call_frames.pop()

        thread = threading.current_thread()

        frame_locals = {k: v for k, v in frame.f_locals.items() if k != "__builtins__"}
        frame_data = {
            "path": frame_path(frame),
            "co_name": co_name,
            "qualname": get_qualname(frame),
            "event": event,
            "frame_id": self.thread_locals._frame_ids[id(frame)],
            "arg": arg,
            "locals": frame_locals,
            "thread": thread.name,
            # The operating system's thread ID.
            # Guaranteed to be unique for the lifetime of the thread.
            "thread_native_id": thread.native_id,
            "timestamp": time.time(),
            "type": "frame",
            "user_code_call_site": user_code_call_site,
        }
        data = dump_msgpack(frame_data)
        if thread.native_id == self.main_thread_id:
            self.frames_of_interest.append(data)
        else:  # pragma: no cover
            self.frames[thread.native_id].append(data)


def get_qualname(frame: types.FrameType) -> str | None:
    try:
        qualname = frame.f_code.co_qualname  # type: ignore[attr-defined]
    except AttributeError:
        pass
    else:
        module = frame.f_globals["__name__"]
        return f"{module}.{qualname}"

    co_name = frame.f_code.co_name
    if co_name == "<module>":  # pragma: no cover
        module = frame.f_globals["__name__"]
        return f"{module}.<module>"

    try:
        outer_frame = frame.f_back
        assert outer_frame
        try:
            function = outer_frame.f_locals[co_name]
        except KeyError:
            try:
                self = frame.f_locals["self"]
            except KeyError:
                cls = frame.f_locals.get("cls")
                if isinstance(cls, type):
                    function = inspect.getattr_static(cls, co_name)
                else:
                    try:
                        qualname = frame.f_locals["__qualname__"]
                    except KeyError:
                        function = frame.f_globals[co_name]
                    else:  # pragma: no cover
                        module = frame.f_globals["__name__"]
                        return f"{module}.{qualname}"
            else:
                function = inspect.getattr_static(self, co_name)
                if isinstance(function, property):
                    function = function.fget

        return f"{function.__module__}.{function.__qualname__}"
    except Exception:
        return None


class Enabled:
    def __init__(self, config: Mapping[str, Any] | None = None):
        if config is None:
            config = {}
        self.config = config
        self._profiler: KoloProfiler | None = None

    def __call__(self, func):
        @wraps(func)
        def inner(*args, **kwargs):
            with self:
                return func(*args, **kwargs)

        return inner

    def __enter__(self) -> None:
        if sys.getprofile():
            return

        if self.config.get("threading", False):
            try:
                thread_profiler = threading.getprofile()  # type: ignore[attr-defined]
            except AttributeError:
                thread_profiler = threading._profile_hook
            if thread_profiler:
                return

        config = load_config(self.config)
        db_path = setup_db()
        monkeypatch_queryset_repr()
        self._profiler = KoloProfiler(db_path, config=config, source="kolo.enable")
        self._profiler.__enter__()

    def __exit__(self, *exc) -> None:
        if self._profiler is not None:
            self._profiler.__exit__(*exc)
        if self._profiler is not None:
            self._profiler.save_request_in_db()
            self._profiler = None


F = TypeVar("F", bound=Callable[..., Any])


class CallableContextManager(Protocol):
    def __call__(self, func: F) -> F: ...  # pragma: no cover

    def __enter__(self) -> None: ...  # pragma: no cover

    def __exit__(self, *exc) -> None: ...  # pragma: no cover


@overload
def enable(_func: F) -> F:
    """Stub"""


@overload
def enable(config: Mapping[str, Any] | None = None) -> CallableContextManager:
    """Stub"""


def enable(config=None):
    if config is None or isinstance(config, Mapping):
        return Enabled(config)
    # Treat as a decorator called on a function
    return Enabled()(config)


enabled = enable
