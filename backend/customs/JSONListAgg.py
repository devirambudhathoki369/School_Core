from django.db.models import Func, JSONField


class JSONListAgg(Func):
    function = "jsonb_agg"
    template = "%(function)s(%(expressions)s)"
    output_field = JSONField()
