# The expand step: real tables for facts that live in JSON, kept in step by triggers.
# See main/models/Normalized.py. Backfilled by 0109.

import customs.NepaliDateField
import django.db.models.deletion
from django.db import migrations, models

# The catalog as the frontend's permission list had it on this date. A later id
# reaches the catalog through the trigger, named "Permission <id>".
PERMISSIONS = {
    1: "DASHBOARD.SUMMARY",
    101: "STUDENT.ENROLLMENT",
    102: "STUDENT.UPDATE",
    103: "STUDENT.PAYMENT",
    104: "STUDENT.LEDGER_POSTING",
    105: "STUDENT.DUES_POSTING",
    106: "STUDENT.REMINDER_BILLS",
    107: "STUDENT.FAST_CASH_RECEIPT",
    108: "STUDENT.TAX_INVOICE",
    109: "STUDENT.DELETE_LEDGER",
    110: "STUDENT.DELETE_INVOICE",
    111: "STUDENT.BULK_PHOTOS",
    201: "STAFF.ENROLLMENT",
    202: "STAFF.UPDATE",
    203: "STAFF.PAYMENT",
    204: "STAFF.SALARY_POSTING",
    209: "STAFF.DELETE_LEDGER",
    210: "STAFF.DELETE_INVOICE",
    211: "STAFF.PAY_SLIPS",
    212: "STAFF.SALARY_SHEET",
    501: "MANAGE.ACADEMIC_YEARS",
    502: "MANAGE.SECTIONS",
    503: "MANAGE.COURSES",
    504: "MANAGE.SUBJECTS",
    505: "MANAGE.CLASS_PERIODS",
    506: "MANAGE.FEES",
    507: "MANAGE.BUS_STATIONS",
    508: "MANAGE.EXTRA_ACTIVITIES",
    509: "MANAGE.COURSES_SUBJECTS_PAGE",
    510: "MANAGE.BATCHES",
    511: "MANAGE.BUS_TRACKING",
    601: "EXAM.SETUP",
    602: "EXAM.SCHEDULE_SETUP",
    603: "EXAM.OPTIONAL_SUBJECT_ASSIGNMENT",
    604: "EXAM.MARKS_ENTRY",
    605: "EXAM.MARKS_ENTRY_SLIP",
    606: "EXAM.GRADING_RULES_SETUP",
    607: "EXAM.ENTRY_CARDS",
    608: "EXAM.RESULTS_PUBLISH",
    609: "EXAM.SEAT_PLAN",
    610: "EXAM.RESULT_MAKING",
    650: "EXAM.VIEW_RESULTS",
    666: "EXAM.CHARACTER_CERTIFICATE",
    676: "EXAM.EXTRA_ACTIVITY_ENTRY",
    701: "REPORTS.RECENT_ENROLLMENTS",
    702: "REPORTS.RECENT_TRANSACTIONS",
    703: "REPORTS.RECENT_POSTINGS",
    704: "REPORTS.OVERALL_REMAINING_DUES",
    705: "REPORTS.OVERALL_STUDENT_LEDGERS",
    706: "REPORTS.TRANSACTIONS_HISTORY",
    707: "REPORTS.ENROLLMENT_HISTORY",
    708: "REPORTS.OPENING_BALANCE_REPORT",
    709: "REPORTS.NEW_ADMISSIONS_REPORT",
    710: "REPORTS.STUDENTS_BALANCE_RANGE_REPORT",
    711: "REPORTS.TRANSPORTATION_REPORT",
    712: "REPORTS.DISCOUNTS_REPORT",
    713: "REPORTS.STUDENTS_PROFILE_PRINT",
    714: "REPORTS.LEDGER_POSTING_HISTORY",
    715: "REPORTS.STAFF_DETAILS_REPORT",
    716: "REPORTS.ETHNIC_GROUP_REPORT",
    1101: "ACCOUNTING.ECONOMIC_YEAR",
    1102: "ACCOUNTING.LEDGER",
    1103: "ACCOUNTING.INCOME_ENTRY",
    1104: "ACCOUNTING.EXPENSE_ENTRY",
    1105: "ACCOUNTING.JOURNAL_ENTRY",
    1106: "ACCOUNTING.CONTRA_ENTRY",
    1107: "ACCOUNTING.INDIVIDUAL_LEDGER_REPORT",
    1108: "ACCOUNTING.GROUPWISE_LEDGER_REPORT",
    1109: "ACCOUNTING.PROFIT_LOSS_REPORT",
    1110: "ACCOUNTING.BALANCE_SHEET",
    1111: "ACCOUNTING.CASH_FLOW_STATEMENT",
    1112: "ACCOUNTING.TRIAL_BALANCE",
    1113: "ACCOUNTING.DAY_BOOK",
    1131: "ACCOUNTING.LEDGERS",
    1132: "ACCOUNTING.INCOME_ENTRIES",
    1133: "ACCOUNTING.EXPENSE_ENTRIES",
    1134: "ACCOUNTING.JOURNAL_ENTRIES",
    1135: "ACCOUNTING.CONTRA_ENTRIES",
    1136: "ACCOUNTING.INCOME_ENTRIES_EDIT",
    1137: "ACCOUNTING.INCOME_ENTRIES_DELETE",
    1138: "ACCOUNTING.EXPENSE_ENTRIES_EDIT",
    1139: "ACCOUNTING.EXPENSE_ENTRIES_DELETE",
    1140: "ACCOUNTING.JOURNAL_ENTRIES_EDIT",
    1141: "ACCOUNTING.JOURNAL_ENTRIES_DELETE",
    1501: "ATTENDANCE.ENTRY",
    1502: "ATTENDANCE.MANAGEMENT",
    1503: "ATTENDANCE.REPORT",
    1504: "ATTENDANCE.OVERALL_REPORT",
    1505: "ATTENDANCE.HISTORY",
    1601: "COMMUNICATION.SMS.SETTINGS",
    1602: "COMMUNICATION.SMS.TEMPLATES",
    1603: "COMMUNICATION.SMS.BULK_SMS",
    1604: "COMMUNICATION.SMS.DUES_REMINDER",
    1605: "COMMUNICATION.SMS.SEND_MESSAGES",
    1606: "COMMUNICATION.SMS.STAFF_SMS",
    1607: "COMMUNICATION.SMS.REPORT",
    1651: "COMMUNICATION.NOTICE.CREATE",
    1652: "COMMUNICATION.NOTICE.LIST",
    1660: "COMMUNICATION.NOTICE.LETTER_TO_STUDENTS",
    1701: "COMMUNICATION.NEWS.CREATE",
    1702: "COMMUNICATION.NEWS.LIST",
    1751: "COMMUNICATION.APP.SLIDE_IMAGES",
    2201: "LIBRARY.SETUP",
    2202: "LIBRARY.BOOK_SETUP",
    2203: "LIBRARY.BOOK_TRANSACTION",
    2204: "LIBRARY.REPORTS",
    2301: "INVENTORY.ITEMS",
    2302: "INVENTORY.PURCHASES",
    2303: "INVENTORY.ISSUES",
    2304: "INVENTORY.REPORTS",
    2305: "INVENTORY.WASTAGE",
    2401: "RFID.USERS_SETUP",
    2402: "RFID.REGISTERED_USERS",
    2403: "RFID.ATTENDANCE_LOGS",
    2404: "RFID.TIME_SET",
    2501: "HOSTEL.SETUP",
    2502: "HOSTEL.ROOMS",
    2503: "HOSTEL.ALLOCATION",
    2504: "HOSTEL.ATTENDANCE",
    2505: "HOSTEL.LEAVE",
    2506: "HOSTEL.VISITORS",
    2507: "HOSTEL.COMPLAINTS",
    2508: "HOSTEL.MESS",
    2509: "HOSTEL.DISCIPLINE",
    2510: "HOSTEL.REPORTS",
    2601: "EXTRA_BILLING.PARTIES",
    2602: "EXTRA_BILLING.BILLING",
    2603: "EXTRA_BILLING.PAYMENT",
    2604: "EXTRA_BILLING.REPORTS",
    2701: "CANTEEN.COUNTER",
    2702: "CANTEEN.ITEMS",
    2703: "CANTEEN.ACCOUNTS",
    2705: "CANTEEN.REPORTS",
    2706: "CANTEEN.SETUP",
    2707: "CANTEEN.USE_TYPES",
    2708: "CANTEEN.MONTHLY_POSTING",
    2709: "CANTEEN.COLLECT",
    2710: "CANTEEN.USERS",
}

