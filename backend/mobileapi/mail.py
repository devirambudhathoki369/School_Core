"""The parents' emails: sign-in codes, and the notice when the sign-in moves."""
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


def send_moved_notice(old_email: str, school_name: str) -> bool:
    """Tell a parent their sign-in went to another email. Only the school office
    can make that happen (a family code for a parent who had joined), so the
    old address hears of it, and the parent can ask the school if it was not
    them."""
    subject = f"Your SchoolCore sign-in at {school_name} was moved"
    body = (
        f"{school_name} gave your SchoolCore account a new email address, so this address no longer signs in, "
        f"and the phones that used it have been signed out.\n\n"
        f"If you did not ask for this, please contact {school_name} at once.\n"
    )
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [old_email], fail_silently=False)
        return True
    except Exception:
        logger.exception("mobile sign-in moved notice failed")
        return False


def send_later(send, *args, **kwargs):
    """Send off the request thread. A sign-in code goes only to an address the
    school has, so a request that waited for the mail server would answer more
    slowly for a known address than an unknown one, and say which is which."""
    from main.methods.push import _in_background

    _in_background(send, *args, **kwargs)
