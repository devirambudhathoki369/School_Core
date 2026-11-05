"""Write the mobile API's OpenAPI 3 schema, for the app's generated types.

    python manage.py mobile_schema ../mobile/src/api/openapi.json

The same schema is served at /api/mobile/v1/schema.
"""
import json

from django.core.management.base import BaseCommand
from django.test import RequestFactory

from mobileapi.schema import MobileSchemaView


class Command(BaseCommand):
    help = "Write the mobile API's OpenAPI 3 schema as JSON (to a file, or to stdout)."

    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", help="Where to write it; stdout when left out")

    def handle(self, *args, path=None, **options):
        request = RequestFactory().get("/api/mobile/v1/schema", {"format": "json"}, SERVER_NAME="localhost")
        response = MobileSchemaView.as_view()(request)
        response.render()
        if response.status_code != 200:
            raise SystemExit(f"The schema could not be made: HTTP {response.status_code}")
        schema = json.loads(response.content)
        text = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        if path:
            with open(path, "w", encoding="utf-8") as out:
                out.write(text)
            self.stderr.write(f"Wrote {len(schema.get('paths', {}))} paths to {path}")
        else:
            self.stdout.write(text)