# A failed sync must never stop a payment or a save: the JSON is still the source
# of truth, so the handlers warn and let the write through, and
# `manage.py normalization_audit` reports the rows that differ.
SYNC_FUNCTIONS = r"""
CREATE OR REPLACE FUNCTION norm_numeric(v jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN jsonb_typeof(v) = 'number' THEN (v #>> '{}')::numeric
        WHEN jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN trim(v #>> '{}')::numeric
    END
$$;

CREATE OR REPLACE FUNCTION norm_bigint(v jsonb) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN jsonb_typeof(v) = 'number' AND (v #>> '{}') ~ '^[0-9]{1,18}$' THEN (v #>> '{}')::bigint
        WHEN jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^[0-9]{1,18}$' THEN (v #>> '{}')::bigint
    END
$$;

CREATE OR REPLACE FUNCTION norm_class_period_slots(period_id bigint, subjects jsonb, teachers jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_classperiodslot WHERE class_period_id = period_id;
    INSERT INTO main_classperiodslot (class_period_id, period_no, subject_id, teacher_id)
    SELECT period_id, CASE WHEN k.no ~ '^[0-9]{1,4}$' THEN k.no::int END, s.id, t.id
    FROM (
        SELECT key AS no FROM jsonb_each(CASE WHEN jsonb_typeof(subjects) = 'object' THEN subjects ELSE '{}'::jsonb END)
        UNION
        SELECT key FROM jsonb_each(CASE WHEN jsonb_typeof(teachers) = 'object' THEN teachers ELSE '{}'::jsonb END)
    ) k
    LEFT JOIN main_subject s ON s.id = norm_bigint(subjects -> k.no)
    LEFT JOIN main_staff t ON t.id = norm_bigint(teachers -> k.no)
    WHERE k.no ~ '^[0-9]{1,4}$';
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_class_period_slots(%): %', period_id, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_exam_schedule_subjects(schedule_ref bigint, schedule jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_examschedulesubject WHERE schedule_id = schedule_ref;
    IF jsonb_typeof(schedule) = 'object' THEN
        INSERT INTO main_examschedulesubject (schedule_id, subject_id, exam_date)
        SELECT schedule_ref, s.id,
               CASE WHEN replace(e.value, '/', '-') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN replace(e.value, '/', '-') END
        FROM jsonb_each_text(schedule) e
        JOIN main_subject s ON s.id = CASE WHEN e.key ~ '^[0-9]{1,18}$' THEN e.key::bigint END;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_exam_schedule_subjects(%): %', schedule_ref, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_assignment_students(assignment_ref bigint, students jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_subjectassignmentstudent WHERE assignment_id = assignment_ref;
    IF jsonb_typeof(students) = 'array' THEN
        INSERT INTO main_subjectassignmentstudent (assignment_id, student_id)
        SELECT DISTINCT assignment_ref, s.id
        FROM jsonb_array_elements(students) e
        JOIN main_student s ON s.id = norm_bigint(e);
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_assignment_students(%): %', assignment_ref, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_staff_grants(staff_ref bigint, permissions jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_staffpermissiongrant WHERE staff_id = staff_ref;
    IF jsonb_typeof(permissions) = 'array' THEN
        INSERT INTO main_staffpermission (code, name)
        SELECT DISTINCT norm_bigint(e), 'Permission ' || norm_bigint(e)
        FROM jsonb_array_elements(permissions) e
        WHERE norm_bigint(e) IS NOT NULL
        ON CONFLICT (code) DO NOTHING;
        INSERT INTO main_staffpermissiongrant (staff_id, permission_id)
        SELECT DISTINCT staff_ref, norm_bigint(e)
        FROM jsonb_array_elements(permissions) e
        WHERE norm_bigint(e) IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_staff_grants(%): %', staff_ref, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_student_ledger_lines(ledger_ref bigint, details jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_studentledgerline WHERE ledger_id = ledger_ref;
    IF jsonb_typeof(details) = 'object' THEN
        INSERT INTO main_studentledgerline (ledger_id, line_no, title_id, code, label, amount)
        SELECT ledger_ref, row_number() OVER (ORDER BY e.key), t.id,
               CASE WHEN t.id IS NULL THEN left(e.key, 32) ELSE '' END,
               details -> '__titles' ->> e.key, norm_numeric(e.value)
        FROM jsonb_each(details) e
        LEFT JOIN main_feetitle t ON t.id = CASE WHEN e.key ~ '^[0-9]{1,18}$' THEN e.key::bigint END
        WHERE e.key <> '__titles' AND norm_numeric(e.value) IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_student_ledger_lines(%): %', ledger_ref, SQLERRM;
END $$;

-- A receipt holds {title: {amt, due, dis}}, or for a cash receipt [{AMT, PAR}, ...].
CREATE OR REPLACE FUNCTION norm_student_invoice_lines(invoice_ref bigint, details jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_studentinvoiceline WHERE invoice_id = invoice_ref;
    IF jsonb_typeof(details) = 'object' THEN
        INSERT INTO main_studentinvoiceline (invoice_id, line_no, title_id, code, label, amount, due, discount)
        SELECT invoice_ref, row_number() OVER (ORDER BY e.key), t.id,
               CASE WHEN t.id IS NULL THEN left(e.key, 32) ELSE '' END,
               details -> '__titles' ->> e.key,
               CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END,
               CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'due') END,
               CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'dis') END
        FROM jsonb_each(details) e
        LEFT JOIN main_feetitle t ON t.id = CASE WHEN e.key ~ '^[0-9]{1,18}$' THEN e.key::bigint END
        WHERE e.key <> '__titles'
          AND (CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END) IS NOT NULL;
    ELSIF jsonb_typeof(details) = 'array' THEN
        INSERT INTO main_studentinvoiceline (invoice_id, line_no, code, label, amount)
        SELECT invoice_ref, e.no, 'cash', e.value ->> 'PAR', norm_numeric(e.value -> 'AMT')
        FROM jsonb_array_elements(details) WITH ORDINALITY AS e(value, no)
        WHERE norm_numeric(e.value -> 'AMT') IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_student_invoice_lines(%): %', invoice_ref, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_staff_ledger_lines(ledger_ref bigint, details jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_staffledgerline WHERE ledger_id = ledger_ref;
    IF jsonb_typeof(details) = 'object' THEN
        INSERT INTO main_staffledgerline (ledger_id, line_no, code, amount)
        SELECT ledger_ref, row_number() OVER (ORDER BY e.key), left(e.key, 32), norm_numeric(e.value)
        FROM jsonb_each(details) e
        WHERE e.key <> '__titles' AND norm_numeric(e.value) IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_staff_ledger_lines(%): %', ledger_ref, SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION norm_staff_invoice_lines(invoice_ref bigint, details jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM main_staffinvoiceline WHERE invoice_id = invoice_ref;
    IF jsonb_typeof(details) = 'object' THEN
        INSERT INTO main_staffinvoiceline (invoice_id, line_no, code, amount, due)
        SELECT invoice_ref, row_number() OVER (ORDER BY e.key), left(e.key, 32),
               CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END,
               CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'due') END
        FROM jsonb_each(details) e
        WHERE e.key <> '__titles'
          AND (CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END) IS NOT NULL;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'norm_staff_invoice_lines(%): %', invoice_ref, SQLERRM;
END $$;
"""

