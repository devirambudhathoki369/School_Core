import re

from django.db.models import Q, Value
from django.db.models.fields.json import KeyTextTransform
from django.db.models.functions import Replace, Substr

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    StaffTokenAuthentication,
    AdminTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.FiscalYears import AcademicYear
from ...models.exams.Certificate import CharacterCertificate

# A BS date the way the database holds it. Compared as TEXT, which sorts the
# same as the calendar for this zero-padded form — and, unlike parsing, does
# not choke on a year whose last day is written 32.
BS_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CharacterCertificateSearchView(SecuredAPIView):
    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)

    student_name_field = "name"
    guardian_name_field = "guardian_name"
    birth_date_field = "birth_date"
    issue_date_field = "issue_date"

    def yearDates(self, academic_year_id):
        """The first and last day of an academic year, or (None, None).

        The year is OPTIONAL: a certificate is looked up by the student's name
        years after it was issued, so the search covers every year unless one
        is asked for.
        """
        try:
            academic_year_id = int(academic_year_id)
        except (TypeError, ValueError):
            return None, None
        ay = (
            AcademicYear.objects.filter(id=academic_year_id)
            .values("start_date", "end_date")
            .first()
        )
        if not ay:
            return None, None
        start_date, end_date = str(ay["start_date"] or ""), str(ay["end_date"] or "")
        if BS_DATE.match(start_date) and BS_DATE.match(end_date):
            return start_date, end_date
        return None, None

    def post(self, request):
        school_id = request.data.get("school")
        if school_id:
            start_date, end_date = self.yearDates(request.data.get("academic_year"))
            student_name = str(request.data.get("student_name") or "").strip()
            guardian_name = str(request.data.get("guardian_name") or "").strip()
            birth_date = str(request.data.get("birth_date") or "").strip()
            issue_date = str(request.data.get("issue_date") or "").strip()
            #
            q = Q(school=school_id, is_active=True)
            if start_date and end_date:
                # `issue_date` lives inside the JSON and is typed by hand: most
                # read 2083-06-20, some "2083-06-20 B.S.", a few 2083/06/20.
                # The first ten characters are the date either way, once the
                # slashes are dashes. Handing the JSON lookup date OBJECTS
                # instead is what made every search answer 500 — they cannot
                # be written into a JSON comparison.
                q &= Q(issued__range=[start_date, end_date])
            if issue_date:
                q &= Q(data__issue_date__icontains=issue_date)
            if student_name:
                q &= Q(data__name__icontains=student_name)
            if guardian_name:
                q &= Q(data__guardian_name__icontains=guardian_name)
            if birth_date:
                q &= Q(data__birth_date=birth_date)
            certificates = (
                CharacterCertificate.objects.annotate(
                    issued=Replace(
                        Substr(KeyTextTransform("issue_date", "data"), 1, 10),
                        Value("/"),
                        Value("-"),
                    )
                )
                .filter(q)
                .order_by("-id")
                .values("serial_no", "data")
            )
            certificates = [
                {"serial_no": cert.get("serial_no"), **(cert.get("data") or {})}
                for cert in certificates
            ]
            return Response(certificates)
        return self.RESPONSE__INVALID_REQUEST
