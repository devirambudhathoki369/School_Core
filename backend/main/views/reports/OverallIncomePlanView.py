from django.db.models import Q, OuterRef, Value
from django.db.models.functions import Coalesce

#
from rest_framework.response import Response
from collections import defaultdict
from decimal import Decimal

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.ClassInfo import ClassInfo
from ...models.Fee import Fee, FeeTitle
from ...models.Student import Student, StudentTransportationInfo, StudentDiscountInfo
from ...methods.nepaliDatetime import getCurrentNepaliYear
from ...constants.payment import TRANSPORTATION, HOSTEL
from ...methods.hostelRates import schoolUsesHostel, studentHostelRateMap


class OverallIncomePlanView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STUDENT_STATUS_RUNNING = 1

    def post(self, request):
        school_id: int = request.data.get("school")
        months: list[int] = request.data.get("month") or []
        education_level: int = request.data.get("education_level")

        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        base_q = Q(is_active=True)
        sq = Q(school=school_id)
        sq2 = Q(class_info__school=school_id)
        elq = Q(education_level=education_level) if education_level else Q()
        elq2 = (
            Q(class_info__education_level=education_level) if education_level else Q()
        )

        """
        All classes in school X
        """
        class_infos = list(
            ClassInfo.objects.filter(base_q, sq, elq).values(
                "id", "education_level", "grade", "course", "section"
            )
        )

        class_ids: list[int] = []
        class_meta: dict[int, tuple[int]] = {}
        for ci in class_infos:
            cid = ci["id"]
            class_ids.append(cid)
            class_meta[cid] = (
                ci["education_level"],
                ci["grade"],
                ci["course"],
                ci["section"],
            )

        """
        Fee titles & month counts
        """
        db_titles = FeeTitle.objects.filter(base_q, sq, months__gt=0).values(
            "id", "title", "months"
        )
        # The title's months are the DEFAULT; a class that is admitted in a
        # different month overrides them on its own fee row (Fee.months). This
        # report has to project off the same months the ledger will actually
        # bill, so the count is resolved per (class, title) below and the title's
        # list only answers where the class has no override.
        title_month_list: dict[int, list[int]] = {
            e["id"]: (e["months"] or []) for e in db_titles
        }

        titles: dict[int, str] = {TRANSPORTATION: "transportation"}
        # The hostel is projected income like the bus is — a per-student
        # recurring charge that never appears in the class fee table. Added ONLY
        # for a school that has the module, so no other school's income plan
        # grows a column of zeroes.
        uses_hostel = schoolUsesHostel(school_id)
        if uses_hostel:
            titles[HOSTEL] = "hostel"
        sel_months = set(months)

        """
        All fee rows for this school indexed
        """
        # EVERY title's fee rows, not just the ones the selection already
        # covers: a class's own months can pull a title into the selection, and
        # that can only be seen from the fee rows.
        fees_qs = Fee.objects.filter(
            base_q, sq2, elq2, Q(title__in=title_month_list.keys())
        ).values(
            "class_info_id", "title_id", "fee", "months", "class_info__section"
        )
        fees_qs = list(fees_qs)

        # Which titles get a column. The rule is the one this report always
        # had — the title is billable in one of the selected months — PLUS the
        # titles a class has pulled into the selection with its own months. A
        # title payable only in Shrawan for the one class admitted then belongs
        # on a Shrawan report; nothing that used to have a column loses one.
        overridden_into_selection = {
            f["title_id"]
            for f in fees_qs
            if f["months"] and sel_months.intersection(f["months"])
        }
        for e in db_titles:
            tid = e["id"]
            if (
                sel_months.intersection(title_month_list.get(tid) or [])
                or tid in overridden_into_selection
            ):
                titles[tid] = e["title"]

        # Build indexes for fast lookup
        #  - section_fees: per (edu, grade, course, section, title)
        #  - base_fees: per (edu, grade, course, title) where section is None

        # Each entry is the (rate, months) of one fee row: the two travel
        # together because a class that sets its own months sets them on the very
        # row its rate comes from, and reading the rate from one row and the
        # months from another is how a projection stops matching the bill.
        section_fees: dict[
            tuple[int, int | None, int | None, int | None, int],
            tuple[int, list[int] | None],
        ] = {}
        base_fees: dict[tuple[int, int | None, int | None, int], tuple[int, list[int] | None]] = {}

        for f in fees_qs:
            cid = f["class_info_id"]
            tid = f["title_id"]
            row = (f["fee"], f["months"])
            # A fee can outlive its class: the row stays active while the class
            # is retired, and this used to read `class_meta[cid]` straight out
            # and raise KeyError — the whole report 500'd for any school with
            # one (Great Araniko has such a row). It is not a class of this
            # report's scope, so it is skipped.
            meta = class_meta.get(cid)
            if not meta:
                continue
            edu, grade, course, section = meta
            base_key = (edu, grade, course, tid)
            if section is None:
                # class-level (or course-level) fee
                base_fees[base_key] = row
            else:
                # section-specific fee
                section_key = (edu, grade, course, section, tid)
                section_fees[section_key] = row

        def resolve_fee_row(cid: int, tid: int) -> tuple[int, list[int] | None] | None:
            edu, grade, course, section = class_meta[cid]

            base_key = (edu, grade, course, tid)

            # 1) try section-specific fee
            if section is not None:
                section_key = (edu, grade, course, section, tid)
                row = section_fees.get(section_key)
                if row is not None:
                    return row

            # 2) fallback: same meta but section is None
            return base_fees.get(base_key)

        def month_count(cid: int, tid: int, own_months: list[int] | None) -> int:
            """How many of the selected months this class pays this title in."""
            eff = own_months or title_month_list.get(tid) or []
            return len(sel_months.intersection(eff))

        """
        Student count per class
        Classwise transportation total (discount adjusted below)
        Classwise & titlewise discount total (totals will be adjusted in final computation)
        """
        tsp_info = StudentTransportationInfo.objects.filter(
            base_q, sq, student=OuterRef("pk")
        ).values("bus_station__fee", "start_date")[:1]
        #
        students_qs = (
            Student.objects.filter(
                base_q,
                class_info_id__in=class_ids,
                status=self.STUDENT_STATUS_RUNNING,
            )
            .annotate(
                tsp_rate=Coalesce(tsp_info.values("bus_station__fee"), Value(None)),
                tsp_start_date=Coalesce(tsp_info.values("start_date"), Value(None)),
            )
            .values("id", "class_info_id", "tsp_rate", "tsp_start_date")
        )
        # student discounts;
        student_ids = students_qs.values_list("id", flat=True)
        # Discounts are asked for by the titles this report actually projects —
        # the columns. Asking wider pulls in rows for titles nothing is billed
        # for here, and duplicate discount rows for one student/title then
        # resolve differently depending on how many came back.
        projected_titles = [
            tid for tid in titles if tid not in (TRANSPORTATION, HOSTEL)
        ]
        discounts = self.getStudentDiscounts(
            school_id, student_ids, Q(title__in=projected_titles)
        )
        #
        # One query for every boarder's rate and check-in date; empty for a
        # school without the module.
        hostel_rates = (
            studentHostelRateMap(list(student_ids), school_id) if uses_hostel else {}
        )
        student_counts = {}  # class_id: student count
        transport_totals = {}  # class_id: total transport amount
        hostel_totals = {}  # class_id: total projected hostel amount
        discount_totals = defaultdict(
            lambda: defaultdict(Decimal)
        )  # class_id: {title_id: discount_amount}; totals;

        for s in students_qs:
            sid = s["id"]
            cid = s["class_info_id"]
            rate: Decimal = s["tsp_rate"]
            start_date = s["tsp_start_date"]
            # ----- class students count;
            student_counts[cid] = student_counts.get(cid, 0) + 1
            # ----- discounts;
            tsp_rate = rate or Decimal(0)
            std_discount = discounts.get(cid, {}).get(sid, None)
            if std_discount:
                # tsp discount;
                if TRANSPORTATION in std_discount:
                    tsp_dper, tsp_damt = std_discount.get(TRANSPORTATION, (0, 0))
                    new_da = (tsp_dper / 100 * tsp_rate) if tsp_dper else tsp_damt
                    tsp_rate -= new_da
                # other discounts
                for title_id, (tdper, tdamt) in std_discount.items():
                    if title_id == TRANSPORTATION:
                        continue
                    trow = resolve_fee_row(cid, title_id)
                    if trow is None:
                        continue
                    tfee, tmonths = trow
                    tpmc = month_count(cid, title_id, tmonths)
                    discount_value = Decimal((tdper / 100 * tfee) if tdper else tdamt)
                    discount_totals[cid][title_id] += discount_value * tpmc

            tsp_months = self.get_tsp_months(start_date)
            pmc = len(sel_months.intersection(tsp_months))
            std_total = pmc * tsp_rate
            transport_totals[cid] = transport_totals.get(cid, 0) + std_total

            # ----- hostel; the same arithmetic as the bus: months of the
            # selection that fall on or after the student moved in, times the
            # rate agreed at check-in. No discount arm — a hostel concession IS
            # a lower rate on the allocation, so it is already in this figure.
            boarder = hostel_rates.get(sid)
            if boarder:
                hostel_months = self.get_tsp_months(str(boarder.get("check_in_date") or ""))
                hpmc = len(sel_months.intersection(hostel_months))
                hostel_totals[cid] = hostel_totals.get(cid, 0) + (
                    hpmc * (boarder.get("monthly_fee") or Decimal(0))
                )

        """
        Final compute per-class / per-title totals
        """
        data: dict[int, dict[int, int]] = defaultdict(dict)

        for cid in class_ids:
            stu_count = student_counts.get(cid, 0)
            tsp_proj = transport_totals.get(cid, 0)

            # skip empty classes:
            if not stu_count:
                continue

            for tid in titles:
                if tid in (TRANSPORTATION, HOSTEL):
                    continue
                row = resolve_fee_row(cid, tid)
                if row is None:
                    continue
                fee, own_months = row
                gross = fee * month_count(cid, tid, own_months) * stu_count
                total_class_discount = discount_totals.get(cid, {}).get(tid, 0)
                net = gross - total_class_discount
                data[cid][tid] = net
            data[cid][TRANSPORTATION] = tsp_proj
            if uses_hostel:
                data[cid][HOSTEL] = hostel_totals.get(cid, 0)

        return Response(
            {
                "data": data,
                "titles": titles,
                "structure": {"class_info": {"title_id": "total_amount"}},
            }
        )

    def getStudentDiscounts(self, school_id: int, student_ids: list[int], title_q):
        title_q = title_q | Q(title__isnull=True)
        discounts = (
            StudentDiscountInfo.objects.filter(
                title_q,
                school=school_id,
                student__in=student_ids,
                is_active=True,
            )
            .order_by("student")
            .values(
                "title",
                "discount",
                "percentage",
                "student",
                "student__class_info",
            )
        )

        mapped = defaultdict(lambda: defaultdict(dict))
        for e in discounts:
            class_id = e["student__class_info"]
            student_id = e["student"]
            title_id = e.get("title") or TRANSPORTATION  # title-id or None:tsp;

            mapped[class_id][student_id][title_id] = [
                e["percentage"],
                e["discount"],
            ]
        return mapped

    def get_tsp_months(self, start_date):
        """ """
        if not start_date:
            return set()

        current_year = getCurrentNepaliYear()
        enrolled_year = int(start_date[:4])
        enrolled_month = int(start_date[5:7])

        min, max = enrolled_month, 12
        if current_year > enrolled_year:
            min, max = 1, max

        return set(range(min, max + 1))
