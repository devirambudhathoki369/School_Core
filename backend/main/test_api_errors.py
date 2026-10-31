from django.db import IntegrityError
from django.test import SimpleTestCase

from main.views.errors import api_exception_handler


class ApiErrorTests(SimpleTestCase):
    def answer(self, exc):
        with self.assertLogs("django.request", level="ERROR"):
            return api_exception_handler(exc, {"view": self})

    def test_what_the_caller_sent_wrong_is_a_400(self):
        for exc in (ValueError("abc"), KeyError("school"), TypeError("x"), AttributeError("x")):
            self.assertEqual(self.answer(exc).status_code, 400, exc)

    def test_a_write_the_database_refuses_is_a_409(self):
        answer = self.answer(IntegrityError("duplicate key"))
        self.assertEqual(answer.status_code, 409)
        self.assertNotIn("duplicate key", answer.data["message"])

    def test_anything_else_stays_a_server_error(self):
        self.assertIsNone(api_exception_handler(OSError("disk"), {"view": self}))
