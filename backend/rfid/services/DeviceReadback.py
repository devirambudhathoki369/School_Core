from ..models.Attendance import RFIDAttdUser
from .parsers import parse_table_rows


def _same_card(ours, theirs):
    """
    True when two card numbers are the same badge written in either base.

    We store the decimal a reader reports; an access panel reports hex. Left
    as a plain string comparison, every correctly-enrolled user on a panel
    reads as a card mismatch — the reconciliation would say the fleet was
    broken precisely when it had just been fixed.
    """
    ours = (ours or "").strip().lstrip("0") or "0"
    theirs = (theirs or "").strip().lstrip("0") or "0"
    if ours.lower() == theirs.lower():
        return True
    for a, b in ((ours, theirs), (theirs, ours)):
        try:
            if int(a) == int(b, 16):
                return True
        except ValueError:
            continue
    return False

# The reconciliation is stored on the command row that asked for it, so it has
# to stay small — a 700-user panel must not write a 700-line blob. Enough
# examples to diagnose, never enough to bloat.
MAX_EXAMPLES = 10


def reconcile_users(device, body):
    """
    Compare the user table a panel just uploaded against what we hold for it.

    "The panel says 31" is a number we have to be trusted on. This turns it
    into something checkable: which PINs the panel actually holds, which of
    ours never made it down, and which it holds that we don't know about
    (someone enrolled at the panel directly, or a stale row from before a
    device was re-registered).

    Returns a summary dict; never raises, because this runs inside the request
    the device is waiting on and a malformed row must not cost it its
    acknowledgement.
    """
    on_device = {}
    try:
        for row in parse_table_rows(body):
            pin = (row.get("pin") or "").strip()
            if not pin:
                continue
            on_device[pin] = (row.get("cardno") or row.get("card") or "").strip()
    except Exception:
        return None

    if not on_device:
        return None

    ours = {
        u.pin: (u.card or "").strip()
        for u in RFIDAttdUser.objects.filter(device=device).only("pin", "card")
    }

    our_pins = set(ours)
    their_pins = set(on_device)
    missing = sorted(our_pins - their_pins)  # registered here, absent there
    extra = sorted(their_pins - our_pins)  # on the panel, unknown to us
    # A card that differs is worse than one that is absent: the person exists
    # on the panel but the badge in their hand opens nothing.
    mismatched = sorted(
        pin
        for pin in our_pins & their_pins
        if ours[pin]
        and on_device[pin]
        and not _same_card(ours[pin], on_device[pin])
    )

    return {
        "on_device": len(on_device),
        "ours": len(ours),
        "matched": len(our_pins & their_pins),
        "missing_on_device": len(missing),
        "extra_on_device": len(extra),
        "card_mismatch": len(mismatched),
        "missing_examples": missing[:MAX_EXAMPLES],
        "extra_examples": extra[:MAX_EXAMPLES],
        "mismatch_examples": [
            {"pin": p, "ours": ours[p], "device": on_device[p]}
            for p in mismatched[:MAX_EXAMPLES]
        ],
    }


# A sample big enough to read a format off, small enough that it can sit on a
# command row without becoming a copy of the table.
SAMPLE_ROWS = 3
SAMPLE_CHARS = 600


def describe_rows(body):
    """
    What an upload actually looked like, for when the parser made nothing of it.

    Returns the row count, the column names seen, and the first couple of rows
    verbatim. Guessing at a device dialect from the outside is how a bug like
    "69 transactions ingested as 0" survives; this makes the shape visible
    instead of inferred.
    """
    try:
        text = body.decode("utf-8", errors="replace")
    except Exception:
        return None
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return {"rows": 0, "raw": ""}
    keys = []
    for row in parse_table_rows(body):
        keys = sorted(row)
        break
    # Aggregate the whole upload, not just the sample: "no row carried a card
    # number" is a claim about all 69 rows, and three of them cannot support it.
    from collections import Counter

    events = Counter()
    with_pin = with_card = total = 0
    for row in parse_table_rows(body):
        total += 1
        events[row.get("eventtype") or row.get("event") or "?"] += 1
        if (row.get("pin") or "").strip() not in ("", "0"):
            with_pin += 1
        if (row.get("cardno") or row.get("transaction cardno") or "").strip():
            with_card += 1

    return {
        "rows": len(lines),
        "parsed": total,
        "with_pin": with_pin,
        "with_card": with_card,
        "event_types": dict(events.most_common(10)),
        "keys": keys,
        "raw": "\n".join(lines[:SAMPLE_ROWS])[:SAMPLE_CHARS],
    }
