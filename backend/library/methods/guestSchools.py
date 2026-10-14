from ..models.Library import LibraryGuestSchool


def guest_school_ids(school_id, requested=None):
    """
    Guest schools this school's library may serve.

    `requested` (optional) narrows the result to the ids the caller asked for —
    anything not actually registered as a guest is dropped, so a school can
    never reach another school's students by simply posting its id.
    """
    if not school_id:
        return []
    q = LibraryGuestSchool.objects.filter(school=school_id, is_active=True)
    if requested is not None:
        requested = [int(i) for i in requested if str(i).isdigit()]
        if not requested:
            return []
        q = q.filter(guest_school__in=requested)
    return list(q.values_list("guest_school", flat=True))


def borrower_school_ids(school_id, requested=None):
    """Own school + the allowed guest schools (the borrower search scope)."""
    ids = [int(school_id)] if school_id else []
    ids.extend(i for i in guest_school_ids(school_id, requested) if i not in ids)
    return ids
