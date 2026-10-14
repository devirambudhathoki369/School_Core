from django.db.models import Sum, F, Case, When, Value, BooleanField, Q
from django.db import transaction

#
from rest_framework.response import Response
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

#
from account.auth.Authentication import AdminTokenAuthentication
from ..BaseViews import SecuredAPIView
from ...models.FiscalYears import AcademicYear, AcademicYearMapping
from ...models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from ...models.Ledger import LedgerPosting, StudentLedger
from ...models.Invoice import StudentInvoice
from ...models.Student import Student
from ...models.Course import Course
from ...methods.academicYear import is_terminal_level
from ...methods.nepaliDatetime import ndt_today
from ...constants.payment import OPENING_BALANCE, CARRY_FORWARD_OUT

# Education levels that run as batched cohorts (year/semester wise). Only these
# can have a "junior level still running while a senior level graduates"
# situation; grade/school levels (1,2,3,10) promote together and are unaffected.
HIGHER_ED_LEVELS = (4, 5, 8, 9)
STATUS_RUNNING = 1


class ContinuingCohortGuardMixin:
    """Blocks closing a higher-ed class-group that still holds RUNNING students
    while a higher year/semester of the SAME COURSE also has running students —
    i.e. these students are a continuing junior year, not a graduating cohort.

    Closing such a class-group sweeps its students' still-current balance into a
    new-year opening balance, which the payment screen renders as "old dues".
    That is the exact bug behind "running students shown as old dues": the
    4th-year exam ends, the operator closes the program's year, and the 1st/2nd/
    3rd-year students sitting in their same class get their live fees relabelled.

    Why COURSE-scoped, not batch-scoped: schools model cohorts two ways — one
    batch progressing through the levels over time, OR one batch per level
    (Nawa Nepal: batch5=yr1, batch4=yr2, …). At any snapshot both look identical
    (one live batch per level), so "is there a higher level of this COURSE still
    running" is the signal that works for both; a batch-scoped check misses the
    one-batch-per-level layout entirely.

    A terminal cohort closed on its own (no higher level running) is allowed —
    that is a normal graduation. Purely a pre-flight check: it never writes.
    Callers may override with ``force_close_juniors=true`` for the deliberate case.
    """

    def findContinuingCohorts(self, school_id, classes):
        # Resolve the selected class-groups to their (course, level).
        class_ids = list(classes.values_list("id", flat=True))
        selected = ClassInfo.objects.filter(id__in=class_ids).values(
            "id", "education_level", "course", "year", "semester"
        )
        # Program length per course (may be None -> heuristic fallback).
        course_ids = {c["course"] for c in selected if c["course"]}
        course_len = {
            c["id"]: (c["total_years"], c["total_semesters"])
            for c in Course.objects.filter(id__in=course_ids).values(
                "id", "total_years", "total_semesters"
            )
        }
        flagged = []
        for c in selected:
            if c["education_level"] not in HIGHER_ED_LEVELS:
                continue
            level = c["year"] or c["semester"]
            if not level:
                continue
            level_field = "year" if c["year"] else "semester"
            # Does this class-group still hold running students?
            if not Student.objects.filter(
                class_info=c["id"], status=STATUS_RUNNING, is_active=True
            ).exists():
                continue  # empty (already promoted out) -> safe to close.
            # Prefer the program length: a genuinely TERMINAL (graduating) level is
            # allowed to close; a level below the program length is a junior year
            # and is blocked even if its next level has not been created yet.
            ty, ts = course_len.get(c["course"], (None, None))
            terminal = is_terminal_level(level, level_field, ty, ts)
            if terminal is True:
                continue  # final level -> graduating cohort -> close allowed.
            if terminal is False:
                flagged.append(c["id"])  # definitely a junior level.
                continue
            # Unknown length -> fall back to "is a higher level still running?".
            higher_exists = (
                ClassInfo.objects.filter(
                    school=school_id,
                    course=c["course"],
                    education_level=c["education_level"],
                    is_active=True,
                    **{f"{level_field}__gt": level},
                    student__status=STATUS_RUNNING,
                    student__is_active=True,
                )
                .exists()
            )
            if higher_exists:
                flagged.append(c["id"])
        return flagged


