from ..models.Fee import FeeTitle
from ..constants.payment import EXCEPTION_TITLES, TITLE_NAMES_KEY


def _extract_title_ids(details):
    """Return the set of integer title-ids referenced by a details dict.

    `details` may carry both integer-id keys (real FeeTitle references) and
    string exception keys (e.g. "ob", "od", "tn"). Only the former need a
    snapshot lookup against FeeTitle — the exception keys already have stable
    human labels in EXCEPTION_TITLES_ALTERNATIVES.
    """
    ids = set()
    for key in (details or {}).keys():
        if key == TITLE_NAMES_KEY or key in EXCEPTION_TITLES:
            continue
        try:
            ids.add(int(key))
        except (TypeError, ValueError):
            # silently skip unknown non-integer keys; readers tolerate them.
            continue
    return ids


def enrich_details_with_title_names(details, school_id=None):
    """Stamp a {title_id: FeeTitle.title} snapshot into `details[TITLE_NAMES_KEY]`.

    Mutates and returns `details`. Safe to call repeatedly — existing entries
    in the snapshot map are preserved (writer should set values once at create
    time; we don't overwrite to avoid clobbering an authoritative earlier
    snapshot in case of retries).

    Why: StudentInvoice.details and StudentLedger.details only reference fee
    titles by id. The live FeeTitle.title is mutable (admins can rename it),
    so historical reports drift over time. Capturing the name at write time
    keeps Ram's nursery receipt labelled correctly forever.
    """
    if not isinstance(details, dict):
        return details
    ids = _extract_title_ids(details)
    if not ids:
        # nothing to enrich — still init an empty snapshot map so readers can
        # always rely on the key existing on new rows.
        details.setdefault(TITLE_NAMES_KEY, {})
        return details
    q = {"id__in": ids, "is_active": True}
    if school_id:
        q["school_id"] = school_id
    titles_qs = FeeTitle.objects.filter(**q).values("id", "title")
    snapshot = details.get(TITLE_NAMES_KEY) or {}
    for row in titles_qs:
        key = str(row["id"])
        # preserve any pre-existing snapshot value
        if key not in snapshot and row.get("title"):
            snapshot[key] = row["title"]
    details[TITLE_NAMES_KEY] = snapshot
    return details


def enrich_many_details(details_list, school_id=None):
    """Same as enrich_details_with_title_names but for a list of details dicts.

    Optimised to do a single FeeTitle lookup across all referenced ids rather
    than one query per dict — important when LedgerPosting bulk-creates many
    StudentLedger rows at once.
    """
    if not details_list:
        return details_list
    all_ids = set()
    for d in details_list:
        if isinstance(d, dict):
            all_ids.update(_extract_title_ids(d))
    if not all_ids:
        for d in details_list:
            if isinstance(d, dict):
                d.setdefault(TITLE_NAMES_KEY, {})
        return details_list
    q = {"id__in": all_ids, "is_active": True}
    if school_id:
        q["school_id"] = school_id
    lookup = {
        str(row["id"]): row["title"]
        for row in FeeTitle.objects.filter(**q).values("id", "title")
        if row.get("title")
    }
    for d in details_list:
        if not isinstance(d, dict):
            continue
        snapshot = d.get(TITLE_NAMES_KEY) or {}
        for tid in _extract_title_ids(d):
            key = str(tid)
            if key not in snapshot and key in lookup:
                snapshot[key] = lookup[key]
        d[TITLE_NAMES_KEY] = snapshot
    return details_list
