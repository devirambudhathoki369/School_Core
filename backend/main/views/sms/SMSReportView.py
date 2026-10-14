from django.db.models import Q, Sum, Count

#
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.SMSLog import SMSLog, SMS_TYPE_CHOICES
from ...methods.getDateRange import normalizeNepaliDate
from ...methods.nepaliDatetime import npt


class SMSReportView(SecuredAPIView):
    """
    A school's own SMS log: every message it has sent, with the network, credit
    and delivery status the gateway reported.

    Scoped by `school` in the body, which the authenticator has already checked
    belongs to the caller (see BaseTokenAuthentication.belongs_to_school) — so a
    school cannot read another school's messages by editing the request, the way
    a shared provider panel would have let them.
    """

    # Both roles, because this is a REPORT and its permission (1607) can be
    # granted to a staff member — an admin-only endpoint behind a grantable menu
    # row is just a 401 with extra steps. The tenant check runs either way: a
    # staff token is matched against the staff member's own school.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    include_docs = False

    # A month of a busy school is a few thousand rows, which the report renders
    # and exports in one go (this product does not paginate report tables). The
    # cap is what stops an unbounded date range from trying to draw a year of
    # sends into one page; the response says when it bit, so the number shown is
    # never quietly wrong.
    LIMIT = 5000

    VIEW_LOGWISE = 1
    VIEW_DATEWISE = 2
    VIEW_TYPEWISE = 3

    def post(self, request):
        data = request.data if isinstance(request.data, dict) else {}
        school_id = data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        q = Q(school=school_id)
        #
        # The two bounds are handled one at a time rather than as an all-or-
        # nothing pair. A half-filled range is a real question — "everything
        # since Baishakh 1", "everything up to the day they complained" — and
        # treating it as no filter at all answered it with the school's whole
        # history while the From box on screen still showed a date. Each bound is
        # also normalised to the zero-padded form the column stores, so a typed
        # "2083-5-8" matches the rows it names instead of nothing.
        start, end = "", ""
        date_range = data.get("date_range")
        if isinstance(date_range, list) and len(date_range) == 2:
            try:
                start = normalizeNepaliDate(date_range[0]) if date_range[0] else ""
                end = normalizeNepaliDate(date_range[1]) if date_range[1] else ""
            except ValidationError:
                # A raw DRF validation error reaches the page as a bare list,
                # which its error handler cannot read — the user would be shown
                # "Request failed with status code 400". Say what is wrong.
                return Response(
                    {"message": "Invalid date! Use YYYY-MM-DD (BS)."},
                    status=HTTP_400_BAD_REQUEST,
                )
        if start and end:
            if start > end:
                # A backwards range matches no row, and an empty table reads as
                # "nothing was sent" — an answer about a range the user did not
                # ask for. Say what is wrong instead.
                return Response(
                    {"message": "'From' date is after 'To' date!"},
                    status=HTTP_400_BAD_REQUEST,
                )
            # both bounds are canonical YYYY-MM-DD, so the column's own text
            # ordering is the calendar ordering.
            q &= Q(date__range=(start, end))
        elif start:
            q &= Q(date__gte=start)
        elif end:
            q &= Q(date__lte=end)
        #
        sms_type = data.get("sms_type")
        if sms_type:
            q &= Q(sms_type=sms_type)
        #
        status = data.get("status")
        if status:
            q &= Q(status__iexact=status)
        #
        mobile = (data.get("mobile") or "").strip()
        if mobile:
            # a number is quoted to us in whatever form the parent gave it
            # (98…, 97798…), so match anywhere rather than from the front.
            q &= Q(receiver__contains=mobile)

        logs = SMSLog.objects.filter(q)
        # One aggregate over the whole match, so the totals stay true even when
        # the row cap trims what is listed.
        summary = logs.aggregate(count=Count("id"), credits=Sum("credit"))
        view = self._int(data.get("view")) or self.VIEW_LOGWISE

        if view == self.VIEW_DATEWISE:
            rows = self._grouped(logs, "date")
        elif view == self.VIEW_TYPEWISE:
            rows = self._grouped(logs, "sms_type", labels=dict(SMS_TYPE_CHOICES))
        else:
            rows = self._logwise(logs)

        return Response(
            {
                "data": rows,
                "info": {
                    "total_sms": summary.get("count") or 0,
                    "total_credit": summary.get("credits") or 0,
                    "truncated": view == self.VIEW_LOGWISE
                    and (summary.get("count") or 0) > self.LIMIT,
                    "limit": self.LIMIT,
                    # The range the rows were actually read for, in the form the
                    # column stores. The page prints this rather than what is
                    # typed in the boxes, so the header on a printed log names
                    # the days it really covers.
                    "date_from": start,
                    "date_to": end,
                },
            }
        )

    def _logwise(self, logs):
        types = dict(SMS_TYPE_CHOICES)
        rows = logs.values(
            "id",
            "receiver",
            "message",
            "network",
            "credit",
            "status",
            "sms_type",
            "date",
            "sent_at",
        )[: self.LIMIT]
        return [
            {
                "id": row["id"],
                "receiver": row["receiver"],
                "message": row["message"],
                "network": row["network"],
                "credit": row["credit"],
                "status": row["status"],
                "type": types.get(row["sms_type"], ""),
                "date": row["date"],
                # "2026-09-02 18:00:25" — the school reads local time, and this
                # is the one column they cross-check against the provider panel.
                "sent_on": self._stamp(row["sent_at"]),
            }
            for row in rows
        ]

    def _grouped(self, logs, field, labels=None):
        rows = (
            logs.values(field)
            .annotate(count=Count("id"), credits=Sum("credit"))
            .order_by("-" + field if field == "date" else field)
        )
        return [
            {
                field if field == "date" else "type": (
                    labels.get(row[field], row[field]) if labels else row[field]
                ),
                "count": row["count"],
                "credit": row["credits"] or 0,
            }
            for row in rows
        ]

    @staticmethod
    def _stamp(value):
        # Nepal time, not the server's UTC. This column is what a school reads
        # against the provider's panel, and 18:00 there must not say 12:15 here.
        return npt(value).strftime("%Y-%m-%d %H:%M:%S") if value else ""

    @staticmethod
    def _int(value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
