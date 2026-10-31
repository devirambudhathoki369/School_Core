# The wall between schools, for tables that carry a school and also point at a
# parent that carries one: the database now refuses a row whose two schools differ.
#
#     child (parent_id, school_id) ──FK──▶ parent (id, school_id)
#
# NOT VALID checks new and changed rows from now on, holding its lock only briefly.
# Old rows are then validated where they are clean; where they are not, the key
# still guards new rows and the old ones wait for the clean-up. Deferred like
# Django's own keys, so rows can be saved in any order inside a transaction.

from django.db import IntegrityError, migrations

# A composite foreign key needs a unique key on exactly these columns to point at.
PARENTS = [
    "accounting_accountingeconomicyear",
    "accounting_accountingledger",
    "canteen_canteenaccount",
    "canteen_canteencategory",
    "canteen_canteenenrollment",
    "canteen_canteenitem",
    "canteen_canteenplan",
    "canteen_canteenposting",
    "canteen_canteensale",
    "canteen_canteentransaction",
    "extra_billing_billingparty",
    "extra_billing_extraledgerposting",
    "hostel_hostel",
    "library_library",
    "main_academicyear",
    "main_batch",
    "main_busstation",
    "main_classinfo",
    "main_course",
    "main_exam",
    "main_feetitle",
    "main_inventorycategory",
    "main_inventoryitem",
    "main_section",
    "main_staff",
    "main_subject",
]

# (child table, its reference to the parent, parent table)
LINKS = [
    ("accounting_accountingeconomicyear", "previous_ey_id", "accounting_accountingeconomicyear"),
    ("accounting_contraentry", "economic_year_id", "accounting_accountingeconomicyear"),
    ("accounting_contraentry", "ledger_id", "accounting_accountingledger"),
    ("accounting_expenseentry", "economic_year_id", "accounting_accountingeconomicyear"),
    ("accounting_expenseentry", "ledger_id", "accounting_accountingledger"),
    ("accounting_incomeentry", "economic_year_id", "accounting_accountingeconomicyear"),
    ("accounting_incomeentry", "ledger_id", "accounting_accountingledger"),
    ("accounting_journalentry", "economic_year_id", "accounting_accountingeconomicyear"),
    ("canteen_canteenaccount", "staff_id", "main_staff"),
    ("canteen_canteenclassrate", "item_id", "canteen_canteenitem"),
    ("canteen_canteenenrollment", "plan_id", "canteen_canteenplan"),
    ("canteen_canteenitem", "category_id", "canteen_canteencategory"),
    ("canteen_canteenplan", "item_id", "canteen_canteenitem"),
    ("canteen_canteenplancharge", "enrollment_id", "canteen_canteenenrollment"),
    ("canteen_canteenplancharge", "item_id", "canteen_canteenitem"),
    ("canteen_canteenplancharge", "plan_id", "canteen_canteenplan"),
    ("canteen_canteenplancharge", "txn_id", "canteen_canteentransaction"),
    ("canteen_canteensale", "staff_id", "main_staff"),
    ("canteen_canteentransaction", "account_id", "canteen_canteenaccount"),
    ("canteen_canteentransaction", "posting_id", "canteen_canteenposting"),
    ("canteen_canteentransaction", "sale_id", "canteen_canteensale"),
    ("extra_billing_extrainvoice", "party_id", "extra_billing_billingparty"),
    ("extra_billing_extraledger", "party_id", "extra_billing_billingparty"),
    ("extra_billing_extraledger", "posting_id", "extra_billing_extraledgerposting"),
    ("hostel_hostel", "warden_id", "main_staff"),
    ("hostel_hostelallocation", "academic_year_id", "main_academicyear"),
    ("hostel_hostelallocation", "hostel_id", "hostel_hostel"),
    ("hostel_hostelattendance", "hostel_id", "hostel_hostel"),
    ("hostel_hostelcomplaint", "assigned_to_id", "main_staff"),
    ("hostel_hostelcomplaint", "hostel_id", "hostel_hostel"),
    ("hostel_hosteldisciplinerecord", "hostel_id", "hostel_hostel"),
    ("hostel_hosteldisciplinerecord", "reported_by_id", "main_staff"),
    ("hostel_hostelleave", "approved_by_id", "main_staff"),
    ("hostel_hostelleave", "hostel_id", "hostel_hostel"),
    ("hostel_hostelmessmenu", "hostel_id", "hostel_hostel"),
    ("hostel_hostelvisitor", "hostel_id", "hostel_hostel"),
    ("library_book", "class_info_id", "main_classinfo"),
    ("library_book", "library_id", "library_library"),
    # library_bookissue.student and .staff stay out: a library lends to its guest schools' people.
    ("main_academicyearmapping", "academic_year_id", "main_academicyear"),
    ("main_academicyearmapping", "previous_academic_year_id", "main_academicyear"),
    ("main_batch", "course_id", "main_course"),
    ("main_batch", "start_academic_year_id", "main_academicyear"),
    ("main_classattendance", "class_info_id", "main_classinfo"),
    ("main_classattendance", "teacher_id", "main_staff"),
    ("main_classinfo", "academic_year_id", "main_academicyear"),
    ("main_classinfo", "batch_id", "main_batch"),
    ("main_classinfo", "course_id", "main_course"),
    ("main_classinfo", "section_id", "main_section"),
    ("main_exam", "academic_year_id", "main_academicyear"),
    ("main_extraactivityentry", "class_info_id", "main_classinfo"),
    ("main_extraactivityentry", "exam_id", "main_exam"),
    ("main_homework", "class_info_id", "main_classinfo"),
    ("main_homework", "staff_id", "main_staff"),
    ("main_homework", "subject_id", "main_subject"),
    ("main_inventoryitem", "category_id", "main_inventorycategory"),
    ("main_inventorytransaction", "academic_year_id", "main_academicyear"),
    ("main_inventorytransaction", "item_id", "main_inventoryitem"),
    ("main_pendingstudentphoto", "class_info_id", "main_classinfo"),
    ("main_pendingstudentphoto", "uploader_staff_id", "main_staff"),
    ("main_seatplanroom", "exam_id", "main_exam"),
    ("main_staff", "primary_subject_id", "main_subject"),
    ("main_staff", "secondary_subject_id", "main_subject"),
    ("main_staffattendance", "staff_id", "main_staff"),
    ("main_staffinvoice", "academic_year_id", "main_academicyear"),
    ("main_staffinvoice", "staff_id", "main_staff"),
    ("main_staffledger", "academic_year_id", "main_academicyear"),
    ("main_staffledger", "staff_id", "main_staff"),
    ("main_staffpayrollclose", "accounting_economic_year_id", "accounting_accountingeconomicyear"),
    ("main_studentdiscountinfo", "academic_year_id", "main_academicyear"),
    ("main_studentdiscountinfo", "title_id", "main_feetitle"),
    ("main_studentinvoice", "academic_year_id", "main_academicyear"),
    ("main_studentinvoice", "class_info_id", "main_classinfo"),
    ("main_studentledger", "academic_year_id", "main_academicyear"),
    ("main_studenttransportationinfo", "bus_station_id", "main_busstation"),
    ("main_subject", "class_info_id", "main_classinfo"),
    ("main_subjectassignment", "academic_year_id", "main_academicyear"),
    ("main_subjectassignment", "class_info_id", "main_classinfo"),
    ("main_subjectassignment", "subject_id", "main_subject"),
]


