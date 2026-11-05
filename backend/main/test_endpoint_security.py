"""Discover routes at runtime so new endpoints cannot evade boundary tests.

These tests cover the shared authentication/tenant/CSRF gates, not every valid
business payload. Handler-specific tests cover the record-level rules.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import URLResolver, get_resolver, resolve
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, StaffAuthToken, StudentAuthToken
from account.auth.context import users_context
from account.models import StaffAccount, StudentAccount
from main.models.FiscalYears import EconomicYear
from main.models.Staff import Staff, StaffRole
from main import test_digital_id as fixtures
from main.views.BaseViews import SecuredAPIView


def protected_routes(patterns=None, prefix=''):
    for pattern in patterns or get_resolver().url_patterns:
        path = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from protected_routes(pattern.url_patterns, path)
            continue
        view = getattr(pattern.callback, 'cls', None)
        if view and issubclass(view, SecuredAPIView):
            for method in view.http_method_names:
                if hasattr(view, method) or method == 'head' and hasattr(view, 'get'):
                    yield '/' + path, method, view


@override_settings(ENFORCE_SCHOOL_SCOPE=True, ENFORCE_ORIGIN_CHECK=True, ENFORCE_STAFF_PERMISSIONS=True)
class EndpointSecurityTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        year = EconomicYear.objects.create(name='2083/84', start_date='2083-04-01', end_date='2084-03-30')
        cls.school = fixtures.DigitalIdTests.school('route-one', year)
        cls.other = fixtures.DigitalIdTests.school('route-two', year)
        staff = StaffAccount.objects.create(username='route-staff')
        Staff.objects.create(account=staff, school=cls.school, role=StaffRole.objects.create(role='Teacher'),
                             first_name='Route', last_name='Test', primary_contact='9800000000', location='Test')
        student = StudentAccount.objects.create(username='route-student')
        fixtures.DigitalIdTests.student(cls.school, 'Route', student)
        cls.tokens = {
            'AdminTokenAuthentication': AdminAuthToken.issue(cls.school.account).key,
            'StaffTokenAuthentication': StaffAuthToken.issue(staff).key,
            'StudentTokenAuthentication': StudentAuthToken.issue(student).key,
        }

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)

    def call(self, client, path, method, data=None, **headers):
        # No request can consume another one's throttle quota in a gate test.
        cache.clear()
        parsers = resolve(path).func.cls.parser_classes
        format_name = 'json' if any(p.media_type == 'application/json' for p in parsers) else 'multipart'
        return getattr(client, method)(path, data or {}, format=format_name, **headers)

    def test_every_protected_method_rejects_anonymous_and_invalid_tokens(self):
        count = 0
        for path, method, view in protected_routes():
            for token in (None, 'invalid-security-audit-token'):
                client = APIClient()
                if token:
                    client.credentials(HTTP_AUTHORIZATION=f'IGNITE {token}')
                with self.subTest(path=path, method=method, token=bool(token)):
                    response = self.call(client, path, method)
                    self.assertIn(response.status_code, (401, 403), response.content)
                count += 1
        print(f'Endpoint audit: {count} anonymous/invalid-token checks')

    def test_every_school_token_is_refused_another_school(self):
        count = 0
        for path, method, view in protected_routes():
            if method == 'options':
                continue
            for auth in view.authentication_classes:
                token = self.tokens.get(auth.__name__)
                if not token:
                    continue
                client = APIClient()
                client.credentials(HTTP_AUTHORIZATION=f'IGNITE {token}')
                with self.subTest(path=path, method=method, role=auth.__name__):
                    response = self.call(client, path, method, {'school': self.other.pk})
                    self.assertIn(response.status_code, (401, 403), response.content)
                count += 1
        print(f'Endpoint audit: {count} cross-school checks')

    def test_every_cookie_write_requires_a_trusted_origin(self):
        count = 0
        for path, method, view in protected_routes():
            if method in ('get', 'head', 'options'):
                continue
            if not any(auth.__name__ == 'AdminTokenAuthentication' for auth in view.authentication_classes):
                continue
            for headers in ({}, {'HTTP_ORIGIN': 'https://untrusted.example'}):
                client = APIClient()
                client.cookies['smsys'] = self.tokens['AdminTokenAuthentication']
                with self.subTest(path=path, method=method, headers=headers):
                    response = self.call(client, path, method, {'school': self.school.pk}, **headers)
                    self.assertIn(response.status_code, (401, 403), response.content)
                count += 1
        print(f'Endpoint audit: {count} cookie-origin checks')
