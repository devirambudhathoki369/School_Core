from django.db.models import Q, F, Exists, OuterRef

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    StaffTokenAuthentication,
    AdminTokenAuthentication,
)

#
from main.views.BaseViews import SecuredAPIView
from .BaseViews import SharedLibraryMixin
from ..models.Book import BookCopy, BookIssue


BOOK_SEARCH_FIELDS = [
    "id",  # accession_no
    #
    "b_id",
    "b_title",
    "b_isbn",
    "b_edition",
]


class BookCopySearchView(SecuredAPIView, SharedLibraryMixin):
    """
    Actual physical books search for issue!
    """

    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        library_id = request.data.get("library")
        accession_no = request.data.get("accession_no")
        title = request.data.get("title")

        if school_id and library_id:
            q = Q(is_active=True)
            sharedLibQ = self.sharedLibraryQ(school_id)
            qBL = Q(book__library=library_id)
            if sharedLibQ:
                q &= qBL
            else:
                q &= Q(book__school=school_id) & qBL
            q &= Q(is_lost=False, is_damaged=False)
            if accession_no:
                q &= Q(id=accession_no)
            elif title:
                q &= Q(book__title__icontains=title)

            currently_issued = BookIssue.objects.filter(
                book=OuterRef("pk"),
                returned_date__isnull=True,
                is_active=True,
            )  # is currently issued?

            books = BookCopy.objects.filter(q)
            books = books.annotate(
                b_id=F("book_id"),
                b_title=F("book__title"),
                b_isbn=F("book__isbn_no"),
                b_edition=F("book__edition"),
                #
                is_currently_issued=Exists(currently_issued),
            ).filter(is_currently_issued=False)

            books = books.values(*BOOK_SEARCH_FIELDS)
            return Response(books)
        return self.RESPONSE__INVALID_REQUEST