# (parent table, trigger function, its call, the JSON columns that drive it)
SYNCS = [
    ("main_classperiod", "norm_trg_class_period", "norm_class_period_slots(NEW.id, NEW.subjects, NEW.teachers)", ["subjects", "teachers"]),
    ("main_examschedule", "norm_trg_exam_schedule", "norm_exam_schedule_subjects(NEW.id, NEW.schedule)", ["schedule"]),
    ("main_subjectassignment", "norm_trg_subject_assignment", "norm_assignment_students(NEW.id, NEW.students)", ["students"]),
    ("main_staff", "norm_trg_staff", "norm_staff_grants(NEW.id, NEW.permissions)", ["permissions"]),
    ("main_studentledger", "norm_trg_student_ledger", "norm_student_ledger_lines(NEW.id, NEW.details)", ["details"]),
    ("main_studentinvoice", "norm_trg_student_invoice", "norm_student_invoice_lines(NEW.id, NEW.details)", ["details"]),
    ("main_staffledger", "norm_trg_staff_ledger", "norm_staff_ledger_lines(NEW.id, NEW.details)", ["details"]),
    ("main_staffinvoice", "norm_trg_staff_invoice", "norm_staff_invoice_lines(NEW.id, NEW.details)", ["details"]),
]


def trigger_sql():
    parts = [SYNC_FUNCTIONS]
    for table, function, call, columns in SYNCS:
        changed = " OR ".join(f"OLD.{c} IS DISTINCT FROM NEW.{c}" for c in columns)
        parts.append(f"""
CREATE OR REPLACE FUNCTION {function}() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM {call};
    RETURN NULL;
END $$;
CREATE TRIGGER {function}_ins AFTER INSERT ON {table}
    FOR EACH ROW EXECUTE FUNCTION {function}();
CREATE TRIGGER {function}_upd AFTER UPDATE OF {", ".join(columns)} ON {table}
    FOR EACH ROW WHEN ({changed}) EXECUTE FUNCTION {function}();
""")
    return "\n".join(parts)


