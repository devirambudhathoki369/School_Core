from __future__ import annotations

import platform
from datetime import datetime, timezone

from jinja2 import ChoiceLoader, Environment, FileSystemLoader, PackageLoader

from ..config import load_config
from ..db import load_trace, load_trace_from_db, setup_db
from ..version import __version__
from .processors import load_processors, run_processors


class KoloPackageLoader(PackageLoader):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        # Work around UNC path mishandling:
        # https://github.com/pallets/jinja/issues/1675
        if platform.system() == "Windows":
            unc_prefix = "\\\\?\\"
            if self._template_root.startswith(unc_prefix):  # pragma: no cover
                self._template_root = self._template_root[len(unc_prefix) :]


env = Environment(
    loader=ChoiceLoader(
        (
            FileSystemLoader(""),
            KoloPackageLoader("kolo"),
        )
    )
)


def maybe_black(rendered):
    try:
        from black import format_file_contents
        from black.mode import Mode
        from black.parsing import InvalidInput
        from black.report import NothingChanged
    except ImportError:  # pragma: no cover
        return rendered

    try:
        return format_file_contents(
            rendered, fast=True, mode=Mode(magic_trailing_comma=False)
        )
    except (InvalidInput, NothingChanged):  # pragma: no cover
        return rendered


def generate_from_trace_id(
    trace_id: str,
    test_class: str,
    test_name: str,
    template_name: str = "",
    config=None,
    include_generation_timestamp=True,
) -> str:
    if config is None:
        config = load_config()
    db_path = setup_db()
    msgpack_data, json_data = load_trace_from_db(db_path, trace_id)
    trace = load_trace(msgpack_data, json_data)

    processors = load_processors(config)

    context = {
        "_config": config,
        "_db_path": db_path,
        "_frames": trace["frames_of_interest"],
        "_trace": trace,
        "base_test_case": "TestCase",
        "kolo_version": __version__,
        "now": datetime.now(timezone.utc) if include_generation_timestamp else None,
        "test_class": test_class,
        "test_name": test_name,
        "trace_id": trace_id,
    }
    run_processors(processors, context)

    if not template_name:
        template_name = "django_request_test.py.j2"
    template = env.get_template(template_name)
    rendered = template.render(**context)
    return maybe_black(rendered)
