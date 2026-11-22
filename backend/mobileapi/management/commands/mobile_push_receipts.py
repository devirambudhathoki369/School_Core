"""Read the receipts of the app's pushes (mobileapi/push.py, check_receipts).

    python manage.py mobile_push_receipts

Run it from cron every 15 minutes (check_push_receipts.sh). Each receipt says
whether Firebase or Apple took the push. A phone that is gone loses its
token, so nothing more is sent to it. Any other error, such as a wrong
Firebase key, goes to the log and Sentry.
"""
from django.core.management.base import BaseCommand

from mobileapi.push import check_receipts


class Command(BaseCommand):
    help = "Read the receipts of the app's pushes and clear the tokens of phones that are gone."

    def handle(self, *args, **options):
        result = check_receipts()
        self.stdout.write(
            f"read {result['read']}, waiting {result['waiting']}, phones gone {result['gone']}, "
            f"failed {result['failed']}, dropped after a day {result['dropped']}"
        )