def drop_trigger_sql():
    parts = []
    for table, function, _call, _columns in SYNCS:
        parts.append(f"DROP TRIGGER IF EXISTS {function}_ins ON {table};")
        parts.append(f"DROP TRIGGER IF EXISTS {function}_upd ON {table};")
        parts.append(f"DROP FUNCTION IF EXISTS {function}();")
    for name in ("norm_class_period_slots(bigint, jsonb, jsonb)", "norm_exam_schedule_subjects(bigint, jsonb)",
                 "norm_assignment_students(bigint, jsonb)", "norm_staff_grants(bigint, jsonb)",
                 "norm_student_ledger_lines(bigint, jsonb)", "norm_student_invoice_lines(bigint, jsonb)",
                 "norm_staff_ledger_lines(bigint, jsonb)", "norm_staff_invoice_lines(bigint, jsonb)",
                 "norm_numeric(jsonb)", "norm_bigint(jsonb)"):
        parts.append(f"DROP FUNCTION IF EXISTS {name};")
    return "\n".join(parts)


def seed_catalog(apps, schema_editor):
    StaffPermission = apps.get_model("main", "StaffPermission")
    StaffPermission.objects.bulk_create(
        [StaffPermission(code=code, name=name) for code, name in PERMISSIONS.items()],
        ignore_conflicts=True,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0107_schoolcore_product_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='StaffPermission',
            fields=[
                ('code', models.PositiveIntegerField(primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=80)),
            ],
        ),
        migrations.CreateModel(
            name='ClassPeriodSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_no', models.PositiveSmallIntegerField()),
                ('class_period', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='slots', to='main.classperiod')),
                ('subject', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='main.subject')),
                ('teacher', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='main.staff')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('class_period', 'period_no'), name='one_slot_per_period')],
            },
        ),
        migrations.CreateModel(
            name='ExamScheduleSubject',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('exam_date', customs.NepaliDateField.NepaliDateField(blank=True, max_length=10, null=True)),
                ('schedule', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='subjects', to='main.examschedule')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to='main.subject')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('schedule', 'subject'), name='one_date_per_schedule_subject')],
            },
        ),
        migrations.CreateModel(
            name='StaffInvoiceLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('line_no', models.PositiveSmallIntegerField()),
                ('code', models.CharField(max_length=32)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('due', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('invoice', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='main.staffinvoice')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('invoice', 'line_no'), name='one_staff_invoice_line_no')],
            },
        ),
        migrations.CreateModel(
            name='StaffLedgerLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('line_no', models.PositiveSmallIntegerField()),
                ('code', models.CharField(max_length=32)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('ledger', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='main.staffledger')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('ledger', 'line_no'), name='one_staff_ledger_line_no')],
            },
        ),
        migrations.CreateModel(
            name='StaffPermissionGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('permission', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='grants', to='main.staffpermission')),
                ('staff', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='permission_grants', to='main.staff')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('staff', 'permission'), name='grant_once_per_staff')],
            },
        ),
        migrations.CreateModel(
            name='StudentInvoiceLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('line_no', models.PositiveSmallIntegerField()),
                ('code', models.CharField(blank=True, default='', max_length=32)),
                ('label', models.TextField(blank=True, null=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('due', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('discount', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('invoice', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='main.studentinvoice')),
                ('title', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='main.feetitle')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('invoice', 'line_no'), name='one_student_invoice_line_no')],
            },
        ),
        migrations.CreateModel(
            name='StudentLedgerLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('line_no', models.PositiveSmallIntegerField()),
                ('code', models.CharField(blank=True, default='', max_length=32)),
                ('label', models.TextField(blank=True, null=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('ledger', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='main.studentledger')),
                ('title', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='main.feetitle')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('ledger', 'line_no'), name='one_student_ledger_line_no')],
            },
        ),
        migrations.CreateModel(
            name='SubjectAssignmentStudent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assignment', models.ForeignKey(db_index=False, on_delete=django.db.models.deletion.CASCADE, related_name='student_links', to='main.subjectassignment')),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to='main.student')),
            ],
            options={
                'constraints': [models.UniqueConstraint(fields=('assignment', 'student'), name='student_once_per_assignment')],
            },
        ),
        migrations.RunPython(seed_catalog, migrations.RunPython.noop),
        migrations.RunSQL(trigger_sql(), drop_trigger_sql()),
    ]
