"""The rule for every password the server sets. The portal's forms ask for the same (strong_password)."""

import re

from django.contrib.auth.password_validation import (
    CommonPasswordValidator,
    UserAttributeSimilarityValidator,
)
from django.core.exceptions import ValidationError

PASSWORD_RULE = (
    "A password needs 6 to 20 characters with upper and lower case letters, "
    "a number and one of @$!%*#?&."
)


def password_problem(password, user=None):
    """Why this password cannot be used, or None."""
    password = password if isinstance(password, str) else ""
    if not (
        6 <= len(password) <= 20
        and re.search(r"[a-z]", password)
        and re.search(r"[A-Z]", password)
        and re.search(r"[0-9]", password)
        and re.search(r"[@$!%*#?&]", password)
    ):
        return PASSWORD_RULE
    try:
        CommonPasswordValidator().validate(password)
        if user is not None:
            UserAttributeSimilarityValidator().validate(password, user)
    except ValidationError as refused:
        return refused.messages[0]
    return None
