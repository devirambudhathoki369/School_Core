from __future__ import annotations

import logging
import os
import threading
import time
import types
from typing import List, Tuple

import ulid

formatter = logging.Formatter()


class LoggingFilter:
    co_names: Tuple[str, ...] = ("_log",)
    logging_filename = os.path.normpath("/logging/")

    def __init__(self, config) -> None:
        self.config = config

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            event == "return"
            and self.logging_filename in frame.f_code.co_filename
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
        native_id = getattr(thread, "native_id", None)
        frame_locals = frame.f_locals
        exc_info = frame_locals["exc_info"]
        traceback = None if exc_info is None else formatter.formatException(exc_info)
        extra = frame_locals["extra"]
        if call_frames:
            call_frame, call_frame_id = call_frames[-1]
            user_code_call_site = {
                "call_frame_id": call_frame_id,
                "line_number": call_frame.f_lineno,
            }
        else:
            user_code_call_site = None
        return {
            "args": frame_locals["args"],
            "extra": extra,
            "frame_id": f"frm_{ulid.new()}",
            "level": logging.getLevelName(frame_locals["level"]),
            "msg": frame_locals["msg"],
            "stack": formatter.formatStack(frame_locals["sinfo"]),
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": timestamp,
            "traceback": traceback,
            "type": "log_message",
            "user_code_call_site": user_code_call_site,
        }
