from rest_framework import serializers

#
from ..models.Notice import Notice


class NoticeSerializer(serializers.ModelSerializer):
    """
    `is_active` is READ-ONLY, and that is load-bearing now that this serializer
    accepts multipart.

    DRF's `BooleanField.get_value` treats HTML form input specially: a browser
    does not send an unchecked checkbox at all, so a *missing* boolean in form
    data resolves to `False` rather than falling back to the model default. The
    moment a notice was posted with a picture — that is, as multipart instead of
    JSON — it saved with `is_active = False` and vanished, because the list
    endpoint filters on `is_active=True`. It would have been pushed to every
    phone and then been impossible to open.

    Nothing needs to set it through here: publishing relies on the model default
    of `True`, and the soft-delete sets the field on the instance directly.
    """

    class Meta:
        model = Notice
        fields = "__all__"
        read_only_fields = ("is_active",)
