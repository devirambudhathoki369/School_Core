from django.db.models import Model, CharField, FileField


class NoticeSA(Model):
    alt = CharField(max_length=255, blank=True, default="")
    file = FileField(upload_to="sa_notices/%Y/")

    def __str__(self):
        return self.file.name.rsplit("/", 1)[-1] if self.file else "NoticeSA"
