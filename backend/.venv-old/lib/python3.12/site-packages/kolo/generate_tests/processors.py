from datetime import datetime
from itertools import chain
from typing import List

import click

from ..db import SchemaNotFoundError, load_schema_for_commit_sha
from ..django_schema import get_schema
from ..git import COMMIT_SHA
from .factories import build_factories, import_factories
from .loaders import import_string
from .outbound import parse_outbound_frames
from .queries import DjangoCreate, SQLParser
from .request import (
    build_test_client_call,
    get_query_params,
    get_request_body,
    get_request_headers,
    parse_request_frames,
)

SCHEMA_NOT_FOUND_WARNING = """\
Warning: Could not find a Django schema for commit: {0}.

Falling back to the current commit's schema.

For more reliable results, run `kolo store-django-model-schema` from {0}
then retry this command.
"""


def process_django_schema(context):
    commit_sha = context["_trace"]["current_commit_sha"]
    db_path = context["_db_path"]
    if commit_sha == COMMIT_SHA:
        schema_data = get_schema()  # pragma: no cover
    else:
        try:
            schema_data = load_schema_for_commit_sha(db_path, commit_sha)
        except SchemaNotFoundError:
            click.echo(SCHEMA_NOT_FOUND_WARNING.format(commit_sha), err=True)
            schema_data = get_schema()
    return {"schema_data": schema_data}


def reused_fixture(new_fixture, fixtures):
    for fixture in fixtures:
        if (
            fixture.table == new_fixture.table
            and fixture.model == new_fixture.model
            and fixture.primary_key == new_fixture.primary_key
        ):
            return True
    return False


def process_sql_queries(context):
    schema_data = context["schema_data"]
    parser = SQLParser(context["_config"])

    all_imports = set()
    all_fixtures: List[DjangoCreate] = []
    for section in context["sections"]:
        frames = section["frames"]
        sql_queries = [frame for frame in frames if frame["type"] == "end_sql_query"]
        sql_fixtures, imports, asserts = parser.parse_sql_queries(
            sql_queries, schema_data
        )
        sql_fixtures = [f for f in sql_fixtures if not reused_fixture(f, all_fixtures)]
        all_fixtures.extend(sql_fixtures)
        section["asserts"] = asserts
        section["sql_fixtures"] = sql_fixtures
        all_imports.update(imports)
    context["imports"] = sorted(all_imports)


def process_factories(context):
    imports = set(context.get("imports", []))
    for section in context["sections"]:
        sql_fixtures = section.get("sql_fixtures", [])
        factory_configs = import_factories(context["_config"])
        factories, factory_imports = build_factories(sql_fixtures, factory_configs)
        imports.update(factory_imports)
        section["sql_fixtures"] = factories
    context["imports"] = sorted(imports)


def process_django_request(context):
    frames = context["_frames"]
    served_request_frames = parse_request_frames(frames)

    sections = []
    if not served_request_frames:
        sections.append({"frames": frames})

    for served in served_request_frames:
        request = served["request"]
        response = served["response"]
        request_headers = get_request_headers(request)
        prettified_request_body = get_request_body(request, request_headers)
        query_params = get_query_params(request)
        request_timestamp = datetime.utcfromtimestamp(request["timestamp"]).isoformat(
            timespec="seconds"
        )
        template_names = served["templates"]

        test_client_call = build_test_client_call(
            request,
            query_params,
            prettified_request_body,
            request_headers,
            pytest=False,
        )
        test_client_call_pytest = build_test_client_call(
            request, query_params, prettified_request_body, request_headers, pytest=True
        )

        sections.append(
            {
                "request": request,
                "request_timestamp": request_timestamp,
                "response": response,
                "template_names": template_names,
                "test_client_call": test_client_call,
                "test_client_call_pytest": test_client_call_pytest,
                "frames": served["frames"],
            }
        )

    return {"sections": sections}


def process_outbound_requests(context):
    for section in context["sections"]:
        frames = section["frames"]
        outbound_request_frames = parse_outbound_frames(frames)
        section["outbound_request_frames"] = outbound_request_frames


def process_django_version(context):
    try:
        from django import __version__ as django_version
    except ImportError:  # pragma: no cover
        django_version = ""
    return {"django_version": django_version}


def process_time_travel(context):
    """Choose time_machine unless only freezegun is installed"""
    try:
        import time_machine
    except ImportError:
        try:
            import freezegun
        except ImportError:  # pragma: no cover
            pass
        else:
            return {
                "time_travel_import": "import freezegun",
                "time_travel_call": "freezegun.freeze_time",
                "time_travel_tick": ", tick=True",
            }
    return {
        "time_travel_import": "import time_machine",
        "time_travel_call": "time_machine.travel",
        "time_travel_tick": "",
    }


def load_processors(config):
    default_processors = (
        process_django_version,
        process_django_schema,
        process_django_request,
        process_outbound_requests,
        process_sql_queries,
        process_factories,
        process_time_travel,
    )
    custom_processors = config.get("test_generation", {}).get("trace_processors", [])
    custom_processors = map(import_string, custom_processors)
    return tuple(chain(default_processors, custom_processors))


def run_processors(processors, context):
    for processor in processors:
        processor_output = processor(context)
        if processor_output:
            context.update(processor_output)
