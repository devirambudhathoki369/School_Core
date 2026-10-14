from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError

from main.models.Student import Student
from main.methods.push import dispatch_push, STUDENT_STATUS_RUNNING
from main.models.Notification import RECIPIENT_ROLE_STUDENT


class Command(BaseCommand):
    help = (
        "ONE-TIME global broadcast: push a notification to every active, "
        "app-using student across ALL schools. Token-targeted (the proven path), "
        "grouped per school so delivery is recorded in NotificationHistory and "
        "dead tokens are cleared. Dry-run by default; pass --send to actually fire."
    )

    def add_arguments(self, parser):
        parser.add_argument("--title", required=True, help="Notification title")
        parser.add_argument("--body", required=True, help="Notification body")
        parser.add_argument(
            "--send",
            action="store_true",
            help="Actually send. Without this, only reports reachable counts.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        title, body = opts["title"], opts["body"]
        if not title.strip() or not body.strip():
            raise CommandError("Both --title and --body must be non-empty.")

        # every active, running student that has a live device token, grouped by
        # school so each dispatch_push records history under the right school_id.
        rows = Student.objects.filter(
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
            account__app_device_token__isnull=False,
        ).values_list("id", "class_info__school", "account__app_device_token")

        by_school = defaultdict(list)
        for student_id, school_id, token in rows:
            by_school[school_id].append((student_id, token))

        total = sum(len(r) for r in by_school.values())
        if not total:
            w("No active student has a device token. Nothing to broadcast.")
            return

        w(f"Reachable students across {len(by_school)} schools: {total}")
        for school_id, recipients in sorted(
            by_school.items(), key=lambda kv: (kv[0] is None, kv[0])
        ):
            w(f"  school {school_id}: {len(recipients)}")

        if not opts["send"]:
            w("\nDry-run only. Re-run with --send to actually broadcast.")
            return

        w(f'\nSending "{title}" to {total} devices...\n')
        totals = {"sent": 0, "failed": 0, "stale": 0}
        for school_id, recipients in sorted(
            by_school.items(), key=lambda kv: (kv[0] is None, kv[0])
        ):
            result = dispatch_push(
                school_id,
                RECIPIENT_ROLE_STUDENT,
                recipients,
                title,
                body,
                data={"type": "broadcast"},
                store=True,
                include_notification=True,
            )
            sent = result.get("sent", 0)
            failed = result.get("failed", 0)
            stale = len(result.get("stale_tokens", []))
            totals["sent"] += sent
            totals["failed"] += failed
            totals["stale"] += stale
            w(f"  school {school_id}: sent={sent} failed={failed} stale={stale}")

        w(
            self.style.SUCCESS(
                f"\nDone. sent={totals['sent']} failed={totals['failed']} "
                f"stale(cleared)={totals['stale']}"
            )
        )
