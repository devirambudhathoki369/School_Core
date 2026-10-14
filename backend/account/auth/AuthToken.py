from typing import Any
from datetime import timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone
import binascii
import os
from django.utils.translation import gettext_lazy as _
from rest_framework.authtoken.serializers import AuthTokenSerializer
from django.contrib.auth.models import User
from django.contrib import admin


class AuthToken(models.Model):
    # How many devices one account may stay signed in on at once. Kept generous
    # on purpose: office accounts get shared across every machine in the room,
    # and a tight cap would just recreate the "someone else signed in and threw
    # me out" complaint this whole model exists to remove.
    MAX_ACTIVE_SESSIONS = 25

    key = models.CharField(_("Token"), max_length=40, primary_key=True)
    created = models.DateTimeField(_("Created"), auto_now_add=True)
    # The FCM registration id this session signed in with, when it came from the
    # mobile app. It is what lets logout tell "this is the phone, drop its push
    # registration" apart from "this is the office desktop, leave the phone
    # alone" — the account only has room for one app_device_token, so without
    # this the web logout used to unregister the user's phone from push.
    device_token = models.CharField(
        _("Device token"), max_length=255, null=True, blank=True
    )

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)

    #
    def save(self, *args, **kwargs):
        if not self.key:
            self.key = self.generate_token()
        return super().save(*args, **kwargs)

    @classmethod
    def generate_token(cls):
        return binascii.hexlify(os.urandom(20)).decode()

    @classmethod
    def issue(cls, user, device_token=None):
        """
        Mint a fresh session token for `user` and return it.

        Every sign-in gets its own key so devices never share a session. To stop
        that from growing without bound (a phone that re-authenticates on each
        app launch would otherwise leave a row behind every time), only the
        newest MAX_ACTIVE_SESSIONS keys per user survive — older ones are
        dropped, which signs out whichever device signed in longest ago.
        """
        token = cls.objects.create(user=user, device_token=device_token or None)
        keep = list(
            cls.objects.filter(user=user)
            .order_by("-created")
            .values_list("key", flat=True)[: cls.MAX_ACTIVE_SESSIONS]
        )
        # the just-created key is the newest, so it is always inside `keep` —
        # excluding it again only guards the case where a burst of sign-ins
        # lands on an identical `created` timestamp and the ordering is a toss-up.
        cls.objects.filter(user=user).exclude(key__in=keep).exclude(
            key=token.key
        ).delete()
        return token

    @property
    def is_expired(self):
        """
        Has this session outlived its welcome?

        `created` was recorded from the very first version of this model and
        never once read, so every token ever minted was valid forever — a key
        lifted from a phone's storage, a log or a proxy kept working
        indefinitely, and nothing short of a manual DELETE could stop it.

        The TTL is a setting rather than a constant so it can be widened, or
        switched off with `AUTH_TOKEN_TTL_DAYS=0`, without a code change.
        """
        ttl = getattr(settings, "AUTH_TOKEN_TTL_DAYS", 0)
        if not ttl:
            return False
        return timezone.now() - self.created > timedelta(days=ttl)

    def __str__(self):
        return f"token_{self.user.username}"

    class Meta:
        abstract = True


class AuthTokenSerializer(AuthTokenSerializer):
    pass


# One row per SESSION, not per user.
#
# These used to be OneToOne, so a user had exactly one token no matter how many
# devices they were signed in on: the office desktop and the phone shared the
# same key, and logging out on either one deleted that single row and kicked the
# other one out mid-work. A ForeignKey lets every login mint its own key, so a
# logout only ever ends the session that asked for it. `related_name="tokens"`
# gives each account model `account.tokens` for the "all my sessions" cases
# (password change, account deletion) that must still clear every device.
class UserAuthToken(AuthToken):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tokens")


class SuperAdminAuthToken(AuthToken):
    user = models.ForeignKey(
        "account.SuperAdminAccount", on_delete=models.CASCADE, related_name="tokens"
    )


class AdminAuthToken(AuthToken):
    user = models.ForeignKey(
        "account.AdminAccount", on_delete=models.CASCADE, related_name="tokens"
    )


class StaffAuthToken(AuthToken):
    user = models.ForeignKey(
        "account.StaffAccount", on_delete=models.CASCADE, related_name="tokens"
    )


class StudentAuthToken(AuthToken):
    user = models.ForeignKey(
        "account.StudentAccount", on_delete=models.CASCADE, related_name="tokens"
    )


# ---
from django.utils import timezone


class AuthTokenAdmin(admin.ModelAdmin):
    list_display = ("user", "created", "days_since_created")
    list_filter = ("created",)
    ordering = ("created",)

    @admin.display(description="Age")
    def days_since_created(self, obj):
        now = timezone.now()
        diff = now - obj.created
        days = diff.days

        if days == 0:
            return "Today"
        return f"{days} days ago"
