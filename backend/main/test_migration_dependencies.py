from importlib import import_module

from django.db.migrations.loader import MigrationLoader
from django.test import SimpleTestCase, override_settings


class IntegrityMigrationDependenciesTests(SimpleTestCase):
    @override_settings(MIGRATION_MODULES={})
    def test_every_raw_sql_table_and_date_column_exists_before_integrity_rules(self):
        migration = import_module("main.migrations.0110_integrity_keys")
        loader = MigrationLoader(None)
        state = loader.project_state([("main", "0110_integrity_keys")], at_end=False)
        tables = {
            model._meta.db_table: {field.column for field in model._meta.local_fields}
            for model in state.apps.get_models()
        }
        for table, column in migration.DATE_COLUMNS:
            with self.subTest(table=table, column=column):
                self.assertIn(table, tables)
                self.assertIn(column, tables[table])
        for _, table, *_ in migration.UNIQUE_RULES:
            self.assertIn(table, tables)
