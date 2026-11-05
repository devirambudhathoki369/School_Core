"""Security boundaries found during the November 2026 endpoint audit.

Run only with backend.test_settings for an isolated database.
"""
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from account.auth.AuthToken import StaffAuthToken, StudentAuthToken
from account.auth.context import users_context
from account.models import StaffAccount, StudentAccount
from main.models.FiscalYears import EconomicYear
from main.models.Staff import Staff, StaffRole
from main import test_digital_id as fixtures
from rfid.models.Device import Device, DeviceCommand
from rfid.services.DeviceCommandQueueReg import CommandQueue


@override_settings(ENFORCE_STAFF_PERMISSIONS=True, ENFORCE_SCHOOL_SCOPE=True,
                   ICLOCK_REQUIRE_PUSH_KEY=True)
class SecurityAuditTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)
        year = EconomicYear.objects.create(name='2083/84', start_date='2083-04-01', end_date='2084-03-30')
        self.school = fixtures.DigitalIdTests.school('audit', year)
        self.other_school = fixtures.DigitalIdTests.school('audit-other', year)
        self.student = fixtures.DigitalIdTests.student(self.school, 'Audit')
        role = StaffRole.objects.create(role='Teacher')
        self.staff_account = StaffAccount.objects.create_user(username='audit-teacher', password='original staff passphrase')
        self.colleague = StaffAccount.objects.create_user(username='audit-payroll', password='original payroll passphrase')
        for account, permissions in ((self.staff_account, []), (self.colleague, [505])):
            Staff.objects.create(account=account, school=self.school, role=role,
                first_name='Audit', last_name='Teacher', primary_contact='9800000000',
                location='Test', permissions=permissions)
        self.staff_client = APIClient()
        self.staff_client.credentials(HTTP_AUTHORIZATION=f'IGNITE {StaffAuthToken.issue(self.staff_account).key}')

    def registration(self, **extra):
        return {'student': self.student.pk, 'contact': '9800000000',
                'username': 'audit-student', 'password': 'a unique student passphrase', **extra}

    def test_staff_cannot_reset_colleague_password(self):
        response = self.staff_client.put('/auth/change_password', {
            'role': 'staff', 'user': self.colleague.pk,
            'password': 'attacker chosen passphrase', 'confirm_password': 'attacker chosen passphrase',
        }, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.colleague.refresh_from_db()
        self.assertTrue(self.colleague.check_password('original payroll passphrase'))

    def test_registration_without_sms_key_fails_closed(self):
        with patch('account.serializers.extractSchoolSMSAPIKey', return_value=None):
            response = APIClient().post('/auth/student/register', self.registration(), format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.student.refresh_from_db()
        self.assertIsNone(self.student.account_id)
        self.assertFalse(StudentAccount.objects.filter(username='audit-student').exists())

    def test_registration_cannot_replace_existing_account(self):
        existing = StudentAccount.objects.create_user(username='audit-existing', password='existing student passphrase')
        self.student.account = existing
        self.student.save()
        with patch('account.serializers.send_sms') as sms, patch('account.serializers.extractSchoolSMSAPIKey', return_value='test-key'):
            response = APIClient().post('/auth/student/register', self.registration(), format='json')
        self.assertEqual(response.status_code, 400, response.content)
        self.student.refresh_from_db()
        self.assertEqual(self.student.account_id, existing.pk)
        sms.assert_not_called()

    def test_registration_attaches_student_only_after_otp(self):
        with patch('account.serializers.send_sms', return_value=True), patch('account.serializers.extractSchoolSMSAPIKey', return_value='test-key'):
            response = APIClient().post('/auth/student/register', self.registration(), format='json')
        self.assertEqual(response.status_code, 200, response.content)
        account = StudentAccount.objects.get(username='audit-student')
        self.assertFalse(account.verified)
        self.student.refresh_from_db()
        self.assertIsNone(self.student.account_id)
        response = APIClient().post('/auth/otp/verify', {'username': account.username, 'otp': account.otp}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        self.student.refresh_from_db()
        self.assertEqual(self.student.account_id, account.pk)

    def test_keyless_device_cannot_poll_commands(self):
        device = Device.objects.create(serial_number='audit-keyless', school=self.school)
        command = CommandQueue.enqueue(device, 'DATA UPDATE user Pin=1 CardNo=123456')
        response = APIClient().get('/iclock/getrequest', {'SN': device.serial_number})
        self.assertEqual(response.status_code, 403)
        command.refresh_from_db()
        self.assertEqual(command.status, DeviceCommand.STATUS_PENDING)

    def test_ping_requires_key_even_when_other_routes_require_it(self):
        device = Device.objects.create(serial_number='audit-keyed', school=self.school, push_comm_key='audit-device-secret')
        response = APIClient().get('/iclock/ping', {'SN': device.serial_number})
        self.assertEqual(response.status_code, 403)
        device.refresh_from_db()
        self.assertIsNone(device.last_seen)

    def test_command_ack_is_scoped_to_authenticated_device(self):
        own = Device.objects.create(serial_number='audit-device-one', school=self.school, push_comm_key='audit-device-secret')
        other = Device.objects.create(serial_number='audit-device-two', school=self.other_school, push_comm_key='other-device-secret')
        command = CommandQueue.enqueue(other, 'DATA QUERY user')
        response = APIClient().post(
            f'/iclock/devicecmd?SN={own.serial_number}&pushcommkey=audit-device-secret',
            f'ID={command.cmd_id}&Return=0', content_type='text/plain')
        self.assertEqual(response.status_code, 200)
        command.refresh_from_db()
        self.assertEqual(command.status, DeviceCommand.STATUS_PENDING)
