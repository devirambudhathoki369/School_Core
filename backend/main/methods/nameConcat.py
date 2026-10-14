from django.db.models import Value, CharField
from django.db.models.functions import Concat


def nameConcat(prefix=None):
    def field(_field):
        return f"{prefix}__{_field}" if prefix else _field

    # Names are returned exactly as entered (no Lower()) so every report
    # shows the student/staff name with its original casing.
    return Concat(
        field("first_name"),
        Value(" "),
        field("middle_name"),
        Value(" "),
        field("last_name"),
        output_field=CharField(),
    )
