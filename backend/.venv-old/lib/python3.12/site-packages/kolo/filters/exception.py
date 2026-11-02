from __future__ import annotations

import threading
import time
import traceback
import types
from itertools import starmap
from typing import Dict, List, Literal, Optional, Tuple, TypedDict

import ulid

try:
    from django.db.models import Model as DjangoModel
except ImportError:  # pragma: no cover

    class DjangoModel:  # type: ignore
        """Stub type so isinstance returns False"""


from ..serialize import frame_path
from .core import library_filter


class ExceptionFrameInfo(TypedDict):
    path: str
    co_name: str
    locals: Dict[str, object]
    expanded_locals: Dict[str, Dict[str, object]]


class RecordedException(TypedDict):
    # Usually contains one string. Last string in the list is always
    # the one indicating which exception occurred
    exception_summary: List[str]
    exception_with_traceback: List[str]
    exception_frames: List[ExceptionFrameInfo]
    frame_id: str
    bottom_exception_frame: ExceptionFrameInfo | None
    thread: str
    thread_native_id: Optional[int]
    timestamp: float
    type: Literal["exception"]


class ExceptionFilter:
    co_names: Tuple[str, ...] = ("handle_uncaught_exception",)

    def __init__(self, config, ignore_frames, include_frames) -> None:
        self.config = config
        self.ignore_frames = ignore_frames
        self.include_frames = include_frames

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            event == "call"
            and "django" in frame.f_code.co_filename
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
        frame_locals = frame.f_locals
        exc_type, exc_value, exc_traceback = frame_locals["exc_info"]

        recorded_exception_frames = []
        expanded_locals_for_frames = []
        frames = (frame[0] for frame in traceback.walk_tb(exc_traceback))
        for frame in frames:
            include_match = self.include_match(frame)
            if not include_match and self.ignore_match(frame):
                continue

            if include_match or not library_filter(frame):
                frame_locals = frame.f_locals

                expanded_locals = {}
                for key, value in frame_locals.items():
                    if hasattr(value, "__dict__") and isinstance(value, DjangoModel):
                        expanded_locals[key] = vars(value)

                recorded_exception_frames.append(frame)
                expanded_locals_for_frames.append(expanded_locals)

        def serialize_exception_frame(frame, expanded_locals) -> "ExceptionFrameInfo":
            return {
                "path": frame_path(frame),
                "co_name": frame.f_code.co_name,
                "locals": frame.f_locals,
                "expanded_locals": expanded_locals,
            }

        exception_with_traceback = traceback.format_exception(
            exc_type, exc_value, exc_traceback
        )

        zipped_frames = zip(recorded_exception_frames, expanded_locals_for_frames)
        exception_frames = list(starmap(serialize_exception_frame, zipped_frames))
        bottom_exception_frame = exception_frames[-1] if exception_frames else None

        recorded_exception: RecordedException = {
            "frame_id": f"frm_{ulid.new()}",
            "exception_summary": traceback.format_exception_only(exc_type, exc_value),
            "exception_with_traceback": exception_with_traceback,
            "exception_frames": exception_frames,
            "bottom_exception_frame": bottom_exception_frame,
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": timestamp,
            "type": "exception",
        }
        return recorded_exception

    def include_match(self, frame: types.FrameType) -> bool:
        for include_filter in self.include_frames:
            if include_filter(frame, event="return", arg=None):
                return True
        return False

    def ignore_match(self, frame: types.FrameType) -> bool:
        for ignore_filter in self.ignore_frames:
            if ignore_filter(frame, event="return", arg=None):
                return True
        return False
