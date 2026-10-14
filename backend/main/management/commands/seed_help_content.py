"""Load the Support and Guides content that used to be compiled into the frontend.

Run once after migrating. It is idempotent — categories and guides are matched
on their key/slug, so re-running refreshes the seeded rows without duplicating
them. Rows a superadmin has since added by hand are left alone.

    python manage.py seed_help_content
    python manage.py seed_help_content --overwrite   # also reset edited rows

Without `--overwrite` an existing row is left exactly as it is, so this can be
run on production after the superadmin has already edited the text.
"""

import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from main.models.superadmin.HelpContent import SupportInfo, GuideCategory, Guide

SEED = Path(__file__).resolve().parents[2] / "data" / "help_seed.json"


class Command(BaseCommand):
    help = "Seed the Support details and the Guides library from help_seed.json"

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="Replace rows that already exist instead of skipping them.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        overwrite = options["overwrite"]
        data = json.loads(SEED.read_text(encoding="utf-8"))

        # ── support details ────────────────────────────────────────────────
        info = SupportInfo.load()
        if overwrite or not info.contact:
            for field, value in data["support"].items():
                setattr(info, field, value)
            info.save()
            self.stdout.write(self.style.SUCCESS("support details written"))
        else:
            self.stdout.write("support details already set — skipped")

        # ── categories ─────────────────────────────────────────────────────
        categories = {}
        made = skipped = 0
        for row in data["categories"]:
            category = GuideCategory.objects.filter(key=row["key"]).first()
            if category and not overwrite:
                categories[row["key"]] = category
                skipped += 1
                continue
            category, _ = GuideCategory.objects.update_or_create(
                key=row["key"],
                defaults={"name": row["name"], "order": row["order"], "is_active": True},
            )
            categories[row["key"]] = category
            made += 1
        self.stdout.write(self.style.SUCCESS(f"categories: {made} written, {skipped} kept"))

        # ── guides ─────────────────────────────────────────────────────────
        made = skipped = 0
        for row in data["guides"]:
            if Guide.objects.filter(slug=row["slug"]).exists() and not overwrite:
                skipped += 1
                continue
            Guide.objects.update_or_create(
                slug=row["slug"],
                defaults={
                    "category": categories.get(row["category"]),
                    "title": row["title"],
                    "summary": row["summary"],
                    "where": row["where"],
                    "view": row["view"],
                    "steps": row["steps"],
                    "tips": row["tips"],
                    "order": row["order"],
                    "is_active": True,
                },
            )
            made += 1
        self.stdout.write(self.style.SUCCESS(f"guides: {made} written, {skipped} kept"))
