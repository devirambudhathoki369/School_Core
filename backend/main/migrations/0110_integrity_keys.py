# Rules the real data already keeps, now enforced by the database.
#
# Every rule was measured on a copy of production first. Not atomic, and built
# CONCURRENTLY, so writes carry on during the build. A rule whose data no longer
# holds on the day is skipped with a warning rather than stopping the deploy;
# `manage.py normalization_audit` lists whatever is still missing.
#
# These are plain indexes and constraints, not Meta.constraints, on purpose: DRF
# turns a model's unique rules into serializer validators, and that would change
# what the API accepts and requires. The database refuses only a real duplicate.

from django.db import IntegrityError, migrations

# (index name, table, key, which rows it covers)
UNIQUE_RULES = [
    ("uniq_student_attendance_per_sheet", "main_studentattendance", "class_attendance_id, student_id", "is_active"),
    ("uniq_staff_attendance_per_day", "main_staffattendance", "staff_id, date", "is_active"),
    ("uniq_ledger_per_student_posting", "main_studentledger", "student_id, ledger_posting_id", "is_active"),
    # All rows, not just active ones: a voided number must never be issued again.
    ("uniq_student_receipt_number", "main_studentinvoice", "school_id, economic_year_id, invoice_id", None),
    ("uniq_staff_receipt_number", "main_staffinvoice", "school_id, economic_year_id, invoice_id", None),
    ("uniq_income_voucher_number", "accounting_incomeentry", "school_id, economic_year_id, voucher_id", None),
    ("uniq_expense_voucher_number", "accounting_expenseentry", "school_id, economic_year_id, voucher_id", None),
    ("uniq_journal_voucher_number", "accounting_journalentry", "school_id, economic_year_id, voucher_id", None),
    ("uniq_contra_voucher_number", "accounting_contraentry", "school_id, economic_year_id, voucher_id", None),
    ("uniq_economic_year_name", "main_economicyear", "lower(name)", None),
    ("uniq_staff_role_name", "main_staffrole", "lower(role)", None),
    ("uniq_course_per_school", "main_course", "school_id, education_level, lower(course)", "is_active"),
    ("uniq_extra_activity_per_school", "main_extraactivity", "school_id, lower(name)", "is_active"),
    ("uniq_shareholder_per_school", "main_shareholder", "school_id, contact", "is_active"),
    ("uniq_inventory_category_per_school", "main_inventorycategory", "school_id, lower(name)", "is_active"),
    ("uniq_inventory_item_per_school", "main_inventoryitem", "school_id, lower(name)", "is_active"),
    ("uniq_staff_card_per_school", "main_staff", "school_id, rfid_card", "is_active AND rfid_card IS NOT NULL AND rfid_card <> ''"),
    ("uniq_accounting_year_per_school", "accounting_accountingeconomicyear", "school_id, lower(name)", "is_active"),
    ("uniq_homework_submission", "main_homeworksubmission", "homework_id, student_id", "is_active"),
    ("uniq_open_issue_per_copy", "library_bookissue", "book_id", "is_active AND (returned_date IS NULL OR returned_date = '')"),
]

# Bikram Sambat dates are text, so the database must check the shape. The calendar
# itself (how many days a month has) stays with NepaliDateField.
DATE_COLUMNS = [
    ("main_inventorytransaction", "date"),
    ("main_studenttaxinvoice", "date"),
    ("main_smslog", "date"),
    ("main_schooladmin", "estd_date"),
    ("main_schooladmin", "renew_date"),
    ("main_economicyear", "start_date"),
    ("main_economicyear", "end_date"),
    ("main_academicyear", "start_date"),
    ("main_academicyear", "end_date"),
    ("main_student", "birth_date"),
    ("main_studenttransportationinfo", "start_date"),
    ("main_staffotherinfo", "birth_date"),
    ("main_staffotherinfo", "joined_date"),
    ("main_schoolfoundation", "estd_date"),
    ("main_ledgerposting", "date"),
    ("main_studentledger", "date"),
    ("main_staffledger", "date"),
    ("main_studentinvoice", "date"),
    ("main_staffinvoice", "date"),
    ("main_classattendance", "date"),
    ("main_staffattendance", "date"),
    ("main_notice", "date"),
    ("main_calendarevent", "start_date"),
    ("main_calendarevent", "end_date"),
    ("main_homework", "due_date"),
    ("main_homeworksubmission", "submitted_date"),
    ("main_classresult", "published_date"),
    ("accounting_accountingeconomicyear", "start_date"),
    ("accounting_accountingeconomicyear", "end_date"),
    ("accounting_incomeentry", "date"),
    ("accounting_expenseentry", "date"),
    ("accounting_journalentry", "date"),
    ("accounting_contraentry", "date"),
    ("library_book", "entry_date"),
    ("library_bookcopy", "entry_date"),
    ("library_bookissue", "issued_date"),
    ("library_bookissue", "due_date"),
    ("library_bookissue", "returned_date"),
    ("hostel_hostelallocation", "check_in_date"),
    ("hostel_hostelallocation", "check_out_date"),
    ("hostel_hostelattendance", "date"),
    ("hostel_hostelleave", "from_date"),
    ("hostel_hostelleave", "to_date"),
    ("hostel_hostelleave", "actual_return_date"),
    ("hostel_hostelvisitor", "visit_date"),
    ("hostel_hostelcomplaint", "reported_date"),
    ("hostel_hostelcomplaint", "resolved_date"),
    ("hostel_hosteldisciplinerecord", "date"),
    ("extra_billing_extraledgerposting", "date"),
    ("extra_billing_extraledger", "date"),
    ("extra_billing_extrainvoice", "date"),
    ("canteen_canteentransaction", "date"),
    ("canteen_canteensale", "date"),
    ("canteen_canteenenrollment", "start_date"),
    ("canteen_canteenposting", "date"),
]


