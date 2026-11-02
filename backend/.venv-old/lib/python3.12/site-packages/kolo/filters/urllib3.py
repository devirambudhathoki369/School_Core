from __future__ import annotations

import os
import threading
import time
import types
from typing import Dict, List, Literal, Tuple

import ulid

from ..serialize import decode_body, decode_header_value
from .types import BaseOutboundRequest, BaseOutboundResponse


class OutboundRequest(BaseOutboundRequest):
    subtype: Literal["urllib3"]


class OutboundResponse(BaseOutboundResponse):
    subtype: Literal["urllib3"]


def get_full_url(frame_locals) -> str:
    scheme = frame_locals["self"].scheme
    host = frame_locals["self"].host
    port = frame_locals["self"].port
    url = frame_locals["url"]
    return f"{scheme}://{host}:{port}{url}"


class Urllib3Filter:
    co_names: Tuple[str, ...] = ("urlopen",)
    urllib3_filename = os.path.normpath("urllib3/connectionpool")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        filepath = frame.f_code.co_filename
        callable_name = frame.f_code.co_name
        return callable_name == "urlopen" and self.urllib3_filename in filepath

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        frame_locals = frame.f_locals
        thread = threading.current_thread()

        if event == "call":
            request_headers = {
                key: decode_header_value(value)
                for key, value in frame_locals["headers"].items()
            }

            full_url = get_full_url(frame_locals)
            method = frame_locals["method"].upper()
            method_and_full_url = f"{method} {full_url}"

            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            api_request: OutboundRequest = {
                "body": decode_body(frame_locals["body"], request_headers),
                "frame_id": frame_id,
                "headers": request_headers,
                "method": method,
                "method_and_full_url": method_and_full_url,
                "subtype": "urllib3",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": time.time(),
                "type": "outbound_http_request",
                "url": full_url,
            }
            return api_request

        assert event == "return"

        full_url = get_full_url(frame_locals)
        method = frame_locals["method"].upper()
        method_and_full_url = f"{method} {full_url}"

        try:
            response = frame_locals["response"]
        except KeyError:
            headers = None
            status = None
        else:
            headers = dict(response.headers)
            status = response.status

        api_response: OutboundResponse = {
            "body": None,
            "frame_id": self._frame_ids[id(frame)],
            "headers": headers,
            "method": method,
            "method_and_full_url": method_and_full_url,
            "status_code": status,
            "subtype": "urllib3",
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": time.time(),
            "type": "outbound_http_response",
            "url": full_url,
        }
        return api_response
