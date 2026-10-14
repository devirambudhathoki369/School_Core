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
