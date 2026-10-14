from django.db.models import F, OuterRef, Value, Q, Subquery
from django.contrib.postgres.aggregates import StringAgg
from django.utils import timezone

#
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import CursorPagination

#
from customs.JSONBuildObject import JSONBuildObject
from customs.JSONListAgg import JSONListAgg

#
from ..models.BaseModels import accountant_sq
from ..methods.getAccountant import getAccountant
from main.methods import idempotency as idem


class EntryCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class BaseEntryView:
    Name = "Entry"
    EntryModel = None
    ParticularModel = None
    EntrySerializer = None
    RESPONSE__INVALID_REQUEST = Response(
        {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
    )
    RESPONSE__NOT_FOUND = Response(
        {"message": "Not Found!"}, status=status.HTTP_404_NOT_FOUND
    )
    RESPONSE__CLOSED_YEAR = Response(
        {
            "message": "This fiscal year is closed. Its vouchers can only be "
            "viewed/reprinted — not created, edited or deleted."
        },
        status=status.HTTP_403_FORBIDDEN,
    )
    RETURN_FIELDS = (
        "id",
        "date",
        "voucher_id",
    )
    PARTICULAR_OBJECT_MAP = [
        Value("id"),
        F("id"),
        Value("ledger"),
        F("ledger"),
        Value("ledger_name"),
        F("ledger_str"),
        Value("amount"),
        F("amount"),
        Value("remarks"),
        F("remarks"),
    ]

    @staticmethod
    def _isClosedYear(economic_year_id):
        # a closed accounting economic year is read-only: no create/edit/delete.
        if not economic_year_id:
            return False
        from ..models.AccountingEconomicYear import AccountingEconomicYear

        return AccountingEconomicYear.objects.filter(
            id=economic_year_id, closed=True
        ).exists()

    # TODO
    # get
    #    - by id (single) or by school-id paginated!
    # update, delete!
    def getEntries(self, request, RETURN_FIELDS=None):
        RETURN_FIELDS = RETURN_FIELDS if RETURN_FIELDS else self.RETURN_FIELDS
        school_id = request.query_params.get("school")
        entry_id = request.query_params.get("entry")
        if school_id:
            if entry_id:
                voucher = self.getVoucher(entry_id)
                return Response(voucher)
            else:
                # deleted (is_active=False) vouchers stay visible in the list —
                # the client shows them as "Deleted" — so the voucher trail is
                # never silently missing numbers. An explicit ?status=active|
                # deleted narrows the list when the client asks for it.
                q = Q(school=school_id)
                # optional fiscal-year filter so the transaction-history list
                # can show a specific (incl. past/closed) economic year.
                economic_year = request.query_params.get("economic_year")
                if economic_year:
                    q &= Q(economic_year=economic_year)
                status_filter = request.query_params.get("status")
                if status_filter in ("active", "deleted"):
                    q &= Q(is_active=(status_filter == "active"))
                entries = self.EntryModel.objects.filter(q)
                RETURN_FIELDS += ("is_active",)
                if self.ID and self.ID in (1, 2):
                    # only in list-view!
                    if self.ID in (1, 2):
                        entries = entries.include_mode_text()
                        RETURN_FIELDS += (
                            "mode",
                            "mode_text",
                        )  # payment_mode and str repr.
                # Combine each voucher's per-line remarks into one 'narration'
                # column for the list (a voucher has many particulars). Blank
                # major-ledger lines are skipped.
                entries = entries.annotate(narration=self.getNarrationQuery())
                RETURN_FIELDS += ("narration",)
                entries = entries.values(*RETURN_FIELDS)
                paginator = EntryCursorPagination()
                entries = paginator.paginate_queryset(entries, request)
                return paginator.get_paginated_response(entries)
        return self.RESPONSE__INVALID_REQUEST

    def getNarrationQuery(self):
        # A voucher's narration = its particulars' remarks joined into one
        # string (distinct, blank/major-ledger lines skipped). Postgres StringAgg.
        return Subquery(
            self.ParticularModel.objects.filter(entry=OuterRef("pk"))
            .exclude(remarks="")
            .exclude(remarks__isnull=True)
            .values("entry")
            .annotate(n=StringAgg("remarks", delimiter="; ", distinct=True))
            .values("n")[:1]
        )

    def getParticularsQuery(self):
        object_map = list(self.PARTICULAR_OBJECT_MAP)
        if self.ID == 3:  # JOURNAL-ENTRY-VIEW
            object_map += [Value("type"), F("type")]
        else:  # other-views
            object_map += [
                Value("ledger_group"),
                F("ledger__ledger_group"),
            ]

        particulars_query = (
            self.ParticularModel.objects.filter(entry=OuterRef("pk"))
            .annotate(json_particular=JSONBuildObject(*object_map))
            .values_list(JSONListAgg("json_particular"), flat=True)
        )
        return Subquery(particulars_query)

    def getVoucher(self, voucher_id):
        # no is_active filter: deleted vouchers stay viewable/reprintable
        # (the client blocks editing them; delete reason lives in remarks)
        RETURN_FIELDS = self.RETURN_FIELDS + ("is_active",)
        entry = self.EntryModel.objects.filter(id=voucher_id)
        entry = entry.annotate(
            particulars=self.getParticularsQuery(),
            accountant=accountant_sq(self.EntryModel),
        )
        if self.ID and self.ID in (1, 2):
            entry = entry.annotate(
                ledger_group=F("ledger__ledger_group"),
                ledger_name=F("ledger__name"),
            )
            RETURN_FIELDS += (
                "ledger_group",
                "ledger_name",
                "mode",
                "ledger",
                "remarks",
            )
        entry = entry.values(*RETURN_FIELDS, "particulars", "accountant").first()
        if entry:
            particulars = entry.get("particulars")
            if particulars and isinstance(particulars, list):
                majorLedgerId = entry.get("ledger")
                isMajorLedgerAtFirst = bool(
                    len(particulars) > 0
                    and particulars[0].get("ledger") == majorLedgerId
                )
                if majorLedgerId and not isMajorLedgerAtFirst:
                    # bringing major-ledger-particular at first!
                    for index, item in enumerate(entry["particulars"]):
                        if item.get("ledger") == majorLedgerId:
                            entry["particulars"][0], entry["particulars"][index] = (
                                entry["particulars"][index],
                                entry["particulars"][0],
                            )
                            break
            acc = entry.get("accountant")
            if acc:
                entry["accountant"] = getAccountant(acc)
            return entry
        return {}

    def _duplicateSignature(self, request):
        # Identifying fields of a voucher. Byte-identical re-submits (double
        # click / retry) hash to the same key; self.ID keeps entry types apart.
        data = request.data
        return idem.make_signature(
            "voucher",
            self.ID,
            data.get("school"),
            data.get("economic_year"),
            data.get("date"),
            data.get("remarks"),
            data.get("mode"),
            data.get("ledger"),
            data.get("particulars"),
        )

    def save(self, request):
        # closed fiscal years are read-only — reject new vouchers.
        if self._isClosedYear(request.data.get("economic_year")):
            return self.RESPONSE__CLOSED_YEAR
        # Idempotency gate: block an identical voucher being stored again within
        # the duplicate window (~1-2 min).
        guard_key = self._duplicateSignature(request)
        if not idem.reserve(guard_key):
            cached = idem.peek(guard_key)
            entry_id = cached.get("entry_id") if isinstance(cached, dict) else None
            if entry_id and self.EntryModel.objects.filter(id=entry_id, is_active=True).exists():
                # original already saved — return its voucher, no new row
                return Response(
                    {
                        "message": f"{self.Name} was already saved a moment ago.",
                        "entry": self.getVoucher(entry_id),
                        "duplicate": True,
                    }
                )
            # A voucher deleted since is not there to be duplicated: it is
            # being entered again and is saved as a new one. Anything else is
            # the original still being processed by the first request.
            if not (entry_id and idem.reclaim(guard_key, entry_id)):
                return Response(
                    {
                        "message": f"This {self.Name.lower()} is being saved. Please wait a moment before retrying."
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        s = self.EntrySerializer(data=request.data)
        if s.is_valid():
            try:
                ins = s.save(entry_type_id=self.ID)
            except Exception:
                idem.release(guard_key)
                raise
            if ins is None:
                # serializer.create returned nothing (e.g. no particulars) —
                # nothing was stored, so free the lock for a corrected retry
                idem.release(guard_key)
                return self.RESPONSE__INVALID_REQUEST
            # Hold the lock for the full window and remember the entry id so an
            # identical re-submit echoes this same voucher.
            idem.fill(guard_key, {"entry_id": ins.id})
            return Response(
                {
                    "message": f"{self.Name} saved!",
                    "entry": self.getVoucher(ins.id),
                }
            )
        # invalid payload — free the lock so a corrected retry isn't blocked
        idem.release(guard_key)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        if "delete_reason" in request.data:
            return self._delete(request)
        else:
            id = request.data.get("id")
            school_id = request.data.get("school")
            # deleted vouchers are visible in lists but must never be editable
            entry = self.EntryModel.objects.filter(
                id=id, school=school_id, is_active=True
            ).first()
            if entry:
                # closed fiscal years are read-only — reject edits.
                if self._isClosedYear(entry.economic_year_id):
                    return self.RESPONSE__CLOSED_YEAR
                s = self.EntrySerializer(entry, request.data, partial=True)
                if s.is_valid():
                    ins = s.save(entry_type_id=self.ID)
                    return Response(
                        {
                            "message": f"{self.Name} updated!",
                            "entry": self.getVoucher(ins.id),
                        }
                    )
        return self.RESPONSE__INVALID_REQUEST

    def _delete(self, request):
        id = request.data.get("entry")
        school_id = request.data.get("school")
        if id and school_id:
            item = self.EntryModel.objects.filter(
                id=id, school=school_id, is_active=True
            )
            if item:
                # closed fiscal years are read-only — reject deletes.
                if self._isClosedYear(item.first().economic_year_id):
                    return self.RESPONSE__CLOSED_YEAR
                updates = {
                    "is_active": False,
                    "updated_at": timezone.now(),
                }
                delete_reason = request.data.get("delete_reason")
                if delete_reason:
                    updates["remarks"] = delete_reason
                item.update(**updates)
                return Response({"message": "Voucher deleted!"})
        return self.RESPONSE__INVALID_REQUEST
