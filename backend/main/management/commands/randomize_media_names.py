"""
Give files people uploaded before names nobody can guess.

    python manage.py randomize_media_names            # say what would change
    python manage.py randomize_media_names --apply    # rename them

New uploads of people's own files (photos, handed-in work) are saved under
names that start with 16 random characters (main/methods/uploads.py
`unguessable_name`). This gives files saved before the same, in the same
folder, and points the database at the new name. A file
whose name already starts that way is left alone, so it is safe to run again.

Each rename is the database change and the move together: if the file can't
be moved, the row keeps its old name. A name the database has but the disk
does not is counted and left as it is.
"""

import os

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand
from django.db import transaction

from main.methods.uploads import UNGUESSABLE_NAME, unguessable_name
from main.models.Homework import HomeworkSubmissionFile
from main.models.PendingStudentPhoto import PendingStudentPhoto
from main.models.Staff import Staff
from main.models.Student import Student

# People's own files: their photos and the work they hand in.
FIELDS = (
    (Student, "image"),
    (Staff, "image"),
    (PendingStudentPhoto, "image"),
    (HomeworkSubmissionFile, "file"),
)


def needs_new_name(name):
    return bool(name) and not UNGUESSABLE_NAME.match(os.path.basename(name))


class Command(BaseCommand):
    help = "Rename uploaded photos and hand-ins to names nobody can guess."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="really rename them")

    def handle(self, *args, **options):
        apply = options["apply"]
        for model, field in FIELDS:
            renamed = missing = 0
            column = model._meta.get_field(field).max_length
            names = (
                model._base_manager.exclude(**{field: ""}).exclude(**{f"{field}__isnull": True})
                .values_list(field, flat=True).distinct()
            )
            for name in [n for n in names.iterator() if needs_new_name(n)]:
                if not default_storage.exists(name):
                    missing += 1
                    continue
                folder = os.path.dirname(name)
                # the old name, cut so the new one still fits the column
                keep = max(8, column - len(folder) - len("/") - 17)
                new = unguessable_name(folder.replace("%", "%%"), os.path.basename(name), keep=keep)
                renamed += 1
                if not apply:
                    continue
                with transaction.atomic():
                    # every row that shares the file moves with it
                    model._base_manager.filter(**{field: name}).update(**{field: new})
                    os.makedirs(os.path.dirname(default_storage.path(new)), exist_ok=True)
                    os.rename(default_storage.path(name), default_storage.path(new))
            verb = "Renamed" if apply else "Would rename"
            self.stdout.write(f"{model.__name__}.{field}: {verb} {renamed}. Missing from disk: {missing}.")
