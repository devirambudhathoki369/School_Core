from django.db.models import Q
from django.contrib.postgres.aggregates import ArrayAgg

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination

#
from account.auth.Authentication import (
    StaffTokenAuthentication,
    AdminTokenAuthentication,
)

#
from main.views.BaseViews import SecuredAPIView
from ..models.Book import Book, BookCopy
from ..serializers.BookSerializers import BookEntrySerializer

BOOK_FIELDS = [
    "id",
    "title",
    "personal_author",
    "place_and_publisher",
    "isbn_no",
    "edition",
    "quantity",
    "price",
    "call_no",
]


class BookCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class BookEntryView(SecuredAPIView):
    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)

    @staticmethod
    def parse_accession_range(accession_from, accession_to):
        """
        (from, to) as ints, or None when either end is missing/not a number.
        A reversed range is accepted and read the way it was meant.
        """
        if not (accession_from and accession_to):
            return None
        try:
            start, end = int(accession_from), int(accession_to)
        except (TypeError, ValueError):
            return None
        return (start, end) if start <= end else (end, start)

    def get(self, request):
        school_id = request.query_params.get("school")
        library_id = request.query_params.get("library")
        id = request.query_params.get("id")
        title = request.query_params.get("title")
        search = (request.query_params.get("search") or "").strip()
        selected_books = request.query_params.getlist("selectedBooks[]")
        barcode = request.query_params.get("barcode")
        barcode = self.getBooleanValue(barcode)
        accession_from = request.query_params.get("accession_from")
        accession_to = request.query_params.get("accession_to")

        paginate = request.query_params.get("page") or request.query_params.get(
            "cursor"
        )  # if page and cursor params are not empty.

        if school_id:
            """Bar code print; returns BookCopy.id i.e. accession_no."""
            accession_range = self.parse_accession_range(accession_from, accession_to)
            if barcode and (selected_books or accession_range):
                bcq = Q(
                    book__school=school_id,
                    is_active=True,
                    is_lost=False,
                    is_damaged=False,
                )
                if selected_books:
                    bcq &= Q(book__in=selected_books)
                else:
                    # An accession number IS the BookCopy id, so a range is a
                    # plain id range. Ids are global across schools, so the
                    # school fence above is what keeps a wide range from
                    # spilling another library's copies into the sheet.
                    start, end = accession_range
                    bcq &= Q(id__gte=start, id__lte=end)
                bcqs = (
                    BookCopy.objects.filter(bcq)
                    .values("id", "book__title")
                    .order_by("id")
                )
                return Response(bcqs)

            """Single book (full record) — used to prefill the edit modal."""
            if id and self.getBooleanValue(request.query_params.get("full")):
                book = Book.objects.filter(
                    school=school_id, id=id, is_active=True
                ).first()
                if book:
                    return Response(BookEntrySerializer(book).data)
                return self.RESPONSE__INVALID_REQUEST

            """Book List"""
            q = Q(school=school_id, is_active=True)
            if library_id:
                q &= Q(library=library_id)
            if id:
                q &= Q(id=id)
            if title:
                q &= Q(title__icontains=title)
            if search:
                # One box for both: a number is looked up as an accession
                # number, anything else as a title. Resolved through a
                # subquery rather than a join on bookcopy — filtering the
                # multi-valued relation here would also shrink the
                # accession_nos aggregate below to just the matched copy.
                cond = Q(title__icontains=search)
                if search.isdigit():
                    cond |= Q(
                        id__in=BookCopy.objects.filter(
                            id=int(search), is_active=True
                        ).values("book_id")
                    )
                q &= cond

            # A Book is a title; its accession numbers live on its copies
            # (BookCopy.id IS the accession number). Ship them with the row so
            # the list can show which physical books a title covers.
            qs = Book.objects.filter(q).values(*BOOK_FIELDS).annotate(
                accession_nos=ArrayAgg(
                    "bookcopy__id",
                    filter=Q(bookcopy__is_active=True),
                    ordering="bookcopy__id",
                    default=None,
                )
            )
            if paginate:
                paginator = BookCursorPagination()
                books = paginator.paginate_queryset(qs, request)
                return paginator.get_paginated_response(books)
            else:
                return Response(qs)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = BookEntrySerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Book saved!"})
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        school_id = request.data.get("school")
        id = request.data.get("id")
        if id and school_id:
            book = Book.objects.filter(id=id, school=school_id).first()
            if book:
                s = BookEntrySerializer(instance=book, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Book updated!"})
        return self.RESPONSE__INVALID_REQUEST
