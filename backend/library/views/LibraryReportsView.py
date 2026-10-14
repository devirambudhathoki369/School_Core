from django.db.models import (
    Case,
    When,
    Value,
    CharField,
    IntegerField,
    F,
    Q,
    Count,
    Sum,
)
from django.db.models.functions import Coalesce

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from main.methods.nameConcat import nameConcat
from main.methods.nepaliDatetime import ndt_today

#
from ..models.Book import Book, BookCopy, BookIssue


def _borrower_annotation():
    return Case(
        When(student__isnull=False, then=nameConcat("student")),
        When(staff__isnull=False, then=nameConcat("staff")),
        default=Value(""),
        output_field=CharField(),
    )


def _borrower_school_annotation(school_id):
    """
    Name of the borrower's own school, blank for this school's own members.

    A library may serve guest schools' students, so the reports have to say who
    a borrower belongs to — but only where it isn't obvious.
    """
    return Case(
        When(student__class_info__school=school_id, then=Value("")),
        When(
            student__isnull=False,
            then=F("student__class_info__school__name"),
        ),
        default=Value(""),
        output_field=CharField(),
    )


class LibraryReportsView(SecuredAPIView):
    """
    Unified library reporting endpoint.

    GET /library/reports?report=<kind>&school=<id>&...
      kinds: daily, issued-by-students, issued-by-teachers, issued-returned-count,
             overall, book-operation, fine, member-profile
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    # reports cover guest schools' borrowers too (see guest_school_ids)
    allow_other_school_people = True

    def get(self, request):
        school_id = request.query_params.get("school")
        report = request.query_params.get("report")
        if not school_id or not report:
            return self.RESPONSE__INVALID_REQUEST

        handler = {
            "daily": self.daily_report,
            "issued-by-students": self.issued_by_students,
            "issued-by-teachers": self.issued_by_teachers,
            "issued-returned-count": self.issued_returned_count,
            "overall": self.overall_report,
            "book-operation": self.book_operation_report,
            "fine": self.fine_report,
            "member-profile": self.member_profile,
        }.get(report)

        if not handler:
            return self.RESPONSE__INVALID_REQUEST
        return handler(request, school_id)

    # ----- helpers -------------------------------------------------------
    def _date_range(self, request):
        start = request.query_params.get("start")
        end = request.query_params.get("end")
        return start, end

    # ----- reports -------------------------------------------------------
    def daily_report(self, request, school_id):
        """All issue/return activity on a single day."""
        date = request.query_params.get("date") or ndt_today()
        base = BookIssue.objects.filter(school=school_id, is_active=True).annotate(
            accession_no=F("book_id"),
            book_name=F("book__book__title"),
            borrower=_borrower_annotation(),
            borrower_school=_borrower_school_annotation(school_id),
        )
        issued = (
            base.filter(issued_date=date)
            .annotate(action=Value("Issued", output_field=CharField()), date=F("issued_date"))
        )
        returned = (
            base.filter(returned_date=date)
            .annotate(action=Value("Returned", output_field=CharField()), date=F("returned_date"))
        )
        fields = [
            "action", "accession_no", "book_name", "borrower", "borrower_school",
            "date", "fine_amount",
        ]
        rows = list(issued.values(*fields)) + list(returned.values(*fields))
        return Response({"date": date, "rows": rows})

    def _outstanding_issues(self, school_id):
        return (
            BookIssue.objects.filter(
                school=school_id, is_active=True, returned_date__isnull=True
            )
            .annotate(
                accession_no=F("book_id"),
                book_name=F("book__book__title"),
                borrower=_borrower_annotation(),
                borrower_school=_borrower_school_annotation(school_id),
            )
            .order_by("-id")
        )

    def issued_by_students(self, request, school_id):
        qs = (
            self._outstanding_issues(school_id)
            .filter(student__isnull=False)
            .annotate(classname=F("student__class_info__name"))
            .values(
                "accession_no", "book_name", "borrower", "classname",
                "borrower_school", "issued_date", "due_date",
            )
        )
        return Response(list(qs))

    def issued_by_teachers(self, request, school_id):
        qs = (
            self._outstanding_issues(school_id)
            .filter(staff__isnull=False)
            .values("accession_no", "book_name", "borrower", "issued_date", "due_date")
        )
        return Response(list(qs))

    def issued_returned_count(self, request, school_id):
        start, end = self._date_range(request)
        q = Q(school=school_id, is_active=True)
        issued_q = Q(q)
        returned_q = Q(q, returned_date__isnull=False)
        if start and end:
            issued_q &= Q(issued_date__range=[start, end])
            returned_q &= Q(returned_date__range=[start, end])
        issued = BookIssue.objects.filter(issued_q).count()
        returned = BookIssue.objects.filter(returned_q).count()
        outstanding = BookIssue.objects.filter(
            q, returned_date__isnull=True
        ).count()
        rows = [
            {"metric": "Issued", "value": issued},
            {"metric": "Returned", "value": returned},
            {"metric": "Outstanding (not yet returned)", "value": outstanding},
        ]
        return Response(rows)

    def overall_report(self, request, school_id):
        titles = Book.objects.filter(school=school_id, is_active=True).count()
        copies = BookCopy.objects.filter(
            book__school=school_id, is_active=True
        )
        total_copies = copies.count()
        lost = copies.filter(is_lost=True).count()
        damaged = copies.filter(is_damaged=True).count()
        issued_out = BookIssue.objects.filter(
            school=school_id, is_active=True, returned_date__isnull=True
        ).count()
        available = total_copies - lost - damaged - issued_out
        rows = [
            {"metric": "Book titles", "value": titles},
            {"metric": "Total copies", "value": total_copies},
            {"metric": "Available", "value": max(0, available)},
            {"metric": "Issued out", "value": issued_out},
            {"metric": "Lost", "value": lost},
            {"metric": "Damaged", "value": damaged},
        ]
        return Response(rows)

    def book_operation_report(self, request, school_id):
        """Per-title issue / return / currently-out counts."""
        start, end = self._date_range(request)
        issue_filter = Q()
        if start and end:
            issue_filter = Q(bookcopy__bookissue__issued_date__range=[start, end])
        qs = (
            Book.objects.filter(school=school_id, is_active=True)
            .annotate(
                issued_count=Count(
                    "bookcopy__bookissue",
                    filter=issue_filter & Q(bookcopy__bookissue__is_active=True),
                ),
                returned_count=Count(
                    "bookcopy__bookissue",
                    filter=Q(bookcopy__bookissue__returned_date__isnull=False)
                    & Q(bookcopy__bookissue__is_active=True),
                ),
                out_count=Count(
                    "bookcopy__bookissue",
                    filter=Q(bookcopy__bookissue__returned_date__isnull=True)
                    & Q(bookcopy__bookissue__is_active=True),
                ),
            )
            .filter(issued_count__gt=0)
            .values("title", "personal_author", "issued_count", "returned_count", "out_count")
            .order_by("-issued_count")
        )
        return Response(list(qs))

    def fine_report(self, request, school_id):
        start, end = self._date_range(request)
        q = Q(school=school_id, is_active=True, fine_amount__gt=0)
        if start and end:
            q &= Q(returned_date__range=[start, end])
        qs = (
            BookIssue.objects.filter(q)
            .annotate(
                accession_no=F("book_id"),
                book_name=F("book__book__title"),
                borrower=_borrower_annotation(),
                classname=F("student__class_info__name"),
                borrower_school=_borrower_school_annotation(school_id),
            )
            .values(
                "accession_no", "book_name", "borrower", "classname",
                "borrower_school", "returned_date", "fine_amount",
            )
            .order_by("-returned_date")
        )
        rows = list(qs)
        total = sum(r["fine_amount"] or 0 for r in rows)
        return Response({"rows": rows, "total": total})

    def member_profile(self, request, school_id):
        """Full library history for a student or staff member."""
        student_id = request.query_params.get("student")
        staff_id = request.query_params.get("staff")
        if not (student_id or staff_id):
            return self.RESPONSE__INVALID_REQUEST

        q = Q(school=school_id, is_active=True)
        if student_id:
            q &= Q(student=student_id)
        else:
            q &= Q(staff=staff_id)

        qs = (
            BookIssue.objects.filter(q)
            .annotate(
                accession_no=F("book_id"),
                book_name=F("book__book__title"),
            )
            .order_by("-id")
        )
        history = list(
            qs.values(
                "accession_no", "book_name", "issued_date", "due_date",
                "returned_date", "fine_amount",
            )
        )
        held = [r for r in history if not r["returned_date"]]
        totals = qs.aggregate(
            total_fine=Coalesce(Sum("fine_amount"), Value(0)),
            total_issued=Count("id"),
        )
        return Response(
            {
                "held": held,
                "history": history,
                "total_fine": totals["total_fine"],
                "total_issued": totals["total_issued"],
                "currently_held": len(held),
            }
        )
