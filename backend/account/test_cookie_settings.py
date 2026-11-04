from django.test import SimpleTestCase, override_settings
from rest_framework.response import Response

from account.views import clear_auth_cookie


class AuthCookieSettingsTests(SimpleTestCase):
    @override_settings(AUTH_COOKIE_SECURE=True, AUTH_COOKIE_SAMESITE="None")
    def test_production_logout_expires_secure_cross_site_cookie(self):
        cookie = clear_auth_cookie(Response()).cookies["smsys"]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "None")
        self.assertEqual(cookie["max-age"], 0)

    @override_settings(AUTH_COOKIE_SECURE=False, AUTH_COOKIE_SAMESITE="Lax")
    def test_local_logout_matches_http_cookie_attributes(self):
        cookie = clear_auth_cookie(Response()).cookies["smsys"]
        self.assertFalse(cookie["secure"])
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["samesite"], "Lax")
        self.assertEqual(cookie["max-age"], 0)
