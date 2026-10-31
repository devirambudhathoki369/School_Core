"""What `manage.py check --deploy` can see of how this server is set up."""

from django.conf import settings
from django.core.checks import Tags, Warning, register
from django.db import connection


@register(Tags.security, deploy=True)
def database_login_has_only_the_rights_it_needs(app_configs, **kwargs):
    with connection.cursor() as cursor:
        cursor.execute("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")
        superuser, bypass = cursor.fetchone()
    if superuser or bypass:
        return [
            Warning(
                "The app signs in to PostgreSQL as a role that is a superuser or skips row security.",
                hint="Use a role with data rights only: tools/database/db_roles.sql.",
                id="main.W001",
            )
        ]
    return []


@register(Tags.security, deploy=True)
def card_readers_have_keys(app_configs, **kwargs):
    from rfid.models.Device import Device

    keyless = Device.objects.filter(push_comm_key="").count()
    if keyless and not settings.ICLOCK_REQUIRE_PUSH_KEY:
        return [
            Warning(
                f"{keyless} card reader(s) have no push key, so their serial number alone identifies them.",
                hint="Set a key on each reader and its Device row, then ICLOCK_REQUIRE_PUSH_KEY=true.",
                id="main.W002",
            )
        ]
    return []
