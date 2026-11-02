import json
import re
from ast import literal_eval
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from functools import total_ordering
from itertools import product
from textwrap import dedent
from typing import Dict, List, Set, Union

import sqlglot
from more_itertools import unique_everseen

from kolo.django_schema import verbose_name

from .loaders import import_string
from .sort import TopologicalSorter

DATABASES = {
    "postgresql": "postgres",
}


UUID_REPR_REGEX = re.compile(
    r"UUID\(\'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\'\)"
)
DECIMAL_REPR_REGEX = re.compile(r"Decimal\('(\d+.?\d+?)'\)")
TIMEDELTA_REPR_REGEX = re.compile(
    r"datetime.timedelta\((?:days=(\d+),? ?)?(?:seconds=(\d+),? ?)?(?:microseconds=(\d+))?\)"
)
TIMEDELTA_STR_REGEX = re.compile(r"(-?\d+) days (\d+)\.(\d+) seconds")
TIMEDELTA_MICROSECONDS_REGEX = re.compile(r"\d+")


def is_auto_now(field):
    django_field = field.schema["django_field"]
    if django_field not in (
        "django.db.models.fields.DateTimeField",
        "django.db.models.fields.DateField",
    ):
        return False
    return field.schema["auto_now"] or field.schema["auto_now_add"]


class TooComplicatedError(Exception):
    pass


class AssertInsert:
    def __init__(
        self, variable_name, model, table, fields, import_path=None, query=None
    ):
        self.variable_name = variable_name
        self.model = model
        self.table = table
        self.fields = fields
        self.query = query
        self.import_path = import_path

    @classmethod
    def from_raw(cls, fields, query, table_schema, table_name, names, primary_key):
        module = table_schema["model_module"]
        model = table_schema["model_name"]
        verbose_name = table_schema["verbose_name"]
        variable_name = names.next_variable_name(
            verbose_name, primary_key.name, primary_key.value_repr
        )
        return cls(
            variable_name,
            f"{model}",
            table_name,
            fields,
            f"from {module} import {model}",
            query,
        )

    def update_fields(self, names, schema):
        fields = []
        for field in self.fields:
            if field.schema["primary_key"]:
                continue  # pragma: no cover
            if field.schema["django_field"] == "django.db.models.fields.DateTimeField":
                continue  # pragma: no cover
            if field.schema["django_field"] == "django.db.models.fields.DurationField":
                continue  # pragma: no cover
            if field.schema["django_field"] == "django.db.models.fields.json.JSONField":
                continue  # pragma: no cover
            if field.skip_default():
                continue

            if field.schema["is_relation"]:
                related_model = field.schema["related_model"]
                verbose_name = schema[related_model]["verbose_name"]
                related_pk = field.schema["related_pk"]
                try:
                    field.value_repr = field.value = names.names[
                        (verbose_name, related_pk, field.value_repr)
                    ]
                except KeyError:  # pragma: no cover
                    pass

            fields.append(field)

        for name, schema in schema[self.table]["fields"].items():
            if schema["gfk_object_id_field"]:
                fields = collect_gfk(fields, name, schema, names)
        self.fields = fields

    def __eq__(self, other):
        if not isinstance(other, AssertInsert):
            return NotImplemented  # pragma: no cover
        return (self.variable_name, self.model, self.fields) == (
            other.variable_name,
            other.model,
            other.fields,
        )

    def __repr__(self):
        return dedent(  # pragma: no cover
            f"""\
            AssertInsert(
                "{self.variable_name}",
                "{self.model}",
                "{self.table}",
                {self.fields},
            )"""
        )

    def unique_fields(self):
        unique = []
        rest = []
        for field in self.fields:
            if field.schema.get("has_unique", False):
                unique.append(field)
            else:
                rest.append(field)
        return unique, rest

    def foreign_keys(self):
        foreign = []
        rest = []
        for field in self.fields:
            if field.schema["is_relation"]:
                foreign.append(field)
            else:
                rest.append(field)
        return foreign, rest

    def get_template_parts(self, fields):
        yield f"{self.variable_name} = {self.model}.objects.get("
        for field in fields:
            yield f"{field.name}={field.value_repr},"
        yield ")"

    def get_fields(self):
        fields, rest = self.unique_fields()
        if fields:
            return fields, rest

        fields, rest = self.foreign_keys()
        if fields:
            return fields, rest

        return self.fields, []

    @property
    def template_parts(self):
        fields, rest = self.get_fields()

        yield from self.get_template_parts(fields)

        for field in rest:
            yield field.assert_equal_template(self.variable_name)

    @property
    def pytest_template_parts(self):
        fields, rest = self.get_fields()

        yield from self.get_template_parts(fields)

        for field in rest:
            yield field.assert_equal_template_pytest(self.variable_name)


