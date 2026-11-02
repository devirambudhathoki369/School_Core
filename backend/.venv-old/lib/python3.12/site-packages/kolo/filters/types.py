from typing import Dict, Literal, Optional, TypedDict


class BaseOutboundRequest(TypedDict):
    body: Optional[str]
    frame_id: str
    headers: Dict[str, str]
    method: str
    method_and_full_url: str
    thread: str
    thread_native_id: Optional[int]
    timestamp: float
    type: Literal["outbound_http_request"]
    url: str


class BaseOutboundResponse(TypedDict):
    body: Optional[str]
    frame_id: str
    headers: Optional[Dict[str, str]]
    method: str
    method_and_full_url: str
    status_code: Optional[int]
    thread: str
    thread_native_id: Optional[int]
    timestamp: float
    type: Literal["outbound_http_response"]
    url: str
