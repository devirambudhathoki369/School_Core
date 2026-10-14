from django.db.models import CharField
import nepali_datetime
from django.core.exceptions import ValidationError


class NepaliDateField(CharField):
    def __init__(self, *args, **kwargs):
        # Set the default maximum length for the date string
        kwargs.setdefault("max_length", 10)  # Typical length for a YYYY-MM-DD format
        super().__init__(db_collation=None, *args, **kwargs)

    def from_db_value(self, value, expression, connection):
        # Convert the value from the database to a nepali_datetime.date object
        return value

    def to_python(self, value):
        # Convert the value to a nepali_datetime.date object
        if (
            isinstance(value, nepali_datetime.date)
            or value is None
            or isinstance(value, int)
        ):
            return value
        try:
            year, month, day = map(int, value.split("-"))
            return nepali_datetime.date(year, month, day)
        except ValueError as e:
            raise ValidationError(f'"{value}" is not a valid Nepali date: {e}')
        except TypeError:
            raise ValidationError(f'"{value}" must be a string in YYYY-MM-DD format.')

    def _empty_value(self):
        # store NULL for nullable date columns, "" otherwise (column is NOT NULL)
        return None if self.null else ""

    def get_prep_value(self, value):
        # Prepare the value for saving to the database
        if value is None:
            return value
        # Treat a blank/empty value as "no date" instead of raising. An optional
        # date can then be left empty or cleared without a 500 (e.g. bulk updates
        # writing birth_date across students where some have no DOB stored).
        if isinstance(value, str) and value.strip() == "":
            return self._empty_value()
        if isinstance(value, nepali_datetime.date):
            return value.strftime("%Y-%m-%d")
        value = self.to_python(value)
        return value.strftime("%Y-%m-%d") if value else self._empty_value()

    def value_to_string(self, obj):
        value = self.value_from_object(obj)
        if isinstance(value, nepali_datetime.date):
            return value.strftime("%Y-%m-%d")
        return value if value is not None else ""


# -------
from django import forms


class NepaliDateInput(forms.TextInput):
    input_type = "date"

    def format_value(self, value):
        # Convert the Nepali date to string format for the input field
        if isinstance(value, nepali_datetime.date):
            return value.strftime("%Y-%m-%d")
        return value


class NepaliDateFormField(forms.CharField):
    def to_python(self, value):
        if value in self.empty_values:
            return None
        try:
            year, month, day = map(int, value.split("-"))
            return nepali_datetime.date(year, month, day)
        except ValueError:
            raise forms.ValidationError("Invalid date format, must be YYYY-MM-DD.")

    def widget_attrs(self, widget):
        attrs = super().widget_attrs(widget)
        attrs.update({"pattern": r"\d{4}-\d{2}-\d{2}"})
        return attrs
