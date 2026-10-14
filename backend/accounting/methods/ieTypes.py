"""
Dr/Cr side of an income/expense particular.

Journal particulars store their side on the row (`type`). Income & expense
particulars don't, so the side is derived from the ledger's group category.
Everything that needs a signed amount -- ledger reports, trial balance and the
year-close -- must use these same cases, or closing balances stop matching the
reports they are supposed to summarise.
"""

from django.db.models import Value, When

#
from ..constants.ledger_groups import (
    LEDGER_GROUPS_OPTIONS,
    INCOME_ID,
    EXPENSE_ID,
    IE_TYPES,
)


def get_ie_types(entry_kind: int):
    """
    Generate a list of When() cases for income/expense entry type detection.
    Uses category-based mapping if opt.group exists,
    else falls back to the natural side (opt.type.value).
    """
    return [
        When(
            ledger_group=opt.value,
            then=Value(
                IE_TYPES[entry_kind][opt.group].value
                if opt.group in IE_TYPES[entry_kind]
                else opt.type.value
            ),
        )
        for opt in LEDGER_GROUPS_OPTIONS
    ]


IE_TYPE_CASES = {
    INCOME_ID: get_ie_types(INCOME_ID),
    EXPENSE_ID: get_ie_types(EXPENSE_ID),
}

# natural side of every ledger group; fallback when a ledger has no saved
# balance row for the year being closed.
NATURAL_BALANCE_TYPES = {opt.value: opt.type.value for opt in LEDGER_GROUPS_OPTIONS}
