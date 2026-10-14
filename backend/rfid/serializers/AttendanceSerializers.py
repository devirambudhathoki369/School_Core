from rest_framework import serializers
import datetime

from ..models.Attendance import RFIDAttdUser
from main.models.Student import Student
from main.models.Staff import Staff
from ..services.UsersSyncReg import UsersSyncReg

DIS_STUDENT = 1
DIS_STAFF = 2
DIS_OTHER = 3


def generate_pin_sequence(users, device_id):
    pins = []
    for u in users:
        uid, discriminator = u.get("student"), DIS_STUDENT
        if uid is None:
            uid, discriminator = u["staff"], DIS_STAFF
        pin = f"{device_id}{discriminator}{uid}"
        pins.append(pin)
    return pins


class RFIDAttdUserListSerializer(serializers.ListSerializer):
    def create(self, validated_list):
        device = self.context.get("device")
        pins = generate_pin_sequence(validated_list, device.id)
        # ---
        student_ids = {d["student"] for d in validated_list if d.get("student")}
        staff_ids = {d["staff"] for d in validated_list if d.get("staff")}

        students = (
            {
                s.id: s
                for s in Student.objects.filter(id__in=student_ids).only(
                    "id", "rfid_card"
                )
            }
            if student_ids
            else {}
        )
        staffs = (
            {
                s.id: s
                for s in Staff.objects.filter(id__in=staff_ids).only("id", "rfid_card")
            }
            if staff_ids
            else {}
        )
        # ---
        attd_users = []
        users_payload = []
        for idx, data in enumerate(validated_list):
            student_obj = students.get(data["student"]) if data.get("student") else None
            staff_obj = staffs.get(data["staff"]) if data.get("staff") else None
            data["student"] = student_obj
            data["staff"] = staff_obj
            data["device"] = device
            data["pin"] = pins[idx]
            name = data.pop("name")
            # The card is the profile's source of truth. Fall back to it when the
            # request didn't carry one (e.g. cards saved before the device existed),
            # so the device always receives Card= and badge verify works.
            card = (data.get("card") or "").strip()
            if not card:
                profile = student_obj or staff_obj
                card = (getattr(profile, "rfid_card", "") or "").strip()
                data["card"] = card
            attd_users.append(RFIDAttdUser(**data))
            users_payload.append(
                {
                    "name": name.capitalize(),
                    **({"card": card} if card else {}),
                    "pin": data.get("pin"),
                }
            )
        attd_users = RFIDAttdUser.objects.bulk_create(attd_users, ignore_conflicts=True)
        UsersSyncReg.add_users(device, users_payload)

        return attd_users


class RFIDAttdUserSerializer(serializers.ModelSerializer):
    pin = serializers.CharField(read_only=True, required=False, allow_blank=True)
    password = serializers.CharField(required=False, allow_blank=True)
    card = serializers.CharField(required=False, allow_blank=True)
    tz_str = serializers.CharField(required=False, allow_blank=True)
    # fks
    device = serializers.IntegerField()
    student = serializers.IntegerField(required=False, allow_null=True)
    staff = serializers.IntegerField(required=False, allow_null=True)
    # temporary field, pop later;
    name = serializers.CharField()

    class Meta:
        model = RFIDAttdUser
        fields = "__all__"
        list_serializer_class = RFIDAttdUserListSerializer

    def create(self, validated_data):
        device = self.context.get("device")
        pins = generate_pin_sequence([validated_data], device.id)
        validated_data["pin"] = pins[0]
        # push to device
        name = validated_data.pop("name")
        card = (validated_data.pop("card", "") or "").strip()
        if not card:
            # Fall back to the profile's stored card (source of truth).
            student_id = validated_data.get("student")
            staff_id = validated_data.get("staff")
            if student_id:
                card = (
                    Student.objects.filter(id=student_id)
                    .values_list("rfid_card", flat=True)
                    .first()
                    or ""
                ).strip()
            elif staff_id:
                card = (
                    Staff.objects.filter(id=staff_id)
                    .values_list("rfid_card", flat=True)
                    .first()
                    or ""
                ).strip()
            validated_data["card"] = card
        users_payload = [
            {
                "name": name.capitalize(),
                **({"card": card} if card else {}),
                "pin": validated_data.get("pin"),
            }
        ]
        attd_user = super().create(validated_data)
        UsersSyncReg.add_users(device, users_payload)
        return attd_user

    # validate student, staff
    def validate(self, attrs):
        attrs = super().validate(attrs)
        student = attrs.get("student")
        staff = attrs.get("staff")

        if not student and not staff:
            raise serializers.ValidationError(
                "Either student or staff must be provided."
            )
        if student and staff:
            raise serializers.ValidationError(
                "Only one of student or staff can be set."
            )

        return attrs