class AssertUpdate:
    def __init__(self, variable_name, model, table, fields, query=None):
        self.variable_name = variable_name
        self.model = model
        self.table = table
        self.fields = fields
        self.query = query

    def __repr__(self):
        return dedent(
            f"""\
            AssertUpdate(
                "{self.variable_name}",
                "{self.model}",
                "{self.table}",
                {self.fields},
            )"""
        )

    def __eq__(self, other):
        if not isinstance(other, AssertUpdate):
            return NotImplemented  # pragma: no cover
        return (self.variable_name, self.fields) == (other.variable_name, other.fields)

    def update_fields(self, names, schema):
        fields = []
        for field in self.fields:
            if field.schema["primary_key"]:
                continue  # pragma: no cover
            if field.schema["django_field"] == "django.db.models.fields.DateTimeField":
                continue  # pragma: no cover
            if field.schema["django_field"] == "django.db.models.fields.json.JSONField":
                continue  # pragma: no cover
            if field.skip_default():
                continue

            if field.schema["is_relation"]:
                related_model = field.schema["related_model"]
                verbose_name = schema[related_model]["verbose_name"]
                related_pk = field.schema["related_pk"]
                try:
                    field.value_repr = field.value = names.names[
                        (verbose_name, related_pk, field.value_repr)
                    ]
                except KeyError:  # pragma: no cover
                    pass
                else:
                    field.name = field.schema["field_name"]

            fields.append(field)

        for name, schema in schema[self.table]["fields"].items():
            if schema["gfk_object_id_field"]:
                fields = collect_gfk(fields, name, schema, names)
        self.fields = fields

    @property
    def template_parts(self):
        if not self.fields:
            return
        yield f"{self.variable_name}.refresh_from_db()"
        for field in self.fields:
            yield field.assert_equal_template(self.variable_name)

    @property
    def pytest_template_parts(self):
        if not self.fields:
            return
        yield f"{self.variable_name}.refresh_from_db()"
        for field in self.fields:
            yield field.assert_equal_template_pytest(self.variable_name)


class AssertDelete:
    def __init__(self, model, fields, query=None):
        self.model = model
        self.fields = fields
        self.query = query

    def __repr__(self):
        return dedent(
            f"""\
            AssertDelete(
                "{self.model}",
                {self.fields},
            )"""
        )

    def __eq__(self, other):
        if not isinstance(other, AssertDelete):
            return NotImplemented  # pragma: no cover
        return (self.model, self.fields) == (other.model, other.fields)

    def update_fields(self, names, schema):
        pass

    def grouped_fields(self):
        fields: Dict[str, List[DjangoField]] = {}
        for field in self.fields:
            fields.setdefault(field.name, []).append(field)
        return fields

    @property
    def template_parts(self):
        yield f"self.assertFalse({self.model}.objects.filter("
        for name, fields in self.grouped_fields().items():
            if len(fields) == 1:
                yield f"{name}={fields[0].value_repr},"
            else:
                yield f"{name}__in=("
                for field in fields:
                    yield f"{field.value_repr},"
                yield "),"
        yield ").exists())"

    @property
    def pytest_template_parts(self):
        yield f"assert not {self.model}.objects.filter("
        for name, fields in self.grouped_fields().items():
            if len(fields) == 1:
                yield f"{name}={fields[0].value_repr},"
            else:
                yield f"{name}__in=("
                for field in fields:
                    yield f"{field.value_repr},"
                yield "),"
        yield ").exists()"