class AcademicYearClassSearchMixin:
    fullforms = {
        "el": "education_level",
        "g": "grade",
        "c": "course",
        "y": "year",
        "s": "semester",
    }

    def handleKeyDetails(self, classes_key_details: list):
        class_info_keys = list()
        query = {}
        for key_detail in classes_key_details:
            _class_info_key = ""
            for detail in key_detail:
                key, value = detail["key"], detail["value"]
                _class_info_key += key + str(value)
                ff = self.fullforms.get(key) + "__in"
                if ff:
                    try:
                        query[ff].add(value)
                    except:
                        query[ff] = set([value])
            class_info_keys.append(_class_info_key)
        return class_info_keys, query

    def getClasses(self, school_id, class_query):
        # handle years and semesters, this should be OR, others are AND
        or_fields = ("year__in", "semester__in")
        and_query, or_query = Q(), Q()
        for k, v in class_query.items():
            q = Q(**{k: v})
            if k in or_fields:
                or_query |= q
            else:
                and_query &= q
        query = and_query & or_query if or_query else and_query

        classes = ClassInfo.objects.filter(
            query, school=school_id, is_active=True
        ).only(*CLASS_DETAILS_FIELDS)
        return classes


class AcademicYearMismatchInvoicesQueryMixin:
    def getInvoicesQuery(self, school_id, class_ids, academic_year_id):
        return (
            StudentInvoice.objects.filter(
                is_active=True,
                school=school_id,
                student__is_active=True,
                student__class_info__in=class_ids,
                isCashReceipt=False,
                academic_year__closed=False,
            )
            .annotate(
                is_invalid=Case(
                    When(academic_year=academic_year_id, then=Value(False)),
                    default=Value(True),
                    output_field=BooleanField(),
                )
            )
            .filter(is_invalid=True)
        )


class AcademicYearMismatchLedgersQueryMixin:
    # Year-close / carry-forward bookkeeping keys. A student who moves to a class
    # on another academic-year track (class 10 -> 11: SCHOOL 20xx -> HIGH SCHOOL
    # 20xx) keeps the close's `ob` row in the old track's year, balanced by a
    # `cfo` row there once the dues are carried into the new track (or the `ob`
    # is simply 0). Those rows net to zero, move no money and are exactly what a
    # correct carry leaves behind, so they must not block the new track's close.
    CARRY_BOOKKEEPING_KEYS = (OPENING_BALANCE, CARRY_FORWARD_OUT)

    def getLedgersQuery(self, school_id, class_ids, academic_year_id):
        ledgers = self._getMismatchLedgersQuery(school_id, class_ids, academic_year_id)
        settled_ids = self._settledCarryLedgerIds(ledgers)
        if settled_ids:
            ledgers = ledgers.exclude(id__in=settled_ids)
        return ledgers

    def _settledCarryLedgerIds(self, ledgers):
        """Ids of pure ob/cfo rows whose (student, academic year) nets to zero.

        A non-zero stranded `ob` (dues never carried) is still reported.
        """
        rows = ledgers.filter(
            details__has_any_keys=self.CARRY_BOOKKEEPING_KEYS
        ).values_list("id", "student_id", "academic_year_id", "details", "total")
        groups = defaultdict(lambda: {"ids": [], "net": Decimal(0)})
        for ledger_id, student_id, academic_year_id, details, total in rows:
            if not set(details or {}) <= set(self.CARRY_BOOKKEEPING_KEYS):
                continue  # mixed with real fee titles -> not pure bookkeeping.
            group = groups[(student_id, academic_year_id)]
            group["ids"].append(ledger_id)
            group["net"] += total or 0
        return [
            ledger_id
            for group in groups.values()
            if group["net"] == 0
            for ledger_id in group["ids"]
        ]

    def _getMismatchLedgersQuery(self, school_id, class_ids, academic_year_id):
        return (
            StudentLedger.objects.filter(
                is_active=True,
                ledger_posting__is_active=True,
                school=school_id,
                student__is_active=True,
                student__class_info__in=class_ids,
                academic_year__closed=False,
            )
            .annotate(
                is_invalid=Case(
                    When(academic_year=academic_year_id, then=Value(False)),
                    default=Value(True),
                    output_field=BooleanField(),
                )
            )
            .filter(is_invalid=True)
        )


