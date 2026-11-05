"""Make a family code for a parent (shown once), issued as the school admin.

    manage.py issue_family_code --school 3 --phone 9845744350
"""
from django.core.management.base import BaseCommand, CommandError

from main.models.Guardian import Guardian
from mobileapi.guardians import issue_family_code, normalize_phone


class Command(BaseCommand):
    help = "Make a single-use family code for one parent."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, required=True)
        parser.add_argument("--phone", required=True)

    def handle(self, *args, school, phone, **options):
        number = normalize_phone(phone)
        guardian = Guardian.objects.select_related("school__account").filter(school_id=school, phone=number).first()
        if guardian is None:
            raise CommandError("No parent with that number at that school. Run link_guardians first.")
        code = issue_family_code(guardian, admin=guardian.school.account)
        self.stdout.write(f"Family code for the parent with number ending {number[-3:]}: {code}")
        self.stdout.write("It works once, for 7 days. It is not stored and cannot be shown again.")
