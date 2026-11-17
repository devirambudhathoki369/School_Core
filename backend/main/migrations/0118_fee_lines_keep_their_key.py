# A fee line keeps its JSON key when its fee title is deleted.
#
# A student ledger or receipt line names its fee title by `title_id`, and keeps
# `code` for keys that are not a title ("tn", "od"). When the title is deleted,
# on_delete=SET_NULL clears `title_id` and `code` stays empty, so the line no
# longer says which JSON key it came from. Totals per row still matched, but a
# sum per title from the lines (Phase 3, main/services/fee_lines.py) would put
# that money under a blank key. The trigger below writes the old id into `code`
# as the title goes, as the sync in 0108 does for a key whose title is missing.
#
# Lines that already lost their key are rebuilt from their row's JSON, which is
# still the source of truth.

from django.db import migrations

LINE_TABLES = ("main_studentledgerline", "main_studentinvoiceline")

FORWARD = """
CREATE OR REPLACE FUNCTION norm_line_keeps_key() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.title_id IS NULL AND OLD.title_id IS NOT NULL AND NEW.code = '' THEN
        NEW.code := left(OLD.title_id::text, 32);
    END IF;
    RETURN NEW;
END $$;
""" + "".join(
    f"""
CREATE TRIGGER norm_trg_keeps_key BEFORE UPDATE OF title_id ON {table}
    FOR EACH ROW WHEN (NEW.title_id IS NULL AND OLD.title_id IS NOT NULL)
    EXECUTE FUNCTION norm_line_keeps_key();
"""
    for table in LINE_TABLES
) + """
SELECT norm_student_ledger_lines(p.id, p.details) FROM main_studentledger p
 WHERE EXISTS (SELECT 1 FROM main_studentledgerline x WHERE x.ledger_id = p.id AND x.title_id IS NULL AND x.code = '');
SELECT norm_student_invoice_lines(p.id, p.details) FROM main_studentinvoice p
 WHERE EXISTS (SELECT 1 FROM main_studentinvoiceline x WHERE x.invoice_id = p.id AND x.title_id IS NULL AND x.code = '');
"""

BACKWARD = "".join(f"DROP TRIGGER IF EXISTS norm_trg_keeps_key ON {table};\n" for table in LINE_TABLES) + (
    "DROP FUNCTION IF EXISTS norm_line_keeps_key();\n"
)


class Migration(migrations.Migration):
    dependencies = [
        ("main", "0117_guardians_and_app_code"),
    ]

    operations = [
        migrations.RunSQL(FORWARD, BACKWARD),
    ]
