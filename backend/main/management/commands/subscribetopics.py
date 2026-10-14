from collections import defaultdict

from django.core.management.base import BaseCommand

from main.models.Student import Student
from main.methods.push import school_topic, STUDENT_STATUS_RUNNING
from backend.firebase.topics import subscribe_tokens


class Command(BaseCommand):
    help = (
        "Subscribe existing students' device tokens to their school topic "
        "(school_<id>), so topic notices reach them before logins re-seed. "
        "Dry-run by default; pass --apply to actually subscribe."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Limit to one school id")
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually subscribe (default just reports counts)",
        )

    def handle(self, *args, **opts):
        qs = Student.objects.filter(
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
            account__app_device_token__isnull=False,
        )
        if opts.get("school"):
            qs = qs.filter(class_info__school=opts["school"])

        by_school = defaultdict(list)
        for school_id, token in qs.values_list(
            "class_info__school", "account__app_device_token"
        ):
            by_school[school_id].append(token)

        if not by_school:
            self.stdout.write("No student device tokens to subscribe.")
            return

        for school_id, tokens in sorted(by_school.items()):
            topic = school_topic(school_id)
            if opts.get("apply"):
                n = subscribe_tokens(topic, tokens)
                self.stdout.write(f"{topic}: subscribed {n}/{len(tokens)}")
            else:
                self.stdout.write(f"{topic}: {len(tokens)} tokens (dry-run)")

        if not opts.get("apply"):
            self.stdout.write("\nDry-run only. Re-run with --apply to subscribe.")
