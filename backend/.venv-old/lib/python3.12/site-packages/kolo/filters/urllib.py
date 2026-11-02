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
    subtype: Literal["urllib"]


class OutboundResponse(BaseOutboundResponse):
    subtype: Literal["urllib"]


class UrllibFilter:
    co_names: Tuple[str, ...] = ("do_open",)
    urllib_filename = os.path.normpath("urllib/request")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return (
            frame.f_code.co_name == "do_open"
            and self.urllib_filename in frame.f_code.co_filename
        )

    def process(
        self,
        frame: types.FrameType,
        event: str,
        arg: object,
        call_frames: List[Tuple[types.FrameType, str]],
    ):
        thread = threading.current_thread()
        request = frame.f_locals["req"]
        full_url = request.full_url
        method = request.get_method()
        method_and_full_url = f"{method} {full_url}"
        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            request_headers = {
                key: decode_header_value(value) for key, value in request.header_items()
            }

            api_request: OutboundRequest = {
                "body": decode_body(request.data, request_headers),
                "frame_id": frame_id,
                "headers": request_headers,
                "method": method,
                "method_and_full_url": method_and_full_url,
                "subtype": "urllib",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": time.time(),
                "type": "outbound_http_request",
                "url": full_url,
            }
            return api_request

        elif event == "return":  # pragma: no branch
            if arg is None:
                # Probably an exception
                headers = None
                status_code = None
            else:
                response = frame.f_locals["r"]
                headers = dict(response.headers)
                status_code = response.status

            api_response: OutboundResponse = {
                "body": None,
                "frame_id": self._frame_ids[id(frame)],
                "headers": headers,
                "method": method,
                "method_and_full_url": method_and_full_url,
                "status_code": status_code,
                "subtype": "urllib",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": time.time(),
                "type": "outbound_http_response",
                "url": full_url,
            }
            return api_response
