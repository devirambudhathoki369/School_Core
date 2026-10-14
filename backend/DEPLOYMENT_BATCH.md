# Batch/Cohort rollout — safe deployment & existing-data guide

Goal: give higher-ed programs (bachelor/master/diploma/pre-diploma) a **batch**
(intake/cohort) dimension so intakes like 2078 / 2079 / 2080 never collapse onto
one class row — **without disrupting any existing data and without changing any
billing amount.**

## Why this is safe by construction

| Concern | Guarantee |
|---|---|
| Existing rows | `Batch` is a new table; `ClassInfo.batch` and `Student.batch` are **nullable** FKs. Every existing row stays valid with `batch = NULL`. Nothing dropped/retyped/made-required. |
| School (grade) data | Never gets a batch. Untouched, forever. |
| Academic-year keys | `gen_class_key` appends `b<batch>` **only** when a batch is present. NULL batch ⇒ byte-identical key ⇒ every existing mapping/close/promote resolves exactly as today. |
| **Billing** | Fees resolve via `feeq()` by class **details** (`education_level, course, section, year, semester, school`) — **not** by `class_info.id` and **not** by batch (`batch` is deliberately kept out of `CLASS_DETAILS_FIELDS`). Two batches in the same course+semester return the **identical** fee rows. Amounts are unchanged before/after. |
| Historical invoices/ledgers | Immutable. `StudentInvoice.class_info` / `LedgerPosting.class_info` are write-time snapshots; the backfill never rewrites them. |
| Reversibility | Everything additive ⇒ migration is reversible; `backfill_batches --revert` nulls the FKs and deletes Batch rows. |

## Managing the existing data — two phases

**Phase 1 — STAMP (safe, additive, done by `backfill_batches`)**
- Creates one `Batch` per (school, course, admission-year), inferred from each
  student's immutable `Student.academic_year` admission stamp.
- Stamps `Student.batch` for every higher-ed student.
- Stamps `ClassInfo.batch` only where a class holds exactly **one** batch.
- Leaves **collapsed** classes (>1 admission year on one row) `NULL` and reports
  them. NULL = current behavior, so nothing breaks.

**Phase 2 — SPLIT (only collapsed classes; separate, reviewed step)**
For each collapsed class: clone a per-batch `ClassInfo` (same details + batch),
move the newer batch's students onto it, and mirror its `AcademicYearMapping`
row with the new batch-key. Billing stays identical (feeq is details-based).
**Finalize this step against the real collapsed-class list from staging — do not
run it blind.**

## Deployment runbook (staging rehearsal first — the keystone)

Nothing runs against prod until it has run clean against a **restored copy** of
prod.

```
# 0. MEASURE (read-only, safe to run on prod any time)
python manage.py analyze_batches --verbose

# 1. STAGING CLONE
pg_dump <prod_db> > prod_snapshot.sql        # (check free disk first!)
createdb smsys_staging && psql smsys_staging < prod_snapshot.sql

# 2. MIGRATE on staging — migration 0066 is already written (additive only)
python manage.py makemigrations main --check --dry-run   # expect: "No changes"
                                              # (proves 0066 matches the models)
python manage.py sqlmigrate main 0066         # eyeball the SQL (all ADD/CREATE)
python manage.py migrate

# 3. BACKFILL Phase 1 (STAMP) on staging
python manage.py backfill_batches --school <id>            # dry-run: read the plan
python manage.py backfill_batches --school <id> --apply

# 4. Phase 2 (SPLIT) on staging — only collapsed classes
python manage.py split_batches --school <id>               # dry-run: read the plan
python manage.py split_batches --school <id> --apply

# 5. VERIFY on staging (the gate before prod)
#    - billing: pick sample students in split classes, compare fee-preview /
#      invoice totals BEFORE vs AFTER — must be identical (feeq is details-based).
#    - app smoke test: create a class + a student via the UI/API (confirm no 400
#      from the extended ClassInfo unique_together — writes go through
#      get_or_create_class, not the serializer, so this should be clean).
#    - academic year: `check_ay_alignment --school <id>` resolves each batch key.
#    - `analyze_batches --school <id>` shows 0 collapsed classes remaining.
#    - run the app's test suite.

# --- PROD (only after staging is green) ---
# gate: pg_dump prod (verify free disk FIRST — see 2026-07-03 outage), then repeat
# steps 2–5 per school, ONE at a time, verifying after each.
# Escape hatches (in order): split_batches --revert --apply  THEN
#                            backfill_batches --revert --apply
# Ultimate rollback = restore the pre-apply pg_dump.
```

## Files in this change set
- `models/Batch.py`, `models/ClassInfo.py` (+batch, unique_together), `models/Student.py` (+batch)
- `migrations/0066_batch_classinfo_batch_student_batch.py` (additive)
- `methods/academicYear.py` — batch-aware `gen_class_key` + `mirror_mapping_to_batch_key`
- `management/commands/analyze_batches.py` — read-only blast-radius report
- `management/commands/backfill_batches.py` — Phase 1 stamp (dry-run/apply/revert)
- `management/commands/split_batches.py` — Phase 2 split (dry-run/apply/revert)
- key-building call sites wired to pass `batch`: `FiscalYearViews.getAcademicYearByClassId`,
  `StudentViews` promote + carry-forward resolvers, `check_ay_alignment`.

## Notes / follow-ups
- **Key-building call sites** already pass `batch`. One remaining reader,
  `FiscalYearViews.genAcademicYearKeysFromClasses`, degrades gracefully: the
  mapping mirror is ADDITIVE (old no-batch key kept), so a class still resolves
  via its old key to the same academic year until that path is given `batch`.
- **Close flow**: `AcademicYearCloseView` builds keys from the frontend `classes`
  payload (not `gen_class_key`), so closing a batched class needs the frontend to
  include the batch segment. Out of scope here; note for the close UI.
- **Per-batch fee schedules** (a newer intake paying a revised fee) are a future
  opt-in: make `feeq` batch-aware *then*. Not part of this rollout.
- The `dumpdata` cron that filled the disk (2026-07-03 outage) must NOT be reused;
  use a targeted `pg_dump` with a free-space check.
- **Per-batch fee schedules** (a newer intake paying a revised fee) are a future
  opt-in: make `feeq` batch-aware *then*. Not part of this rollout.
- The `dumpdata` cron that filled the disk (2026-07-03 outage) must NOT be reused;
  use a targeted `pg_dump` with a free-space check.
```
