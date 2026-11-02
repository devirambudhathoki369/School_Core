"""The SMS API key box refuses anything that is not a key."""

from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from account.methods.smsKey import looks_like_sms_key
from account.models import AdminAccount
from main.test_invoice_audit import AuditSchoolWithStudent

KEY = "a1b2c3d4" * 8  # 64 hex, the shape of every key in use


class SMSKeyTests(AuditSchoolWithStudent, TestCase):
    def setUp(self):
        self.addCleanup(users_context.set, None)
        AdminAccount.objects.filter(id=self.admin.id).update(sms_api=KEY)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}")

    def save(self, value):
        return self.client.put(
            "/auth/account_update", {"role": "admin", "user": self.admin.id, "sms_api": value}, format="json",
        )

    def stored(self):
        return AdminAccount.objects.get(id=self.admin.id).sms_api

    def test_the_real_announcement_is_refused_and_the_key_is_kept(self):
        text = "नमस्ते यहि कत्तिक १५ गते नतिजा प्रकासिट हुने भएकाले उपस्थिति हुन् अनुरोध छ"
        res = self.save(text)
        self.assertEqual(res.status_code, 400)
        self.assertIn("not an SMS API key", res.json()["message"])
        self.assertEqual(self.stored(), KEY)

    def test_english_sentences_and_short_words_are_refused_too(self):
        for value in ("Results are out on Kartik 15, please come", "hello", "abc def ghi jkl mno pqr stu vwx"):
            self.assertEqual(self.save(value).status_code, 400, value)
        self.assertEqual(self.stored(), KEY)

    def test_a_real_key_saves_with_stray_spaces_trimmed(self):
        new = "f" * 64
        self.assertEqual(self.save(f"  {new}\n").status_code, 200)
        self.assertEqual(self.stored(), new)

    def test_every_key_shape_in_use_passes(self):
        self.assertTrue(looks_like_sms_key("0123456789abcdef" * 4))
        self.assertTrue(looks_like_sms_key("NewFormat-Token_2026.abcDEF123"))
        self.assertFalse(looks_like_sms_key(""))
        self.assertFalse(looks_like_sms_key(None))
