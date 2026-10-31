"""School database exports. Shared references never expand into other tenants."""
import json
import hashlib
from datetime import datetime, time
from pathlib import PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection, transaction
from django.db.models import AutoField, Q, FileField, IntegerField
from django.utils import timezone

from main.methods.schoolModules import module_flags
from main.models.SchoolAdmin import SchoolAdmin

APP_LABELS = {"main", "account", "accounting", "library", "hostel", "extra_billing", "canteen", "rfid", "contenttypes"}
# Reviewed non-tenant tables. A newly added unclassified model fails the export
# instead of silently omitting a new feature's data.
GLOBAL_MODELS = {
    "contenttypes.contenttype", "account.superadminaccount", "account.userauthtoken",
    "account.superadminauthtoken", "main.splashnotice", "main.supportinfo",
    "main.guidecategory", "main.guide", "main.economicyear", "main.staffrole",
    "main.schoolfoundation", "main.noticesa",
    # the catalog of modules; a school's grants (main.schoolmodule) are its own
    "main.module",
    "main.staffpermission",
}
# Rows the database writes from a JSON column by trigger (main/models/Normalized.py).
# Restoring the parent writes them again, so an export of them would collide.
DERIVED_MODELS = {
    "main.classperiodslot", "main.examschedulesubject", "main.subjectassignmentstudent",
    "main.staffpermissiongrant", "main.studentledgerline", "main.studentinvoiceline",
    "main.staffledgerline", "main.staffinvoiceline",
}
# The trigger runs as each parent row is restored, which can be before the subject
# or teacher it names is back. So the script runs the same sync again at its end.
DERIVED_RESYNC = {
    "main.classperiod": "norm_class_period_slots(id, subjects, teachers)",
    "main.examschedule": "norm_exam_schedule_subjects(id, schedule)",
    "main.subjectassignment": "norm_assignment_students(id, students)",
    "main.staff": "norm_staff_grants(id, permissions)",
    "main.studentledger": "norm_student_ledger_lines(id, details)",
    "main.studentinvoice": "norm_student_invoice_lines(id, details)",
    "main.staffledger": "norm_staff_ledger_lines(id, details)",
    "main.staffinvoice": "norm_staff_invoice_lines(id, details)",
}
OWNED_DETAILS = {
    "account.adminaccount": "schooladmin__pk",
    "account.studentaccount": "student__class_info__school_id",
    "account.staffaccount": "staff__school_id",
    "main.studentguardianinfo": "student__class_info__school_id",
    "main.studentotherinfo": "student__class_info__school_id",
    "main.staffotherinfo": "staff__school_id",
}


class LosslessJSONEncoder(DjangoJSONEncoder):
    def default(self, value):
        # Django's standard encoder truncates timestamps to milliseconds.
        if isinstance(value, (datetime, time)):
            return value.isoformat()
        return super().default(value)


def relations(model):
    return [f for f in model._meta.concrete_fields if f.is_relation and f.related_model]


def ownership_paths(models):
    """Direct school ownership wins; otherwise use shortest parent paths.

    Do not walk reverse relationships: a shared year/foundation/account must
    never become a route back into all of its schools.
    """
    paths = {SchoolAdmin: ["pk"]}
    for model in models:
        if model._meta.label_lower in OWNED_DETAILS:
            paths[model] = [OWNED_DETAILS[model._meta.label_lower]]
            continue
        fields = relations(model)
        school = next((f for f in fields if f.name == "school" and f.related_model == SchoolAdmin), None)
        if school:
            paths[model] = [school.attname]
    while True:
        added = {}
        for model in models:
            if model in paths:
                continue
            candidates = [f"{f.name}__{path}" for f in relations(model)
                          if f.related_model in paths for path in paths[f.related_model]]
            if candidates:
                depth = min(p.count("__") for p in candidates)
                added[model] = [p for p in candidates if p.count("__") == depth]
        if not added:
            unknown = [m._meta.label for m in models if m not in paths
                       and m._meta.label_lower not in GLOBAL_MODELS]
            if unknown:
                raise RuntimeError(f"Unclassified backup models: {', '.join(unknown)}")
            return paths
        paths.update(added)


def chunks(values, size=500):
    values = list(values)
    for start in range(0, len(values), size):
        yield values[start:start + size]


