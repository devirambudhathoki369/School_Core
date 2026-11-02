import json

from more_itertools import pairwise


def update_response_json_body(response):
    content_type = (
        response["headers"].get("Content-Type")
        or response["headers"].get("content-type")
        or response["headers"].get("CONTENT-TYPE")
    )
    response["content_type"] = content_type
    content_type_is_json = content_type and "application/json" in content_type
    if response["body"] and content_type_is_json:
        response["json_body"] = json.loads(response["body"])


def parse_outbound_frames(frames):
    frames = (
        frame
        for frame in frames
        if frame["type"] in ("outbound_http_request", "outbound_http_response")
    )

    without_urllib3 = (frame for frame in frames if frame["subtype"] != "urllib3")

    outbound_frames = []
    for request, response in pairwise(without_urllib3):
        if (
            request["type"] != "outbound_http_request"
            or response["type"] != "outbound_http_response"
        ):
            # We don't have a (request, response) pair, so move ahead.
            # Usually this is (response, request), but could also be
            # (request, request) or (response, response) if the trace
            # failed to record as expected.
            continue  # pragma: no cover

        update_response_json_body(response)
        outbound_frames.append({"request": request, "response": response})

    return outbound_frames
