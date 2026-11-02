from __future__ import annotations

import os
import threading
import time
from typing import Dict

import ulid


class PytestFilter:
    event_types = {
        "pytest_runtest_logstart": "start_test",
        "pytest_runtest_logfinish": "end_test",
    }
    co_names = tuple(event_types)
    pytest_plugin_filename = os.path.normpath("kolo/pytest_plugin.py")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame, event, arg):  # pragma: no cover
        return (
            event == "call"
            and self.pytest_plugin_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.event_types
        )

    def process(self, frame, event, arg, call_frames):  # pragma: no cover
        timestamp = time.time()
        thread = threading.current_thread()
        native_id = getattr(thread, "native_id", None)
        co_name = frame.f_code.co_name
        location = frame.f_locals["location"]
        if co_name == "pytest_runtest_logstart":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(location)] = frame_id
        else:
            frame_id = self._frame_ids[id(location)]

        filename, lineno, test = location
        test_class, _sep, test_name = test.rpartition(".")
        return {
            "frame_id": frame_id,
            "thread": thread.name,
            "thread_native_id": native_id,
            "type": self.event_types[co_name],
            "test_name": test_name,
            "test_class": test_class if test_class else None,
            "timestamp": timestamp,
        }
