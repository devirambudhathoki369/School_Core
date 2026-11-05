"""The parents' sign-in code emails."""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

CODE_MINUTES = 10


def send_code(email: str, code: str, school_name: str, *, adding_email: bool) -> bool:
    if adding_email:
        subject = f"Your code to add this email at {school_name}"
        lead = f"Use this code to add this email to your SchoolCore account at {school_name}:"
    else:
        subject = f"Your SchoolCore sign-in code for {school_name}"
        lead = f"Use this code to sign in to SchoolCore at {school_name}:"
    body = (
        f"{lead}\n\n"
        f"    {code}\n\n"
        f"It works for {CODE_MINUTES} minutes. If you did not ask for it, you can ignore this email.\n"
    )
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [email], fail_silently=False)
        return True
    except Exception:
        # The caller answers the same either way; the failure is for the logs.
        logger.exception("mobile sign-in code email failed")
        return False
