import os
import threading
import time
import types
from typing import Dict, List, Literal, Set, Tuple

import ulid

from .types import BaseOutboundRequest, BaseOutboundResponse


class OutboundRequest(BaseOutboundRequest):
    subtype: Literal["httpx"]


class OutboundResponse(BaseOutboundResponse):
    subtype: Literal["httpx"]


class HttpxFilter:
    co_names: Tuple[str, ...] = ("send",)
    httpx_filename = os.path.normpath("httpx/_client.py")

    def __init__(self, config) -> None:
        self.config = config
        self._frame_ids: Dict[int, str] = {}
        self._request_ids: Set[int] = set()

    def __call__(self, frame: types.FrameType, event: str, arg: object) -> bool:
        return self.httpx_filename in frame.f_code.co_filename

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
        # Track `request_id` to strip out unwanted resume frames in the async case.
        # Unfortunately `request_id` isn't guaranteed to be unique if the user chooses
        # to re-use a `request` instance, but I haven't thought of a way to do better.
        # We can't use `self` (`Client` or `AsyncClient` because that's even more likely
        # to be re-used.
        request_id = id(frame_locals["request"])
        request = frame_locals["request"]
        method = request.method
        url = str(request.url)

        if event == "call":
            if request_id in self._request_ids:
                # If the `request_id` is re-used, assume we're resuming the coroutine
                return
            self._request_ids.add(request_id)
            frame_id = f"frm_{ulid.new()}"
            self._frame_ids[id(frame)] = frame_id
            api_request: OutboundRequest = {
                "body": None,
                "frame_id": frame_id,
                "headers": dict(request.headers),
                "method": method,
                "method_and_full_url": f"{method} {url}",
                "subtype": "httpx",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": timestamp,
                "type": "outbound_http_request",
                "url": url,
            }
            return api_request

        assert event == "return"

        api_response: OutboundResponse

        if arg is None:
            # Probably an exception
            api_response = {
                "type": "outbound_http_response",
                "body": None,
                "frame_id": self._frame_ids[id(frame)],
                "headers": None,
                "method": method,
                "method_and_full_url": f"{method} {url}",
                "status_code": None,
                "subtype": "httpx",
                "thread": thread.name,
                "thread_native_id": thread.native_id,
                "timestamp": timestamp,
                "url": url,
            }
            return api_response

        from httpx._models import Response

        if not isinstance(arg, Response):
            # If we don't have a `Response`, assume we're suspending the coroutine
            return

        self._request_ids.discard(request_id)

        from httpx._exceptions import ResponseNotRead

        try:
            body = arg.text
        except ResponseNotRead:  # pragma: no cover
            body = None

        api_response = {
            "type": "outbound_http_response",
            "body": body,
            "frame_id": self._frame_ids[id(frame)],
            "headers": dict(arg.headers),
            "method": method,
            "method_and_full_url": f"{method} {url}",
            "status_code": arg.status_code,
            "subtype": "httpx",
            "thread": thread.name,
            "thread_native_id": thread.native_id,
            "timestamp": timestamp,
            "url": url,
        }
        return api_response
