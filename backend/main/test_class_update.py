from types import SimpleNamespace

from django.test import SimpleTestCase

from main.views.ClassViews import ClassViews


class ClassUpdateTests(SimpleTestCase):
    def test_only_the_superuser_may_move_classes_between_years(self):
        # A local variable named `status` once shadowed rest_framework's, so
        # this refusal raised UnboundLocalError and answered 500.
        for role in (None, "admin", "staff", "student"):
            request = SimpleNamespace(user_role=role, data={"school": 1, "data": []})
            answer = ClassViews().put(request)
            self.assertEqual(answer.status_code, 403, role)
