from django.db.models import (
    Model,
    DateField,
    DateTimeField,
    CharField,
    EmailField,
    BooleanField,
)
from django.core.validators import MinLengthValidator, MaxLengthValidator
from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import pre_save, post_save, post_delete

#
from account.auth.context import users_context

#
from .history_log.HistoryLog import HistoryLog
from .history_log.diff import model_instance_diff

_allow_empty = {"null": True, "blank": True}


class BaseModel(Model):
    """
    This provides `is_active, created_at and updated_at` fields by default.
    """

    created_at = DateField(auto_now_add=True, editable=False)
    updated_at = DateTimeField(auto_now=True)
    is_active = BooleanField(default=True)
    # add last_accessed field;

    class Meta:
        abstract = True

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        post_save.connect(cls.log_create, sender=cls)
        pre_save.connect(cls.log_update, sender=cls)
        # post_delete.connect(cls.log_delete, sender=cls)
        """
            We mostly do soft deletion.
            We don't care about things that can be deleted;
            But must try to log remarks or create custom log!
            So, commented this delete remarks!
        """

    """
    ACTION_CHOICES_REFERENCE = (
        (1, "Create"),
        (2, "Read"),
        (3, "Update"),
        (4, "Delete"),
    )
    """

    @staticmethod
    def log_create(sender, instance, created, **kwargs):
        CREATE = 1
        if created:
            sender.create_log(sender, instance, CREATE, None)

    @staticmethod
    def log_update(sender, instance, **kwargs):
        UPDATE = 3
        if not instance._state.adding:
            update_fields = kwargs.get("update_fields", None)
            old = sender.objects.filter(pk=instance.pk).first()
            changes = model_instance_diff(old, instance, fields_to_check=update_fields)
            if changes:
                sender.create_log(sender, instance, UPDATE, changes)

    @staticmethod
    def log_delete(sender, instance, **kwargs):
        DELETE = 4
        if instance.pk is not None:
            sender.create_log(sender, instance, DELETE, {"is_active": False})

    @staticmethod
    def create_log(sender, instance, action, changes):
        user_context = users_context.get()
        if not user_context:
            return
        user_type = user_context.get("user_type")
        user_id = user_context.get("user_id")
        school_id = user_context.get("school_id") or None
        ip_address = user_context.get("ip_address")
        object_type = ContentType.objects.get_for_model(sender)

        HistoryLog.objects.create(
            user_type=user_type,
            user_id=user_id,
            school_id=school_id,
            object_type=object_type,
            object_id=instance.pk,
            action=action,
            changes=changes,
            ip_address=ip_address,
        )


class CustomCharField(CharField):
    """
    A custom char-field with min-length and max-length validators.
    """

    def __init__(self, *args, min_length=None, max_length=None, **kwargs):
        super().__init__(max_length=max_length, *args, **kwargs)

        if min_length is not None:
            self.validators.append(MinLengthValidator(min_length))
        # if max_length is not None:
        #     self.validators.append(MaxLengthValidator(max_length))


class CustomEmailField(EmailField):
    def __init__(self, *args, min_length=12, max_length=50, **kwargs):
        super().__init__(*args, **kwargs)

        if min_length is not None:
            self.validators.append(MinLengthValidator(min_length))
        if max_length is not None:
            self.validators.append(MaxLengthValidator(max_length))


# id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
