"""One-off import of Tulsipur Metro College's catalogue from their old MySQL ERP.

The source dump (`metroooo.sql`, table `edu_erp_library_books_info`) has one row
per PHYSICAL COPY, and that row's `bookid` is the accession number written in the
book. Here the accession number IS `BookCopy.id` — a single global
auto-increment key, not a per-school counter — so copies are inserted at explicit
primary keys and the sequence is reset afterwards.

Feed it the CSV produced from that dump (see --csv columns below); prod's venv
has no MySQL client. Dates in the CSV are already Bikram Sambat text, because
NepaliDateField stores text and must never be re-parsed as Gregorian.

CSV columns: accession_no, entry_date, title, author, publisher, isbn, edition,
price, published_year, pages, call_no, corporate_author, broad_subject, keywords,
geographical_descriptions, note, source

Dry-run unless --apply is passed.
"""

import csv
from collections import OrderedDict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from main.models.SchoolAdmin import SchoolAdmin
from library.models.Library import Library
from library.models.Book import Book, BookCopy, BookIssue

# a copy of a title is identified by everything that describes the title itself;
# rows agreeing on all of it are copies of one Book.
IDENTITY = ("title", "author", "publisher", "isbn", "edition", "published_year",
            "broad_subject", "call_no", "corporate_author")


class Command(BaseCommand):
    help = (
        "Import the Metro College catalogue CSV, preserving each row's accession "
        "number as the BookCopy primary key. Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_path")
        parser.add_argument("--school", type=int, required=True)
        parser.add_argument("--library", type=int, required=True)
        parser.add_argument(
            "--skip", default="",
            help="Accession numbers to leave out, e.g. '4206-4210,17'. Their "
                 "numbers are simply never used — nothing is renumbered.")
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write. Without it, only reports what would change.")

    def _group(self, rows):
        books = OrderedDict()
        for r in rows:
            books.setdefault(tuple(r[k] for k in IDENTITY), []).append(r)
        return books

    @staticmethod
    def _int(value, default=None):
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default

    def handle(self, *args, **opts):
        school_id, library_id, apply = opts["school"], opts["library"], opts["apply"]

        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            raise CommandError(f"school {school_id} not found")
        library = Library.objects.filter(id=library_id, school_id=school_id).first()
        if not library:
            raise CommandError(f"library {library_id} not found for school {school_id}")

        with open(opts["csv_path"], newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            raise CommandError("csv has no rows")
        for r in rows:
            r["accession_no"] = int(r["accession_no"])

        skip = set()
        for part in filter(None, (p.strip() for p in opts["skip"].split(","))):
            lo, _, hi = part.partition("-")
            skip.update(range(int(lo), int(hi or lo) + 1))
        if skip:
            before = len(rows)
            rows = [r for r in rows if r["accession_no"] not in skip]
            self.stdout.write(f"skipped  : {before - len(rows)} rows ({opts['skip']})")
            if not rows:
                raise CommandError("every row was skipped")

        wanted = {r["accession_no"] for r in rows}
        if len(wanted) != len(rows):
            raise CommandError("csv contains duplicate accession numbers")
        top = max(wanted)

        # Anything already parked on a number this catalogue needs has to move.
        clashing = list(
            BookCopy.objects.filter(id__in=wanted).values_list("id", flat=True))
        open_issues = BookIssue.objects.filter(
            book_id__in=clashing, returned_date__isnull=True, is_active=True).count()
        shift = (top + 1) - min(clashing) if clashing else 0
        landing = [c + shift for c in clashing]
        blocked = set(landing) & (set(
            BookCopy.objects.exclude(id__in=clashing).values_list("id", flat=True)) | wanted)

        books = self._group(rows)

        self.stdout.write(f"school   : {school_id} {school.name}")
        self.stdout.write(f"library  : {library_id} {library.name}")
        self.stdout.write(
            f"csv rows : {len(rows)} -> {len(books)} books / {len(rows)} copies")
        self.stdout.write(f"accession: {min(wanted)} - {top}")
        self.stdout.write(f"existing copies needing to move: {len(clashing)}")
        self.stdout.write(f"open issues on those copies    : {open_issues}")

        if open_issues:
            raise CommandError(
                "copies that must be renumbered are currently issued — return "
                "them first, or their accession numbers change mid-loan")
        if blocked:
            raise CommandError(f"no room to move existing copies: {sorted(blocked)[:10]}")

        if not apply:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — nothing written. Re-run with --apply."))
            return

        with transaction.atomic():
            if clashing:
                # The landing range is verified free above, so no two copies ever
                # share an id mid-statement.
                with connection.cursor() as cur:
                    cur.execute(
                        "UPDATE library_bookcopy SET id = id + %s WHERE id = ANY(%s)",
                        [shift, clashing])
                self.stdout.write(f"moved {len(clashing)} existing copies by +{shift}")

            copies = []
            for key, group in books.items():
                f = dict(zip(IDENTITY, key))
                r0 = group[0]
                book = Book.objects.create(
                    school_id=school_id,
                    library_id=library_id,
                    # the catalogue's own earliest entry for this title
                    entry_date=min(r["entry_date"] for r in group),
                    title=f["title"],
                    personal_author=f["author"],
                    place_and_publisher=f["publisher"],
                    isbn_no=f["isbn"] or None,
                    edition=f["edition"],
                    quantity=len(group),
                    price=self._int(r0.get("price"), 0) or 0,
                    pages=self._int(r0.get("pages")),
                    # "0000" in the source means the year was never recorded;
                    # left blank rather than carried over as a fake year.
                    published_year="" if f["published_year"] == "0000" else f["published_year"],
                    broad_subject=f["broad_subject"],
                    call_no=f["call_no"] or None,
                    corporate_author=f["corporate_author"] or None,
                    keywords=r0.get("keywords", ""),
                    geographical_descriptions=r0.get("geographical_descriptions") or None,
                    note=r0.get("note") or None,
                    source=r0.get("source") or None,
                )
                for r in group:
                    copies.append(BookCopy(
                        id=r["accession_no"], book=book, entry_date=r["entry_date"]))
            BookCopy.objects.bulk_create(copies, batch_size=1000)

            # Explicit ids leave the sequence behind; without this the next book
            # entered through the UI would collide with an imported copy.
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT setval('library_bookcopy_id_seq', "
                    "(SELECT COALESCE(MAX(id), 1) FROM library_bookcopy))")

        self.stdout.write(self.style.SUCCESS(
            f"imported {len(books)} books / {len(copies)} copies for school {school_id}"))