class DjangoCreate:
    def __init__(
        self,
        table,
        model,
        primary_key,
        values,
        variable_name,
        import_path=None,
        query=None,
    ):
        self.table = table
        self.model = model
        self.primary_key = primary_key
        self.values = values
        self.import_path = import_path
        self.query = query
        self.variable_name = variable_name

    @classmethod
    def from_raw(cls, table, values, query, schema_data, names):
        module = schema_data[table]["model_module"]
        model = schema_data[table]["model_name"]
        values = tuple(values)
        primary_key = find_pk(values)
        verbose_name = schema_data[table]["verbose_name"]
        variable_name = names.next_variable_name(
            verbose_name, primary_key.name, primary_key.value_repr
        )
        return cls(
            table,
            f"{model}",
            primary_key,
            values,
            variable_name,
            f"from {module} import {model}",
            query,
        )

    def update_fields(self, names, schema):
        fields = self.values
        for name, field_schema in schema[self.table]["fields"].items():
            if field_schema["gfk_object_id_field"]:
                fields = collect_gfk(fields, name, field_schema, names)

        updated_fields = []
        for field in fields:
            if field.schema["primary_key"]:
                continue
            if field.schema["null"] and field.value is None:
                continue
            if is_auto_now(field):
                continue
            if field.skip_default():
                continue
            if field.schema["is_relation"]:
                related_model = field.schema["related_model"]
                if related_model is None:
                    updated_fields.append(field)
                    continue  # Generic Foreign Key
                verbose_name = schema[related_model]["verbose_name"]
                related_pk = field.schema["related_pk"]
                try:
                    field.value_repr = field.value = names.names[
                        (verbose_name, related_pk, field.value_repr)
                    ]
                except KeyError:
                    field.name = field.schema["field_attname"]
            updated_fields.append(field)

        self.values = tuple(updated_fields)

    def __eq__(self, other):
        if not isinstance(other, DjangoCreate):
            return NotImplemented
        return (self.table, self.model, self.values, self.variable_name) == (
            other.table,
            other.model,
            other.values,
            other.variable_name,
        )

    def __repr__(self):
        return dedent(
            f"""\
            DjangoCreate(
                "{self.table}",
                "{self.model}",
                {self.primary_key},
                {self.values},
                "{self.variable_name}",
            )"""
        )

    @property
    def template_parts(self):
        yield f"{self.variable_name}, _created = {self.model}.objects.get_or_create("
        for field in self.values:
            yield f"{field.name}={field.value_repr},"
        defaults = {self.primary_key.name: self.primary_key.raw_value}
        yield f"defaults={defaults},"
        yield ")"


@total_ordering
class DjangoField:
    def __init__(self, name, column_name, value, schema=None):
        self.name = name
        self.column_name = column_name
        self.value_repr = repr(value)
        self.raw_value = value
        self.value = repr(value) if isinstance(value, str) else value
        self.schema = schema

    @classmethod
    def from_column(cls, column, value, table_schema, parser):
        field_schema = table_schema["fields"][column.name]
        name = field_schema["field_name"]
        value = parser.parse_value(value, field_schema)
        return cls(name, column.name, value, field_schema)

    @classmethod
    def from_identifier(cls, identifier, value, table_schema, parser):
        field_schema = table_schema["fields"][identifier.name]
        if isinstance(value, sqlglot.expressions.Null):
            value = None
        elif isinstance(value, sqlglot.expressions.Boolean):
            value = value.this
        elif isinstance(value, sqlglot.expressions.Cast):
            value = value.name
        elif isinstance(value, sqlglot.expressions.Anonymous):
            value = str(value)
        elif value.is_string:
            value = value.name
        else:
            value = literal_eval(value.name)
        value = parser.parse_value(value, field_schema)
        return cls(field_schema["field_name"], identifier.name, value, field_schema)

    @classmethod
    def from_eq(cls, eq, schema_fields, parser):
        name = eq.left.name
        right = eq.right
        if isinstance(right, sqlglot.expressions.Literal):
            value = right.name
            if not right.is_string:
                value = literal_eval(value)
        elif isinstance(right, sqlglot.expressions.Boolean):
            value = right.this
        elif isinstance(right, sqlglot.expressions.Cast) and right.name:
            value = right.name
            # TODO: Do something reasonable with `right.to`
        elif isinstance(right, sqlglot.expressions.Paren):
            raise TooComplicatedError()
        else:
            raise TooComplicatedError()  # pragma: no cover
        field_schema = schema_fields[name]
        value = parser.parse_value(value, field_schema)
        return cls(field_schema["field_name"], name, value, field_schema)

    def __eq__(self, other):
        return (self.name, self.column_name, self.value) == (
            other.name,
            other.column_name,
            other.value,
        )

    def __lt__(self, other) -> bool:
        if self.name == other.name:
            if self.value is None:
                return False
            if other.value is None:
                return True
            return repr(self.value) < repr(other.value)
        return self.name < other.name

    def __repr__(self):
        return f'DjangoField("{self.name}", "{self.column_name}", {self.value_repr})'

    def assert_equal_template(self, variable_name):
        return f"self.assertEqual({variable_name}.{self.name}, {self.value_repr})"

    def assert_equal_template_pytest(self, variable_name):
        return f"assert {variable_name}.{self.name} == {self.value_repr}"

    def skip_default(self):
        if "default" not in self.schema:
            return False

        default_schema = self.schema["default"]
        if repr(default_schema["value"]) == self.value_repr:
            return True

        if "type" not in default_schema:
            return False

        field_type = default_schema["type"]
        value = default_schema["value"]
        if field_type == "Decimal" and self.value == Decimal(value):
            return True
        if field_type == "timedelta" and self.value == timedelta(  # pragma: no branch
            **value
        ):
            return True
        return False


