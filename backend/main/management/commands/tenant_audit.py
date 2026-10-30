"""Find rows whose links lead to more than one school.

A student belongs to a class, an academic year and a batch, and each of those
belongs to a school -- but nothing in the database says they must be the SAME
school. Every school must be completely isolated, and the constraints that will
enforce it (a direct school on every row, composite foreign keys, row-level
security) can only be added once no existing row breaks them. This is that
check, and it only reads.

For every model the per-school export knows (main/services/database_backup.py),
it follows each route from a row to a school -- its own `school` link, and one
route through every parent that belongs to a school -- and counts the rows
where two routes that both resolve name different schools.

    python manage.py tenant_audit            # a report; exit 1 if any row crosses
    python manage.py tenant_audit --samples 5

It joins across large tables (attendance, ledgers): run it against a replica or
off-peak.
"""
from django.apps import apps
from django.core.management.base import BaseCommand
from django.db.models import F

from main.services.database_backup import APP_LABELS, GLOBAL_MODELS, ownership_paths, relations


def school_routes(model, paths):
    """Every route from `model` to a school: its own link first, then one
    through each parent that has a route of its own."""
    routes = []
    for field in relations(model):
        if field.name == "school" and field.related_model._meta.label_lower == "main.schooladmin":
            routes.append(field.attname)
    for field in relations(model):
        parent_paths = paths.get(field.related_model)
        if not parent_paths or field.name == "school":
            continue
        route = f"{field.name}__{parent_paths[0]}"
        if route not in routes:
            routes.append(route)
    return routes


def crossings(model, routes, samples=0):
    """[(route_a, route_b, count, sample ids)] for routes that disagree."""
    found = []
    base, others = routes[0], routes[1:]
    for other in others:
        rows = (
            model._base_manager.exclude(**{f"{base}__isnull": True})
            .exclude(**{f"{other}__isnull": True})
            .exclude(**{base: F(other)})
        )
        count = rows.count()
        if count:
            ids = list(rows.order_by("pk").values_list("pk", flat=True)[:samples]) if samples else []
            found.append((base, other, count, ids))
    return found


def audit(samples=0):
    models = [
        m for m in apps.get_models()
        if m._meta.app_label in APP_LABELS and m._meta.managed and not m._meta.proxy
    ]
    paths = ownership_paths(models)
    report = []
    for model in models:
        if model._meta.label_lower in GLOBAL_MODELS or model not in paths:
            continue
        routes = school_routes(model, paths)
        if len(routes) < 2:
            continue
        for base, other, count, ids in crossings(model, routes, samples):
            report.append({"model": model._meta.label, "route": base, "other": other, "rows": count, "ids": ids})
    return report


class Command(BaseCommand):
    help = "Report rows whose links lead to more than one school (read-only)."

    def add_arguments(self, parser):
        parser.add_argument("--samples", type=int, default=3, help="row ids to show per finding")

    def handle(self, *args, **options):
        report = audit(options["samples"])
        if not report:
            self.stdout.write(self.style.SUCCESS("Every row's routes lead to one school."))
            return
        total = 0
        for item in report:
            total += item["rows"]
            ids = f"  e.g. ids {item['ids']}" if item["ids"] else ""
            self.stdout.write(f"{item['model']}: {item['rows']} row(s) where {item['route']} != {item['other']}{ids}")
        self.stdout.write(self.style.ERROR(f"{total} row(s) across {len(report)} check(s) cross between schools."))
        raise SystemExit(1)