BS_DATE = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"


def date_rule_name(table, column):
    return f"chk_{table}_{column}"[:55] + "_bsdate"


def malformed_date(column):
    return f"{column} IS NOT NULL AND {column} <> '' AND {column} !~ '{BS_DATE}'"


def has_duplicates(cursor, table, key, where):
    condition = f"WHERE {where}" if where else ""
    cursor.execute(f"SELECT 1 FROM {table} {condition} GROUP BY {key} HAVING count(*) > 1 LIMIT 1")
    return cursor.fetchone() is not None


def drop_if_invalid(cursor, name):
    """A failed CONCURRENTLY build leaves an invalid index, which IF NOT EXISTS would then keep for good."""
    cursor.execute("SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(%s) AND NOT indisvalid", [name])
    if cursor.fetchone() is not None:
        cursor.execute(f"DROP INDEX CONCURRENTLY {name}")


def add_unique_rules(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for name, table, key, where in UNIQUE_RULES:
            drop_if_invalid(cursor, name)
            if has_duplicates(cursor, table, key, where):
                print(f"\n  SKIPPED {name}: {table} holds duplicates of ({key})")
                continue
            condition = f"WHERE {where}" if where else ""
            try:
                cursor.execute(f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {table} ({key}) {condition}")
            except IntegrityError:
                # A duplicate arrived during the build.
                drop_if_invalid(cursor, name)
                print(f"\n  SKIPPED {name}: {table} holds duplicates of ({key})")


def drop_unique_rules(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for name, _table, _key, _where in UNIQUE_RULES:
            cursor.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")


def add_date_rules(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table, column in DATE_COLUMNS:
            name = date_rule_name(table, column)
            cursor.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", [name])
            if cursor.fetchone() is not None:
                continue
            # A CHECK runs on every save of a row, even one that leaves the date alone. Left NOT VALID
            # over an old bad date, it would make that row impossible to save, and with it a whole
            # class's promotion. So a column gets its rule only once it is clean.
            cursor.execute(f"SELECT 1 FROM {table} WHERE {malformed_date(column)} LIMIT 1")
            if cursor.fetchone() is not None:
                print(f"\n  SKIPPED {name}: {table}.{column} holds malformed dates")
                continue
            # NOT VALID, then VALIDATE: the scan runs under a lock that lets writes carry on.
            cursor.execute(
                f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK "
                f"({column} IS NULL OR {column} = '' OR {column} ~ '{BS_DATE}') NOT VALID"
            )
            try:
                cursor.execute(f"ALTER TABLE {table} VALIDATE CONSTRAINT {name}")
            except IntegrityError:
                # A bad date arrived after the look above.
                cursor.execute(f"ALTER TABLE {table} DROP CONSTRAINT {name}")
                print(f"\n  SKIPPED {name}: {table}.{column} holds malformed dates")


def drop_date_rules(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table, column in DATE_COLUMNS:
            cursor.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {date_rule_name(table, column)}")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("main", "0109_normalized_backfill"),
        ("accounting", "0004_alter_accountingledgerbalance_opening_balance_and_more"),
        ("library", "0005_libraryguestschool"),
    ]

    operations = [
        migrations.RunPython(add_unique_rules, drop_unique_rules),
        migrations.RunPython(add_date_rules, drop_date_rules),
    ]
