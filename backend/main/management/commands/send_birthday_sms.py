from django.core.management.base import BaseCommand


class Command(BaseCommand):
    """
    The daily birthday SMS, as a management command.

    The logic already existed as `backend/scripts/wish_birthday.py`, invoked by a
    shell wrapper from cron. Wrappers live only on the server and have been lost
    to a deploy before, taking the job with them silently. A management command
    is tracked in the repo, so restoring the schedule is one crontab line
    against `manage.py` and nothing else has to survive on disk.

    Students and staff are separate opt-ins on each school's preferences, so
    `--students-only` / `--staff-only` exist mainly to verify one side at a time.
    """

    help = (
        "Send the daily birthday wish SMS to students and staff whose BS birth "
        "date falls today, for every school that opted in and has an SMS key "
        "and a template."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--students-only",
            action="store_true",
            help="Only wish students.",
        )
        parser.add_argument(
            "--staff-only",
            action="store_true",
            help="Only wish teachers and other staff.",
        )

    def handle(self, *args, **opts):
        # Imported here rather than at module scope: the script calls
        # django.setup() on import, which must not run while the command module
        # is being discovered.
        from backend.scripts.wish_birthday import BirthdayWisher

        wisher = BirthdayWisher()
        students_only = opts["students_only"]
        staff_only = opts["staff_only"]

        if not staff_only:
            wisher.wish_students()
            self.stdout.write("Student birthday wishes dispatched.")
        if not students_only:
            wisher.wish_staffs()
            self.stdout.write("Staff birthday wishes dispatched.")
        self.stdout.write(self.style.SUCCESS("Done."))
