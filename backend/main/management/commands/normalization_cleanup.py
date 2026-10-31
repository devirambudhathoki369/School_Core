"""
Clean the rows that stop the database rules from being added, then add the rules.

    python manage.py normalization_cleanup             # say what would change
    python manage.py normalization_cleanup --apply     # change it, then add the rules
    python manage.py normalization_cleanup --undo <batch>
    python manage.py normalization_cleanup --report    # what needs a person to decide

Nothing is deleted. A duplicate is marked inactive, and every value changed is kept
in main_cleanupchange, which is what --undo reads.

Each table keeps the row its screens read today, so no school sees a different
answer: the newest for exam schedules, timetables and SMS templates, which are read
newest first, and the oldest for grading rules, which are read with first().

Fee titles, accounting ledgers, academic years in use, and subjects that both hold
marks are left alone, because merging them moves money or results. So are ledger
totals that differ from their lines. --report lists them for the school.
"""

import json
import re
import uuid
from collections import defaultdict
from importlib import import_module

from django.core.management.base import BaseCommand
from django.db import connection, transaction

from main.models.Normalized import CleanupChange

BS_DATE = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$")
DATE_COLUMNS = (("main_student", "birth_date"), ("main_studenttransportationinfo", "start_date"))
CROSSED_KEYS = (
    ("main_subject", "class_info_id"),
    ("main_studentinvoice", "academic_year_id"),
    ("main_staffinvoice", "academic_year_id"),
)


