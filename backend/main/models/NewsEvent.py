from django.db.models import (
    TextField,
    ForeignKey,
    Model,
    ImageField,
    DateTimeField,
    CASCADE,
)

#
from .BaseModel import BaseModel, CustomCharField


class NewsEvent(BaseModel):
    title = CustomCharField(min_length=5, max_length=255)
    content = TextField()
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)


class NewsEventImage(Model):
    image = ImageField(upload_to="news_images/%Y/%m/")
    uploaded_at = DateTimeField(auto_now_add=True)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
