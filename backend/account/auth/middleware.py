from django.http import HttpResponseBadRequest

from .context import users_context


class ResetUsersContextMiddleware:
    """
    Clear the per-request user context before every request.

    `users_context` is only ever SET by token authentication, never cleared, and
    gunicorn's sync workers reuse the same thread. So an unauthenticated request
    (/iclock/ device pushes, student self-registration) inherited whichever user
    the worker served last: HistoryLog rows were attributed to that user and
    their school.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        users_context.set(None)
        return self.get_response(request)


# No page or answer of this server uses the camera, microphone, location or
# payments; the mobile app asks the phone itself, not through this origin.
PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"
# A JSON answer is data, never a page: nothing in it may load, run or frame.
JSON_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"


class AuthResponseSecurityMiddleware:
    """Dynamic school records and credentials must never enter shared caches,
    and every answer carries the headers that keep a browser from doing more
    with it than showing it."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # A NUL character is never part of a real address or query, and
        # PostgreSQL cannot store or compare one: refused here for every route
        # instead of failing inside whichever view reads it.
        if "\x00" in request.path or "%00" in request.META.get("QUERY_STRING", "").lower():
            response = HttpResponseBadRequest("Invalid characters in the request.", content_type="text/plain")
        else:
            response = self.get_response(request)
        response.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        response.setdefault("X-Content-Type-Options", "nosniff")
        if response.get("Content-Type", "").startswith("application/json"):
            response.setdefault("Content-Security-Policy", JSON_CSP)
        if request.path.startswith(("/auth/", "/api/", "/accounting/", "/library/",
                                    "/hostel/", "/canteen/", "/extra-billing/", "/rfid/", "/iclock/")):
            # A view that already said no-store keeps its own wording.
            if "no-store" not in response.get("Cache-Control", ""):
                response["Cache-Control"] = "no-store, private"
            response["Pragma"] = "no-cache"
        return response
