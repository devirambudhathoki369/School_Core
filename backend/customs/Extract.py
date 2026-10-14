from django.db.models import Func, IntegerField


class ExtractYear(Func):
    function = "SPLIT_PART"
    template = "%(function)s(%(expressions)s, '-', 1)::INTEGER"
    output_field = IntegerField()

    def __init__(self, expression, **extra):
        super().__init__(expression, **extra)


class ExtractMonth(Func):
    function = "SPLIT_PART"
    template = "%(function)s(%(expressions)s, '-', 2)::INTEGER"
    output_field = IntegerField()

    def __init__(self, expression, **extra):
        super().__init__(expression, **extra)


class ExtractDay(Func):
    function = "SPLIT_PART"
    template = "%(function)s(%(expressions)s, '-', 3)::INTEGER"
    output_field = IntegerField()

    def __init__(self, expression, **extra):
        super().__init__(expression, **extra)
