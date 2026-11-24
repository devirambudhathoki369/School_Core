"""The Django admin's sign-in, with the same guard as the portal's.

Django's own admin login counts nothing, so a password could be guessed
there without end. Here a username is locked for 15 minutes after 10 wrong
passwords, and one address after 30 wrong ones, whatever usernames it
tries. Its counts are kept apart from the portal's, so failing here cannot
lock a school user out of the portal.
"""
from django.contrib import admin
from django.http import HttpResponse

from .throttles import FailureCounter, client_address

LOCKED_MESSAGE = "Too many failed sign-in attempts. Please wait 15 minutes and try again."
BY_USERNAME = FailureCounter("admin-login-user", limit=10, seconds=15 * 60)
BY_ADDRESS = FailureCounter("admin-login-ip", limit=30, seconds=15 * 60)


def guarded_admin_login(request, extra_context=None):
    if request.method != "POST":
        return admin.site.login(request, extra_context)
    username = (request.POST.get("username") or "").strip().lower()[:254]
    address = client_address(request)
    if BY_USERNAME.blocked(username) or BY_ADDRESS.blocked(address):
        return HttpResponse(LOCKED_MESSAGE, status=429, content_type="text/plain; charset=utf-8")
    response = admin.site.login(request, extra_context)
    # A good password signs in and redirects; a wrong one shows the form again.
    if request.user.is_authenticated and request.user.is_staff:
        BY_USERNAME.clear(username)
    else:
        BY_USERNAME.record(username)
        BY_ADDRESS.record(address)
    return response
