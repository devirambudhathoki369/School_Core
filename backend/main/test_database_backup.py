import hashlib
import gzip
import io
import json
import sqlite3
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
from zipfile import ZipFile
from django.apps import apps
from django.core.management import call_command
from django.core.signals import request_finished
from django.db import close_old_connections
from django.test import TestCase, SimpleTestCase, TransactionTestCase
from main.services.database_backup import write_school_backup
from main.views.superadmin.DatabaseBackupView import DatabaseBackupView, write_full_backup


def make(label, **values):
    model = apps.get_model(label)
    for field in model._meta.concrete_fields:
        if field.primary_key or field.name in values or field.attname in values:
            continue
        if field.has_default() or field.null or getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False):
            continue
        if field.is_relation:
            raise AssertionError(f'Missing relation {label}.{field.name}')
        kind = field.get_internal_type()
        values[field.name] = (False if kind == 'BooleanField' else 1 if 'Integer' in kind or kind == 'DecimalField' else
                              '2083-01-01' if field.__class__.__name__ == 'NepaliDateField' else 'test')
    obj = model(**values)
    model._base_manager.bulk_create([obj])
    return obj


def close_response(response):
    """A response's close() ends the request, and the end of a request closes the
    database connection, which a test's transaction still needs. The test client
    holds that back the same way."""
    request_finished.disconnect(close_old_connections)
    try:
        response.close()
    finally:
        request_finished.connect(close_old_connections)


class SchoolBackupTests(TestCase):
    def setUp(self):
        self.year = make('main.EconomicYear')
        self.schools, self.students = [], []
        for index in range(2):
            account = make('account.AdminAccount', username=f'school{index}')
            school = make('main.SchoolAdmin', account=account, economic_year=self.year, name=f'School {index}')
            year = make('main.AcademicYear', school=school)
            klass = make('main.ClassInfo', school=school, academic_year=year)
            guardian = make('main.StudentGuardianInfo')
            student_account = make('account.StudentAccount', username=f'student{index}')
            student = make('main.Student', class_info=klass, academic_year=year,
                           guardian_info=guardian, account=student_account, is_active=False)
            attendance = make('main.ClassAttendance', school=school, class_info=klass)
            make('main.StudentAttendance', class_attendance=attendance, student=student)
            self.schools.append(school)
            self.students.append(student)
        make('library.LibraryGuestSchool', school=self.schools[0], guest_school=self.schools[1])

    def test_isolated_export_and_restore(self):
        output = io.BytesIO()
        write_school_backup(output, self.schools[0].pk)
        with ZipFile(output) as archive:
            records = json.loads(archive.read('data.json'))
            manifest = json.loads(archive.read('manifest.json'))
        ids = {}
        for record in records:
            ids.setdefault(record['model'], set()).add(record['pk'])
        for label, expected in [('main.schooladmin', self.schools[0].pk), ('main.student', self.students[0].pk),
                                ('main.studentguardianinfo', self.students[0].guardian_info_id),
                                ('account.studentaccount', self.students[0].account_id),
                                ('account.adminaccount', self.schools[0].account_id), ('main.economicyear', self.year.pk)]:
            self.assertEqual(ids[label], {expected})
        self.assertEqual(len(ids['main.studentattendance']), 1)
        self.assertFalse(next(r for r in records if r['model'] == 'main.student')['fields']['is_active'])
        self.assertEqual(sum(manifest['record_counts'].values()), len(records))
        self.assertIn(self.schools[1].pk, next(iter(manifest['external_references'].values())))
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json') as fixture:
            json.dump(records, fixture)
            fixture.flush()
            call_command('loaddata', fixture.name, verbosity=0)
        self.students[0].refresh_from_db()
        self.assertIsNone(self.students[0].other_info_id)

    def test_school_list_and_validation(self):
        view = DatabaseBackupView()
        def request(**params):
            return SimpleNamespace(user_role='superadmin', query_params=params)
        self.assertEqual(len(view.get(request(scope='schools')).data['schools']), 2)
        for params in ({'scope': 'bad'}, {'scope': 'school'}, {'scope': 'school', 'school': 'abc'},
                       {'scope': 'school', 'school': '0'}, {'scope': 'full', 'school': '1'}):
            self.assertEqual(view.get(request(**params)).status_code, 400)
        self.assertEqual(view.get(request(scope='school', school='999999')).status_code, 404)

    def test_download_headers_and_archive(self):
        response = DatabaseBackupView().get(SimpleNamespace(user_role='superuser',
            query_params={'scope': 'school', 'school': str(self.schools[0].pk)}))
        try:
            self.assertEqual(response.status_code, 200)
            self.assertIn('no-store', response['Cache-Control'])
            self.assertIn('.zip', response['Content-Disposition'])
            with ZipFile(io.BytesIO(b''.join(response.streaming_content))) as archive:
                self.assertIsNone(archive.testzip())
        finally:
            close_response(response)


