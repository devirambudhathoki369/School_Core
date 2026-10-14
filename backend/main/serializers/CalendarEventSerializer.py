from rest_framework import serializers

#
from ..models.CalendarEvent import (
    CalendarEvent,
    CALENDAR_EVENT_TYPES,
    CALENDAR_EVENT_COLORS,
)


class CalendarEventSerializer(serializers.ModelSerializer):
    type = serializers.IntegerField(
        help_text=str({e[0]: e[1] for e in CALENDAR_EVENT_TYPES})
    )
    color = serializers.CharField(
        help_text=str({e[0]: e[1] for e in CALENDAR_EVENT_COLORS})
    )
    description = serializers.CharField(required=False)

    class Meta:
        model = CalendarEvent
        fields = "__all__"
        read_only_fields = ("is_active", "created_at", "updated_at")
        extra_kwargs = {"school": {"write_only": True}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["type_str"] = instance.get_type_display()
        data["color_code"] = data.pop("color")
        return data


# DOCS
class CalendarEventParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    id = serializers.IntegerField(required=False, help_text="calendar event id")
    start_date = serializers.CharField(required=False, help_text="Nepali Date")
    end_date = serializers.CharField(required=False, help_text="Nepali Date")
    year = serializers.IntegerField(
        required=False, help_text="Pass both year and month together or ignore"
    )
    month = serializers.IntegerField(
        required=False, help_text="Pass both year and month together or ignore"
    )
