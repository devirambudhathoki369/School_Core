from django.db.models import (
    DecimalField,
    OuterRef,
    Value,
    CharField,
    F,
    Q,
)
from django.db.models.functions import Coalesce, Concat

#
from .genClassname import getClassDetails
from ..models.Student import Student, StudentTransportationInfo
from ..models.Ledger import StudentLedger
from ..constants.payment import OPENING_BALANCE
from .hostelRates import schoolUsesHostel, studentHostelRates


def transportation_query(
    school_id,
    include_station_name=True,
    include_fee=False,
    include_start_date=False,
    station_id=None,
):
    """
    use, \\
    subquery = transportation_query(int, bool, bool, bool) \\
    ModelQuery.annotate(
        station_name=Coalese(subquery.values("bus_station__station"), Value("")),
        transportation_rate=Coalese(subquery.values("bus_station__fee"), Value(0)),
        start_date=Coalese(subquery.values("start_date"), Value("")), 
    )
    * depending on include_start_date return values are optional.
    """
    STI_FIELDS = tuple()
    if include_station_name:
        STI_FIELDS += ("bus_station__station",)
    if include_fee:
        STI_FIELDS += ("bus_station__fee",)
    if include_start_date:
        STI_FIELDS += ("start_date",)
    q = Q(school=school_id, student=OuterRef("pk"), is_active=True)
    if station_id:
        q &= Q(bus_station=station_id)
    return StudentTransportationInfo.objects.filter(q).values(*STI_FIELDS)[:1]


def getStudentDetailForInvoice(
    studentId, schoolId, academic_year_id=None, want_hostel=None
):
    """
    This method extracts specific details of a student which are shown in a payment bill.
    returns [student-name, guardian-name, class-info: [class-name, class-details], transportation-fee].

    When `academic_year_id` is provided (e.g. when reprinting a bill from a
    previous AY), the class is resolved from the student's LedgerPosting
    snapshot in that AY rather than from `Student.class_info` (which is the
    current/post-promotion class). Opening-balance rows are skipped because
    they carry the prior AY's class_info.
    """
    invalid_response = ["", "", "", 0]
    if not studentId:
        return invalid_response
    std = (
        Student.objects.filter(id=studentId, class_info__school=schoolId)
        .values(
            "id",
            "class_info",
        )
        .annotate(
            name=Concat(
                "first_name",
                Value(" "),
                "middle_name",
                Value(" "),
                "last_name",
                output_field=CharField(),
            ),
            guardian_name=Coalesce(
                F("guardian_info__guardian_name"),
                F("guardian_info__father_name"),
                F("guardian_info__mother_name"),
                default=Value(""),
                output_field=CharField(),
            ),
            transportation_fee=Coalesce(
                transportation_query(schoolId, False, True).values("bus_station__fee"),
                Value(0),
                output_field=DecimalField(),
            ),
        )
        .first()
    )
    # The RATE column on a printed receipt. A per-student service has no rate in
    # the class fee table, so without this the hostel line prints its amount
    # against a blank (or zero) rate — which is exactly the kind of receipt a
    # guardian brings back to the counter to query.
    # The hostel rate is looked up EXACTLY when the document being produced
    # needs it. `want_hostel` is passed by the receipt generator, which knows
    # whether this particular invoice has a hostel line on it — so a school
    # without the module never pays a query, and a school that HAS one always
    # gets the rate even for a resident who has since checked out.
    #
    # When the caller does not say (other call sites), fall back to the cached
    # module flag rather than querying blindly.
    if want_hostel is None:
        want_hostel = schoolUsesHostel(schoolId)
    hostel_rates = (
        (studentHostelRates(studentId, schoolId) or {}) if want_hostel else None
    )
    # print(std)
    class_info_id = std.get("class_info")
    if academic_year_id:
        historical_class_id = (
            StudentLedger.objects.filter(
                student=studentId,
                school=schoolId,
                academic_year=academic_year_id,
                is_active=True,
                ledger_posting__is_active=True,
            )
            .exclude(details__has_key=OPENING_BALANCE)
            .order_by("-id")
            .values_list("ledger_posting__class_info", flat=True)
            .first()
        )
        if historical_class_id:
            class_info_id = historical_class_id
    className, class_details = getClassDetails(class_info_id)
    return [
        std.get("name"),
        std.get("guardian_name"),
        [className, class_details],  # class_info
        std.get("transportation_fee"),
        hostel_rates,
    ]