class SchoolBackupSqlTests(TransactionTestCase):
    """database.sql is PostgreSQL's, and the export opens a snapshot of its own:
    it cannot be read from inside the transaction a TestCase wraps a test in."""
    setUp = SchoolBackupTests.setUp

    def test_the_archive_holds_a_database_file_with_the_same_rows(self):
        from django.db import connection, transaction
        if connection.vendor != 'postgresql':
            self.skipTest('database.sql is written on PostgreSQL only')
        output = io.BytesIO()
        write_school_backup(output, self.schools[0].pk)
        with ZipFile(output) as archive:
            script = archive.read('database.sql')
            records = json.loads(archive.read('data.json'))
            manifest = json.loads(archive.read('manifest.json'))
        sql = script.decode('utf-8')
        # Every selected record is one INSERT, and the manifest can prove the file.
        self.assertEqual(sql.count('\nINSERT INTO '), sum(manifest['record_counts'].values()))
        self.assertEqual(manifest['database_sql'], {'path': 'database.sql', 'rows': sql.count('\nINSERT INTO '),
                                                    'sha256': hashlib.sha256(script).hexdigest()})
        self.assertTrue(sql.rstrip().endswith('COMMIT;'))
        self.assertIn('BEGIN;\nSET CONSTRAINTS ALL DEFERRED;', sql)
        # This school's rows, and nobody else's.
        students = [line for line in sql.splitlines() if line.startswith('INSERT INTO "main_student" ')]
        self.assertEqual(len(students), 1)
        self.assertIn("'student0'", sql)
        self.assertNotIn("'student1'", sql)
        self.assertNotIn("'School 1'", sql)
        # Taken out of the tables and put back from the file, it is the same data.
        # The other school's rows stay: this school refers to one of them, and a
        # school backup never carries another school's records.
        from django.apps import apps
        ids = {}
        for record in records:
            ids.setdefault(record['model'], []).append(record['pk'])
        statements = [line for line in sql.splitlines() if line.startswith(('INSERT INTO ', 'SELECT setval('))]
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute('SET CONSTRAINTS ALL DEFERRED')
            for label, keys in ids.items():
                meta = apps.get_model(label)._meta
                cursor.execute(f'DELETE FROM "{meta.db_table}" WHERE "{meta.pk.column}" = ANY(%s)', [keys])
                self.assertEqual(cursor.rowcount, len(keys), label)
            for statement in statements:
                cursor.execute(statement.replace('%', '%%'))
        for label, keys in ids.items():
            self.assertEqual(apps.get_model(label)._base_manager.filter(pk__in=keys).count(), len(keys), label)
        student = apps.get_model('main.Student')._base_manager.get(pk=self.students[0].pk)
        self.assertEqual((student.account_id, student.is_active), (self.students[0].account_id, False))


class FullBackupTests(SimpleTestCase):
    def test_denies_other_roles(self):
        for role in (None, 'admin', 'staff', 'student'):
            result = DatabaseBackupView().get(SimpleNamespace(user_role=role, query_params={}))
            self.assertEqual(result.status_code, 403)

    def test_sqlite_wal_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            path = directory + '/source.sqlite3'
            source = sqlite3.connect(path)
            try:
                source.execute('PRAGMA journal_mode=WAL')
                source.execute('CREATE TABLE example (value TEXT)')
                source.execute("INSERT INTO example VALUES ('committed')")
                source.commit()
                output = io.BytesIO()
                self.assertEqual(write_full_backup(output, {'ENGINE': 'django.db.backends.sqlite3', 'NAME': path}), 'sqlite3.gz')
                restored_path = directory + '/restored.sqlite3'
                with open(restored_path, 'wb') as restored:
                    restored.write(gzip.decompress(output.getvalue()))
                with sqlite3.connect(restored_path) as restored:
                    self.assertEqual(restored.execute('SELECT value FROM example').fetchone(), ('committed',))
            finally:
                source.close()

    @patch('main.views.superadmin.DatabaseBackupView.shutil.which', return_value='/usr/bin/pg_dump')
    @patch('main.views.superadmin.DatabaseBackupView.subprocess.run')
    def test_failed_postgres_dump(self, run, which):
        run.return_value.returncode = 1
        with self.settings(DATABASES={'default': {'ENGINE': 'django.db.backends.postgresql', 'NAME': 'test'}}):
            with self.assertLogs('main.views.superadmin.DatabaseBackupView', level='ERROR'):
                response = DatabaseBackupView().get(SimpleNamespace(user_role='superadmin', query_params={}))
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('Content-Disposition', response)

    def test_unsupported_engine(self):
        with self.assertRaises(RuntimeError):
            write_full_backup(io.BytesIO(), {'ENGINE': 'mysql'})


