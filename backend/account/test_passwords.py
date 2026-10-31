from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.models import AdminAccount
from account.passwords import password_problem
from account.auth.context import users_context


class PasswordRuleTests(SimpleTestCase):
    def test_the_rule(self):
        self.assertIsNone(password_problem("Schoo1@core"))
        for weak in ("a", "simple", "Secret1", "secret@1", "SECRET@1", "Secret@", "Aa@1", "Toolong@12345678901234", None, 12345678):
            self.assertIsNotNone(password_problem(weak), weak)

    def test_a_common_password_is_refused_even_when_it_fits_the_pattern(self):
        self.assertIsNotNone(password_problem("Password@1".replace("@1", "1")))
        self.assertIsNotNone(password_problem("P@ssw0rd"))


class ServerRefusesWeakPasswordsTests(TestCase):
    def setUp(self):
        # A request leaves its account in the context for the next request to clear.
        self.addCleanup(users_context.set, None)

    def test_changing_a_password_by_the_api(self):
        account = AdminAccount.objects.create_user(username="admin-rule", password="Schoo1@core")
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=account).key}")
        body = {"role": "admin", "user": account.id, "password": "a", "confirm_password": "a"}
        self.assertEqual(client.put("/auth/change_password", body, format="json").status_code, 400)
        account.refresh_from_db()
        self.assertTrue(account.check_password("Schoo1@core"))