class AcademicYearCloseView(
    SecuredAPIView,
    AcademicYearClassSearchMixin,
    AcademicYearMismatchInvoicesQueryMixin,
    AcademicYearMismatchLedgersQueryMixin,
    ContinuingCohortGuardMixin,
):
    authentication_classes = (AdminTokenAuthentication,)
    STUDENT_STATUS_RUNNING = 1

    def post(self, request):
        school_id = request.data.get("school")
        if school_id:
            academic_year_mapping_id = request.data.get("id")
            classes_key_details = request.data.get("classes")
            economic_year = request.data.get("economic_year")
            academic_year_id = request.data.get("academic_year")
            academic_year_name = request.data.get("academic_year_name")
            new_academic_year = request.data.get("new_academic_year")
            search = request.data.get("search")
            search = True if search is None else search
            checkAcademicYearIssues = True
            #
            class_info_keys, classes_query = self.handleKeyDetails(classes_key_details)
            # print(class_info_keys, classes_query)
            mapping_query = Q(
                # id=academic_year_mapping_id,
                academic_year=academic_year_id,
                school=school_id,
                key__in=class_info_keys,
            )
            mapping = AcademicYearMapping.objects.filter(
                id=academic_year_mapping_id
            ).filter(mapping_query)
            if mapping.exists():
                classes = self.getClasses(school_id, classes_query)
                if search:
                    classes = classes.values_list("id", flat=True)
                    return Response(classes)
                # SAFETY: never close a year that is already closed. Guards the
                # common double-submit / re-run and keeps the operation from
                # creating a second new year + duplicate opening balances.
                if AcademicYear.objects.filter(
                    school=school_id, id=academic_year_id, closed=True
                ).exists():
                    return Response(
                        {"message": "This academic year is already closed!"}, 400
                    )
                if checkAcademicYearIssues:
                    """check for invalid invoices!"""
                    invoices = self.getInvoicesQuery(
                        school_id, classes, academic_year_id
                    )
                    if invoices.exists():
                        return Response(
                            {
                                "message": "Failed, Incorrect academic year found in invoices!"
                            },
                            400,
                        )
                    """ check for invalid ledgers! """
                    ledgers = self.getLedgersQuery(school_id, classes, academic_year_id)
                    if ledgers.exists():
                        return Response(
                            {
                                "message": "Failed, Incorrect academic year found in ledgers!"
                            },
                            400,
                        )
                # GUARD: never sweep a still-running junior cohort's live fees
                # into "old dues". If a selected higher-ed class-group still
                # holds running students AND a higher year/semester of the same
                # (course, batch) is also running, these students are continuing
                # -- promote or graduate them first. Explicit override only.
                force_close_juniors = request.data.get("force_close_juniors")
                if not force_close_juniors:
                    continuing = self.findContinuingCohorts(school_id, classes)
                    if continuing:
                        return Response(
                            {
                                "message": (
                                    "Close blocked: the selected class-groups "
                                    "still hold running students who have a "
                                    "higher year/semester ahead of them (they "
                                    "are continuing, not graduating). Closing "
                                    "now would relabel their running fees as old "
                                    "dues. Promote or graduate them first, or "
                                    "resend with force_close_juniors=true."
                                ),
                                "continuing_class_ids": continuing,
                            },
                            400,
                        )
                """ balance calculation and saving """
                # balances = {50: {981: Decimal("5000.8779")}}
                balances = self.calculateBalances(classes, academic_year_id)
                if not balances:
                    return Response({"message": "No balances found!"}, 404)
                saved = self.handleCloseOperations(
                    school_id,
                    economic_year,
                    academic_year_id,
                    balances,
                    new_academic_year,
                    mapping_query,
                    classes,
                )
                if saved:
                    academic_year_name = (academic_year_name or "").title()
                    return Response(
                        {"message": f"Academic Year {academic_year_name} Closed!!!"}
                    )
                else:
                    return Response({"message": "Request failed!"}, 400)
        return self.RESPONSE__INVALID_REQUEST

    def getLedgers(self, class_ids: set, academic_year_id: int):
        return (
            StudentLedger.objects.filter(
                is_active=True,
                ledger_posting__is_active=True,
                student__is_active=True,
                # student__status=self.STUDENT_STATUS_RUNNING,
                student__class_info__in=class_ids,
                academic_year=academic_year_id,
            )
            .values("student_id")
            .annotate(
                class_info=F("student__class_info"),
                total_credit=Sum("total"),
            )
            .values("student", "class_info", "total_credit")
        )

    def getInvoices(self, class_ids: set, academic_year_id: int):
        return (
            StudentInvoice.objects.filter(
                is_active=True,
                student__is_active=True,
                # student__status=self.STUDENT_STATUS_RUNNING,
                student__class_info__in=class_ids,
                isCashReceipt=False,
                academic_year=academic_year_id,
            )
            .values("student_id")
            .annotate(
                class_info=F("student__class_info"),
                total_debit=Sum("total_paid"),
                total_discount=Sum("total_discount"),
            )
            .values("student", "class_info", "total_debit", "total_discount")
        )

    def calculateBalances(self, class_ids, academic_year_id: int):
        class_ids = {cls.id for cls in class_ids}
        ledgers = self.getLedgers(class_ids, academic_year_id)
        invoices = self.getInvoices(class_ids, academic_year_id)
        #
        balances = defaultdict(lambda: defaultdict(Decimal))
        for ledger in ledgers.iterator():
            class_info = ledger.get("class_info")
            student_id = ledger.get("student")
            total_credit = ledger.get("total_credit") or 0
            balances[class_info][student_id] += total_credit
        for invoice in invoices.iterator():
            class_info = invoice.get("class_info")
            student_id = invoice.get("student")
            total_debit = invoice.get("total_debit") or 0
            total_discount = invoice.get("total_discount") or 0
            balances[class_info][student_id] -= total_debit
            balances[class_info][student_id] -= total_discount
        return balances

    def handleCloseOperations(
        self,
        school_id: int,
        economic_year: int,
        academic_year: int,
        balances: dict,
        new_academic_year: dict,
        mapping_query: Q,
        classes,
    ):
        # LedgerPosting (class ledger posting): {academic_year, economic_year, class_info}
        # StudentLedger (each student ledger): {student, school, details:{}, ledger_posting, total}
        _common_data = {
            # "academic_year": None,
            "economic_year_id": economic_year,
            "date": ndt_today(),
        }
        with transaction.atomic():
            # SAFETY: lock the mapping rows and re-verify they still point to the
            # academic year being closed. If a concurrent/duplicate request beat
            # us to it, the mapping has already moved to the new year -> abort,
            # so we never create a duplicate year or duplicate opening balances.
            locked_ids = list(
                AcademicYearMapping.objects.select_for_update()
                .filter(mapping_query)
                .values_list("id", flat=True)
            )
            if not locked_ids:
                return False
            new_academic_year["school_id"] = new_academic_year.pop("school")
            new_acay = AcademicYear.objects.create(**new_academic_year)
            _common_data["academic_year"] = new_acay
            student_ledgers = []
            for clsId, studentBalances in balances.items():
                ledger_posting = LedgerPosting.objects.create(
                    class_info_id=clsId,
                    months=[],
                    **_common_data,
                )
                for stdId, stdBalance in studentBalances.items():
                    stdBalance = stdBalance.quantize(
                        Decimal("0.01"), rounding=ROUND_HALF_UP
                    )
                    student_ledgers.append(
                        StudentLedger(
                            ledger_posting=ledger_posting,
                            student_id=stdId,
                            school_id=school_id,
                            details={OPENING_BALANCE: float(stdBalance)},
                            total=stdBalance,
                            **_common_data,
                        )
                    )
            StudentLedger.objects.bulk_create(student_ledgers)
            #
            AcademicYear.objects.filter(school=school_id, id=academic_year).update(
                closed=True
            )
            # update mapping with new and previous academic years!
            AcademicYearMapping.objects.filter(mapping_query).update(
                academic_year=new_acay,
                previous_academic_year=academic_year,
            )
            # update classes' academic years to new-academic-year!
            for cls in classes:
                setattr(cls, "academic_year", new_acay)
            ClassInfo.objects.bulk_update(classes, ["academic_year"])
            # transaction.set_rollback(True)
            # print("QUERY SUCCESSFULL!!")
            return True
        return False
