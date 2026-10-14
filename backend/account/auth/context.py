import contextvars

users_context = contextvars.ContextVar("users_context", default=None)