def write_school_backup(output, school_id):
    models = [m for m in apps.get_models() if m._meta.app_label in APP_LABELS
              and m._meta.managed and not m._meta.proxy
              and m._meta.label_lower not in DERIVED_MODELS]
    paths = ownership_paths(models)
    selected = {m: set() for m in models}
    external = {}
    with transaction.atomic():
        # All tables must describe the same instant, even during active billing.
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        school = SchoolAdmin._base_manager.get(pk=school_id)
        for model, routes in paths.items():
            query = Q()
            for path in routes:
                query |= Q(**{path: school_id})
            selected[model].update(model._base_manager.filter(query).values_list("pk", flat=True))

        # Superadmin changes often have school=NULL in HistoryLog. Recover
        # those through the affected school-owned object or school account.
        # Explicitly tagged logs from other schools must not be pulled in.
        history = apps.get_model("main.HistoryLog")
        content_type = apps.get_model("contenttypes.ContentType")
        content_types = {(r.app_label, r.model): r.pk for r in content_type.objects.all()}
        owned_objects, owned_actors = {}, {}
        for model in paths:
            if model == history or not isinstance(model._meta.pk, IntegerField):
                continue
            type_id = content_types.get((model._meta.app_label, model._meta.model_name))
            if not type_id:
                continue
            owned_objects[type_id] = selected[model]
            if model._meta.app_label == "account" or model == SchoolAdmin or model._meta.model_name in ("staff", "student"):
                owned_actors[type_id] = selected[model]
        # One narrow scan instead of repeatedly scanning the audit table for
        # every 500 IDs. This matters on databases with millions of log rows.
        logs = history.objects.filter(school__isnull=True).values_list(
            "pk", "object_type_id", "object_id", "user_type_id", "user_id")
        for pk, object_type, object_id, user_type, user_id in logs.iterator(chunk_size=2000):
            if (object_id in owned_objects.get(object_type, ())
                    or user_id in owned_actors.get(user_type, ())):
                selected[history].add(pk)

        # Include only referenced shared rows (guardian details, accounts,
        # global years, etc.). Never include their reverse children.
        pending = {m: ids.copy() for m, ids in selected.items() if ids}
        while pending:
            following = {}
            for model, ids in pending.items():
                for field in relations(model):
                    target = field.related_model
                    references = set()
                    for batch in chunks(ids):
                        references.update(model._base_manager.filter(pk__in=batch)
                                          .values_list(field.attname, flat=True))
                    references.discard(None)
                    missing = references - selected.get(target, set())
                    if not missing:
                        continue
                    if target in paths or target not in selected:
                        key = f"{model._meta.label_lower}.{field.name} -> {target._meta.label_lower}"
                        external.setdefault(key, set()).update(missing)
                        continue
                    found = set()
                    for batch in chunks(missing):
                        found.update(target._base_manager.filter(pk__in=batch).values_list("pk", flat=True))
                    selected[target].update(found)
                    following.setdefault(target, set()).update(found)
            pending = {m: ids for m, ids in following.items() if ids}

        manifest = {
            "format": "smsys-school-backup", "version": 2,
            "created_at": timezone.now().isoformat(),
            # The facilities the school had at the time, read in the same
            # snapshot -- its main.schoolmodule rows in data.json say the same.
            # A facility switched off still exports all of its records.
            "school": {"id": school.pk, "name": school.name,
                       "modules": module_flags(school.pk)},
            "record_counts": {m._meta.label_lower: len(ids) for m, ids in selected.items()},
            "table_coverage": {m._meta.db_table: {"model": m._meta.label_lower,
                               "selection": "school-owned" if m in paths else "referenced shared data only"}
                               for m in models},
            "external_references": {key: sorted(ids) for key, ids in external.items()},
            "media_included": True,
        }
        media = {}
        data_hash = hashlib.sha256()
        with ZipFile(output, "w", compression=ZIP_DEFLATED, allowZip64=True) as archive:
            with archive.open("data.json", "w", force_zip64=True) as data:
                def write(value):
                    data_hash.update(value)
                    data.write(value)
                write(b"[")
                first = True
                for model in sorted(models, key=lambda m: m._meta.label_lower):
                    fields = [f for f in model._meta.concrete_fields if not f.primary_key]
                    for batch in chunks(sorted(selected[model])):
                        rows = model._base_manager.filter(pk__in=batch).order_by("pk").values()
                        for row in rows.iterator(chunk_size=500):
                            record = {"model": model._meta.label_lower,
                                      "pk": row[model._meta.pk.attname],
                                      "fields": {f.name: row[f.attname] for f in fields}}
                            for field in fields:
                                if isinstance(field, FileField) and row[field.attname]:
                                    media.setdefault(str(row[field.attname]), field.storage)
                            if not first:
                                write(b",\n")
                            write(json.dumps(record, cls=LosslessJSONEncoder).encode("utf-8"))
                            first = False
                write(b"]")
            manifest["data_sha256"] = data_hash.hexdigest()
            manifest["database_sql"] = write_school_sql(archive, school, models, selected)
            manifest["files"], manifest["missing_files"] = [], []
            for name, storage in sorted(media.items()):
                path = PurePosixPath(name)
                if path.is_absolute() or ".." in path.parts or "\\" in name:
                    raise RuntimeError("Unsafe media path in school records")
                try:
                    source = storage.open(name, "rb")
                except FileNotFoundError:
                    manifest["missing_files"].append(name)
                    continue
                digest, size = hashlib.sha256(), 0
                with source, archive.open(f"media/{path}", "w", force_zip64=True) as dest:
                    while True:
                        block = source.read(64 * 1024)
                        if not block:
                            break
                        digest.update(block)
                        size += len(block)
                        dest.write(block)
                manifest["files"].append({"path": name, "bytes": size, "sha256": digest.hexdigest()})
            archive.writestr("manifest.json", json.dumps(manifest, indent=2, cls=DjangoJSONEncoder))
            archive.writestr("README.txt", SCHOOL_RESTORE_NOTES)
    output.seek(0)
    return manifest


