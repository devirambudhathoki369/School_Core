"""How each school is taking to the app.

    python manage.py mobile_status             # the schools that use the app
    python manage.py mobile_status --school 3  # one school, app or not

For each school: its code, parents and their confirmed children, links
waiting for review, parents who have joined (an email on record), and the
phones signed in, with and without notifications.
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q

from main.models.Guardian import Guardian, StudentGuardian
from main.models.SchoolAdmin import SchoolAdmin
from mobileapi.models import AppSession


class Command(BaseCommand):
    help = "Show how each school is taking to the app."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Only this school (by id), even if it does not use the app.")

    def handle(self, *args, school=None, **options):
        schools = SchoolAdmin.objects.filter(pk=school) if school else SchoolAdmin.objects.filter(
            uses_mobile_app=True, is_active=True
        )
        self.stdout.write(f"{'id':>5}  {'code':<8} {'parents':>8} {'linked':>7} {'review':>7} {'joined':>7} "
                          f"{'phones':>7} {'notify':>7}")
        for each in schools.order_by("id"):
            links = StudentGuardian.objects.filter(guardian__school=each).aggregate(
                linked=Count("id", filter=Q(state=StudentGuardian.LINKED)),
                review=Count("id", filter=Q(state=StudentGuardian.NEEDS_REVIEW)),
            )
            parents = Guardian.objects.filter(school=each, is_active=True).aggregate(
                all=Count("id"), joined=Count("id", filter=Q(email__isnull=False)),
            )
            phones = AppSession.objects.filter(school=each, revoked_at__isnull=True).aggregate(
                all=Count("id"), notify=Count("id", filter=Q(push_token__isnull=False)),
            )
            self.stdout.write(
                f"{each.id:>5}  {each.app_code or '-':<8} {parents['all']:>8} {links['linked']:>7} "
                f"{links['review']:>7} {parents['joined']:>7} {phones['all']:>7} {phones['notify']:>7}"
            )
