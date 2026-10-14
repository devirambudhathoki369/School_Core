"""Which ethnic group each student belongs to, class by class.

  GET /api/ethnic_group_report?school=<id>

Returns the students themselves, one row each, and the page counts them: the
number in a class's "Magar" cell is then by construction the length of the list
that opens from it. A count query and a list query written separately is how a
summary and its own detail come to disagree.

WHO IS COUNTED: exactly the students `ClasswiseStudentStatisticsView` counts
(running, not deleted, in a class that is not deleted), so this report's totals
and that report's totals are the same numbers.

`ethnicity` is the number the enrollment form saved (see `choices/Ethnicity.py`).
`null` means nobody has recorded one for that student, which is most students in
most schools: the page shows them as "Not recorded" rather than leaving them out,
because a report that silently drops nine students in ten reads as a school of a
few hundred. `0` is the form's own "Others" and is a recorded answer.
"""

from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.Student import Student


class EthnicGroupReportView(SecuredAPIView):
    # A report in the Reports menu, which a school can give to its staff: a
    # staff member who can open the page must be answered, not told
    # "Unauthorized".
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    RUNNING = 1

    def get(self, request):
        # The authenticator has already checked that this school is the
        # caller's own; it is read from the same parameter here.
        try:
            school_id = int(request.query_params.get("school"))
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST

        rows = Student.objects.filter(
            class_info__school=school_id,
            class_info__is_active=True,
            is_active=True,
            status=self.RUNNING,
        ).values_list(
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "class_info",
            "roll_no",
            "gender",
            "other_info__ethnicity",
            "guardian_info__father_name",
            "guardian_info__guardian_contact",
            "location",
        )
        students = [
            {
                "id": pk,
                # as entered: a name is not re-cased on its way to a report
                "name": " ".join(part for part in (first, middle, last) if part),
                "class_info": class_info,
                "roll_no": roll_no,
                "gender": gender,
                "ethnicity": ethnicity,
                "father_name": father_name,
                "guardian_contact": guardian_contact,
                "location": location,
            }
            for (
                pk, first, middle, last, class_info, roll_no, gender,
                ethnicity, father_name, guardian_contact, location,
            ) in rows
        ]
        return Response({"students": students})
