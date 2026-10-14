"""Hostel setup: the residence, its blocks, its room types, its rooms and beds.

  GET/POST/PUT/DELETE  /hostel/hostels
  GET/POST/PUT/DELETE  /hostel/blocks       ?hostel=
  GET/POST/PUT/DELETE  /hostel/room-types   ?hostel=
  GET/POST/PUT/DELETE  /hostel/rooms        ?hostel= [&block=] [&available=true]
  GET/POST/DELETE      /hostel/beds         ?room=

DELETES ARE REFUSED WHEN THE RECORD IS REFERENCED. That is a house rule in this
codebase (BusStation, Course, Section, Subject all behave this way) and it
matters more here than anywhere: a room deleted out from under an allocation
takes the record a student's hostel bills were raised against with it.
"""

from django.db.models import Count, Q, F, Sum
from django.db.utils import IntegrityError
from rest_framework.response import Response

from ..constants import (
    ALLOC_ACTIVE,
    HOSTEL_TYPE_CHOICES,
    ROOM_ALLOCATABLE_STATUSES,
    ROOM_STATUS_CHOICES,
    label,
)
from ..models.Allocation import HostelAllocation
from ..models.Hostel import Hostel, HostelBlock, HostelBed, HostelRoom, HostelRoomType
from .BaseViews import HostelBaseView


def occupancy_map(hostel_ids=None, room_ids=None):
    """room_id -> number of people currently living in it.

    Derived, never stored — see the note in models/Hostel.py.
    """
    q = Q(status=ALLOC_ACTIVE, is_active=True)
    if hostel_ids is not None:
        q &= Q(hostel_id__in=hostel_ids)
    if room_ids is not None:
        q &= Q(room_id__in=room_ids)
    rows = (
        HostelAllocation.objects.filter(q)
        .values("room_id")
        .annotate(n=Count("id"))
    )
    return {r["room_id"]: r["n"] for r in rows}