class VariableNames:
    def __init__(self):
        self.counts: Counter = Counter()
        self.names = {}

    def next_variable_name(self, verbose_name, field_name, field_repr):
        full_key = verbose_name, field_name, field_repr
        try:
            return self.names[full_key]
        except KeyError:
            pass

        key = verbose_name, field_name
        self.counts[key] += 1
        suffix = self.counts[key]
        if suffix == 1:
            name = verbose_name
        else:
            name = f"{verbose_name}_{suffix}"
        self.names[full_key] = name
        return name


class SQLParser:
    def __init__(self, config):
        parsers = config.get("test_generation", {}).get("field_parsers", [])
        self.field_parsers = tuple(map(import_string, parsers))
        self.names = VariableNames()

    def parse_value(self, value, column_schema):
        if value is None:
            return None
        django_field = column_schema["django_field"]
        if django_field == "django.db.models.fields.UUIDField":
            uuid_match = UUID_REPR_REGEX.match(str(value))
            if uuid_match:
                value = uuid_match[1]
        elif django_field == "django.db.models.fields.json.JSONField":
            try:
                value = json.loads(value)
            except json.decoder.JSONDecodeError:
                pass
        elif django_field == "django.db.models.fields.DecimalField":
            decimal_match = DECIMAL_REPR_REGEX.match(str(value))
            if decimal_match:
                value = Decimal(decimal_match[1])
        elif django_field == "django.db.models.fields.DurationField":
            if isinstance(value, str):
                timedelta_match = TIMEDELTA_REPR_REGEX.match(value)
                duration_match = TIMEDELTA_STR_REGEX.match(value)
                microseconds_match = TIMEDELTA_MICROSECONDS_REGEX.match(value)
                if timedelta_match:
                    groups = [int(g) if g else 0 for g in timedelta_match.groups()]
                    value = timedelta(
                        days=groups[0], seconds=groups[1], microseconds=groups[2]
                    )
                elif duration_match:
                    groups = duration_match.groups()  # type: ignore
                    value = timedelta(
                        days=int(groups[0]),
                        seconds=int(groups[1]),
                        microseconds=int(groups[2]),
                    )
                elif microseconds_match:  # pragma: no branch
                    value = timedelta(microseconds=int(microseconds_match.group()))
            else:
                value = timedelta(microseconds=value)
        elif django_field == "django.db.models.fields.DateTimeField":
            if isinstance(value, str):
                value = datetime.fromisoformat(value)
            value = datetime.combine(
                value.date(), value.time(), value.tzinfo or timezone.utc
            )
        elif django_field == "django.db.models.fields.DateField":
            if isinstance(value, str):
                value = date.fromisoformat(value)
        else:
            for parser in self.field_parsers:
                value = parser(value, django_field)
        return value

    def build_assert_inserts(
        self, parsed_query, query, table_schema, table_name, seen_mutations
    ):
        sql_schema = parsed_query.find(sqlglot.expressions.Schema)
        if sql_schema is None:
            return  # pragma: no cover
        schema_columns = [
            column
            for (_key, column) in sql_schema.iter_expressions()
            if isinstance(column, sqlglot.expressions.Identifier)
        ]
        returning = parsed_query.find(sqlglot.expressions.Returning)
        values = parsed_query.find(sqlglot.expressions.Values)
        for sql_values_tuple in values.expressions:
            value_columns = [
                column for (_key, column) in sql_values_tuple.iter_expressions()
            ]
            zipped_columns = list(zip(schema_columns, value_columns))
            fields = self.build_insert_assert_fields(zipped_columns, table_schema)
            primary_key = None
            if returning:  # pragma: no branch
                for field, value in zip(returning.expressions, query["query_data"][0]):
                    field_schema = table_schema["fields"][field.name]
                    if field_schema["primary_key"]:  # pragma: no branch
                        primary_key = DjangoField(
                            field.this.name,
                            field.this.name,
                            value,
                            field_schema,
                        )
                        seen_mutations.setdefault(table_name, set()).add(repr(value))
            if primary_key is None:  # pragma: no cover
                continue
            yield AssertInsert.from_raw(
                fields, query, table_schema, table_name, self.names, primary_key
            )

    def build_insert_assert_fields(self, columns, table_schema):
        fields = []
        for identifier, value in columns:
            field = DjangoField.from_identifier(identifier, value, table_schema, self)
            fields.append(field)
        return fields

    def build_update_assert_fields(self, columns, schema_fields):
        fields = []
        for eq in columns:
            if not isinstance(eq, sqlglot.expressions.EQ):
                continue
            try:
                field = DjangoField.from_eq(eq, schema_fields, self)
            except TooComplicatedError:
                continue
            fields.append(field)
        return fields

    def build_delete_fields(self, exp, table_schema):
        if isinstance(exp, sqlglot.expressions.In):
            for literal in exp.expressions:
                yield DjangoField.from_identifier(exp.this, literal, table_schema, self)

        elif isinstance(exp, sqlglot.expressions.EQ):  # pragma: no branch
            literal = exp.expression
            yield DjangoField.from_identifier(exp.this, literal, table_schema, self)

    def build_delete_lookup_fields(self, where, table_schema):
        if isinstance(where.this, sqlglot.expressions.Paren):
            if isinstance(where.this.this, sqlglot.expressions.Or):
                left = where.this.this.left
                right = where.this.this.right
                yield list(self.build_delete_fields(left, table_schema))
                yield list(self.build_delete_fields(right, table_schema))
            elif isinstance(  # pragma: no branch
                where.this.this, sqlglot.expressions.And
            ):
                left = where.this.this.left
                right = where.this.this.right
                left_fields = self.build_delete_fields(left, table_schema)
                right_fields = self.build_delete_fields(right, table_schema)
                for fields in product(left_fields, right_fields):
                    yield list(fields)

        else:
            yield list(self.build_delete_fields(where.this, table_schema))

    def parse_columns(self, columns, row, schema_data):
        columns_by_table: Dict[str, List[DjangoField]] = {}
        for column, value in zip(columns, row):
            if not isinstance(column, sqlglot.exp.Column):
                continue

            table_schema = schema_data[column.table]
            field = DjangoField.from_column(column, value, table_schema, self)
            columns_by_table.setdefault(column.table, []).append(field)
        return columns_by_table

    def parse_sql_queries(self, sql_queries, schema_data):
        # each select needs to become an insert
        inserts = []
        imports = set()
        asserts: List[AnyAssert] = []
        seen_mutations: Dict[str, Set[str]] = {}
        for query in sql_queries:
            if query["query_data"] is None or query["query"] is None:
                continue

            database = query["database"]
            database = DATABASES.get(database, database)
            try:
                parsed_query = sqlglot.parse_one(query["query"], read=database)
            except sqlglot.errors.ParseError as e:  # pragma: no cover
                print("# Error parsing query:")
                print(f'# {query["query"]}')
                print(f"# {e.errors}")
                continue

            if isinstance(parsed_query, sqlglot.exp.Select):
                columns = [column for (_key, column) in parsed_query.iter_expressions()]
                for batch in query["query_data"]:
                    # Skip queries with no columns, eg .count(), .exists()
                    if not any(
                        isinstance(column, sqlglot.exp.Column) for column in columns
                    ):
                        continue
                    for row in batch:
                        columns_by_table = self.parse_columns(columns, row, schema_data)

                        for table, row in columns_by_table.items():
                            pk = find_pk(row)
                            if pk is None:
                                continue
                            elif pk.value_repr in seen_mutations.setdefault(
                                table, set()
                            ):
                                continue
                            else:
                                create = DjangoCreate.from_raw(
                                    table, row, query, schema_data, self.names
                                )
                                if create.primary_key.raw_value is None:
                                    continue
                                inserts.append(create)
                                imports.add(create.import_path)
            else:
                _table = parsed_query.find(sqlglot.exp.Table)
                if _table is None:
                    continue  # pragma: no cover
                table_name = _table.name
                table_schema = schema_data[table_name]
                columns = [column for (_key, column) in parsed_query.iter_expressions()]
                if isinstance(parsed_query, sqlglot.expressions.Update):
                    where = parsed_query.find(sqlglot.expressions.Where)
                    if where is None:
                        continue  # pragma: no cover

                    fields = self.build_update_assert_fields(
                        columns, table_schema["fields"]
                    )

                    if isinstance(where.this, sqlglot.expressions.In):
                        lookups = []
                        lookup_name = where.this.this.name
                        for literal in where.this.expressions:
                            lookups.append((lookup_name, literal.name))
                    elif isinstance(where.this, sqlglot.expressions.Paren):
                        continue
                    else:
                        lookup_name = where.this.left.name
                        lookup_value = where.this.right.name
                        lookups = [(lookup_name, lookup_value)]

                    verbose_name = table_schema["verbose_name"]
                    for lookup_name, lookup_value in lookups:
                        variable_name = self.names.next_variable_name(
                            verbose_name, lookup_name, lookup_value
                        )
                        assert_update = AssertUpdate(
                            variable_name,
                            table_schema["model_name"],
                            table_name,
                            fields,
                            query,
                        )
                        asserts.append(assert_update)
                        if table_schema["fields"][lookup_name][  # pragma: no branch
                            "primary_key"
                        ]:
                            seen_mutations.setdefault(table_name, set()).add(
                                lookup_value
                            )
                elif isinstance(parsed_query, sqlglot.expressions.Delete):
                    where = parsed_query.find(sqlglot.expressions.Where)
                    if where is None:
                        continue  # pragma: no cover

                    model = table_schema["model_name"]
                    module = table_schema["model_module"]
                    for fields in self.build_delete_lookup_fields(where, table_schema):
                        assert_delete = AssertDelete(model, fields, query)
                        asserts.append(assert_delete)
                    import_path = f"from {module} import {model}"
                    imports.add(import_path)
                elif isinstance(  # pragma: no branch
                    parsed_query, sqlglot.expressions.Insert
                ):
                    for assert_insert in self.build_assert_inserts(
                        parsed_query,
                        query,
                        table_schema,
                        table_name,
                        seen_mutations,
                    ):
                        asserts.append(assert_insert)
                        imports.add(assert_insert.import_path)

        deduplicated = unique_everseen(inserts)
        sql_fixtures = sorted_inserts(deduplicated, schema_data)
        for create in sql_fixtures:
            create.update_fields(self.names, schema_data)
        asserts = merge_asserts(asserts)
        for assert_ in asserts:
            assert_.update_fields(self.names, schema_data)
        return sql_fixtures, imports, asserts


