def first_blocking_reference(checks):
    """
    Guard against deleting a record that is still referenced by active children.

    `checks` is an iterable of (queryset, label) pairs, where each queryset
    selects the ACTIVE child rows that reference the record being deleted.
    Returns the label of the first non-empty queryset — so the caller can tell
    the user exactly what is blocking the delete — or None when nothing
    references the record and it is safe to (soft-)delete.

    Example:
        blocker = first_blocking_reference([
            (StudentTransportationInfo.objects.filter(
                bus_station=station_id, is_active=True), "students"),
        ])
        if blocker:
            return Response({"message": f"... still assigned to {blocker} ..."}, 409)
    """
    for queryset, label in checks:
        if queryset.exists():
            return label
    return None
