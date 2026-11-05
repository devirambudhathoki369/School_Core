from django.urls import path

from .schema import MobileSchemaView
from .views.auth import (
    FamilyCodeView,
    ParentCodeView,
    ParentVerifyView,
    PasswordSignInView,
    RefreshView,
    SchoolLookupView,
)
from .views.me import CloseAccountView, MeView, SessionDetailView, SessionsView, SignOutEverywhereView, SignOutView

urlpatterns = [
    path("schema", MobileSchemaView.as_view(), name="schema"),
    # sign-in (phase 1)
    path("schools/<str:code>", SchoolLookupView.as_view(), name="school"),
    path("auth/signin", PasswordSignInView.as_view(), name="signin"),
    path("auth/parent/code", ParentCodeView.as_view(), name="parent-code"),
    path("auth/parent/verify", ParentVerifyView.as_view(), name="parent-verify"),
    path("auth/parent/family-code", FamilyCodeView.as_view(), name="parent-family-code"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/signout", SignOutView.as_view(), name="signout"),
    path("auth/signout-all", SignOutEverywhereView.as_view(), name="signout-all"),
    path("me", MeView.as_view(), name="me"),
    path("me/sessions", SessionsView.as_view(), name="sessions"),
    path("me/sessions/<uuid:session_id>", SessionDetailView.as_view(), name="session"),
    path("me/close-account", CloseAccountView.as_view(), name="close-account"),
]