def collect_gfk(fields, name, schema, names):
    try:
        from django.contrib.contenttypes.models import ContentType
    except ImportError:  # pragma: no cover
        return fields

    content_type_field = None
    object_id_field = None

    for field in fields:
        if field.schema["field_name"] == schema["gfk_content_type_field"]:
            content_type_field = field
        elif field.schema["field_name"] == schema["gfk_object_id_field"]:
            object_id_field = field

    if content_type_field is None or object_id_field is None:
        return fields  # pragma: no cover

    try:
        content_type = ContentType.objects.get(pk=content_type_field.raw_value)
    except ContentType.DoesNotExist:  # pragma: no cover
        return fields

    model = content_type.model_class()
    value = names.next_variable_name(
        verbose_name(model),
        model._meta.pk.attname,  # type: ignore
        object_id_field.raw_value,
    )
    gfk_field = DjangoField(
        name=name,
        column_name=name,
        value=value,
        schema=schema,
    )
    gfk_field.value_repr = gfk_field.value = value
    collected = []
    for field in fields:
        if field == content_type_field or field == object_id_field:
            continue
        collected.append(field)
    collected.append(gfk_field)
    return collected


def find_pk(fields):
    for field in fields:
        if field.schema["primary_key"]:
            return field
    return None  # pragma: no cover


