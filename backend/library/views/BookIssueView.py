from django.db.models import Case, When, Value, CharField, F, Q

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework import status
from rest_framework.exceptions import ValidationError

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from main.methods.nameConcat import nameConcat

#
from ..models.Book import BookIssue
from ..serializers.BookSerializers import BookIssueSerializer, BookIssueReturnSerializer

ACTION_RENEW = "renew"
ACTION_RETURN = "return"


class BookIssueCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class BookIssueView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    # borrowers may be a guest school's students/staff (see guest_school_ids)
    allow_other_school_people = True

    def get(self, request):
        school_id = request.query_params.get("school")
        student_id = request.query_params.get("student")
        staff_id = request.query_params.get("staff")
        returned = request.query_params.get("returned")
        issue_date_start = request.query_params.get("issue_date_start")
        issue_date_end = request.query_params.get("issue_date_end")
        return_date_start = request.query_params.get("return_date_start")
        return_date_end = request.query_params.get("return_date_end")
        include_borrower = not (
            student_id or staff_id
        )  # available in all report except in user's profile.
        paginate = request.query_params.get("page") or request.query_params.get(
            "cursor"
        )  # if page and cursor params are not empty.

        if school_id:
            RETURN_FIELDS = [
                "id",
                "accession_no",
                "issued_date",
                "due_date",
                "accession_no",
                "book_name",
                "price",
                "fine_amount",
            ]

            query = Q(school=school_id, is_active=True)
            if student_id:
                query &= Q(student=student_id)
            elif staff_id:
                query &= Q(staff=staff_id)

            if issue_date_start and issue_date_end:
                query &= Q(issued_date__range=[issue_date_start, issue_date_end])
            if return_date_start and return_date_end:
                query &= Q(returned_date__range=[return_date_start, return_date_end])
                returned = True

            if returned:
                query &= Q(returned_date__isnull=False)
                RETURN_FIELDS.append("returned_date")
            else:
                query &= Q(returned_date__isnull=True)

            #
            qs = (
                BookIssue.objects.filter(query)
                .annotate(
                    accession_no=F("book_id"),
                    book_name=F("book__book__title"),
                    price=F("book__book__price"),
                )
                .order_by("-id")
            )
            if include_borrower:
                qs = qs.annotate(
                    class_info=F("student__class_info"),
                    borrower=Case(
                        When(student__isnull=False, then=nameConcat("student")),
                        When(staff__isnull=False, then=nameConcat("staff")),
                        default=Value(""),
                        output_field=CharField(),
                    ),
                )
                RETURN_FIELDS.extend(["class_info", "borrower"])

            qs = qs.values(*RETURN_FIELDS)
            if paginate:
                paginator = BookIssueCursorPagination()
                data = paginator.paginate_queryset(qs, request)
                return paginator.get_paginated_response(data)
            else:
                return Response(qs)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = BookIssueSerializer(data=request.data)

        if s.is_valid():
            try:
                s.save()
                return Response({"message": "Book Issued!"})
            except ValidationError as e:
                error_msg = e.detail
        else:
            error_msg = self.getSerializationError(s)

        return Response({"message": error_msg}, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request):
        action = request.data.get("action")
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            new_due_date = request.data.get("due_date")
            q = Q(id=id, school=school_id)
            if action == ACTION_RENEW and new_due_date:
                item = BookIssue.objects.filter(q).first()
                if item:
                    # A renewal EXTENDS a loan. Saving one that does not move the
                    # return date forward bumped updated_at, changed nothing, and
                    # still answered "Book Issue renewed!" — so the librarian was
                    # told it worked while the list kept showing the old date.
                    # BS dates are zero-padded YYYY-MM-DD, so string order is
                    # date order.
                    if item.due_date and new_due_date <= item.due_date:
                        return Response(
                            {
                                "message": "New return date must be after the "
                                f"current return date ({item.due_date})!"
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    s = BookIssueSerializer(
                        instance=item, data=request.data, partial=True
                    )
                    if s.is_valid():
                        s.save()
                        # Echo the stored date so the client shows what was
                        # actually saved rather than what it hoped it sent.
                        return Response(
                            {
                                "message": "Book Issue renewed!",
                                "due_date": s.instance.due_date,
                            }
                        )
            elif action == ACTION_RETURN:
                item = (
                    BookIssue.objects.select_related(
                        "book__book",
                        "book__book__library",
                        "student",
                    )
                    .only(
                        "id",
                        "school_id",
                        "due_date",
                        "student__class_info_id",
                        "book__book",
                        "book__book__price",
                        "book__book__library__preferences",
                    )
                    .filter(q)
                    .first()
                )
                if item:
                    s = BookIssueReturnSerializer(
                        instance=item, data=request.data, partial=True
                    )
                    if s.is_valid():
                        s.save()
                        return Response({"message": "Book Issue returned!"})
        return self.RESPONSE__INVALID_REQUEST
