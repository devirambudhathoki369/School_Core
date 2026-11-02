"""The rule for every password the server sets. The portal's forms ask for the same (strong_password)."""


from django.contrib.auth.password_validation import (
    CommonPasswordValidator,
    UserAttributeSimilarityValidator,
    NumericPasswordValidator,
)
from django.core.exceptions import ValidationError

PASSWORD_RULE = "Use 15 to 128 characters. A unique passphrase with several words is recommended."


def password_problem(password, user=None):
    """Why this password cannot be used, or None."""
    password = password if isinstance(password, str) else ""
    if not 15 <= len(password) <= 128:
        return PASSWORD_RULE
    try:
        CommonPasswordValidator().validate(password)
        NumericPasswordValidator().validate(password)
        if user is not None:
            UserAttributeSimilarityValidator().validate(password, user)
    except ValidationError as refused:
        return refused.messages[0]
    return None


def require_current_password(user, password):
    """Bound password guesses even when an attacker already holds a session."""
    from django.core.cache import cache
    from rest_framework.exceptions import Throttled, ValidationError as APIValidationError

    key = f"password-confirm:{user._meta.label_lower}:{user.pk}"
    if (cache.get(key) or 0) >= 10:
        raise Throttled(wait=900, detail="Too many incorrect password confirmations. Try again in 15 minutes.")
    if not isinstance(password, str) or len(password) > 1024 or not user.check_password(password):
        cache.add(key, 0, 900)
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, 900)
        raise APIValidationError({"message": "Current password is incorrect!"})
    cache.delete(key)