def sorted_inserts(deduplicated, schema_data):
    objects = {
        (obj.table, obj.primary_key.column_name, obj.primary_key.raw_value): obj
        for obj in deduplicated
    }
    graph = []
    for obj in objects.values():
        schema = schema_data[obj.table]["fields"]
        keys = (
            (
                schema[field.column_name]["related_model"],
                schema[field.column_name]["related_pk"],
                field.raw_value,
            )
            for field in obj.values
            if schema[field.column_name]["is_relation"]
        )
        graph.append((obj, [objects[key] for key in keys if key in objects]))

    sorter = TopologicalSorter(graph)
    return list(sorter.static_order())


AnyAssert = Union[AssertDelete, AssertInsert, AssertUpdate]


def merge_asserts(asserts):
    lookup: Dict[str, AnyAssert] = {}
    merged: List[AnyAssert] = []
    for _assert in asserts:
        if isinstance(_assert, AssertInsert):
            lookup[_assert.variable_name] = _assert
            merged.append(_assert)
        elif isinstance(_assert, AssertUpdate):
            if _assert.variable_name not in lookup:
                lookup[_assert.variable_name] = _assert
                merged.append(_assert)
                continue
            insert = lookup[_assert.variable_name]
            insert.fields = merge_fields(insert, _assert)
        else:
            merged.append(_assert)

    return tidy_recreates(tidy_deletes(merged))


