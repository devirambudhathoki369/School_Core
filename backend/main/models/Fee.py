from django.db.models import (
    DecimalField,
    JSONField,
    ForeignKey,
    CASCADE,
    Case,
    When,
    Value,
    IntegerField,
    BooleanField,
    Q,
)

#
from .BaseModel import BaseModel, CustomCharField
from ..views.fields import CLASS_DETAILS_FIELDS


class FeeTitle(BaseModel):
    title = CustomCharField(min_length=2, max_length=30)
    months = JSONField(default=list)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    isCashReceipt = BooleanField(default=False)

    def __str__(self) -> str:
        return f"Fee title : {self.title}"


class Fee(BaseModel):
    title = ForeignKey("main.FeeTitle", on_delete=CASCADE)
    fee = DecimalField(max_digits=10, decimal_places=2)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    # The months THIS class pays the title in, overriding FeeTitle.months.
    #
    # A fee title is one school-wide thing ("monthly fee", "admission fee") and
    # every report groups money by it, so the title itself must stay one row per
    # school. WHEN it is payable is not school-wide though: classes are admitted
    # in different months (one intake in Baishakh, the next in Shrawan), and a
    # title billed in a month a class has not started in is a wrong charge.
    #
    # NULL (and an empty list) means "follow the title" — which is every row
    # that existed before this field, so billing is unchanged until a school
    # sets an override. A class that should not be billed a title at all has no
    # Fee row for it; that is what an absent row means, and it is why an empty
    # list is read as "inherit" rather than "never" (an accidentally cleared
    # month picker must not silently stop a class's billing).
    months = JSONField(null=True, blank=True, default=None)

    class Meta:
        unique_together = ("class_info_id", "title_id")

    def __str__(self) -> str:
        return f"{self.title.title} > {self.fee}"


# -- PRIORITIES --
# if fee.class-info.section is same as SECTION;
P_SAME_SECTION_FEE = 1
# if fee.class-info.section is not same as SECTION, filter out these;
P_ANOTHER_SECTION_FEE = 2
# default;
P_DEFAULT = -1
class_info_fields = (*CLASS_DETAILS_FIELDS, "school")


# The field every billing caller asks payable months by. It reads as the
# TITLE's months and mostly is; where the class overrides them, this is the
# class's own list. One name so no caller has to know which of the two answered.
TITLE_MONTHS_FIELD = "title__months"
OWN_MONTHS_FIELD = "months"


def feeq(class_details, section, RETURN_FIELDS, TITLE_IDS=[]):
    """
    Must remove section from CLASS_DETAILS before passing it here!
    returns all fees except those from different section having same class/grade.

    Asking for ``title__months`` returns the EFFECTIVE months: the class's own
    ``Fee.months`` when it has them, the title's list otherwise. Callers are
    unchanged and cannot get the raw title list by accident — which is the
    point, since billing must read one answer.
    """
    class_details = {
        f"class_info__{key}": value
        for key, value in class_details.items()
        if key in class_info_fields
    }
    #
    query = Q(
        **class_details,
        is_active=True,
        priority__in=[P_SAME_SECTION_FEE, P_DEFAULT],
    )
    if TITLE_IDS:
        query &= Q(title__id__in=TITLE_IDS)
    #
    # Ask the DB for the class's own months alongside the title's whenever a
    # caller wants months, then resolve in Python: `Coalesce` over two jsonb
    # columns cannot tell NULL from `[]`, and `[]` has to mean "inherit" too.
    fields = tuple(RETURN_FIELDS)
    wants_months = TITLE_MONTHS_FIELD in fields
    added_own = wants_months and OWN_MONTHS_FIELD not in fields
    if added_own:
        fields += (OWN_MONTHS_FIELD,)
    #
    rows = (
        Fee.objects.annotate(
            priority=Case(
                When(class_info__section=section, then=Value(P_SAME_SECTION_FEE)),
                When(
                    ~Q(class_info__section=section) & ~Q(class_info__section=None),
                    then=Value(P_ANOTHER_SECTION_FEE),
                ),
                default=Value(P_DEFAULT),
                output_field=IntegerField(),
            )
        )
        .filter(query)
        .order_by("title__id", "priority")
        .distinct("title__id")
        .values(*fields)
        # , "class_info", "priority"
    )
    if not wants_months:
        return rows
    resolved = []
    for row in rows:
        own = row.pop(OWN_MONTHS_FIELD) if added_own else row.get(OWN_MONTHS_FIELD)
        if own:
            row[TITLE_MONTHS_FIELD] = own
        resolved.append(row)
    return resolved
