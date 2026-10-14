from django.db.models import Func
from django.contrib.postgres.fields import JSONField


class JSONBuildObject(Func):
    function = "JSONB_BUILD_OBJECT"
    output_field = JSONField()
