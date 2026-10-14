"""Collapse duplicate exam-result rows so one subject means one column.

Two shapes of duplicate had no way of being stopped by the database:

  headers  more than one active `ClassResult` for the same exam + class +
           subject. Marks entry used to match a header on the WHOLE payload,
           criteria included, so re-saving with a changed full/pass mark minted
           a twin and split one subject's marks across two rows.

  rows     more than one active `StudentResult` for the same header + student.
           The update path inserted whenever the page sent a row without a
           result id, which a stale tab or a double-submit does routinely.

Readers hide both by taking the newest of each group (`distinct` on the header,
a `Rank` window on the row), which is why this stayed invisible for years — but
it means every total is one un-deduplicated query away from being wrong, and it
makes the marks that are actually shown depend on insertion order.

The repair keeps exactly what the app already shows wherever it can:

  * per header, the newest row per student survives; older ones go inactive.
  * per group of duplicate headers, the newest wins — the same one the
    gradesheet already renders. Students it has no row for are MOVED across
    from a loser before the loser is deactivated, so a merge can only ever
    bring back a mark that was hidden, never change or drop one on screen.

Everything is a soft delete (`is_active=False`); nothing is erased.
"""

from django.db import connection

# ---------------------------------------------------------------- rows

_DUP_ROWS_COUNT = """
SELECT count(*) FROM (
    SELECT 1 FROM main_studentresult
    WHERE is_active {school_filter}
    GROUP BY class_result_id, student_id HAVING count(*) > 1
) d
"""

_DUP_ROWS_FIX = """
UPDATE main_studentresult sr SET is_active = false, updated_at = now()
WHERE sr.is_active AND sr.id IN (
    SELECT id FROM (
        SELECT id, row_number() OVER (
                   PARTITION BY class_result_id, student_id ORDER BY id DESC
               ) AS rn
        FROM main_studentresult WHERE is_active {school_filter}
    ) ranked WHERE rn > 1
)
"""

# ------------------------------------------------------------- headers

_DUP_HEADERS = """
SELECT keeper, losers FROM (
    -- Newest wins, which is precisely the header every reader already
    -- renders (`distinct` ordered by -id), so folding cannot change a mark
    -- that is on screen today — it can only bring back one that was hidden.
    SELECT (array_agg(cr_id ORDER BY cr_id DESC))[1] AS keeper,
           (array_agg(cr_id ORDER BY cr_id DESC))[2:] AS losers
    FROM (
        SELECT cr.id AS cr_id, cr.exam_id, cr.class_info_id, cr.subject_id
        FROM main_classresult cr
        JOIN main_classinfo ci ON ci.id = cr.class_info_id
        WHERE cr.is_active {school_filter}
    ) h
    GROUP BY exam_id, class_info_id, subject_id
    HAVING count(*) > 1
) g
"""

# Marks a loser holds for a student the keeper has no active row for: move the
# newest such row onto the keeper rather than losing it.
_MOVE_ROWS = """
UPDATE main_studentresult SET class_result_id = %(keeper)s, updated_at = now()
WHERE id IN (
    SELECT id FROM (
        SELECT sr.id, row_number() OVER (
                   PARTITION BY sr.student_id ORDER BY sr.id DESC
               ) AS rn
        FROM main_studentresult sr
        WHERE sr.class_result_id = ANY(%(losers)s) AND sr.is_active
          AND NOT EXISTS (
              SELECT 1 FROM main_studentresult k
              WHERE k.class_result_id = %(keeper)s AND k.is_active
                AND k.student_id = sr.student_id
          )
    ) pick WHERE rn = 1
)
"""

_DEACTIVATE_LOSERS = """
UPDATE main_studentresult SET is_active = false, updated_at = now()
WHERE class_result_id = ANY(%(losers)s) AND is_active
"""

_DEACTIVATE_HEADERS = """
UPDATE main_classresult SET is_active = false, updated_at = now()
WHERE id = ANY(%(losers)s)
"""


def duplicate_row_count(school_id=None):
    params = {}
    where = ""
    if school_id:
        params["school"] = school_id
        where = (
            " AND class_result_id IN (SELECT cr.id FROM main_classresult cr "
            "JOIN main_classinfo ci ON ci.id = cr.class_info_id "
            "WHERE ci.school_id = %(school)s)"
        )
    with connection.cursor() as cursor:
        cursor.execute(_DUP_ROWS_COUNT.format(school_filter=where), params)
        return cursor.fetchone()[0]


def dedupe_student_rows(school_id=None):
    """Deactivate every student row but the newest per (header, student)."""
    params = {}
    where = ""
    if school_id:
        params["school"] = school_id
        where = (
            " AND class_result_id IN (SELECT cr.id FROM main_classresult cr "
            "JOIN main_classinfo ci ON ci.id = cr.class_info_id "
            "WHERE ci.school_id = %(school)s)"
        )
    with connection.cursor() as cursor:
        cursor.execute(_DUP_ROWS_FIX.format(school_filter=where), params)
        return cursor.rowcount


def duplicate_header_groups(school_id=None):
    """[(keeper_id, [loser_id, ...]), ...] for every duplicated header."""
    params = {}
    where = ""
    if school_id:
        params["school"] = school_id
        where = " AND ci.school_id = %(school)s"
    with connection.cursor() as cursor:
        cursor.execute(_DUP_HEADERS.format(school_filter=where), params)
        return [(row[0], list(row[1] or [])) for row in cursor.fetchall()]


def merge_header_group(keeper, losers):
    """Fold `losers` into `keeper`. Returns (rows_moved, rows_dropped)."""
    if not losers:
        return 0, 0
    with connection.cursor() as cursor:
        cursor.execute(_MOVE_ROWS, {"keeper": keeper, "losers": losers})
        moved = cursor.rowcount
        cursor.execute(_DEACTIVATE_LOSERS, {"losers": losers})
        dropped = cursor.rowcount
        cursor.execute(_DEACTIVATE_HEADERS, {"losers": losers})
    return moved, dropped
