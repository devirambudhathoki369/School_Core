"""
Delete audit trail rows older than a period the school's legal needs decide.

    python manage.py prune_history_log --days 730            # say how many
    python manage.py prune_history_log --days 730 --apply    # delete them, in batches

There is no default, on purpose: this is a decision about people's records.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from main.models.history_log.HistoryLog import HistoryLog

BATCH = 5000


class Command(BaseCommand):
    help = "Delete audit trail rows older than --days."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, required=True, help="keep this many days")
        parser.add_argument("--apply", action="store_true", help="really delete them")

    def handle(self, *args, **options):
        if options["days"] < 1:
            self.stderr.write("--days must be at least 1.")
            raise SystemExit(2)
        old = HistoryLog.objects.filter(timestamp__lt=timezone.now() - timedelta(days=options["days"]))
        if not options["apply"]:
            self.stdout.write(f"Would delete {old.count()} row(s).")
            return
        deleted = 0
        while True:
            ids = list(old.values_list("pk", flat=True)[:BATCH])
            if not ids:
                break
            deleted += HistoryLog.objects.filter(pk__in=ids)._raw_delete(HistoryLog.objects.db)
        self.stdout.write(f"Deleted {deleted} row(s).")
