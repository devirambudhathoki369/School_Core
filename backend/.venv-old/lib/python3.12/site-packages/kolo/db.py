from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Tuple

from .config import create_kolo_directory
from .serialize import load_msgpack

logger = logging.getLogger("kolo")


class SchemaNotFoundError(Exception):
    pass


class TraceNotFoundError(Exception):
    pass


@contextmanager
def db_connection(db_path, timeout=60):
    """
    Wrap sqlite's connection for use as a context manager

    Commits all changes if no exception is raised.
    Always closes the connection after the context manager exits.
    """
    connection = sqlite3.connect(str(db_path), isolation_level=None, timeout=timeout)
    try:
        connection.execute("pragma journal_mode=wal")
    finally:
        connection.close()

    connection = sqlite3.connect(str(db_path), isolation_level=None, timeout=timeout)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def get_db_path() -> Path:
    return create_kolo_directory() / "db.sqlite3"


def create_traces_table(connection) -> None:
    create_table_query = """
    CREATE TABLE IF NOT EXISTS traces (
        id text PRIMARY KEY NOT NULL,
        created_at TEXT DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')) NOT NULL,
        data text NULL,
        msgpack blob NULL
    );
    """
    create_timestamp_index_query = """
        CREATE INDEX IF NOT EXISTS
        idx_traces_created_at
        ON traces (created_at);
        """
    invocations_exists_query = """
    SELECT EXISTS(
        SELECT 1 FROM sqlite_master
        WHERE type="table" AND name="invocations"
    );
    """
    copy_invocations_query = """
    INSERT OR IGNORE INTO traces (id, created_at, data, msgpack)
        SELECT id, created_at, data, NULL FROM invocations;
    """
    drop_invocations_query = "DROP TABLE invocations;"

    connection.execute(create_table_query)
    connection.execute(create_timestamp_index_query)
    cursor = connection.execute(invocations_exists_query)
    if cursor.fetchone()[0]:
        connection.execute(copy_invocations_query)
        connection.execute(drop_invocations_query)


def setup_db() -> Path:
    db_path = get_db_path()

    with db_connection(db_path) as connection:
        create_traces_table(connection)

    return db_path


def save_trace_in_sqlite(
    db_path: Path,
    trace_id: str,
    json_string: str | None = None,
    msgpack: bytes | None = None,
    *,
    ignore_errors: bool = True,
    created_at: datetime | None = None,
    timeout=60,
) -> None:
    ignore = " OR IGNORE" if ignore_errors else ""
    _columns = ["id", "data", "msgpack"]
    values: list[object] = [trace_id, json_string, msgpack]
    if created_at is not None:
        _columns.append("created_at")
        values.append(created_at)
    columns = ", ".join(_columns)
    params = ",".join(["?" for _ in _columns])

    insert_sql = f"INSERT{ignore} INTO traces({columns}) VALUES({params})"

    # We can't reuse a connection
    # because we're in a new thread
    with db_connection(db_path, timeout) as connection:
        try:
            connection.execute(insert_sql, values)
        except (sqlite3.DataError, sqlite3.InterfaceError):
            # DataError on python 3.11+
            # InterfaceError on python 3.10-
            logger.exception("The generated trace was too big to store in sqlite.")


def load_trace(msgpack_data: bytes | None, json_data: str | None):
    if msgpack_data is None:
        assert json_data is not None
        return json.loads(json_data)
    return load_msgpack(msgpack_data)


def load_trace_from_db(db_path: Path, trace_id: str) -> Tuple[bytes | None, str | None]:
    fetch_sql = "SELECT msgpack, data FROM traces WHERE id = ?"

    with db_connection(db_path) as connection:
        cursor = connection.execute(fetch_sql, (trace_id,))
        row = cursor.fetchone()
    if row is None:
        raise TraceNotFoundError(trace_id)
    return row


def list_traces_from_db(db_path: Path, count=500, reverse=False):
    list_sql = """
    SELECT id, created_at, COALESCE(LENGTH(msgpack), LENGTH(CAST(data AS BLOB)))
    FROM traces ORDER BY id DESC LIMIT ?
    """

    with db_connection(db_path) as connection:
        cursor = connection.execute(list_sql, [count])
        rows = cursor.fetchall()
    if reverse:
        return reversed(rows)
    return rows


def delete_traces_by_id(db_path: Path, trace_ids: Tuple[str, ...]):
    params = ", ".join("?" * len(trace_ids))
    delete_sql = f"DELETE FROM traces WHERE id in ({params})"

    with db_connection(db_path) as connection:
        connection.execute(delete_sql, trace_ids)


def delete_traces_before(db_path: Path, before: datetime):
    delete_sql = "DELETE FROM traces WHERE (created_at < ?)"

    with db_connection(db_path) as connection:
        connection.execute(delete_sql, (before,))
        cursor = connection.execute("SELECT changes()")
        deleted_count = cursor.fetchone()[0]
    return deleted_count


def vacuum_db(db_path):
    with db_connection(db_path) as connection:
        connection.execute("VACUUM")


def create_schema_table(connection) -> None:
    create_table_query = """
    CREATE TABLE IF NOT EXISTS schemas (
        id integer PRIMARY KEY,
        created_at TEXT DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')) NOT NULL,
        git_commit TEXT NULL,
        data text NOT NULL
    );
    """

    connection.execute(create_table_query)


def save_schema(connection, schema, commit_sha) -> None:
    insert_sql = 'INSERT INTO schemas("data", "git_commit") VALUES(?, ?)'
    connection.execute(insert_sql, (json.dumps(schema), commit_sha))


def load_schema(db_path: Path) -> Tuple[Dict[str, Any], str]:
    load_sql = """SELECT data, git_commit FROM schemas
        ORDER BY created_at DESC LIMIT 1"""

    with db_connection(db_path) as connection:
        cursor = connection.execute(load_sql)
        data, commit = cursor.fetchone()

    data = json.loads(data)
    return data, commit


def load_schema_for_commit_sha(
    db_path: Path, commit_sha: str
) -> Tuple[Dict[str, Any], str]:
    load_sql = """SELECT data FROM schemas WHERE git_commit = ?
        ORDER BY created_at DESC LIMIT 1"""

    with db_connection(db_path) as connection:
        try:
            cursor = connection.execute(load_sql, [commit_sha])
        except sqlite3.OperationalError:
            row = None
        else:
            row = cursor.fetchone()

    if not row:
        raise SchemaNotFoundError(commit_sha)

    return json.loads(row[0])
