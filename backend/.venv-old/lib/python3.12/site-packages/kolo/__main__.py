from __future__ import annotations

import gzip
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta
from runpy import run_module, run_path

import click
import httpx
import msgpack

from . import django_schema
from .config import load_config
from .db import (
    TraceNotFoundError,
    create_schema_table,
    db_connection,
    delete_traces_before,
    delete_traces_by_id,
    list_traces_from_db,
    load_trace_from_db,
    save_schema,
    save_trace_in_sqlite,
    setup_db,
    vacuum_db,
)
from .profiler import KoloProfiler
from .serialize import monkeypatch_queryset_repr
from .utils import pretty_byte_size

DATETIME_FORMATS = click.DateTime(
    (
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S.%f",
    )
)


DJANGO_SETTINGS_ERROR = """Django settings not found.
Use `--settings` or set the `DJANGO_SETTINGS_MODULE` environment variable."""

TRACE_NOT_FOUND_ERROR = "Could not find trace_id: `{trace_id}`"

TEST_GENERATION_ERROR = """\
Test generation dependencies are not installed.

Run `pip install 'kolo[test_generation]'` to install them.
"""


def get_profiler(one_trace_per_test) -> KoloProfiler:
    config = load_config()
    db_path = setup_db()
    return KoloProfiler(
        db_path, config=config, one_trace_per_test=one_trace_per_test, source="kolo run"
    )


def profile_module(profiler: KoloProfiler, module_name: str):
    monkeypatch_queryset_repr()
    with profiler:
        run_module(module_name, run_name="__main__", alter_sys=True)


def profile_path(profiler: KoloProfiler, path: str):
    monkeypatch_queryset_repr()
    with profiler:
        run_path(path, run_name="__main__")


@click.group()
def cli():
    # Ensure the current working directory is on the path.
    # Important when running the `kolo` script installed by setuptools.
    # Not really necessary when using `python -m kolo`, but doesn't hurt.
    # Note, we use 1, not 0: https://stackoverflow.com/q/10095037
    # This probably doesn't matter for our use case, but it doesn't hurt.
    sys.path.insert(1, ".")


def python_noop_profiler(frame, event, arg):  # pragma: no cover
    pass


@cli.command(context_settings={"ignore_unknown_options": True})
@click.argument("path")
@click.argument("args", nargs=-1, type=click.UNPROCESSED)
@click.option(
    "--one-trace-per-test",
    default=False,
    is_flag=True,
    help="Generate a trace for each test traced by Kolo.",
)
@click.option("--noop", default=False, is_flag=True, hidden=True)
def run(path, args, one_trace_per_test, noop):
    """
    Profile Python code using Kolo.

    PATH is the path to the python file or module being profiled.
    """
    if path == "python":
        path, *args = args
        if path == "-m":
            path, *args = args
            module = True
        else:
            module = False
    elif path.endswith(".py"):
        module = False
    else:
        module = True

    # Monkeypatch sys.argv, so the profiled code doesn't get confused
    # Without this, the profiled code would see extra args it doesn't
    # know how to handle.
    sys.argv = [path, *args]

    if noop:  # pragma: no cover
        config = load_config()
        if config.get("use_rust", True):
            from ._kolo import register_noop_profiler

            register_noop_profiler()
        else:
            sys.setprofile(python_noop_profiler)

        try:
            if module:
                run_module(path, run_name="__main__", alter_sys=True)
            else:
                run_path(path, run_name="__main__")
        finally:
            sys.setprofile(None)
        return

    profiler = get_profiler(one_trace_per_test)
    try:
        if module:
            profile_module(profiler, path)
        else:
            profile_path(profiler, path)
    finally:
        if not one_trace_per_test:  # pragma: no branch
            profiler.save_request_in_db()


@cli.group()
def trace():
    """
    Subcommands for working with Kolo traces.
    """


