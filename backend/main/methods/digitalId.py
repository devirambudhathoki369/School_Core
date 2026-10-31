"""
The code on a Digital ID link, so a link cannot be guessed from its ids.

A keyed hash of who the link is for, which is why there is nothing to store and
every card already has one. Changing SECRET_KEY changes the codes: cards printed
before that fall back to what an old link shows.
"""

from django.utils.crypto import constant_time_compare, salted_hmac


def digital_id_code(role, school_id, person_id):
    value = f"{int(role)}:{int(school_id)}:{int(person_id)}"
    return salted_hmac("main.digital_id", value).hexdigest()[:32]


def code_is_good(code, role, school_id, person_id):
    try:
        return bool(code) and constant_time_compare(str(code), digital_id_code(role, school_id, person_id))
    except (TypeError, ValueError):
        return False
