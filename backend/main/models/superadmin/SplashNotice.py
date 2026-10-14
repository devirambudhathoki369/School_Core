from django.db.models import (
    Model,
    CharField,
    TextField,
    FileField,
    BooleanField,
    DateTimeField,
)


class SplashNotice(Model):
    """A superadmin-authored splash shown to every school user at login.

    Title/message and/or an image. Only `is_active` notices are shown; the
    frontend renders the most recent active one as a dismissible popup that also
    auto-closes after a few seconds.
    """

    title = CharField(max_length=120, blank=True, default="")
    message = TextField(blank=True, default="")
    image = FileField(upload_to="splash_notices/%Y/", blank=True, null=True)
    is_active = BooleanField(default=True, db_index=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-id",)

    def __str__(self):
        return self.title or (self.image.name if self.image else f"Splash<{self.id}>")
