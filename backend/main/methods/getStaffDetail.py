from django.db.models import (
    Value,
    CharField,
    F,
)
from django.db.models.functions import Concat, Lower

#
from ..models.Staff import Staff


def getStaffDetailForInvoice(staffId, schoolId):
    """
    This method extracts specific details of a staff which are shown in a payment bill.
    returns [staff-name].
    """
    invalid_response = [""]
    if not staffId:
        return invalid_response
    staff = (
        Staff.objects.filter(id=staffId, school=schoolId)
        .annotate(
            name=Lower(
                Concat(
                    "first_name",
                    Value(" "),
                    "middle_name",
                    Value(" "),
                    "last_name",
                    output_field=CharField(),
                )
            ),
            designation=F("role__role"),
        )
        .values("name", "designation")
        .first()
    )
    return [staff.get("name"), staff.get("designation")]
