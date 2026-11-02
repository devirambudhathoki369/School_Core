from __future__ import annotations

import os
import threading
import time
import types
from typing import TYPE_CHECKING, Dict, List, Literal, Tuple

import ulid

from ..serialize import decode_body
from .types import BaseOutboundRequest, BaseOutboundResponse


class OutboundRequest(BaseOutboundRequest):
    subtype: Literal["requests"]


class OutboundResponse(BaseOutboundResponse):
    subtype: Literal["requests"]


class ApiRequestFilter:
    co_names: Tuple[str, ...] = ("send",)
    requests_filename = os.path.normpath("requests/sessions")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        filepath = frame.f_code.co_filename
        callable_name = frame.f_code.co_name
        return callable_name == "send" and self.requests_filename in filepath

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
        request = frame_locals["request"]
        method_and_url = f"{request.method} {request.url}"

        if event == "call":
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id

            api_request: OutboundRequest = {
                "body": decode_body(request.body, request.headers),
                "frame_id": frame_id,
                "headers": dict(request.headers),
                "method": request.method,
                "method_and_full_url": method_and_url,
                "subtype": "requests",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": timestamp,
                "type": "outbound_http_request",
                "url": request.url,
            }
            return api_request

        assert event == "return"

        response = arg
        if TYPE_CHECKING:
            from requests.models import Response

            assert isinstance(response, Response)

        if response is None:
            body = None
            headers = None
            status_code = None
        else:
            body = response.text
            headers = dict(response.headers)
            status_code = response.status_code

        api_response: OutboundResponse = {
            "body": body,
            "frame_id": self._frame_ids[id(frame)],
            "headers": headers,
            "method": request.method,
            "method_and_full_url": method_and_url,
            "status_code": status_code,
            "subtype": "requests",
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": timestamp,
            "type": "outbound_http_response",
            "url": request.url,
        }
        return api_response
