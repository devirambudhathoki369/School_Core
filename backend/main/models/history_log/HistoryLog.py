from django.db import models
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib import admin

ACTION_CHOICES = (
    (1, "Create"),
    (2, "Read"),
    (3, "Update"),
    (4, "Delete"),
)


class HistoryLog(models.Model):
    user_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, related_name="user_type"
    )
    user_id = models.PositiveIntegerField()
    user_object = GenericForeignKey("user_type", "user_id")
    #
    school = models.ForeignKey(
        "main.SchoolAdmin", on_delete=models.CASCADE, null=True, blank=True
    )
    #
    object_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, related_name="record_type"
    )
    object_id = models.PositiveIntegerField()
    content_object = GenericForeignKey("object_type", "object_id")
    #
    timestamp = models.DateTimeField(auto_now_add=True)
    action = models.PositiveSmallIntegerField(choices=ACTION_CHOICES)
    changes = models.JSONField(blank=True, null=True, help_text="Changes")
    ip_address = models.GenericIPAddressField(
        blank=True, null=True, help_text="IP address"
    )

    # class Meta:
    #     indexes = [
    #         models.Index(
    #             fields=["object_id", "object_type", "user_type", "action", "-id"],
    #             name="object_based_idx",
    #         )
    #     ]


# -----
from django.urls import reverse
from django.utils.html import format_html


class HistoryLogAdmin(admin.ModelAdmin):
    list_select_related = (
        "school",
        "user_type",
        "object_type",
    )
    #
    list_display = (
        "id",
        "timestamp",
        "action",
        "content",
        "user",
        "school",
        "ip_address",
    )
    search_fields = [
        "school__name",
        "ip_address",
    ]

    @admin.display(description="User")
    def user(self, obj):
        return self.prepare_link(obj.user_type, obj.user_id)

    @admin.display(description="Content")
    def content(self, obj):
        return self.prepare_link(obj.object_type, obj.object_id)

    def prepare_link(self, type, iid):
        if type and iid:
            model_class = type.model_class()
            app_label = model_class._meta.app_label
            model_name = model_class._meta.model_name
            try:
                url = reverse(f"admin:{app_label}_{model_name}_change", args=[iid])
                return format_html('<a href="{}">{} #{}', url, model_name, iid)
            except Exception:
                return f"{model_name} #{iid}"
        return "-"