def rows(sql, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        return cursor.fetchall()


class Cleanup:
    def __init__(self, apply):
        self.apply = apply
        self.batch = uuid.uuid4().hex
        self.counts = defaultdict(int)
        self.step = ""

    def change(self, table, row_id, column, old, new):
        """One value, logged with what it was. A dry run only counts it."""
        self.counts[self.step] += 1
        if not self.apply:
            return
        CleanupChange.objects.create(
            batch=self.batch, step=self.step, table_name=table, row_id=row_id,
            column_name=column, old_value=old, new_value=new,
        )
        value = json.dumps(new) if isinstance(new, (dict, list)) else new
        with connection.cursor() as cursor:
            cursor.execute(f"UPDATE {table} SET {column} = %s WHERE id = %s", [value, row_id])

    def retire(self, table, ids):
        for row_id in ids:
            self.change(table, row_id, "is_active", True, False)

    # ---------------------------------------------------------------- dates

    def malformed_dates(self):
        self.step = "malformed dates"
        for table, column in DATE_COLUMNS:
            bad = rows(
                f"SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL AND {column} <> '' "
                f"AND {column} !~ '^[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}$'"
            )
            for row_id, value in bad:
                found = BS_DATE.match(value.strip())
                if found:
                    year, month, day = found.groups()
                    self.change(table, row_id, column, value, f"{year}-{int(month):02d}-{int(day):02d}")

    # ------------------------------------------------------ links across schools

    def crossed_receipts(self):
        self.step = "receipts on another school's year"
        for table in ("main_studentinvoice", "main_staffinvoice"):
            crossed = rows(
                f"""SELECT i.id, i.academic_year_id, own.id
                    FROM {table} i
                    JOIN main_academicyear y ON y.id = i.academic_year_id
                    JOIN LATERAL (
                        SELECT o.id FROM main_academicyear o
                        WHERE o.school_id = i.school_id AND lower(o.name) = lower(y.name)
                        ORDER BY o.is_active DESC, o.id DESC LIMIT 1
                    ) own ON true
                    WHERE y.school_id <> i.school_id"""
            )
            for row_id, old, new in crossed:
                self.change(table, row_id, "academic_year_id", old, new)

    def crossed_exam_schedules(self):
        self.step = "exam schedules across schools"
        self.retire("main_examschedule", [r[0] for r in rows(
            """SELECT e.id FROM main_examschedule e
               JOIN main_exam x ON x.id = e.exam_id JOIN main_classinfo c ON c.id = e.class_info_id
               WHERE x.school_id <> c.school_id AND e.is_active"""
        )])

    def crossed_class_results(self):
        self.step = "class results on another school's subject"
        crossed = rows(
            """SELECT r.id, r.subject_id, own.id
               FROM main_classresult r
               JOIN main_exam x ON x.id = r.exam_id
               JOIN main_subject s ON s.id = r.subject_id
               JOIN LATERAL (
                   SELECT o.id FROM main_subject o
                   WHERE o.school_id = x.school_id AND o.is_active AND lower(o.subject) = lower(s.subject)
                     AND o.class_info_id = r.class_info_id
                   ORDER BY o.id LIMIT 1
               ) own ON true
               WHERE x.school_id <> s.school_id"""
        )
        for row_id, old, new in crossed:
            self.change("main_classresult", row_id, "subject_id", old, new)

    def crossed_subjects(self):
        self.step = "subjects on another school's class"
        crossed = rows(
            """SELECT s.id, s.class_info_id, (
                   SELECT array_agg(o.id) FROM main_classinfo o
                   WHERE o.school_id = s.school_id AND o.is_active AND o.section_id IS NULL
                     AND o.education_level = c.education_level
                     AND o.grade IS NOT DISTINCT FROM c.grade AND o.faculty IS NOT DISTINCT FROM c.faculty
                     AND o.year IS NOT DISTINCT FROM c.year AND o.semester IS NOT DISTINCT FROM c.semester
               )
               FROM main_subject s JOIN main_classinfo c ON c.id = s.class_info_id
               WHERE c.school_id <> s.school_id"""
        )
        for row_id, old, matches in crossed:
            if matches and len(matches) == 1:
                self.change("main_subject", row_id, "class_info_id", old, matches[0])

    # ------------------------------------------------------------------ duplicates

    def attendance_sheets(self):
        """One sheet per class and day. A student marked present on either sheet was present."""
        self.step = "attendance sheets"
        groups = rows(
            """SELECT array_agg(id) FROM main_classattendance WHERE is_active
               GROUP BY school_id, class_info_id, date HAVING count(*) > 1"""
        )
        for (ids,) in groups:
            marks = defaultdict(list)
            for sheet, row_id, student, status in rows(
                """SELECT class_attendance_id, id, student_id, status FROM main_studentattendance
                   WHERE class_attendance_id = ANY(%s) AND is_active""",
                [ids],
            ):
                marks[sheet].append((row_id, student, status))
            keeper = max(ids, key=lambda sheet: (len(marks[sheet]), sheet))
            kept = {student: (row_id, status) for row_id, student, status in marks[keeper]}
            for sheet in ids:
                if sheet == keeper:
                    continue
                for row_id, student, status in marks[sheet]:
                    if student not in kept:
                        self.change("main_studentattendance", row_id, "class_attendance_id", sheet, keeper)
                        kept[student] = (row_id, status)
                        continue
                    other_id, other_status = kept[student]
                    if status and not other_status:
                        self.change("main_studentattendance", other_id, "status", False, True)
                        kept[student] = (other_id, True)
                    self.change("main_studentattendance", row_id, "is_active", True, False)
                self.change("main_classattendance", sheet, "is_active", True, False)

    def keep_one(self, step, table, group_by, newest=True):
        self.step = step
        keep = "max(id)" if newest else "min(id)"
        for ids, kept in rows(
            f"SELECT array_agg(id), {keep} FROM {table} WHERE is_active GROUP BY {group_by} HAVING count(*) > 1"
        ):
            self.retire(table, [row_id for row_id in ids if row_id != kept])

    def subject_assignments(self):
        """All rows of an optional subject are read together, so the students are merged."""
        self.step = "optional subject lists"
        groups = rows(
            """SELECT array_agg(id ORDER BY id) FROM main_subjectassignment WHERE is_active
               GROUP BY academic_year_id, class_info_id, subject_id HAVING count(*) > 1"""
        )
        for (ids,) in groups:
            lists = dict(rows("SELECT id, students FROM main_subjectassignment WHERE id = ANY(%s)", [ids]))
            kept = ids[-1]
            merged = []
            for row_id in ids:
                for student in json.loads(lists[row_id]) if isinstance(lists[row_id], str) else (lists[row_id] or []):
                    if student not in merged:
                        merged.append(student)
            old = json.loads(lists[kept]) if isinstance(lists[kept], str) else lists[kept]
            if merged != old:
                self.change("main_subjectassignment", kept, "students", old, merged)
            self.retire("main_subjectassignment", ids[:-1])

    def sections(self):
        """A section no class uses is retired. One in use moves its classes, unless a class would double."""
        self.step = "sections"
        groups = rows(
            """SELECT array_agg(id ORDER BY id) FROM main_section WHERE is_active
               GROUP BY school_id, lower(section) HAVING count(*) > 1"""
        )
        for (ids,) in groups:
            used = dict(rows(
                "SELECT section_id, count(*) FROM main_classinfo WHERE section_id = ANY(%s) GROUP BY 1", [ids]
            ))
            keeper = max(ids, key=lambda section: (used.get(section, 0), section))
            for section in ids:
                if section == keeper:
                    continue
                classes = rows("SELECT id FROM main_classinfo WHERE section_id = %s", [section])
                clash = rows(
                    """SELECT 1 FROM main_classinfo a JOIN main_classinfo b
                         ON b.section_id = %s AND a.school_id = b.school_id
                        AND a.academic_year_id IS NOT DISTINCT FROM b.academic_year_id
                        AND a.education_level = b.education_level AND a.grade IS NOT DISTINCT FROM b.grade
                        AND a.faculty IS NOT DISTINCT FROM b.faculty AND a.course_id IS NOT DISTINCT FROM b.course_id
                        AND a.year IS NOT DISTINCT FROM b.year AND a.semester IS NOT DISTINCT FROM b.semester
                        AND a.name IS NOT DISTINCT FROM b.name
                       WHERE a.section_id = %s LIMIT 1""",
                    [keeper, section],
                )
                if clash:
                    continue
                for (class_id,) in classes:
                    self.change("main_classinfo", class_id, "section_id", section, keeper)
                self.change("main_section", section, "is_active", True, False)

    def idle_subjects(self):
        """A duplicate subject nothing points at is retired. Anything holding marks stays."""
        self.step = "subjects nothing uses"
        groups = rows(
            """SELECT array_agg(id) FROM main_subject WHERE is_active
               GROUP BY class_info_id, lower(subject), type HAVING count(*) > 1"""
        )
        for (ids,) in groups:
            used = {r[0] for r in rows(
                """SELECT subject_id FROM main_classresult WHERE subject_id = ANY(%(i)s)
                   UNION SELECT subject_id FROM main_homework WHERE subject_id = ANY(%(i)s)
                   UNION SELECT subject_id FROM main_subjectassignment WHERE subject_id = ANY(%(i)s)
                   UNION SELECT subject_id FROM main_classperiodslot WHERE subject_id = ANY(%(i)s)
                   UNION SELECT subject_id FROM main_examschedulesubject WHERE subject_id = ANY(%(i)s)""",
                {"i": ids},
            )}
            # Keep every subject in use. With none in use, keep the newest.
            spare = [i for i in ids if i not in used]
            if not used:
                spare.remove(max(spare))
            self.retire("main_subject", spare)

    def run(self):
        for step in (
            self.malformed_dates,
            self.crossed_receipts,
            self.crossed_exam_schedules,
            self.crossed_class_results,
            self.crossed_subjects,
            self.attendance_sheets,
            lambda: self.keep_one("exam schedules", "main_examschedule", "exam_id, class_info_id"),
            lambda: self.keep_one("timetables", "main_classperiod", "class_info_id, academic_year_id"),
            lambda: self.keep_one("sms templates", "main_smstemplate", "school_id, type"),
            lambda: self.keep_one("grading rules", "main_gradingrules", "school_id, type", newest=False),
            lambda: self.keep_one("year mappings", "main_academicyearmapping", "school_id, key"),
            self.subject_assignments,
            self.sections,
            self.idle_subjects,
        ):
            # One transaction per step, so a dry run also proves each would commit.
            with transaction.atomic():
                step()
        return dict(self.counts)


def undo_changes(batch):
    changes = CleanupChange.objects.filter(batch=batch).order_by("-id")
    count = 0
    with transaction.atomic():
        for change in changes:
            old = change.old_value
            value = json.dumps(old) if isinstance(old, (dict, list)) else old
            with connection.cursor() as cursor:
                cursor.execute(
                    f"UPDATE {change.table_name} SET {change.column_name} = %s WHERE id = %s",
                    [value, change.row_id],
                )
            count += 1
        changes.delete()
    return count


class Editor:
    connection = connection


def add_missing_rules():
    """Every rule whose data is now clean. Each add skips a rule its data still breaks."""
    integrity = import_module("main.migrations.0110_integrity_keys")
    integrity.add_unique_rules(None, Editor)
    integrity.add_date_rules(None, Editor)
    import_module("main.migrations.0111_tenant_keys").add_keys(None, Editor)
    import_module("main.migrations.0114_cleanup_log_and_keys").add_rules(None, Editor)


def undo(batch):
    """The old values break the rules the cleanup made possible, so those rules come
    off first, and go back on only where the data still allows."""
    integrity = import_module("main.migrations.0110_integrity_keys")
    tenant = import_module("main.migrations.0111_tenant_keys")
    import_module("main.migrations.0114_cleanup_log_and_keys").drop_rules(None, Editor)
    with connection.cursor() as cursor:
        for table, column in DATE_COLUMNS:
            cursor.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {integrity.date_rule_name(table, column)}")
        for child, column in CROSSED_KEYS:
            cursor.execute(f"ALTER TABLE {child} DROP CONSTRAINT IF EXISTS {tenant.link_name(child, column)}")
    count = undo_changes(batch)
    add_missing_rules()
    return count


REPORTS = (
    ("Ledger totals that differ from their lines (the school decides which is right)",
     """SELECT l.school_id, count(*), sum(abs(l.total - x.s))
        FROM main_studentledger l
        JOIN LATERAL (SELECT coalesce(sum(n.amount), 0) s FROM main_studentledgerline n WHERE n.ledger_id = l.id) x ON true
        WHERE l.is_active AND abs(l.total - x.s) > 0.01 GROUP BY 1 ORDER BY 1"""),
    ("Subjects on another school's class with no matching class of their own",
     """SELECT s.school_id, count(*), string_agg(s.subject, ', ')
        FROM main_subject s JOIN main_classinfo c ON c.id = s.class_info_id
        WHERE c.school_id <> s.school_id GROUP BY 1 ORDER BY 1"""),
    ("Class results on a subject of another school, with no subject of that name in their own",
     """SELECT x.school_id, count(*), string_agg(s.subject, ', ')
        FROM main_classresult r JOIN main_exam x ON x.id = r.exam_id JOIN main_subject s ON s.id = r.subject_id
        WHERE x.school_id <> s.school_id GROUP BY 1 ORDER BY 1"""),
    ("Duplicate subjects in a class that are both in use",
     """SELECT school_id, count(*), string_agg(DISTINCT subject, ', ') FROM (
            SELECT school_id, subject FROM main_subject WHERE is_active
            GROUP BY school_id, class_info_id, lower(subject), subject, type HAVING count(*) > 1
        ) d GROUP BY 1 ORDER BY 1"""),
    ("Duplicate fee titles (ledgers point at both)",
     """SELECT school_id, count(*), string_agg(t, ', ') FROM (
            SELECT school_id, min(title) t FROM main_feetitle WHERE is_active
            GROUP BY school_id, lower(title) HAVING count(*) > 1
        ) d GROUP BY 1 ORDER BY 1"""),
    ("Duplicate accounting ledgers (vouchers point at both)",
     """SELECT school_id, count(*), string_agg(n, ', ') FROM (
            SELECT school_id, min(name) n FROM accounting_accountingledger WHERE is_active
            GROUP BY school_id, lower(name) HAVING count(*) > 1
        ) d GROUP BY 1 ORDER BY 1"""),
    ("Duplicate academic years",
     """SELECT school_id, count(*), string_agg(n, ', ') FROM (
            SELECT school_id, min(name) n FROM main_academicyear WHERE is_active
            GROUP BY school_id, lower(name) HAVING count(*) > 1
        ) d GROUP BY 1 ORDER BY 1"""),
)


class Command(BaseCommand):
    help = "Clean what stops the database rules being added, then add them. A dry run unless --apply."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true", help="really change the rows and add the rules")
        parser.add_argument("--undo", metavar="BATCH", help="put back everything a batch changed")
        parser.add_argument("--report", action="store_true", help="list what needs a person to decide")

    def handle(self, *args, **options):
        if options["report"]:
            for title, sql in REPORTS:
                self.stdout.write(self.style.MIGRATE_HEADING(title))
                found = rows(sql)
                if not found:
                    self.stdout.write("  none")
                for school, count, detail in found:
                    self.stdout.write(f"  school {school}: {count} ({str(detail)[:200]})")
            return
        if options["undo"]:
            self.stdout.write(f"Put back {undo(options['undo'])} value(s).")
            return
        cleanup = Cleanup(options["apply"])
        counts = cleanup.run()
        for step, count in counts.items():
            self.stdout.write(f"  {step}: {count} value(s)")
        if not options["apply"]:
            self.stdout.write("Nothing changed. Run again with --apply.")
            return
        add_missing_rules()
        self.stdout.write(self.style.SUCCESS(f"Done. Batch {cleanup.batch} can be undone with --undo."))
        self.stdout.write("Run normalization_audit to see what is left, and --report for what needs a person.")
