from collections import defaultdict

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.constants.payment import TITLE_NAMES_KEY
from main.methods.classPostedMonths import classPostedMonths
from main.models.ClassInfo import ClassInfo
from main.models.Ledger import StudentLedger
from main.views.BaseViews import BaseSearchView
from ..fields import FOREIGN_CLASS_DETAILS_FIELDS, CHOICES_CLASS_DETAILS_FIELDS


from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response


class LedgerPostingSearchView(BaseSearchView):
    """
    POST: api/search/postings from ledger_posting.jsx

    Answers "which months has this class already been billed for?" — the month
    picker greys those out so the same period is never posted twice.

    A month is only OFF-LIMITS to the whole class when a CLASS-WIDE posting
    carries it. Every catch-up posted from one student's profile also writes a
    LedgerPosting against the class (`single_student=True`), and counting those
    blocked the month for all 50-odd classmates because one late-admitted pupil
    had been caught up on it — 329 class/year groups school-wide had months they
    could not post at all. Those months come back as per-student data instead
    (`include_student_months`), so the client can bill everyone else and leave
    out only the students who already hold the month.

    Per-student data is keyed by FEE TITLE, not by month alone. Schools post one
    title at a time — the same month billed again for a different title is a
    normal second charge, not a duplicate (164 of the last 400 class-wide
    postings did exactly that). Only the same title in the same month is one.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    RETURN_FIELDS = ("months",)

    def post(self, request):
        school_id = request.data.pop("school", None)
        academic_year_id = request.data.pop("academic_year", None)
        # Clients that can act on it ask for the per-student breakdown. Older
        # ones don't, and must keep receiving the bare list of months they
        # already parse — the shape of this response can't change under them.
        include_student_months = (
            request.data.pop("include_student_months", False) is True
        )
        if not school_id:
            return Response({"message": "Not authenticated!"})
        q = Q(school__id=school_id)
        q &= self.query(
            fields=FOREIGN_CLASS_DETAILS_FIELDS,
            data=request.data,
            fieldType="foreign",
            useNull=True,
        )
        q &= self.query(
            fields=CHOICES_CLASS_DETAILS_FIELDS,
            data=request.data,
            fieldType="choices",
            useNull=True,
        )
        # print(q)
        try:
            class_ids = list(ClassInfo.objects.filter(q).values_list("id", flat=True))
            if not class_ids:
                return Response(
                    {"months": [], "student_titles": {}}
                    if include_student_months
                    else [],
                    status=status.HTTP_200_OK,
                )
            class_months = classPostedMonths(class_ids, academic_year_id)
            if not include_student_months:
                return Response(sorted(class_months), status=status.HTTP_200_OK)
            # Which title each student of this class has already been billed
            # for, and for which months. Read off StudentLedger (not the
            # posting's class) so a student billed before a section change still
            # counts as billed. `details` holds one key per fee title.
            ledgers = StudentLedger.objects.filter(
                student__class_info__id__in=class_ids,
                is_active=True,
                ledger_posting__is_active=True,
            )
            if academic_year_id:
                ledgers = ledgers.filter(academic_year=academic_year_id)
            student_titles = defaultdict(lambda: defaultdict(set))
            for student_id, months, details in ledgers.values_list(
                "student__id", "ledger_posting__months", "details"
            ):
                if not months or not isinstance(details, dict):
                    # A month-less posting (old dues / opening balance) bills no
                    # period, so it can't make a month "already billed".
                    continue
                for title in details:
                    if title == TITLE_NAMES_KEY:
                        continue
                    student_titles[student_id][str(title)].update(months)
            return Response(
                {
                    "months": sorted(class_months),
                    "student_titles": {
                        student_id: {
                            title: sorted(months) for title, months in titles.items()
                        }
                        for student_id, titles in student_titles.items()
                    },
                },
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            # print(e)
            return Response({"message": "Not found!"})
