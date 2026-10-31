from cryptography.fernet import Fernet
from django.core import serializers
from django.db import connection
from django.test import TestCase, override_settings

from account.models import AdminAccount
from customs.EncryptedField import TOKEN_PREFIX, encrypt, encrypt_rows, is_encrypted
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.history_log.diff import model_instance_diff
from rfid.models.Device import Device


class EncryptedFieldTests(TestCase):
    def device(self, **extra):
        ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        school = SchoolAdmin.objects.create(
            name="School", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01", pan_no="123",
            email="one@example.com", account=AdminAccount.objects.create(username="admin-one"), economic_year=ey,
        )
        return Device.objects.create(serial_number="ABC123", school=school, **extra)

    def raw(self, table, column, pk):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {column} FROM {table} WHERE id = %s", [pk])
            return cursor.fetchone()[0]

    def test_the_database_holds_a_token_and_the_code_reads_the_value(self):
        account = AdminAccount.objects.create(username="admin-sms", sms_api="key-12345")
        self.assertTrue(self.raw("account_adminaccount", "sms_api", account.pk).startswith(TOKEN_PREFIX))
        self.assertEqual(AdminAccount.objects.get(pk=account.pk).sms_api, "key-12345")
        self.assertEqual(AdminAccount.objects.filter(pk=account.pk).values_list("sms_api", flat=True)[0], "key-12345")

    def test_saving_again_does_not_wrap_it_twice(self):
        account = AdminAccount.objects.create(username="admin-sms", sms_api="key-12345")
        account.refresh_from_db()
        account.save()
        account.refresh_from_db()
        self.assertEqual(account.sms_api, "key-12345")

    def test_empty_stays_empty_so_a_keyless_reader_can_be_told_apart(self):
        device = self.device()
        self.assertEqual(self.raw("rfid_device", "push_comm_key", device.pk), "")
        self.assertEqual(Device.objects.get(pk=device.pk).push_comm_key, "")

    def test_a_row_from_before_encryption_reads_as_it_is(self):
        account = AdminAccount.objects.create(username="admin-sms")
        with connection.cursor() as cursor:
            cursor.execute("UPDATE account_adminaccount SET sms_api = 'old-plain-key' WHERE id = %s", [account.pk])
        self.assertEqual(AdminAccount.objects.get(pk=account.pk).sms_api, "old-plain-key")

    def test_the_migration_step_encrypts_old_rows_and_can_undo_it(self):
        account = AdminAccount.objects.create(username="admin-sms")
        with connection.cursor() as cursor:
            cursor.execute("UPDATE account_adminaccount SET sms_api = 'old-plain-key' WHERE id = %s", [account.pk])
        forwards, backwards = encrypt_rows("account_adminaccount", "sms_api")

        class Editor:
            pass

        Editor.connection = connection
        forwards(None, Editor)
        forwards(None, Editor)
        self.assertTrue(is_encrypted(self.raw("account_adminaccount", "sms_api", account.pk)))
        self.assertEqual(AdminAccount.objects.get(pk=account.pk).sms_api, "old-plain-key")
        backwards(None, Editor)
        self.assertEqual(self.raw("account_adminaccount", "sms_api", account.pk), "old-plain-key")

    def test_a_dump_holds_the_token_and_loads_back(self):
        account = AdminAccount.objects.create(username="admin-sms", sms_api="key-12345")
        dumped = serializers.serialize("json", [AdminAccount.objects.get(pk=account.pk)])
        self.assertNotIn("key-12345", dumped)
        for row in serializers.deserialize("json", dumped):
            row.save()
        self.assertEqual(AdminAccount.objects.get(pk=account.pk).sms_api, "key-12345")

    def test_a_rotated_key_still_reads_old_tokens(self):
        old, new = Fernet.generate_key().decode(), Fernet.generate_key().decode()
        with override_settings(FIELD_ENCRYPTION_KEYS=[old]):
            token = encrypt("secret-value")
        with override_settings(FIELD_ENCRYPTION_KEYS=[new, old]):
            self.assertTrue(is_encrypted(token))

    def test_the_wrong_key_raises_rather_than_reading_as_empty(self):
        device = self.device(push_comm_key="reader-key")
        with override_settings(FIELD_ENCRYPTION_KEYS=[Fernet.generate_key().decode()]):
            with self.assertRaises(Exception):
                Device.objects.get(pk=device.pk)


class AuditTrailTests(TestCase):
    def test_it_says_a_secret_changed_and_not_what_it_was(self):
        old = AdminAccount(username="admin-sms", sms_api="old-secret-key")
        new = AdminAccount(username="admin-sms", sms_api="new-secret-key")
        self.assertEqual(model_instance_diff(old, new)["sms_api"], ("changed", "changed"))
