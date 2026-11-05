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


class AuthResponseSecurityMiddleware:
    """Dynamic school records and credentials must never enter shared caches."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(("/auth/", "/api/", "/accounting/", "/library/",
                                    "/hostel/", "/canteen/", "/extra-billing/", "/rfid/", "/iclock/")):
            # A view that already said no-store keeps its own wording.
            if "no-store" not in response.get("Cache-Control", ""):
                response["Cache-Control"] = "no-store, private"
            response["Pragma"] = "no-cache"
        return response
