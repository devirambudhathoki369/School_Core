from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Test the notice push path WITHOUT publishing a real notice. "
        "Either fan out to a whole school (the exact path NoticeView uses) or "
        "send straight to one raw device token (to verify a specific phone)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--school",
            type=int,
            default=None,
            help="School id to push a test notice to (uses the real notify_school_students path).",
        )
        parser.add_argument(
            "--token",
            type=str,
            default=None,
            help="Send straight to this raw FCM device token (paste a phone's token; bypasses the DB).",
        )
        parser.add_argument(
            "--title",
            type=str,
            default="Notice push test",
            help="Notification title.",
        )
        parser.add_argument(
            "--body",
            type=str,
            default="If you see this, notice push works.",
            help="Notification body.",
        )
        parser.add_argument(
            "--send",
            action="store_true",
            help="Actually send. Without it, only prints how many devices would be reached.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        school = opts["school"]
        token = opts["token"]
        title = opts["title"]
        body = opts["body"]
        data = {"type": "notice", "notice_id": 0}

        if not school and not token:
            raise CommandError("Pass --school <id> or --token <raw-fcm-token>.")

        # --- direct raw-token mode: prove a specific phone receives ---------
        if token:
            from backend.firebase.messaging import send_notification

            if not opts["send"]:
                w("(dry run) would send 1 push to the given token. Add --send to push.")
                return
            result = send_notification([token], title, body, data)
            tok_status = result["results"].get(token, "?")
            w(self.style.SUCCESS(f"RAW TOKEN SEND -> {tok_status}"))
            w(f"summary: {result}")
            if tok_status == "stale":
                w(self.style.WARNING("That token is dead (UNREGISTERED) — the phone must re-login to the app."))
            return

        # --- school fan-out mode: the exact path a published notice runs ---
        from main.methods.push import _student_recipients, dispatch_push
        from main.models.Notification import RECIPIENT_ROLE_STUDENT

        recipients = _student_recipients({"class_info__school": school})
        w(f"school {school}: reachable devices = {len(recipients)}")
        if not recipients:
            w(
                self.style.WARNING(
                    "=> No student in this school has a live device token. A published "
                    "notice would have nothing to push to. Students must log into the "
                    "mobile app first."
                )
            )
            return
        if not opts["send"]:
            w("(dry run) re-run with --send to actually push the test notice.")
            return

        # dispatch_push = send + record NotificationHistory + clear dead tokens
        # (run synchronously here so the command can report the outcome).
        result = dispatch_push(
            school, RECIPIENT_ROLE_STUDENT, recipients, title, body, data
        )
        sent = result.get("sent", 0)
        failed = result.get("failed", 0)
        stale = len(result.get("stale_tokens", []))
        w(self.style.SUCCESS(f"NOTICE PUSH -> sent={sent} failed={failed} stale={stale}"))
        w("(stale tokens were auto-cleared; history rows recorded per recipient)")
