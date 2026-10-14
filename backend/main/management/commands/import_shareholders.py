import json
import os

from django.core.management.base import BaseCommand

from main.models.superadmin.Shareholder import Shareholder
from main.models.SchoolAdmin import SchoolAdmin


class Command(BaseCommand):
    help = (
        "One-time import of the legacy shareholders.json into the Shareholder "
        "table. Idempotent: skips (school, contact) pairs that already exist, so "
        "it is safe to re-run. Does not delete anything."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            default="shareholders.json",
            help="Path to the legacy JSON (default: ./shareholders.json).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually write rows. Without it, only reports what would import.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        path = opts["file"]
        if not os.path.exists(path):
            w(self.style.ERROR(f"file not found: {path}"))
            return
        with open(path) as f:
            data = json.load(f)

        valid_schools = set(SchoolAdmin.objects.values_list("id", flat=True))
        created = skipped = bad = 0
        for label, details in data.items():
            school_id = details.get("profile")
            contacts = details.get("contacts") or []
            if school_id not in valid_schools:
                w(self.style.WARNING(f"  skip '{label}': school {school_id} not found"))
                bad += 1
                continue
            for contact in contacts:
                contact = str(contact).strip()
                if not contact:
                    continue
                exists = Shareholder.objects.filter(
                    school_id=school_id, contact=contact
                ).exists()
                if exists:
                    skipped += 1
                    continue
                w(f"  + school {school_id} ({label}): {contact}")
                if opts["apply"]:
                    Shareholder.objects.create(
                        school_id=school_id, contact=contact, name=None
                    )
                created += 1

        w(f"\nto import: {created}  already-present: {skipped}  bad-school: {bad}")
        if not opts["apply"]:
            w(self.style.NOTICE("(dry run) re-run with --apply to write."))
        else:
            w(self.style.SUCCESS(f"DONE. created {created} shareholder row(s)."))
