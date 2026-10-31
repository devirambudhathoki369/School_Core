"""
Move identity documents out of public media, into PRIVATE_MEDIA_ROOT.

    python manage.py move_student_documents            # say what would move
    python manage.py move_student_documents --apply    # move it

Safe to run again. Only the file moves: the database already holds a name, and a
name means the same in both folders.
"""

import os
import shutil

from django.conf import settings
from django.core.management.base import BaseCommand

from main.models.Student import Student

FIELDS = ("birth_certificate", "nid", "citizenship_front", "citizenship_back")


class Command(BaseCommand):
    help = "Move student identity documents out of public media."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="really move them")

    def handle(self, *args, **options):
        moved = missing = already = 0
        for field in FIELDS:
            names = Student._base_manager.exclude(**{field: ""}).exclude(**{f"{field}__isnull": True})
            for name in names.values_list(field, flat=True).iterator():
                source = os.path.join(settings.MEDIA_ROOT, name)
                target = os.path.join(settings.PRIVATE_MEDIA_ROOT, name)
                if os.path.exists(target):
                    already += 1
                elif not os.path.exists(source):
                    missing += 1
                else:
                    moved += 1
                    if options["apply"]:
                        os.makedirs(os.path.dirname(target), exist_ok=True)
                        shutil.move(source, target)
        verb = "Moved" if options["apply"] else "Would move"
        self.stdout.write(f"{verb} {moved}. Already private: {already}. Missing from disk: {missing}.")
