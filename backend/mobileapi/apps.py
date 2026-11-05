from django.apps import AppConfig


class MobileapiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "mobileapi"
    verbose_name = "Mobile app API"

    def ready(self):
        from . import signals  # noqa: F401  keeps parents linked as student records change
