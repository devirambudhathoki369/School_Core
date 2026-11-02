from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, SimpleTestCase, override_settings
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.test import APIClient, APIRequestFactory

from account.auth.Authentication import BaseTokenAuthentication, request_token
from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from account.models import AdminAccount


@override_settings(ENFORCE_ORIGIN_CHECK=True, CORS_ALLOWED_ORIGINS=['https://portal.example'], CSRF_TRUSTED_ORIGINS=[])
class BrowserOriginTests(SimpleTestCase):
    def test_cookie_writes_require_trusted_origin_or_referer(self):
        guard = BaseTokenAuthentication()
        factory = APIRequestFactory()
        for headers in ({}, {'HTTP_ORIGIN': 'null'}, {'HTTP_ORIGIN': 'https://evil.example'},
                        {'HTTP_SEC_FETCH_SITE': 'same-site'}, {'HTTP_REFERER': 'https://portal.example.evil/path'},
                        {'HTTP_ORIGIN': 'https://evil.example', 'HTTP_REFERER': 'https://portal.example/page'}):
            with self.subTest(headers=headers), self.assertRaises(PermissionDenied):
                guard.enforce_trusted_origin(factory.post('/', **headers), None)
        for headers in ({'HTTP_ORIGIN': 'https://portal.example'}, {'HTTP_REFERER': 'https://portal.example/page'}):
            guard.enforce_trusted_origin(factory.post('/', **headers), None)

    def test_strict_token_header(self):
        factory = APIRequestFactory()
        for value in ('Bearer secret', 'Basic secret', 'IGNITE', 'IGNITE secret extra'):
            with self.subTest(value=value), self.assertRaises(AuthenticationFailed):
                request_token(factory.get('/', HTTP_AUTHORIZATION=value))
        self.assertEqual(request_token(factory.get('/', HTTP_AUTHORIZATION='ignite secret')), ('secret', False))


class AuthenticationRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)
        self.account = AdminAccount.objects.create_user(username='secure-admin', password='Schoo1@core')
        self.token = AdminAuthToken.issue(self.account).key
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'IGNITE {self.token}')

    def test_own_password_requires_current_password_and_revokes_every_session(self):
        AdminAuthToken.issue(self.account)
        data = {'role': 'admin', 'user': self.account.pk, 'password': 'three quiet rivers at dawn', 'confirm_password': 'three quiet rivers at dawn'}
        for current in (None, 'incorrect'):
            data['current_password'] = current
            response = self.client.put('/auth/change_password', data, format='json')
            self.assertEqual(response.status_code, 400, response.content)
            self.account.refresh_from_db()
            self.assertTrue(self.account.check_password('Schoo1@core'))
            self.assertEqual(AdminAuthToken.objects.filter(user=self.account).count(), 2)
        data['current_password'] = 'Schoo1@core'
        response = self.client.put('/auth/change_password', data, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(AdminAuthToken.objects.filter(user=self.account).exists())
        self.account.refresh_from_db()
        self.assertTrue(self.account.check_password(data['password']))
        self.assertEqual(self.client.get('/auth/profile').status_code, 401)

    def test_invalid_header_cannot_restore_or_logout_session(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        self.assertIn(self.client.get('/auth/admin/obtain').status_code, (401, 403))
        self.assertIn(self.client.post('/auth/logout', {'role': 'admin'}, format='json').status_code, (401, 403))
        self.assertTrue(AdminAuthToken.objects.filter(key=self.token).exists())

    def test_cookie_logout_requires_origin_but_native_header_does_not(self):
        browser = APIClient()
        browser.cookies['smsys'] = self.token
        self.assertEqual(browser.post('/auth/logout', {'role': 'admin'}, format='json').status_code, 403)
        self.assertEqual(browser.post('/auth/logout', {'role': 'admin'}, format='json', HTTP_ORIGIN='http://testserver').status_code, 200)

    def test_login_csrf_and_invalid_payloads(self):
        client = APIClient()
        data = {'username': self.account.username, 'password': 'Schoo1@core'}
        self.assertEqual(client.post('/auth/admin/signin', data, format='json', HTTP_ORIGIN='https://evil.example').status_code, 403)
        for invalid in ({'username': ['bad'], 'password': 'x'}, {'username': 'ok', 'password': {'bad': 'value'}}):
            self.assertEqual(client.post('/auth/admin/signin', invalid, format='json').status_code, 400)

    def test_missing_account_still_performs_password_hash(self):
        with patch('account.views.make_password') as hash_password:
            response = APIClient().post('/auth/admin/signin', {'username': 'missing-account', 'password': 'guess'}, format='json')
        self.assertEqual(response.status_code, 401)
        hash_password.assert_called_once_with('guess')

    def test_unknown_obtain_role_is_bad_request_not_server_error(self):
        self.assertEqual(self.client.get('/auth/obtain?role=unknown').status_code, 400)

    def test_auth_responses_are_not_cacheable(self):
        response = self.client.get('/auth/admin/obtain')
        self.assertIn('no-store', response['Cache-Control'])

    def test_unverified_account_cannot_use_existing_session(self):
        self.account.verified = False
        self.account.save(update_fields=['verified'])
        self.assertEqual(self.client.get('/auth/profile').status_code, 401)
        self.assertNotIn('user', self.client.get('/auth/admin/obtain').json())

    def test_old_password_still_signs_in_and_throttle_still_applies(self):
        client = APIClient()
        body = {'username': self.account.username, 'password': 'incorrect'}
        for _ in range(10):
            self.assertEqual(client.post('/auth/admin/signin', body, format='json').status_code, 401)
        body['password'] = 'Schoo1@core'
        self.assertEqual(client.post('/auth/admin/signin', body, format='json').status_code, 429)
        cache.clear()
        self.assertEqual(client.post('/auth/admin/signin', body, format='json').status_code, 200)


class OTPResendTests(TestCase):
    def setUp(self):
        from main.models.FiscalYears import EconomicYear, AcademicYear
        from main.models.SchoolAdmin import SchoolAdmin
        from main.models.ClassInfo import ClassInfo
        from main.models.Student import Student, StudentGuardianInfo
        from account.models import StudentAccount
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)
        fy = EconomicYear.objects.create(name='2083/84', start_date='2083-04-01', end_date='2084-03-31')
        school = SchoolAdmin.objects.create(name='OTP school', address='Test', estd_date='2080-01-01', renew_date='2084-01-01', pan_no='123', email='otp@example.com', economic_year=fy, account=AdminAccount.objects.create(username='otp-admin'))
        year = AcademicYear.objects.create(school=school, name='2083', start_date='2083-01-01', end_date='2083-12-30')
        classroom = ClassInfo.objects.create(school=school, academic_year=year, education_level=2, grade=5)
        self.account = StudentAccount.objects.create_user(username='otp-student', password='old-password', verified=False)
        Student.objects.create(first_name='Asha', last_name='Pun', birth_date='2070-01-01', gender=2, location='Test', class_info=classroom, academic_year=year, account=self.account, guardian_info=StudentGuardianInfo.objects.create(father_name='F', mother_name='M', guardian_contact='9800000000'))
        self.client = APIClient()

    def resend(self):
        return self.client.get('/auth/otp/resend', {'username': self.account.username, 'contact': '9800000000'})

    @patch('account.views.send_sms')
    @patch('account.views.extractSchoolSMSAPIKey', return_value='test-only')
    def test_only_one_sms_per_cooldown(self, key, sms):
        self.assertEqual(self.resend().status_code, 200)
        self.assertEqual(self.resend().status_code, 429)
        self.assertEqual(sms.call_count, 1)

    @patch('account.views.send_sms')
    def test_verified_account_cannot_be_unverified_by_resend(self, sms):
        self.account.verified = True
        self.account.save(update_fields=['verified'])
        self.assertEqual(self.resend().status_code, 400)
        self.account.refresh_from_db()
        self.assertTrue(self.account.verified)
        sms.assert_not_called()