class CompleteSchoolBackupTests(SchoolBackupTests):
    def test_sessions_stay_out_with_untagged_audit_and_timestamp_precision(self):
        from django.contrib.contenttypes.models import ContentType
        from datetime import datetime, timezone
        admin = self.schools[0].account
        make('account.AdminAuthToken', key='a' * 40, user=admin)
        make('account.AdminAuthToken', key='b' * 40, user=self.schools[1].account)
        student_type = ContentType.objects.get_for_model(self.students[0])
        user_type = ContentType.objects.get_for_model(admin)
        log = make('main.HistoryLog', school=None, user_type=user_type, user_id=admin.pk,
                   object_type=student_type, object_id=self.students[0].pk, changes={'field': [None, 'original']})
        make('main.HistoryLog', school=self.schools[1], user_type=user_type, user_id=admin.pk,
             object_type=student_type, object_id=self.students[0].pk)
        timestamp = datetime(2026, 10, 5, 1, 2, 3, 123456, tzinfo=timezone.utc)
        type(log).objects.filter(pk=log.pk).update(timestamp=timestamp)
        output = io.BytesIO()
        write_school_backup(output, self.schools[0].pk)
        with ZipFile(output) as archive:
            records = json.loads(archive.read('data.json'))
        self.assertEqual([r for r in records if r['model'].endswith('authtoken')], [])
        logs = [r for r in records if r['model'] == 'main.historylog']
        self.assertEqual([r['pk'] for r in logs], [log.pk])
        self.assertEqual(logs[0]['fields']['timestamp'], timestamp.isoformat())
        self.assertEqual(logs[0]['fields']['changes'], {'field': [None, 'original']})

    def test_school_files_and_missing_file_manifest(self):
        import hashlib
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory, self.settings(MEDIA_ROOT=directory):
            Path(directory, 'student_profiles').mkdir()
            Path(directory, 'student_profiles/mine.png').write_bytes(b'original-image-bytes')
            Path(directory, 'student_profiles/other.png').write_bytes(b'other-school-image')
            model = type(self.students[0])
            model.objects.filter(pk=self.students[0].pk).update(image='student_profiles/mine.png', nid='missing.pdf')
            model.objects.filter(pk=self.students[1].pk).update(image='student_profiles/other.png')
            output = io.BytesIO()
            write_school_backup(output, self.schools[0].pk)
            with ZipFile(output) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(archive.read('media/student_profiles/mine.png'), b'original-image-bytes')
                self.assertNotIn('media/student_profiles/other.png', archive.namelist())
                self.assertEqual(manifest['missing_files'], ['missing.pdf'])
                self.assertEqual(manifest['data_sha256'], hashlib.sha256(archive.read('data.json')).hexdigest())
                self.assertEqual(manifest['files'][0]['sha256'], hashlib.sha256(b'original-image-bytes').hexdigest())

    def test_every_model_has_a_coverage_decision(self):
        from main.services.database_backup import ownership_paths, APP_LABELS, GLOBAL_MODELS
        models = [m for m in apps.get_models() if m._meta.app_label in APP_LABELS]
        paths = ownership_paths(models)
        self.assertEqual(set(models), set(paths) | {m for m in models if m._meta.label_lower in GLOBAL_MODELS})
        self.assertIn(apps.get_model('account.StudentAuthToken'), paths)
        self.assertIn(apps.get_model('account.StaffAuthToken'), paths)


class BackupJobTests(SimpleTestCase):
    def test_background_job_download(self):
        import time
        from main.services.backup_jobs import start_backup, get_backup
        with tempfile.TemporaryDirectory() as directory, self.settings(DATABASE_BACKUP_DIR=directory):
            def dump(output, settings):
                output.write(gzip.compress(b'complete database'))
                return 'sql.gz'
            with patch('main.views.superadmin.DatabaseBackupView.write_full_backup', side_effect=dump):
                job = start_backup('full', None)['job']
                for attempt in range(200):
                    info, path = get_backup(job)
                    if info['status'] != 'preparing':
                        break
                    time.sleep(.01)
                self.assertEqual(info['status'], 'ready')
                self.assertEqual(gzip.decompress(path.read_bytes()), b'complete database')
                response = DatabaseBackupView().get(SimpleNamespace(user_role='superadmin', query_params={'scope': 'download', 'job': job}))
                try:
                    self.assertEqual(gzip.decompress(b''.join(response.streaming_content)), b'complete database')
                    self.assertIn('no-store', response['Cache-Control'])
                finally:
                    close_response(response)

    def test_job_lock_and_invalid_ids(self):
        import fcntl
        from pathlib import Path
        from main.services.backup_jobs import start_backup, get_backup, BackupBusy
        with tempfile.TemporaryDirectory() as directory, self.settings(DATABASE_BACKUP_DIR=directory):
            with open(Path(directory) / 'generation.lock', 'a+b') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(BackupBusy):
                    start_backup('full', None)
            for value in (None, '../secret', 'x' * 32):
                with self.assertRaises(FileNotFoundError):
                    get_backup(value)