class HostelView(HostelBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        as_options = self.getBooleanValue(request.query_params.get("as_options"))

        hostels = list(
            Hostel.objects.filter(school_id=school_id, is_active=True)
            .annotate(warden_first=F("warden__first_name"), warden_last=F("warden__last_name"))
            .order_by("name")
            .values(
                "id", "name", "hostel_type", "address", "contact",
                "warden", "warden_first", "warden_last", "remarks",
            )
        )
        if as_options:
            return Response([{"value": h["id"], "name": h["name"]} for h in hostels])

        ids = [h["id"] for h in hostels]
        # Capacity and headcount per hostel, in two queries rather than per row.
        cap = {
            r["hostel_id"]: r["beds"]
            for r in HostelRoom.objects.filter(hostel_id__in=ids, is_active=True)
            .values("hostel_id")
            .annotate(beds=Sum("capacity"))
        }
        heads = {
            r["hostel_id"]: r["n"]
            for r in HostelAllocation.objects.filter(
                hostel_id__in=ids, status=ALLOC_ACTIVE, is_active=True
            )
            .values("hostel_id")
            .annotate(n=Count("id"))
        }
        rooms = {
            r["hostel_id"]: r["n"]
            for r in HostelRoom.objects.filter(hostel_id__in=ids, is_active=True)
            .values("hostel_id")
            .annotate(n=Count("id"))
        }
        for h in hostels:
            warden_name = " ".join(
                p for p in [h.pop("warden_first", None), h.pop("warden_last", None)] if p
            )
            h["warden_name"] = warden_name
            h["hostel_type_name"] = label(HOSTEL_TYPE_CHOICES, h["hostel_type"])
            h["rooms"] = rooms.get(h["id"], 0)
            h["capacity"] = cap.get(h["id"], 0) or 0
            h["occupied"] = heads.get(h["id"], 0)
            h["vacant"] = max((h["capacity"] or 0) - h["occupied"], 0)
        return Response(hostels)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        name = (data.get("name") or "").strip()
        if not name:
            return self.RESPONSE__INVALID_REQUEST
        if Hostel.objects.filter(
            school_id=self.school_id(request), name__iexact=name, is_active=True
        ).exists():
            return self.RESPONSE__ALREADY_EXISTS
        h = Hostel.objects.create(
            school_id=self.school_id(request),
            name=name,
            hostel_type=self.int_or_none(data.get("hostel_type")) or 3,
            address=data.get("address") or None,
            contact=data.get("contact") or None,
            warden_id=self.int_or_none(data.get("warden")),
            remarks=data.get("remarks") or None,
        )
        return Response({"message": "Hostel saved!", "id": h.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        h = Hostel.objects.filter(
            id=data.get("id"), school_id=self.school_id(request)
        ).first()
        if not h:
            return self.RESPONSE__NOT_FOUND
        name = (data.get("name") or h.name).strip()
        clash = Hostel.objects.filter(
            school_id=h.school_id, name__iexact=name, is_active=True
        ).exclude(id=h.id)
        if clash.exists():
            return self.RESPONSE__ALREADY_EXISTS
        h.name = name
        h.hostel_type = self.int_or_none(data.get("hostel_type")) or h.hostel_type
        h.address = data.get("address") or None
        h.contact = data.get("contact") or None
        h.warden_id = self.int_or_none(data.get("warden"))
        h.remarks = data.get("remarks") or None
        h.save()
        return Response({"message": "Hostel updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        h = Hostel.objects.filter(
            id=request.query_params.get("id"), school_id=self.school_id(request)
        ).first()
        if not h:
            return self.RESPONSE__NOT_FOUND
        if HostelAllocation.objects.filter(hostel=h).exists():
            return Response(
                {
                    "message": "This hostel has student records against it and "
                    "cannot be deleted. Its history has to stay."
                },
                status=400,
            )
        # Soft delete, like the rest of the product.
        h.is_active = False
        h.save(update_fields=["is_active"])
        return Response({"message": "Hostel removed!"})


class HostelBlockView(HostelBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        hostel_id = request.query_params.get("hostel")
        if not hostel_id:
            return Response([])
        rows = list(
            HostelBlock.objects.filter(
                hostel_id=hostel_id,
                hostel__school_id=self.school_id(request),
                is_active=True,
            )
            .annotate(rooms=Count("rooms", filter=Q(rooms__is_active=True)))
            .order_by("name")
            .values("id", "name", "floors", "warden", "remarks", "rooms")
        )
        if self.getBooleanValue(request.query_params.get("as_options")):
            return Response([{"value": r["id"], "name": r["name"]} for r in rows])
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        hostel = self._hostel(request, data.get("hostel"))
        if not hostel:
            return self.RESPONSE__NOT_FOUND
        name = (data.get("name") or "").strip()
        if not name:
            return self.RESPONSE__INVALID_REQUEST
        if HostelBlock.objects.filter(
            hostel=hostel, name__iexact=name, is_active=True
        ).exists():
            return self.RESPONSE__ALREADY_EXISTS
        b = HostelBlock.objects.create(
            hostel=hostel,
            name=name,
            floors=self.int_or_none(data.get("floors")) or 1,
            warden_id=self.int_or_none(data.get("warden")),
            remarks=data.get("remarks") or None,
        )
        return Response({"message": "Block saved!", "id": b.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        b = HostelBlock.objects.filter(
            id=data.get("id"), hostel__school_id=self.school_id(request)
        ).first()
        if not b:
            return self.RESPONSE__NOT_FOUND
        b.name = (data.get("name") or b.name).strip()
        b.floors = self.int_or_none(data.get("floors")) or b.floors
        b.warden_id = self.int_or_none(data.get("warden"))
        b.remarks = data.get("remarks") or None
        b.save()
        return Response({"message": "Block updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        b = HostelBlock.objects.filter(
            id=request.query_params.get("id"),
            hostel__school_id=self.school_id(request),
        ).first()
        if not b:
            return self.RESPONSE__NOT_FOUND
        if HostelRoom.objects.filter(block=b, is_active=True).exists():
            return Response(
                {"message": "This block still has rooms in it."}, status=400
            )
        b.is_active = False
        b.save(update_fields=["is_active"])
        return Response({"message": "Block removed!"})

    def _hostel(self, request, hostel_id):
        return Hostel.objects.filter(
            id=hostel_id, school_id=self.school_id(request), is_active=True
        ).first()


class HostelRoomTypeView(HostelBaseView):
    FIELDS = (
        "id", "name", "bed_count", "monthly_fee", "admission_fee",
        "security_deposit", "is_ac", "remarks",
    )

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        hostel_id = request.query_params.get("hostel")
        if not hostel_id:
            return Response([])
        rows = list(
            HostelRoomType.objects.filter(
                hostel_id=hostel_id,
                hostel__school_id=self.school_id(request),
                is_active=True,
            )
            .order_by("name")
            .values(*self.FIELDS)
        )
        if self.getBooleanValue(request.query_params.get("as_options")):
            return Response([{"value": r["id"], "name": r["name"]} for r in rows])
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        hostel = Hostel.objects.filter(
            id=data.get("hostel"), school_id=self.school_id(request), is_active=True
        ).first()
        if not hostel:
            return self.RESPONSE__NOT_FOUND
        name = (data.get("name") or "").strip()
        if not name:
            return self.RESPONSE__INVALID_REQUEST
        if HostelRoomType.objects.filter(
            hostel=hostel, name__iexact=name, is_active=True
        ).exists():
            return self.RESPONSE__ALREADY_EXISTS
        rt = HostelRoomType.objects.create(
            hostel=hostel,
            name=name,
            bed_count=self.int_or_none(data.get("bed_count")) or 1,
            monthly_fee=self.decimal_or_zero(data.get("monthly_fee")),
            admission_fee=self.decimal_or_zero(data.get("admission_fee")),
            security_deposit=self.decimal_or_zero(data.get("security_deposit")),
            is_ac=bool(data.get("is_ac")),
            remarks=data.get("remarks") or None,
        )
        return Response({"message": "Room type saved!", "id": rt.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        rt = HostelRoomType.objects.filter(
            id=data.get("id"), hostel__school_id=self.school_id(request)
        ).first()
        if not rt:
            return self.RESPONSE__NOT_FOUND
        rt.name = (data.get("name") or rt.name).strip()
        rt.bed_count = self.int_or_none(data.get("bed_count")) or rt.bed_count
        rt.monthly_fee = self.decimal_or_zero(data.get("monthly_fee"))
        rt.admission_fee = self.decimal_or_zero(data.get("admission_fee"))
        rt.security_deposit = self.decimal_or_zero(data.get("security_deposit"))
        rt.is_ac = bool(data.get("is_ac"))
        rt.remarks = data.get("remarks") or None
        rt.save()
        # NOTE: re-pricing a room type NEVER re-prices anybody's stay. Each
        # allocation carries its own `monthly_fee`, snapshot at check-in, and
        # that is what the billing seam reads.
        return Response({"message": "Room type updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        rt = HostelRoomType.objects.filter(
            id=request.query_params.get("id"),
            hostel__school_id=self.school_id(request),
        ).first()
        if not rt:
            return self.RESPONSE__NOT_FOUND
        if HostelRoom.objects.filter(room_type=rt, is_active=True).exists():
            return Response(
                {"message": "Rooms are still set to this type."}, status=400
            )
        rt.is_active = False
        rt.save(update_fields=["is_active"])
        return Response({"message": "Room type removed!"})


class HostelRoomView(HostelBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        hostel_id = params.get("hostel")
        if not hostel_id:
            return Response([])
        q = Q(
            hostel_id=hostel_id,
            hostel__school_id=self.school_id(request),
            is_active=True,
        )
        if params.get("block"):
            q &= Q(block_id=params.get("block"))
        if params.get("room_type"):
            q &= Q(room_type_id=params.get("room_type"))

        rooms = list(
            HostelRoom.objects.filter(q)
            .annotate(
                block_name=F("block__name"),
                room_type_name=F("room_type__name"),
                monthly_fee=F("room_type__monthly_fee"),
            )
            .order_by("block__name", "floor", "room_no")
            .values(
                "id", "room_no", "floor", "block", "block_name", "room_type",
                "room_type_name", "monthly_fee", "capacity", "status", "remarks",
            )
        )
        occ = occupancy_map(room_ids=[r["id"] for r in rooms])
        beds = {
            r["room_id"]: r["n"]
            for r in HostelBed.objects.filter(
                room_id__in=[r["id"] for r in rooms], is_active=True
            )
            .values("room_id")
            .annotate(n=Count("id"))
        }
        out = []
        for r in rooms:
            r["occupied"] = occ.get(r["id"], 0)
            r["vacant"] = max(r["capacity"] - r["occupied"], 0)
            r["beds"] = beds.get(r["id"], 0)
            r["status_name"] = label(ROOM_STATUS_CHOICES, r["status"])
            r["allocatable"] = (
                r["status"] in ROOM_ALLOCATABLE_STATUSES and r["vacant"] > 0
            )
            out.append(r)
        # `available=true` is what the allocation screen asks for: only rooms a
        # student can actually be put into today.
        if self.getBooleanValue(params.get("available")):
            out = [r for r in out if r["allocatable"]]
        if self.getBooleanValue(params.get("as_options")):
            return Response(
                [
                    {
                        "value": r["id"],
                        "name": f"{r['room_no']}"
                        + (f" ({r['block_name']})" if r["block_name"] else "")
                        + f" — {r['vacant']} free",
                    }
                    for r in out
                ]
            )
        return Response(out)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        hostel = Hostel.objects.filter(
            id=data.get("hostel"), school_id=self.school_id(request), is_active=True
        ).first()
        if not hostel:
            return self.RESPONSE__NOT_FOUND
        room_no = (data.get("room_no") or "").strip()
        if not room_no:
            return self.RESPONSE__INVALID_REQUEST
        if HostelRoom.objects.filter(
            hostel=hostel, room_no__iexact=room_no, is_active=True
        ).exists():
            return self.RESPONSE__ALREADY_EXISTS

        room_type = HostelRoomType.objects.filter(
            id=data.get("room_type"), hostel=hostel
        ).first()
        capacity = self.int_or_none(data.get("capacity")) or (
            room_type.bed_count if room_type else 1
        )
        room = HostelRoom.objects.create(
            hostel=hostel,
            block_id=self.int_or_none(data.get("block")),
            room_no=room_no,
            floor=self.int_or_none(data.get("floor")) or 0,
            room_type=room_type,
            capacity=capacity,
            status=self.int_or_none(data.get("status")) or 1,
            remarks=data.get("remarks") or None,
        )
        # Beds are numbered up front so bed-level allocation works from the
        # first day without a second setup step. A school that does not care
        # about beds simply never looks at them.
        if self.getBooleanValue(data.get("create_beds")) is not False:
            HostelBed.objects.bulk_create(
                [HostelBed(room=room, bed_no=str(i + 1)) for i in range(capacity)]
            )
        return Response({"message": "Room saved!", "id": room.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        room = HostelRoom.objects.filter(
            id=data.get("id"), hostel__school_id=self.school_id(request)
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        occupied = occupancy_map(room_ids=[room.id]).get(room.id, 0)
        capacity = self.int_or_none(data.get("capacity")) or room.capacity
        if capacity < occupied:
            return Response(
                {
                    "message": f"{occupied} student(s) live in this room — "
                    f"capacity cannot be set below that."
                },
                status=400,
            )
        room.room_no = (data.get("room_no") or room.room_no).strip()
        room.block_id = self.int_or_none(data.get("block"))
        room.floor = self.int_or_none(data.get("floor")) or 0
        room.room_type_id = self.int_or_none(data.get("room_type"))
        room.capacity = capacity
        room.status = self.int_or_none(data.get("status")) or room.status
        room.remarks = data.get("remarks") or None
        room.save()
        return Response({"message": "Room updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        room = HostelRoom.objects.filter(
            id=request.query_params.get("id"),
            hostel__school_id=self.school_id(request),
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        if HostelAllocation.objects.filter(room=room).exists():
            return Response(
                {
                    "message": "Students have been allocated to this room. It "
                    "cannot be deleted — mark it Blocked instead."
                },
                status=400,
            )
        room.is_active = False
        room.save(update_fields=["is_active"])
        HostelBed.objects.filter(room=room).update(is_active=False)
        return Response({"message": "Room removed!"})


class HostelBedView(HostelBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        room_id = request.query_params.get("room")
        if not room_id:
            return Response([])
        room = HostelRoom.objects.filter(
            id=room_id, hostel__school_id=self.school_id(request)
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        taken = {
            a["bed_id"]: a
            for a in HostelAllocation.objects.filter(
                room=room, status=ALLOC_ACTIVE, is_active=True, bed__isnull=False
            ).values("bed_id", "student_id", "student__first_name", "student__last_name")
        }
        beds = list(
            HostelBed.objects.filter(room=room, is_active=True)
            .order_by("bed_no")
            .values("id", "bed_no", "remarks")
        )
        for b in beds:
            occ = taken.get(b["id"])
            b["student"] = occ["student_id"] if occ else None
            b["student_name"] = (
                f"{occ['student__first_name']} {occ['student__last_name']}"
                if occ
                else ""
            )
            b["free"] = occ is None
        if self.getBooleanValue(request.query_params.get("free_only")):
            beds = [b for b in beds if b["free"]]
        if self.getBooleanValue(request.query_params.get("as_options")):
            return Response(
                [{"value": b["id"], "name": f"Bed {b['bed_no']}"} for b in beds]
            )
        return Response(beds)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        room = HostelRoom.objects.filter(
            id=data.get("room"), hostel__school_id=self.school_id(request)
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        bed_no = (data.get("bed_no") or "").strip()
        if not bed_no:
            return self.RESPONSE__INVALID_REQUEST
        try:
            bed = HostelBed.objects.create(room=room, bed_no=bed_no)
        except IntegrityError:
            return self.RESPONSE__ALREADY_EXISTS
        if HostelBed.objects.filter(room=room, is_active=True).count() > room.capacity:
            room.capacity = HostelBed.objects.filter(room=room, is_active=True).count()
            room.save(update_fields=["capacity"])
        return Response({"message": "Bed added!", "id": bed.id})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        bed = HostelBed.objects.filter(
            id=request.query_params.get("id"),
            room__hostel__school_id=self.school_id(request),
        ).first()
        if not bed:
            return self.RESPONSE__NOT_FOUND
        if HostelAllocation.objects.filter(
            bed=bed, status=ALLOC_ACTIVE, is_active=True
        ).exists():
            return Response({"message": "Somebody is in this bed."}, status=400)
        bed.is_active = False
        bed.save(update_fields=["is_active"])
        return Response({"message": "Bed removed!"})
