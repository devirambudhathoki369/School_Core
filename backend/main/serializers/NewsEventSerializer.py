from rest_framework import serializers
import bleach

#
from ..models.NewsEvent import NewsEvent, NewsEventImage

ALLOWED_TAGS = ["p", "b", "i", "u", "strong", "em", "ul", "ol", "li", "br", "a", "img"]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title"],
    "img": ["src", "alt", "title", "width", "height"],
}
ALLOWED_PROTOCOLS = ["http", "https"]


class NewsEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsEvent
        fields = "__all__"

    def validate(self, attrs):
        if "content" in attrs:
            attrs["content"] = self.sanitize(attrs["content"])
        return super().validate(attrs)

    def sanitize(self, content):
        return bleach.clean(
            content,
            tags=ALLOWED_TAGS,
            attributes=ALLOWED_ATTRIBUTES,
            protocols=ALLOWED_PROTOCOLS,
            strip=True,
        )


class NewsEventImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = NewsEventImage
        fields = "__all__"


# DOCS
class NewsEventsParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    id = serializers.IntegerField(required=False)
    include_content = serializers.BooleanField(
        required=False, help_text="event's whole content"
    )