def parent_index(table):
    return f"uniq_{table}_id_school"[:63]


def link_name(child, column):
    return f"tn_{child}_{column}"[:63]


def add_keys(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for table in PARENTS:
            # A failed CONCURRENTLY build leaves an invalid index, which IF NOT EXISTS would then keep for good.
            cursor.execute("SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(%s) AND NOT indisvalid", [parent_index(table)])
            if cursor.fetchone() is not None:
                cursor.execute(f"DROP INDEX CONCURRENTLY {parent_index(table)}")
            cursor.execute(f"CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS {parent_index(table)} ON {table} (id, school_id)")
        for child, column, parent in LINKS:
            name = link_name(child, column)
            cursor.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", [name])
            if cursor.fetchone() is None:
                cursor.execute(
                    f"ALTER TABLE {child} ADD CONSTRAINT {name} FOREIGN KEY ({column}, school_id) "
                    f"REFERENCES {parent} (id, school_id) DEFERRABLE INITIALLY DEFERRED NOT VALID"
                )
            try:
                cursor.execute(f"ALTER TABLE {child} VALIDATE CONSTRAINT {name}")
            except IntegrityError:
                print(f"\n  NOT VALIDATED {name}: {child}.{column} has rows in another school")


def drop_keys(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        for child, column, _parent in LINKS:
            cursor.execute(f"ALTER TABLE {child} DROP CONSTRAINT IF EXISTS {link_name(child, column)}")
        for table in PARENTS:
            cursor.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {parent_index(table)}")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("main", "0110_integrity_keys"),
        ("accounting", "0004_alter_accountingledgerbalance_opening_balance_and_more"),
        ("library", "0005_libraryguestschool"),
        ("hostel", "0001_initial"),
        ("canteen", "0004_canteen_users"),
        ("extra_billing", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_keys, drop_keys),
    ]
