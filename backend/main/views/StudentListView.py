"""
GET /api/students/list: the Students page (People > Students & staff > Students).

One school's students as a list a person reads: in class order, then by roll,
filtered by status, class and one search box, with a total so the page can say
how many there are. The advanced search (POST /api/search/students) stays what
a dozen screens build on; this answers only the list.

    school       required; the authenticator proves it is the caller's
    status       1 running (default), 2 passed out, 3 dropped out, or "all"
    class_info   one class (a class and section); checked against the school
    q            a name (every word must match a name), a student id, or at
                 least 4 digits of a phone number (the guardian's or the
                 student's)
    page         from 1; 25 a page, `page_size` up to 100

Each row: id, name, image, class_info, classname, class_academic_year (what
Collect fees switches to first), roll_no, status, guardian, guardian_contact.
`counts` gives how many match the class and search under each status, for the
status tabs.
"""

import re

from django.db.models import Case, Count, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce, Length, NullIf
from rest_framework.pagination import PageNumberPagination

from account.auth.Authentication import AdminTokenAuthentication, StaffTokenAuthentication

from ..methods.genClassname import getClassDetails
from ..models.Student import Student
from .BaseViews import SecuredAPIView

STATUSES = {"1": 1, "2": 2, "3": 3}
_DIGITS = re.compile(r"^\d+$")


class StudentListPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class StudentListView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        params = request.query_params
        school_id = params.get("school")
        if not school_id or not _DIGITS.match(str(school_id)):
            return self.RESPONSE__INVALID_REQUEST
        students = Student.objects.filter(class_info__school_id=school_id, is_active=True)

        class_info = params.get("class_info")
        if class_info:
            if not _DIGITS.match(class_info):
                return self.RESPONSE__INVALID_REQUEST
            students = students.filter(class_info_id=class_info)

        q = " ".join((params.get("q") or "").split())[:60]
        if q:
            students = students.filter(self.search(q))

        # how many match the class and search under each status: the tabs' counts
        counts = {str(row["status"]): row["n"] for row in students.values("status").annotate(n=Count("id"))}

        status = params.get("status") or "1"
        if status != "all":
            if status not in STATUSES:
                return self.RESPONSE__INVALID_REQUEST
            students = students.filter(status=STATUSES[status])

        rows = (
            students.annotate(
                montessory_first=Case(When(class_info__education_level=1, then=Value(0)), default=Value(1),
                                      output_field=IntegerField()),
                guardian=Coalesce(NullIf("guardian_info__guardian_name", Value("")), "guardian_info__father_name"),
            )
            # class order (as the class lists), then the roll as a number when it
            # is one ("2" before "10"), then the name
            .order_by("montessory_first", "class_info__education_level", "class_info__grade",
                      "class_info__section_id", "class_info_id", Length("roll_no"), "roll_no",
                      "first_name", "last_name", "id")
            .values("id", "first_name", "middle_name", "last_name", "image", "class_info",
                    "class_info__academic_year", "roll_no", "status", "guardian",
                    "guardian_info__guardian_contact")
        )
        paginator = StudentListPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        classnames = {}
        results = []
        for row in page:
            class_id = row["class_info"]
            if class_id not in classnames:
                classnames[class_id] = getClassDetails(class_id, False)[0] or ""
            results.append({
                "id": row["id"],
                "name": " ".join(p for p in (row["first_name"], row["middle_name"], row["last_name"]) if p),
                "image": row["image"] or "",
                "class_info": class_id,
                "classname": classnames[class_id],
                "class_academic_year": row["class_info__academic_year"],
                "roll_no": row["roll_no"] or "",
                "status": row["status"],
                "guardian": row["guardian"] or "",
                "guardian_contact": row["guardian_info__guardian_contact"] or "",
            })
        response = paginator.get_paginated_response(results)
        response.data["counts"] = counts
        return response

    @staticmethod
    def search(q):
        """A student id, part of a phone number, or every word of a name."""
        if _DIGITS.match(q):
            match = Q(id=int(q)) if len(q) <= 9 else Q(pk__in=[])
            if len(q) >= 4:
                match |= Q(guardian_info__guardian_contact__contains=q) | Q(contact__contains=q)
            return match
        match = Q()
        for word in q.split(" ")[:4]:
            match &= (Q(first_name__icontains=word) | Q(middle_name__icontains=word)
                      | Q(last_name__icontains=word))
        return match


__all__ = ["StudentListView"]
