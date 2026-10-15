from django.db.models import FileField


def plain_fields(Model):
    """
    The fields of `Model` a client row may set: plain values only.

    Views that copy a client's row onto a record -- `setattr` in a loop,
    `Model(parent=..., **row)` -- also copied any `*_id`, so one key in a row
    re-pointed it at another school's class, result header or roll call, or
    overrode the parent the server had just set. Relations, files and ids are
    never taken from a row; the view sets those itself.
    """
    return {
        field.name
        for field in Model._meta.concrete_fields
        if field.editable
        and not field.primary_key
        and not field.is_relation
        and not isinstance(field, FileField)
    }


def only_plain(Model, row):
    """`row` with every key that is not a plain field of `Model` dropped."""
    allowed = plain_fields(Model)
    return {k: v for k, v in row.items() if k in allowed}
