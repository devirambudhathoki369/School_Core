"""Canteen users — the people who sign in at /canteen and see the canteen only.

  GET   /canteen/users         ?school=                         every canteen user
  POST  /canteen/users         {username, password, full_name, contact?, permissions}
  PUT   /canteen/users         {id, full_name?, contact?, permissions?, is_active?, password?}
  PUT   /canteen/my-password   {current_password, password}     a canteen user's own

The school admin adds them. So may anyone holding the Canteen Users page — a
member of staff, or the canteen's own manager signed in as a canteen user — but
only with pages they hold themselves, and only over a user whose pages they
hold all of: a counter hand given this page must not be able to switch the
manager off, or reset the manager's password and sign in as them.

Nobody is deleted. Switching a user off ends their sessions and keeps the row:
the slips and receipts they wrote carry their name.
"""

import re

from django.db import IntegrityError, transaction
from rest_framework.response import Response

from account.auth.UserRole import UserRoles

from ..auth import CanteenUserTokenAuthentication
from ..constants import PAGE_CHOICES, PAGE_USERS
from ..methods.users import clean_pages
from ..models import CanteenUser, CanteenUserToken
from .BaseViews import CanteenBaseView

USERNAME = re.compile(r"^[\w.@+-]{6,25}$")
PAGE_NAMES = dict(PAGE_CHOICES)


def password_problem(password):
    """The rule every password in the portal follows (OwnPasswordChangeView,
    schemas/validations strong_password): 6-20 characters, upper and lower
    case, a number and one of @$!%*#?&."""
    if not (
        6 <= len(password) <= 20
        and re.search(r"[a-z]", password)
        and re.search(r"[A-Z]", password)
        and re.search(r"[0-9]", password)
        and re.search(r"[@$!%*#?&]", password)
    ):
        return ("A password needs 6 to 20 characters with upper and lower case letters, "
                "a number and one of @$!%*#?&.")
    return None


def user_json(user):
    pages = clean_pages(user.permissions)
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "contact": user.contact,
        "permissions": pages,
        "page_names": [PAGE_NAMES[p] for p in pages],
        "is_active": user.is_active,
        "created_by": user.created_by,
        "created_at": user.created_at,
        "last_login": user.last_login,
    }


class CanteenUserView(CanteenBaseView):
    pages_for = {method: (PAGE_USERS,) for method in ("GET", "POST", "PUT")}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        rows = CanteenUser.objects.filter(school_id=self.school_id(request)).order_by("-is_active", "full_name")
        return Response([user_json(u) for u in rows])

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        full_name = self.text(data.get("full_name"), 60)
        if not USERNAME.match(username):
            return Response({"message": "A username needs 6 to 25 letters or digits (and . @ + - _ only)."}, status=400)
        if not full_name or len(full_name) < 2:
            return Response({"message": "Write the person's name."}, status=400)
        problem = password_problem(password)
        if problem:
            return Response({"message": problem}, status=400)
        pages, refused = self.pages_to_grant(request, school_id, data.get("permissions"))
        if refused:
            return refused
        if CanteenUser.objects.filter(username__iexact=username).exists():
            return Response({"message": f"The username '{username}' is taken. Choose another."}, status=409)
        user = CanteenUser(
            school_id=school_id, username=username, full_name=full_name,
            contact=self.text(data.get("contact"), 20), permissions=pages,
            created_by=self.entered_by(request),
        )
        user.set_password(password)
        try:
            user.save()
        except IntegrityError:
            return Response({"message": f"The username '{username}' is taken. Choose another."}, status=409)
        return Response({
            "message": f"{full_name} can now sign in to the canteen as '{username}'.",
            "user": user_json(user),
        })

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        user = CanteenUser.objects.filter(id=self.int_or_none(data.get("id")), school_id=school_id).first()
        if not user:
            return self.RESPONSE__NOT_FOUND
        held = set(self.pages_held(request, school_id))
        if not set(clean_pages(user.permissions)) <= held:
            return Response({"message": f"{user.full_name} has canteen pages you do not have, "
                                        "so only the school's office can change them."}, status=403)
        is_self = self.is_self(request, user)
        end_sessions = False
        if "full_name" in data:
            full_name = self.text(data.get("full_name"), 60)
            if not full_name or len(full_name) < 2:
                return Response({"message": "Write the person's name."}, status=400)
            user.full_name = full_name
        if "contact" in data:
            user.contact = self.text(data.get("contact"), 20)
        if "permissions" in data:
            pages, refused = self.pages_to_grant(request, school_id, data.get("permissions"))
            if refused:
                return refused
            user.permissions = pages
        if "is_active" in data:
            active = self.bool_of(data.get("is_active"), user.is_active)
            if not active and is_self:
                return Response({"message": "You cannot switch off your own sign-in."}, status=400)
            end_sessions = end_sessions or (user.is_active and not active)
            user.is_active = active
        if data.get("password"):
            problem = password_problem(data.get("password"))
            if problem:
                return Response({"message": problem}, status=400)
            user.set_password(data.get("password"))
            end_sessions = True
        with transaction.atomic():
            user.save()
            if end_sessions:
                sessions = CanteenUserToken.objects.filter(user=user)
                if is_self:
                    # Their own password: the device they changed it on stays in.
                    sessions = sessions.exclude(key=getattr(request.auth, "key", None))
                sessions.delete()
        return Response({"message": f"{user.full_name} saved.", "user": user_json(user)})

    def pages_to_grant(self, request, school_id, values):
        """(pages, None), or (None, a refusal). Only canteen pages, at least one,
        and none the person granting does not hold."""
        if not isinstance(values, list):
            return None, Response({"message": "Tick the pages this person may open."}, status=400)
        pages = clean_pages(values)
        if not pages:
            return None, Response({"message": "Tick at least one page this person may open."}, status=400)
        missing = [PAGE_NAMES[p] for p in pages if p not in set(self.pages_held(request, school_id))]
        if missing:
            return None, Response({"message": "You can only give pages you have yourself: "
                                              + ", ".join(missing) + "."}, status=403)
        return pages, None

    def is_self(self, request, user):
        return (getattr(request, "user_role", None) == UserRoles.ROLE_CANTEEN
                and request.user.pk == user.pk)


class CanteenOwnPasswordView(CanteenBaseView):
    """A canteen user changes their own password. Staff and admins have their
    own way to (account/views.PasswordChangeView); this one takes canteen users
    alone, and the current password is asked again so an open counter left
    unattended cannot be used to lock its owner out."""

    authentication_classes = (CanteenUserTokenAuthentication,)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        user = request.user
        data = request.data
        password = data.get("password") or ""
        if not user.check_password(data.get("current_password") or ""):
            return Response({"message": "The current password is not right."}, status=400)
        problem = password_problem(password)
        if problem:
            return Response({"message": problem}, status=400)
        if user.check_password(password):
            return Response({"message": "The new password must differ from the current one."}, status=400)
        with transaction.atomic():
            user.set_password(password)
            user.save()
            # Every other device signs in again; this one carries on.
            CanteenUserToken.objects.filter(user=user).exclude(key=request.auth.key).delete()
        return Response({"message": "Password changed. Your other devices will need to sign in again."})
