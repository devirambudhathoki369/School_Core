from __future__ import annotations

import threading
import time
import types
from typing import Any, Dict, List, Literal, Optional, Tuple, TypedDict

import ulid


class CeleryJob(TypedDict, total=False):
    frame_id: str
    name: str
    args: Tuple[Any, ...]
    kwargs: Dict[str, Any]
    thread: str
    thread_native_id: Optional[int]
    timestamp: float
    type: Literal["background_job", "background_job_end"]
    subtype: Literal["celery"]


class CeleryFilter:
    co_names: Tuple[str, ...] = ("apply_async",)

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        filepath = frame.f_code.co_filename
        return (
            "celery" in filepath
            and "sentry_sdk" not in filepath
            and "apply_async" in frame.f_code.co_name
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        timestamp = time.time()
        celery_job: CeleryJob
        frame_locals = frame.f_locals
        task_name = frame_locals["self"].name
        task_args = frame_locals["args"]
        task_kwargs = frame_locals["kwargs"]
        thread = threading.current_thread()

        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            celery_job = {
                "frame_id": frame_id,
                "name": task_name,
                "args": task_args,
                "kwargs": task_kwargs,
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": timestamp,
                "type": "background_job",
                "subtype": "celery",
            }
            return celery_job

        assert event == "return"

        celery_job = {
            "frame_id": self._frame_ids[id(frame)],
            "name": task_name,
            "args": task_args,
            "kwargs": task_kwargs,
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": timestamp,
            "type": "background_job_end",
            "subtype": "celery",
        }
        return celery_job
