"""Create parents (main_guardian) and their links from student records.

    manage.py link_guardians                  # report only, writes nothing
    manage.py link_guardians --apply          # write
    manage.py link_guardians --school 3       # one school, app or not

Without --school it covers the schools that use the mobile app. It never
deletes and never changes a link the school decided, so it is safe to rerun.
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from main.models.SchoolAdmin import SchoolAdmin
from mobileapi.guardians import LinkReport, link_school


class Command(BaseCommand):
    help = "Create parents and their links to students from the student records."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Only this school (by id), even if it does not use the app.")
        parser.add_argument("--apply", action="store_true", help="Write. Without it, nothing is saved.")

    def handle(self, *args, school=None, apply=False, **options):
        if school is not None:
            schools = SchoolAdmin.objects.filter(pk=school)
            if not schools.exists():
                raise CommandError(f"No school with id {school}.")
        else:
            schools = SchoolAdmin.objects.filter(uses_mobile_app=True, is_active=True)
        total = LinkReport()
        with transaction.atomic():
            for each in schools.order_by("id"):
                report = link_school(each)
                total.add(report)
                self.stdout.write(
                    f"{each.id:>5}  {each.name[:40]:<40}  students {report.students:>5}  "
                    f"not mobile {report.not_mobile:>4}  parents new {report.guardians_new:>5}  "
                    f"linked {report.links_linked:>5}  to review {report.links_review:>4}  "
                    f"emails {report.emails_set:>4}"
                )
                for email, phone in report.email_conflicts:
                    self.stdout.write(f"       email {email} also on number ending {phone[-3:]}: left off")
            if not apply:
                transaction.set_rollback(True)
        self.stdout.write(
            f"Total: students {total.students}, not mobile {total.not_mobile}, parents new {total.guardians_new}, "
            f"linked {total.links_linked}, to review {total.links_review}, emails {total.emails_set}."
        )
        self.stdout.write(self.style.SUCCESS("Written.") if apply else "Nothing written: run again with --apply.")
