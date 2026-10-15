from django.apps import AppConfig
from django.db.models.signals import post_migrate


def sync_module_catalog(app_config, using="default", apps=None, **kwargs):
    """Make main.Module hold exactly the modules the code defines
    (constants/school_modules.MODULES): add new ones, keep names current.

    On every `migrate` -- and after a test flush, which re-runs post_migrate --
    the way Django keeps its content types. Never deletes: a module some school
    still holds is protected, and one nobody holds does no harm.
    """
    if app_config.label != "main":
        return
    if apps is None:
        # `flush` (and a test flush) sends post_migrate without an app registry
        from django.apps import apps
    try:
        Module = apps.get_model("main", "Module")
    except LookupError:  # migrated to a point before the catalog existed
        return
    from .constants.school_modules import MODULES

    modules = Module.objects.using(using)
    stored = dict(modules.values_list("code", "name"))
    for code, _flag, label, _on in MODULES:
        if code not in stored:
            modules.create(code=code, name=label)
        elif stored[code] != label:
            modules.filter(code=code).update(name=label)


class AccountConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'main'

    def ready(self):
        post_migrate.connect(sync_module_catalog, sender=self, dispatch_uid="main_module_catalog")
