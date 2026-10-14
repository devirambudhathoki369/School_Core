from django.urls import path

#
from ..views.LibraryViews import LibraryView
from ..views.BookEntryView import BookEntryView
from ..views.BookSearchView import BookCopySearchView
from ..views.BookIssueView import BookIssueView
from ..views.LibraryReportsView import LibraryReportsView
from ..views.GuestSchoolView import LibraryGuestSchoolView
from ..views.ManageGuestSchoolsView import ManageLibraryGuestSchoolsView

# /library + ...
urlpatterns = [
    path("libraries", LibraryView.as_view(), name="library management"),
    path("books", BookEntryView.as_view(), name="library books management"),
    path(
        "books/search",
        BookCopySearchView.as_view(),
        name="library books search for issue",
    ),
    path(
        "books/issue",
        BookIssueView.as_view(),
        name="library book issue, renew and return",
    ),
    path(
        "guest-schools",
        LibraryGuestSchoolView.as_view(),
        name="schools served by this library",
    ),
    path(
        "manage/guest-schools",
        ManageLibraryGuestSchoolsView.as_view(),
        name="manage library guest schools",
    ),
    path("reports", LibraryReportsView.as_view(), name="library reports"),
]