@trace.command()
@click.argument("path")
@click.option(
    "--created-at",
    help="Mark this trace as created at this time.",
    type=DATETIME_FORMATS,
)
def load(path, created_at):
    """
    Load a trace from a file into the Kolo database.
    """
    db_path = setup_db()

    try:
        with open(path, "rb") as dump:
            raw_data = dump.read()
    except FileNotFoundError:
        raise click.ClickException(f'File "{path}" not found')

    json_string: str | None = None
    msgpack_bytes: bytes | None = None

    try:
        data = msgpack.unpackb(raw_data)
    except Exception:
        try:
            json_string = raw_data.decode("utf-8")
        except UnicodeDecodeError:
            raise click.ClickException("Trace file is not valid msgpack or json")

        try:
            data = json.loads(json_string)
        except json.JSONDecodeError:
            raise click.ClickException("Trace file is not valid msgpack or json")

        msgpack_bytes = None
    else:
        msgpack_bytes = raw_data

    try:
        trace_id = data["trace_id"]
    except KeyError:
        raise click.ClickException("Trace file is missing the `trace_id`")

    try:
        save_trace_in_sqlite(
            db_path,
            trace_id,
            json_string=json_string,
            msgpack=msgpack_bytes,
            ignore_errors=False,
            created_at=created_at,
        )
    except sqlite3.IntegrityError:
        raise click.ClickException(f"Trace ID `{trace_id}` already exists")

    click.echo(f"Loaded trace {trace_id}")


@trace.command()
@click.argument("trace_id")
@click.option("--file", help="The name of the file to save the trace to.")
def dump(trace_id, file):
    """
    Dump a trace from the Kolo database to stdout or a specified file.
    """
    db_path = setup_db()

    try:
        msgpack_data, json_data = load_trace_from_db(db_path, trace_id)
    except TraceNotFoundError:
        raise click.ClickException(TRACE_NOT_FOUND_ERROR.format(trace_id=trace_id))

    if file:
        if msgpack_data is None:
            assert json_data is not None
            with open(file, "w") as f:
                f.write(json_data)
        else:
            with open(file, "wb") as f:
                f.write(msgpack_data)

    else:
        if msgpack_data is None:
            click.echo(json_data)
        else:
            click.echo(msgpack_data, nl=False)


@trace.command()
@click.option("--count", help="The number of rows to show.", default=500)
@click.option(
    "--reverse",
    help="Reverse the order of the rows: newest at the bottom.",
    default=False,
    is_flag=True,
)
def list(count, reverse):
    """
    List of recent traces stored by Kolo.
    """
    db_path = setup_db()

    traces = list_traces_from_db(db_path, count=count, reverse=reverse)

    if not traces:
        click.echo("No traces found")
        return

    for trace, timestamp, size in traces:
        size = pretty_byte_size(size)
        click.echo(f"{trace} at {timestamp} ({size})")


@trace.command()
@click.argument("trace_ids", required=False, nargs=-1)
@click.option("--old", is_flag=True, default=False, help="Delete old traces.")
@click.option(
    "--before",
    help="Delete traces older than this datetime. Must be used with `--old`.",
    type=DATETIME_FORMATS,
)
@click.option(
    "--vacuum",
    help="Recover disk space from the Kolo database.",
    default=False,
    is_flag=True,
)
def delete(trace_ids, old, before, vacuum):
    """
    Delete one or more traces stored by Kolo.
    """

    if before is not None and old is False:
        raise click.ClickException("--before requires --old")

    if old is False and not trace_ids and vacuum is False:
        raise click.ClickException("Must specify either TRACE_IDS, --old, or --vacuum")

    if trace_ids and old:
        raise click.ClickException("Cannot specify TRACE_IDS and --old together")

    db_path = setup_db()

    if trace_ids:
        delete_traces_by_id(db_path, trace_ids)
    elif old:
        if before is None:
            before = datetime.now() - timedelta(days=30)

        deleted_count = delete_traces_before(db_path, before)
        click.echo(f"Deleted {deleted_count} old traces created before {before}.")

    if vacuum:
        vacuum_db(db_path)


def manage_py_settings():
    import ast

    try:
        with open("manage.py") as f:
            data = f.read()
    except OSError:  # pragma: no cover
        return None
    source = ast.parse(data, "manage.py")
    for node in ast.walk(source):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "setdefault"
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == "DJANGO_SETTINGS_MODULE"
            and isinstance(node.args[1], ast.Constant)
        ):
            return node.args[1].value  # pragma: no cover
    return None


