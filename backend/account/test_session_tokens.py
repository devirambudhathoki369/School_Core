from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, hashlib
from account.auth.context import users_context
from account.models import AdminAccount


class HashedSessionTokenTests(TestCase):
    def setUp(self):
        # A request leaves its account in the context for the next request to clear.
        self.addCleanup(users_context.set, None)
        self.account = AdminAccount.objects.create_user(username="admin-token", password="Schoo1@core")

    def stored(self):
        with connection.cursor() as cursor:
            cursor.execute("SELECT key FROM account_adminauthtoken WHERE user_id = %s", [self.account.pk])
            return [row[0] for row in cursor.fetchall()]

    def profile(self, token):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"IGNITE {token}")
        return client.get("/auth/profile")

    def test_the_table_holds_a_digest_and_the_sign_in_gets_the_token(self):
        token = AdminAuthToken.issue(self.account).key
        self.assertEqual(len(token), 40)
        self.assertEqual(self.stored(), [hashlib.sha256(token.encode()).hexdigest()])

    def test_the_token_opens_the_session(self):
        token = AdminAuthToken.issue(self.account).key
        self.assertEqual(self.profile(token).status_code, 200)

    def test_a_digest_from_the_table_opens_nothing(self):
        AdminAuthToken.issue(self.account)
        self.assertEqual(self.profile(self.stored()[0]).status_code, 401)

    def test_rows_read_back_can_still_be_found_and_deleted(self):
        token = AdminAuthToken.issue(self.account).key
        row = AdminAuthToken.objects.get(key=token)
        self.assertTrue(AdminAuthToken.objects.filter(key=row.key).exists())
        self.assertFalse(AdminAuthToken.objects.exclude(key=row.key).exists())
        row.delete()
        self.assertEqual(self.stored(), [])

    def test_a_new_row_can_be_deleted_by_the_token_it_gave_out(self):
        token = AdminAuthToken.issue(self.account)
        token.delete()
        self.assertEqual(self.stored(), [])

    def test_sessions_past_the_limit_are_dropped_by_their_digest(self):
        for _ in range(AdminAuthToken.MAX_ACTIVE_SESSIONS + 3):
            AdminAuthToken.issue(self.account)
        self.assertEqual(len(self.stored()), AdminAuthToken.MAX_ACTIVE_SESSIONS)
