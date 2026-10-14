from django.db import transaction

#
from rest_framework import serializers

#
from ..models.FiscalYears import (
    FiscalYear,
    EconomicYear,
    AcademicYear,
    AcademicYearMapping,
)
from ..views.closing.AcademicYearCloseView import AcademicYearClassSearchMixin
from ..methods.nepaliDatetime import resolve_fiscal_year_end


def normalize_year_name(name):
    """Case- and whitespace-insensitive form of a year name.

    `SCHOOL 2083`, `School 2083` and `School  2083` are the same year to
    everyone except the database, which is how schools ended up with twin rows
    holding one real dataset between them.
    """
    return " ".join(str(name or "").split()).casefold()


class DuplicateYearNameMixin:
    """Refuse a second year with the same name for the same school.

    Checked in Python rather than as a DB constraint because the comparison is
    normalized (see above) and a school has a handful of years, not thousands.
    Only ACTIVE rows count — retiring a duplicate is `is_active=False`, and a
    retired name has to be reusable.

    Applies to the create endpoints only. The year-CLOSING flow builds its next
    year directly on the model, deliberately: a close must never be blocked by
    a name clash mid-transaction, with the balances already moved.
    """

    YearModel = None
    # EconomicYear is nationwide and has no `school` column; the per-school
    # years scope the check to their own school.
    scoped_by_school = True

    def getExistingYears(self, school):
        years = self.YearModel.objects.filter(is_active=True)
        if self.scoped_by_school:
            years = years.filter(school=school)
        return years

    def validate(self, attrs):
        attrs = super().validate(attrs)
        school = attrs.get("school")
        name = attrs.get("name")
        start_date, end_date = attrs.get("start_date"), attrs.get("end_date")
        #
        if self.instance is None and name and (school or not self.scoped_by_school):
            wanted = normalize_year_name(name)
            existing = self.getExistingYears(school)
            clash = next(
                (
                    row
                    for row in existing.values_list("name", flat=True)
                    if normalize_year_name(row) == wanted
                ),
                None,
            )
            if clash is not None:
                where = "for this school" if self.scoped_by_school else "already"
                raise serializers.ValidationError(
                    {
                        "name": f"'{clash}' exists {where}. "
                        "Use the existing year, or rename this one."
                    }
                )
        # BS dates are zero-padded YYYY-MM-DD strings, so a plain string compare
        # is chronological.
        if start_date and end_date and str(end_date) <= str(start_date):
            raise serializers.ValidationError(
                {"end_date": "End date must come after the start date."}
            )
        # Ashad is 31 days in some BS years and 32 in others, and a year typed
        # a day short silently drops its own last day out of every report that
        # ranges over the year. Correct it rather than reject it: the form has
        # no way to know, and the right answer is a calendar lookup.
        if start_date and end_date:
            attrs["end_date"] = resolve_fiscal_year_end(start_date, end_date)
        return attrs


class FiscalYearSerializer(serializers.ModelSerializer):
    remarks = serializers.CharField(required=False)

    class Meta:
        model = FiscalYear
        fields = "__all__"


class EconomicYearSerializer(DuplicateYearNameMixin, FiscalYearSerializer):
    YearModel = EconomicYear
    scoped_by_school = False

    class Meta:
        model = EconomicYear
        fields = "__all__"


class AcademicYearSerializer(DuplicateYearNameMixin, FiscalYearSerializer):
    start_date = serializers.CharField(help_text="Start Date (B.S) Format YYYY-MM-DD")
    end_date = serializers.CharField(help_text="End Date (B.S) Format YYYY-MM-DD")
    is_active = serializers.BooleanField(default=True, required=False)
    closed = serializers.BooleanField(default=False, required=False)
    YearModel = AcademicYear

    class Meta:
        model = AcademicYear
        fields = "__all__"


class AcademicYearMappingSerializer(
    serializers.ModelSerializer, AcademicYearClassSearchMixin
):
    previous_academic_year = serializers.IntegerField(required=False)
    classes_key_details = serializers.ListField(required=False)

    def create(self, validated_data):
        with transaction.atomic():
            classes_key_details = validated_data.pop("classes_key_details", None)
            if classes_key_details:
                instance = super().create(validated_data)
                school_id = instance.school.id
                academic_year_id = instance.academic_year.id
                self.updateClassInfoAcademicYear(
                    school_id, classes_key_details, academic_year_id
                )
                return instance

    def update(self, instance, validated_data):
        with transaction.atomic():
            classes_key_details = validated_data.pop("classes_key_details", None)
            if classes_key_details:
                instance = super().update(instance, validated_data)
                school_id = instance.school.id
                academic_year_id = instance.academic_year.id
                self.updateClassInfoAcademicYear(
                    school_id, classes_key_details, academic_year_id
                )
                return instance

    def updateClassInfoAcademicYear(
        self, school_id: int, classes_key_details: list, academic_year_id: int
    ):
        _, classes_query = self.handleKeyDetails(classes_key_details)
        classes = self.getClasses(school_id, classes_query)
        classes.update(academic_year=academic_year_id)

    class Meta:
        model = AcademicYearMapping
        fields = "__all__"


# DOCS
class AcademicYearParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    class_info = serializers.IntegerField(required=False)
    closed = serializers.BooleanField(
        default=False, required=False, help_text="Closed academic years"
    )