def tidy_deletes(asserts):
    lookup: Dict[str, List[List[DjangoField]]] = {}
    tidied: List[AnyAssert] = []
    for _assert in reversed(asserts):
        if isinstance(_assert, AssertDelete):
            lookup.setdefault(_assert.model, []).append(_assert.grouped_fields())
            tidied.append(_assert)
        else:
            if _assert.model not in lookup:
                tidied.append(_assert)
                continue

            if any(
                would_be_deleted(_assert, delete_fields)
                for delete_fields in lookup[_assert.model]
            ):
                continue
            tidied.append(_assert)

    return list(reversed(tidied))


def tidy_recreates(asserts):
    lookup: Dict[str, List[List[DjangoField]]] = {}
    tidied: List[AnyAssert] = []
    for _assert in reversed(asserts):
        if isinstance(_assert, AssertUpdate):
            tidied.append(_assert)
        elif isinstance(_assert, AssertInsert):
            lookup.setdefault(_assert.model, []).append(_assert.fields)
            tidied.append(_assert)
        else:
            if _assert.model not in lookup:
                tidied.append(_assert)
                continue

            if any(
                would_be_recreated(_assert, create_fields)
                for create_fields in lookup[_assert.model]
            ):
                continue
            tidied.append(_assert)

    return list(reversed(tidied))


def would_be_deleted(_assert, delete_fields):
    if not any(field.name in delete_fields for field in _assert.fields):
        return False
    for field in _assert.fields:
        if field.name not in delete_fields:
            continue
        if field not in delete_fields[field.name]:
            return False
    return True


def would_be_recreated(delete, create_fields):
    reduced_delete_fields = []
    for delete_field in delete.fields:
        if any(delete_field == field for field in create_fields):
            continue
        reduced_delete_fields.append(delete_field)
    if not reduced_delete_fields:
        return True
    delete.fields = reduced_delete_fields
    return False


def merge_fields(insert, update):
    names = {f.name for f in update.fields}
    fields = []
    for field in insert.fields:
        if field.name in names:
            continue
        fields.append(field)
    fields.extend(update.fields)
    return fields
