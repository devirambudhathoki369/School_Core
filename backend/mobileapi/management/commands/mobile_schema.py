"""Write the mobile API's OpenAPI 3 schema, for the app's generated types.

    python manage.py mobile_schema ../mobile/src/api/openapi.json
    python manage.py mobile_schema --check ../mobile/src/api/openapi.json

With --check it writes nothing and fails when the file is out of date, so a
change to the API without new app types is caught. The same schema is
served at /api/mobile/v1/schema.
"""
import json

from django.core.management.base import BaseCommand, CommandError
from django.test import RequestFactory

from mobileapi.schema import MobileSchemaView


class Command(BaseCommand):
    help = "Write the mobile API's OpenAPI 3 schema as JSON (to a file, or to stdout)."

    def add_arguments(self, parser):
        parser.add_argument("path", nargs="?", help="Where to write it; stdout when left out")
        parser.add_argument("--check", action="store_true", help="Only compare with the file at path")

    def handle(self, *args, path=None, check=False, **options):
        request = RequestFactory().get("/api/mobile/v1/schema", {"format": "json"}, SERVER_NAME="localhost")
        response = MobileSchemaView.as_view()(request)
        response.render()
        if response.status_code != 200:
            raise SystemExit(f"The schema could not be made: HTTP {response.status_code}")
        schema = json.loads(response.content)
        text = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        if check:
            if not path:
                raise CommandError("--check needs the path of the schema file.")
            try:
                with open(path, encoding="utf-8") as current:
                    same = current.read() == text
            except FileNotFoundError:
                same = False
            if not same:
                raise CommandError(
                    f"{path} is out of date. Run: python manage.py mobile_schema {path}, then npm run api-types."
                )
            self.stderr.write(f"{path} is up to date.")
            return
        if path:
            with open(path, "w", encoding="utf-8") as out:
                out.write(text)
            self.stderr.write(f"Wrote {len(schema.get('paths', {}))} paths to {path}")
        else:
            self.stdout.write(text)