def load_django(settings):
    import django

    if settings:
        os.environ["DJANGO_SETTINGS_MODULE"] = settings
    elif os.environ.get("DJANGO_SETTINGS_MODULE"):
        pass
    else:
        settings = manage_py_settings()
        if settings:
            os.environ["DJANGO_SETTINGS_MODULE"] = settings  # pragma: no cover
        else:
            raise click.ClickException(DJANGO_SETTINGS_ERROR)

    django.setup()


@cli.command()
@click.argument("trace_id")
@click.option(
    "--test-name", default="test_my_view", help="The name of the generated test."
)
@click.option(
    "--test-class",
    default="MyTestCase",
    help="The name of the generated TestCase class.",
)
@click.option(
    "--file",
    type=click.File("w"),
    help="Write the generated test to this file.",
)
@click.option(
    "--settings", default="", help="The dotted path to a Django settings module."
)
@click.option(
    "--template", default="", help="The path to a custom test generation template."
)
def generate_test(trace_id, test_name, test_class, file, settings, template):
    """Generate a test from a Kolo trace."""
    import logging

    logging.disable()

    try:
        try:
            from .generate_tests import generate_from_trace_id
        except ModuleNotFoundError:  # pragma: no cover
            raise click.ClickException(TEST_GENERATION_ERROR)

        load_django(settings)

        try:
            test_code = generate_from_trace_id(
                trace_id, test_class, test_name, template
            )
        except TraceNotFoundError as e:
            raise click.ClickException(TRACE_NOT_FOUND_ERROR.format(trace_id=e.args[0]))

        if file:
            file.write(test_code)
        else:
            click.echo(test_code)
    finally:
        logging.disable(logging.NOTSET)


@cli.command()
@click.option(
    "--settings", default="", help="The dotted path to a Django settings module."
)
def store_django_model_schema(settings):
    """Store Django model info for test generation."""
    from .git import COMMIT_SHA

    load_django(settings)

    schema = django_schema.get_schema()

    db_path = setup_db()
    with db_connection(db_path) as connection:
        create_schema_table(connection)
        save_schema(connection, schema, COMMIT_SHA)


@cli.command()
def dbshell():  # pragma: no cover
    """
    Open a sqlite3 shell to the Kolo database.
    """
    db_path = setup_db()
    subprocess.run(["sqlite3", db_path], check=True)


@trace.command()
@click.argument("trace_id")
def upload(trace_id):
    """
    Upload a trace to the Kolo dashboard
    """
    db_path = setup_db()

    try:
        msgpack_data, json_data = load_trace_from_db(db_path, trace_id)
    except TraceNotFoundError:
        raise click.ClickException(TRACE_NOT_FOUND_ERROR.format(trace_id=trace_id))

    base_url = os.environ.get("KOLO_BASE_URL", "https://my.kolo.app")
    url = f"{base_url}/api/traces/"
    if msgpack_data is None:
        assert json_data is not None
        payload = gzip.compress(json_data.encode("utf-8"))
    else:
        payload = gzip.compress(msgpack_data)
    response = httpx.post(url, files={"data": payload})
    if response.status_code == 201:
        click.echo(f"{trace_id} uploaded successfully!")
    else:
        errors = response.json()
        raise click.ClickException(errors)


@trace.command()
@click.argument("trace_id")
def download(trace_id):
    """
    Download a trace from the Kolo dashboard
    """
    db_path = setup_db()

    base_url = os.environ.get("KOLO_BASE_URL", "https://my.kolo.app")
    url = f"{base_url}/api/traces/{trace_id}/"
    response = httpx.get(url)

    if response.status_code == 404:
        raise click.ClickException(f"`{trace_id}` was not found by the server.")
    elif response.status_code != 200:
        raise click.ClickException(f"Unexpected status code: {response.status_code}.")

    try:
        raw_data = gzip.decompress(response.content)
    except gzip.BadGzipFile:
        raise click.ClickException("Downloaded trace was not gzipped.")

    try:
        msgpack.unpackb(raw_data, strict_map_key=False)
    except Exception:
        raise click.ClickException("Downloaded trace was not valid msgpack.")

    try:
        save_trace_in_sqlite(
            db_path,
            trace_id,
            msgpack=raw_data,
            ignore_errors=False,
        )
    except sqlite3.IntegrityError:
        raise click.ClickException(f"`{trace_id}` already exists.")

    click.echo(f"`{trace_id}` downloaded successfully!")


if __name__ == "__main__":
    cli()  # pragma: no cover
