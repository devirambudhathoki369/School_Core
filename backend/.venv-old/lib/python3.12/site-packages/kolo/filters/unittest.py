from __future__ import annotations

import os
import threading
import time
from typing import Dict

import ulid


class UnitTestFilter:
    event_types = {
        "startTest": "start_test",
        "stopTest": "end_test",
    }
    co_names = tuple(event_types)
    unittest_result_filename = os.path.normpath("unittest/result.py")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame, event, arg):  # pragma: no cover
        return (
            event == "call"
            and self.unittest_result_filename in frame.f_code.co_filename
            and frame.f_code.co_name in self.event_types
        )

    def process(self, frame, event, arg, call_frames):  # pragma: no cover
        timestamp = time.time()
        thread = threading.current_thread()
        testcase = frame.f_locals["test"]
        co_name = frame.f_code.co_name
        if co_name == "startTest":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(testcase)] = frame_id
        else:
            frame_id = self._frame_ids[id(testcase)]
        return {
            "frame_id": frame_id,
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "type": self.event_types[co_name],
            "test_name": testcase._testMethodName,
            "test_class": testcase.__class__.__qualname__,
            "timestamp": timestamp,
        }
