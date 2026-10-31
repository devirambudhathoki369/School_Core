"""
Read-only health check of the normalized schema. Run it before and after migrating.

Before 0110 and 0111 it shows which rules the data would break, so a clean-up can
come first. After them it shows any rule that was skipped, any key left unvalidated,
and any JSON row whose real rows differ. Exit code 1 when anything is found.

    python manage.py normalization_audit
"""

from importlib import import_module

from django.core.management.base import BaseCommand
from django.db import connection

# (what is compared, rows whose JSON amounts differ from their lines by more than a paisa)
RECONCILE = [
    (
        "main_studentledger",
        """SELECT count(*) FROM main_studentledger p
           LEFT JOIN LATERAL (SELECT coalesce(sum(amount), 0) s FROM main_studentledgerline x WHERE x.ledger_id = p.id) a ON true
           LEFT JOIN LATERAL (SELECT coalesce(sum(norm_numeric(e.value)), 0) s FROM jsonb_each(p.details) e WHERE e.key <> '__titles') b ON true
           WHERE abs(a.s - b.s) > 0.01""",
    ),
    (
        "main_studentinvoice",
        """SELECT count(*) FROM main_studentinvoice p
           LEFT JOIN LATERAL (SELECT coalesce(sum(amount), 0) s FROM main_studentinvoiceline x WHERE x.invoice_id = p.id) a ON true
           LEFT JOIN LATERAL (
               SELECT coalesce(sum(CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END), 0) s
               FROM jsonb_each(CASE WHEN jsonb_typeof(p.details) = 'object' THEN p.details ELSE '{}'::jsonb END) e WHERE e.key <> '__titles'
           ) b ON true
           LEFT JOIN LATERAL (
               SELECT coalesce(sum(norm_numeric(e -> 'AMT')), 0) s
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.details) = 'array' THEN p.details ELSE '[]'::jsonb END) e
           ) c ON true
           WHERE abs(a.s - b.s - c.s) > 0.01""",
    ),
    (
        "main_staffledger",
        """SELECT count(*) FROM main_staffledger p
           LEFT JOIN LATERAL (SELECT coalesce(sum(amount), 0) s FROM main_staffledgerline x WHERE x.ledger_id = p.id) a ON true
           LEFT JOIN LATERAL (SELECT coalesce(sum(norm_numeric(e.value)), 0) s FROM jsonb_each(p.details) e WHERE e.key <> '__titles') b ON true
           WHERE abs(a.s - b.s) > 0.01""",
    ),
    (
        "main_staffinvoice",
        """SELECT count(*) FROM main_staffinvoice p
           LEFT JOIN LATERAL (SELECT coalesce(sum(amount), 0) s FROM main_staffinvoiceline x WHERE x.invoice_id = p.id) a ON true
           LEFT JOIN LATERAL (
               SELECT coalesce(sum(CASE WHEN jsonb_typeof(e.value) = 'object' THEN norm_numeric(e.value -> 'amt') ELSE norm_numeric(e.value) END), 0) s
               FROM jsonb_each(p.details) e WHERE e.key <> '__titles'
           ) b ON true
           WHERE abs(a.s - b.s) > 0.01""",
    ),
]


def plain_reconcile(table, lines, parent):
    """A details blob of {key: amount} against its lines."""
    return (
        table,
        f"""SELECT count(*) FROM {table} p
           LEFT JOIN LATERAL (SELECT coalesce(sum(amount), 0) s FROM {lines} x WHERE x.{parent} = p.id) a ON true
           LEFT JOIN LATERAL (SELECT coalesce(sum(norm_numeric(e.value)), 0) s FROM jsonb_each(p.details) e WHERE e.key <> '__titles') b ON true
           WHERE abs(a.s - b.s) > 0.01""",
    )


RECONCILE += [
    plain_reconcile("extra_billing_extraledger", "extra_billing_extraledgerline", "ledger_id"),
    plain_reconcile("extra_billing_extrainvoice", "extra_billing_extrainvoiceline", "invoice_id"),
    plain_reconcile("canteen_canteentransaction", "canteen_canteentransactionline", "transaction_id"),
]


def scalar(cursor, sql, params=None):
    cursor.execute(sql, params or [])
    return cursor.fetchone()[0]


def audit():
    """Every finding as a line of text."""
    integrity = import_module("main.migrations.0110_integrity_keys")
    tenant = import_module("main.migrations.0111_tenant_keys")
    later = import_module("main.migrations.0114_cleanup_log_and_keys")
    findings = []
    with connection.cursor() as cursor:
        if scalar(cursor, "SELECT to_regproc('norm_numeric') IS NOT NULL"):
            for table, sql in RECONCILE:
                differ = scalar(cursor, sql)
                if differ:
                    findings.append(f"{table}: {differ} row(s) whose lines differ from their JSON")
        else:
            findings.append("Normalized tables are not installed yet (run migrate to 0109).")
        rules = [rule[:4] for rule in (*integrity.UNIQUE_RULES, *later.UNIQUE_RULES)]
        for name, table, key, where in rules:
            condition = f"WHERE {where}" if where else ""
            duplicates = scalar(
                cursor,
                f"SELECT count(*) FROM (SELECT 1 FROM {table} {condition} GROUP BY {key} HAVING count(*) > 1) x",
            )
            if duplicates:
                findings.append(f"{table}: {duplicates} duplicate group(s) of ({key}), so {name} cannot be built")
            elif not scalar(cursor, "SELECT count(*) FROM pg_index WHERE indexrelid = to_regclass(%s) AND indisvalid", [name]):
                findings.append(f"{table}: rule {name} is not in place")
        for table, column in integrity.DATE_COLUMNS:
            bad = scalar(cursor, f"SELECT count(*) FROM {table} WHERE {integrity.malformed_date(column)}")
            name = integrity.date_rule_name(table, column)
            if bad:
                findings.append(f"{table}.{column}: {bad} malformed date(s), so {name} cannot be added")
            elif not scalar(cursor, "SELECT count(*) FROM pg_constraint WHERE conname = %s", [name]):
                findings.append(f"{table}.{column}: rule {name} is not in place")
        for child, column, parent in tenant.LINKS:
            crossed = scalar(
                cursor,
                f"SELECT count(*) FROM {child} c JOIN {parent} p ON p.id = c.{column} WHERE c.school_id <> p.school_id",
            )
            name = tenant.link_name(child, column)
            if crossed:
                findings.append(f"{child}.{column}: {crossed} row(s) point at another school")
            elif not scalar(cursor, "SELECT count(*) FROM pg_constraint WHERE conname = %s AND convalidated", [name]):
                findings.append(f"{child}.{column}: key {name} is not in place or not validated")
    return findings


class Command(BaseCommand):
    help = "Read-only check of the normalized tables, integrity rules and school boundaries."

    def handle(self, *args, **options):
        findings = audit()
        for line in findings:
            self.stdout.write(line)
        if findings:
            self.stdout.write(self.style.WARNING(f"{len(findings)} finding(s)."))
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS("Nothing to report."))