def write_school_sql(archive, school, models, selected):
    """The same records as data.json, as a database file: database.sql.

    data.json needs this application to read it back. Whoever looks after a
    server expects a backup to hold the database itself, so the archive also
    carries one INSERT for every selected row, exactly as the row is stored,
    read in the same snapshot as data.json. It restores with psql into a
    database that already has the matching tables. PostgreSQL only: on any
    other database the file is left out and the manifest says so.
    """
    if connection.vendor != "postgresql":
        return None
    from psycopg2.extras import Json

    quote = connection.ops.quote_name
    digest, written, sequences = hashlib.sha256(), 0, []
    with archive.open("database.sql", "w", force_zip64=True) as script, connection.cursor() as cursor:
        def write(value):
            value = value if isinstance(value, bytes) else value.encode("utf-8")
            digest.update(value)
            script.write(value)

        write(f"-- School database backup: {' '.join(str(school.name).split())} (#{school.pk})\n"
              "-- PostgreSQL, data only: the tables must already exist (same system version).\n"
              "-- Restore with: psql --set ON_ERROR_STOP=1 -f database.sql <database>\n"
              "-- One transaction: if any row already exists, nothing at all is changed.\n"
              "BEGIN;\nSET CONSTRAINTS ALL DEFERRED;\n")
        for model in sorted(models, key=lambda m: m._meta.label_lower):
            if not selected[model]:
                continue
            table, key = quote(model._meta.db_table), quote(model._meta.pk.column)
            insert = None
            for batch in chunks(sorted(selected[model])):
                cursor.execute(f"SELECT * FROM {table} WHERE {key} = ANY(%s) ORDER BY {key}", [list(batch)])
                if insert is None:
                    columns = cursor.description
                    # json and jsonb: a value the driver has already parsed is written back as JSON.
                    documents = [column.type_code in (114, 3802) for column in columns]
                    insert = (f"INSERT INTO {table} ({', '.join(quote(column.name) for column in columns)}) "
                              f"VALUES ({', '.join(['%s'] * len(columns))});\n")
                for row in cursor.fetchall():
                    values = [bytes(value) if isinstance(value, memoryview)
                              else Json(value) if document and value is not None and not isinstance(value, str)
                              else value for value, document in zip(row, documents)]
                    write(cursor.mogrify(insert, values))
                    written += 1
            if isinstance(model._meta.pk, AutoField):
                sequences.append((table, model._meta.pk.column))
        for model in sorted(models, key=lambda m: m._meta.label_lower):
            sync = DERIVED_RESYNC.get(model._meta.label_lower)
            for batch in chunks(sorted(selected[model])) if sync else ():
                ids = ",".join(str(pk) for pk in batch)
                write(f"SELECT count({sync}) FROM {quote(model._meta.db_table)} WHERE id IN ({ids});\n")
        # New rows made after a restore must not reuse the numbers just put back.
        for table, column in sequences:
            write(f"SELECT setval(pg_get_serial_sequence('{table}', '{column}'), "
                  f"(SELECT MAX({quote(column)}) FROM {table}));\n")
        write("COMMIT;\n")
    return {"path": "database.sql", "rows": written, "sha256": digest.hexdigest()}


SCHOOL_RESTORE_NOTES = """School database backup

database.sql is the school's database: the same records as data.json, as
PostgreSQL INSERT statements with original primary keys. It restores with
  psql --set ON_ERROR_STOP=1 -f database.sql <database>
into a database that already has the tables of the matching application
version. It runs as one transaction and changes nothing if any of its rows
already exists, so use it on an empty copy of the schema or one these rows are
absent from. Its row count and SHA-256 are under database_sql in manifest.json.


data.json is a Django fixture with original primary keys, including inactive
records and all years. manifest.json identifies the school, the facilities
(modules) it had, and table counts. A facility switched off still exports.
Uploaded files referenced by school records are included under media/ with
their original storage paths. Missing source files are listed in missing_files
in the manifest; they cannot be recovered from the database. Copy media/ into
the destination's configured MEDIA_ROOT when restoring. Verify file and data
SHA-256 checksums against the manifest. No files are fetched from external URLs.
Shared reference rows are included only when referenced by selected records.
Cross-school references retain their original IDs, but the other school's
records are NOT exported. See external_references in manifest.json. Generic
audit-log object/user references also retain their original IDs.
School login sessions and untagged audit records traceable to the school are
included. Globally shared system content is not school-owned data.

Restore with the matching application version and schema. First back up the
destination and test in an isolated copy. Ensure external references exist.
Use: python manage.py loaddata /path/to/data.json
Existing rows with matching primary keys (including shared rows) are updated.
This is not a school cloning/import tool and does not remove newer records.
Do not restore into an unrelated database with conflicting primary keys.
"""
