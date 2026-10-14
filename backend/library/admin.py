from django.contrib import admin

from .models.Library import Library
from .models.Book import Book, BookCopy, BookIssue

# Register your models here.
admin.site.register(Library)
admin.site.register(Book)
admin.site.register(BookCopy)
admin.site.register(BookIssue)
