# Superadmin database backups

Open **Superadmin → Database Backup**, choose **Whole system** or **Per school**,
and download. School selection includes inactive schools. All operations require
a superadmin or superuser token. No schema migration is needed.

## Complete school archive

The school ZIP contains:

* `database.sql`: the school's database - the same records as `data.json`, as
  PostgreSQL `INSERT` statements with original primary keys, read in the same
  snapshot. Restore with `psql --set ON_ERROR_STOP=1 -f database.sql <database>`
  into a database that already has the matching tables. It is one transaction
  and changes nothing if any of its rows already exists. Its row count and
  SHA-256 are under `database_sql` in the manifest. Written on PostgreSQL only.
* `data.json`: original field values and primary keys, without year or active
  filters. Includes school setup, students/guardians, staff/accounts/sessions,
  fees/receipts/ledgers, exams/results, attendance/RFID, inventory, library,
  hostel, extra billing, messages, documents/templates, and audit history.
* `media/`: uploaded files referenced by those records, using original paths.
* `manifest.json`: school ID, creation time, counts for every reviewed model
  (including zero counts), table coverage, external references, and SHA-256
  checksums for the data and files. Missing source files are explicitly listed.
* `README.txt`: restoration instructions.

Decimals, nulls, JSON values, inactive rows, and full timestamp precision are
preserved. Audit entries with no school tag are included when their affected
object or actor belongs to the school. A newly added model without an ownership
or global-table classification fails the export rather than being silently lost.

Direct school ownership takes priority. Referenced shared configuration is
included without expanding to other schools. School-specific accounts/details
and their child sessions are included through their owners. Globally shared
announcements, help content, superadmin accounts and sessions are not school
records. Cross-school references retain IDs; their targets are listed in the
manifest and are not exported. Generic audit references also retain original IDs.
Unattributable orphan rows cannot be assigned to a school. Remote URLs are
preserved as data; no external website is downloaded.

## Whole system

PostgreSQL downloads are `.sql.gz`, including schema and data; ownership and
privileges are excluded. SQLite downloads are `.sqlite3.gz`, generated with the
backup API so committed WAL data is included. Whole-system downloads are database
snapshots; media storage must be backed up separately.

## Restore

Restore PostgreSQL into an empty database using
`gunzip -c backup.sql.gz | psql -d <target>`. Decompress SQLite into a separate
file before replacing a stopped application's database.

For a school archive, use the same application version and database schema.
Verify checksums and missing-file/external-reference lists first. Test against
an isolated destination copy, ensure external references exist, and run
`python manage.py loaddata /path/to/data.json`. Copy `media/` into the configured
media storage. Fixtures update matching primary keys, including shared records;
newer destination rows are not removed. This is not school cloning. Do not load
into an unrelated database with conflicting IDs.

## API and operation

* `GET /api/backup?scope=schools`: school selector.
* `POST /api/backup` with `{ "scope": "full" }` or
  `{ "scope": "school", "school": 19 }`: creates a background job, returns 202.
* `GET /api/backup?scope=status&job=<id>`: preparing, ready, or failed.
* `GET /api/backup?scope=download&job=<id>`: completed archive only.

The legacy synchronous GET full/school endpoints remain compatible. The page
uses background generation and polling so proxy/worker request timeouts do not
interrupt preparation. One generation runs at a time across all workers,
enforced with a filesystem lock. Jobs use a private local directory
(`DATABASE_BACKUP_DIR`, default `/tmp/smsys-database-backups`); completed downloads
expire after one hour, and expired artifacts are pruned when another job starts.
Workers must share this directory. Generation does not survive a worker process
restart; retry if a deploy interrupts a preparing job.

PostgreSQL requires a compatible `pg_dump` on PATH. Dump exit status is verified
before offering a download. Allow temporary disk space for raw and compressed
full dumps plus completed archives. The subprocess limit is 30 minutes. School
database reads use a repeatable-read snapshot. Files are read after the database
records; concurrent file changes are not transactionally frozen.

## Validation

`main.test_database_backup` covers isolation, restore, precise timestamps,
sessions, untagged audit logs, model coverage, file checksums, missing files,
background jobs, authorization, input validation, SQLite WAL and dump failures.
Legacy migration `0087_result_uniqueness` contains PostgreSQL-only SQL; SQLite
tests must create current model tables with migrations disabled.
