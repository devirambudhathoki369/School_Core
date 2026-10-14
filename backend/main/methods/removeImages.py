"""Taking a picture OFF a record — a logo, a signature, a profile photo.

Putting one on has always been possible; removing one was not, so a school that
uploaded the wrong award logo had it printed on every bill until support cleared
the column by hand, and a student's photo could be replaced but never withdrawn.

A removal is asked for with `remove` on the record's own PUT, naming the image
field(s) to clear:

    PUT /api/schools   {"id": 53, "remove": "award_logo"}
    PUT /api/students  {"id": 9, "school": 53, "remove": ["image"]}

Only the reference is cleared. The FILE stays where it is: the old path is in the
history log (every update is logged with its diff), so a removal made by mistake
can be put back, and nothing a school uploaded is ever destroyed by a click.
"""


def requestedRemovals(data, allowed):
    """The image fields a request asks to clear.

    Returns None when the request is not a removal at all, and otherwise the
    names that are both asked for and in `allowed` — an empty list when it named
    nothing this record keeps, which the caller should answer as invalid rather
    than as success.

    `remove` arrives as a list from JSON and as text from a form ("logo" or
    "logo,sign"), so both are read.
    """
    if "remove" not in data:
        return None
    raw = data.getlist("remove") if hasattr(data, "getlist") else data.get("remove")
    if isinstance(raw, str):
        raw = [raw]
    names = []
    for item in raw or []:
        for name in str(item).split(","):
            name = name.strip()
            if name in allowed and name not in names:
                names.append(name)
    return names


def clearImages(instance, names):
    """Detach the pictures in `names` from `instance`; returns the ones it held.

    A field that is already empty is left alone, so asking twice is harmless and
    the answer says what actually changed.
    """
    cleared = [name for name in names if getattr(instance, name, None)]
    for name in cleared:
        setattr(instance, name, None)
    if cleared:
        fields = list(cleared)
        if hasattr(instance, "updated_at"):
            fields.append("updated_at")
        instance.save(update_fields=fields)
    return cleared
