from rest_framework import serializers
from django.db import transaction

#
from ...models.exams.Certificate import CharacterCertificate
from ...models.Student import Student
from ...models.FiscalYears import EconomicYear


class CharacterCertificateSerializer(serializers.ModelSerializer):
    student = serializers.IntegerField(required=False)  #
    serial_no = serializers.CharField(required=False)

    class Meta:
        model = CharacterCertificate
        fields = "__all__"

    def to_internal_value(self, data):
        school_id = data.get("school")
        if school_id:
            queryset = Student.objects.filter(class_info__school=school_id)
            self.fields["student"] = serializers.PrimaryKeyRelatedField(
                queryset=queryset, required=False
            )
        return super().to_internal_value(data)

    def create(self, validated_data):
        with transaction.atomic():
            school = validated_data.get("school")
            prevCertificate = (
                CharacterCertificate.objects.filter(school=school)
                .values("serial_no")
                .order_by("-id")
                .first()
            )
            # print(prevCertificate)
            economic_year = self.getEconomicYear()
            serial_no = 1
            if prevCertificate:
                serial_no = prevCertificate.get("serial_no")
            serial_no = self.generateSerialNumber(economic_year, serial_no)
            validated_data["serial_no"] = serial_no
            return CharacterCertificate.objects.create(**validated_data)

    def generateSerialNumber(self, economic_year: str, previous_serial_no):
        current_number = 0
        prev_year = economic_year

        try:
            if isinstance(previous_serial_no, str) and "/" in previous_serial_no:
                parts = previous_serial_no.split("/")
                for i in range(len(parts)):
                    try:
                        current_number = int(parts[i])
                        prev_year = "/".join(parts[i + 1 :])
                        break
                    except ValueError:
                        continue
            else:
                current_number = int(previous_serial_no)
        except (ValueError, TypeError, AttributeError):
            current_number = 0

        if economic_year != prev_year:
            current_number = 1
        else:
            current_number += 1

        return f"{current_number}/{economic_year}"

    def getEconomicYear(self):
        _year = EconomicYear.objects.filter(closed=False).order_by("-id").first()
        if _year:
            return _year.name
        return "____"
