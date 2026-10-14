from main.models.BaseModel import CustomCharField
from django.db.models import Model, CharField, BooleanField, DateTimeField
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.validators import MinLengthValidator
from django.contrib.auth.models import AbstractBaseUser
from django.contrib.auth.base_user import BaseUserManager


class CustomAccountManager(BaseUserManager):
    def create_user(self, username, password, **extra_fields):
        if not username:
            raise ValueError("The Username must be provided")
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


class BaseAccount(AbstractBaseUser):
    objects = CustomAccountManager()

    username = CharField(
        unique=True,
        max_length=25,
        help_text="Required. 25 characters or fewer. Letters, digits and @/./+/-/_ only.",
        validators=[MinLengthValidator(6), UnicodeUsernameValidator()],
        error_messages={
            "unique": "A user with that username already exists.",
        },
    )
    #
    created_at = DateTimeField(auto_now_add=True)
    verified = BooleanField(default=True)
    secret = CharField(max_length=100, null=True, blank=True)
    otp = CharField(max_length=6, null=True, blank=True)

    USERNAME_FIELD = "username"

    class Meta:
        abstract = True

    def __str__(self) -> str:
        return f"account_{self.username}"


#
#
class SuperAdminAccount(BaseAccount):
    """
    A top level account in the system to manage admins, managed by me/developer.
    """

    full_name = CustomCharField(min_length=4, max_length=30)


class AdminAccount(BaseAccount):
    """
    Admin refers to institutional accounts which can be created by superadmins.
    """

    sms_api = CustomCharField(min_length=5, max_length=100, null=True, blank=True)


class AppCreds(Model):
    """
    common fields related to mobile application usage.
    """

    app_device_token = CustomCharField(
        min_length=1, max_length=255, null=True, blank=True
    )
    # Set when the account holder requests deletion of their account from the
    # mobile app (Google Play "delete account" requirement). We do NOT hard-delete
    # the row: the linked Student/Staff record is owned by the school (data
    # controller) and is retained for legal/financial reasons. Instead the login
    # is disabled + personal auth data scrubbed, and this timestamp records when.
    # A school admin can re-enable a mistakenly deleted account.
    deletion_requested_at = DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class StudentAccount(BaseAccount, AppCreds):
    pass


class StaffAccount(BaseAccount, AppCreds):
    pass
