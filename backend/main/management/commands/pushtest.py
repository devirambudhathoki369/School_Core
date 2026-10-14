import os

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Diagnose the FCM push setup (creds path, access token, reachable "
        "students) and optionally send a real test notification."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--student",
            type=int,
            default=None,
            help="Send the test to this student id (default: first student with a token).",
        )
        parser.add_argument(
            "--send",
            action="store_true",
            help="Actually send a test push. Without this, only prints diagnostics.",
        )
        parser.add_argument(
            "--show-token",
            action="store_true",
            help="Print a real device token (to paste into Firebase Console test send).",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        w(f"CWD                  = {os.getcwd()}")
        w(f"SERVICE_ACCOUNT_PATH = {os.environ.get('SERVICE_ACCOUNT_PATH')}")
        path = os.environ.get("SERVICE_ACCOUNT_PATH") or ""
        w(f"creds file exists    = {os.path.isfile(path)}")
        w(f"FCM_URL set          = {bool(os.environ.get('FCM_URL'))}")

        # 1) can we mint a Firebase access token?
        try:
            from backend.firebase.utils import get_access_token

            token_ok = bool(get_access_token())
            w(self.style.SUCCESS(f"ACCESS TOKEN OK      = {token_ok}"))
        except Exception as e:
            w(self.style.ERROR(f"TOKEN ERROR          -> {e!r}"))
            w("=> Firebase creds/path is the problem. Make SERVICE_ACCOUNT_PATH absolute.")
            return

        # 2) is there anyone to push to?
        from main.methods.push import _student_recipients

        filters = {"id": opts["student"]} if opts["student"] else {}
        recipients = _student_recipients(filters)
        w(f"reachable students   = {len(recipients)}")
        if recipients and opts["show_token"]:
            rid, token = recipients[0]
            w(self.style.WARNING(f"DEVICE TOKEN (student {rid}):"))
            w(token)
        if not recipients:
            w(
                self.style.WARNING(
                    "=> No matching student has a device token. Nothing to push to "
                    "(the student must log into the mobile app first)."
                )
            )
            return

        if not opts["send"]:
            w("(diagnostics only — re-run with --send to actually push a test)")
            return

        # 3) actually send one test push.
        from backend.firebase.messaging import send_notification

        recipient_id, token = recipients[0]
        result = send_notification(
            [token], "Test push", "If you see this, push works.", {"type": "test"}
        )
        w(self.style.SUCCESS(f"SEND RESULT (student {recipient_id}) = {result}"))
