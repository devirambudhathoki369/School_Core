"""
A text column the database only ever sees encrypted.

For values the app must read back, which a hash cannot do: a school's SMS key, an
OTP secret, a card reader's key and PINs. A copy of a table or a dump holds no
usable value without the key, and the rest of the code reads the field as usual.
It cannot be searched, because the same value encrypts differently each time.

The keys come from FIELD_ENCRYPTION_KEYS, newest first, so a key can be rotated;
with none set, one is derived from SECRET_KEY. Losing the key loses these values.
A value that will not decrypt raises instead of reading as empty, because an empty
reader key means a reader with no key.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.db.models import CharField

# Every Fernet token starts this way, because it starts with a version and a timestamp.
TOKEN_PREFIX = "gAAAA"


def cipher():
    keys = list(getattr(settings, "FIELD_ENCRYPTION_KEYS", ()) or ())
    if not keys:
        digest = hashlib.sha256(b"field-encryption:" + settings.SECRET_KEY.encode()).digest()
        keys = [base64.urlsafe_b64encode(digest).decode()]
    return MultiFernet([Fernet(key) for key in keys])


def encrypt(value):
    return cipher().encrypt(str(value).encode()).decode()


def decrypt(value):
    return cipher().decrypt(str(value).encode()).decode()


def is_encrypted(value):
    if not isinstance(value, str) or not value.startswith(TOKEN_PREFIX):
        return False
    try:
        decrypt(value)
    except InvalidToken:
        return False
    return True


class EncryptedCharField(CharField):
    def __init__(self, *args, **kwargs):
        # Room for the token. Set the limit on the plain value with validators.
        kwargs.setdefault("max_length", 255)
        super().__init__(*args, **kwargs)

    def from_db_value(self, value, expression, connection):
        # Rows from before encryption are read as they are until they are saved.
        if not value or not value.startswith(TOKEN_PREFIX):
            return value
        return decrypt(value)

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        # Already a token when it comes from a dump, and it must not be wrapped twice.
        if value in (None, "") or is_encrypted(value):
            return value
        return encrypt(value)

    def value_to_string(self, obj):
        # What dumpdata writes: the token, so a dump holds no plain value.
        return self.get_prep_value(self.value_from_object(obj))


def encrypt_rows(table, column, pk="id"):
    """For a migration: (forwards, backwards) that encrypt existing rows, and undo it."""

    def forwards(apps, schema_editor):
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"SELECT {pk}, {column} FROM {table} WHERE {column} IS NOT NULL AND {column} <> ''"
            )
            for key, value in cursor.fetchall():
                if not is_encrypted(value):
                    cursor.execute(f"UPDATE {table} SET {column} = %s WHERE {pk} = %s", [encrypt(value), key])

    def backwards(apps, schema_editor):
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(
                f"SELECT {pk}, {column} FROM {table} WHERE {column} LIKE %s", [TOKEN_PREFIX + "%"]
            )
            for key, value in cursor.fetchall():
                cursor.execute(f"UPDATE {table} SET {column} = %s WHERE {pk} = %s", [decrypt(value), key])

    return forwards, backwards
