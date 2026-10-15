from django.db import transaction

#
from rest_framework import serializers

#
from account.auth.UserRole import UserRoles

#
from ..models.Attendance import ClassAttendance, StudentAttendance
from ..models.SchoolAdmin import SchoolAdmin
from ..models.ClassInfo import ClassInfo
from ..models.Staff import Staff
from ..models.Student import Student
from ..views.sms.SMSTemplateMixin import SMSTemplateMixin
from ..methods.plainFields import only_plain
from ..methods.push import _in_background
from ..methods.absentSMS import mark_absent_sms_sent


class StudentAttendanceSerializer(serializers.ModelSerializer):
    student = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.only("id").all()
    )
    status = serializers.BooleanField(default=False, required=False)
    reason = serializers.CharField(
        default="", required=False, allow_null=True, allow_blank=True
    )

    class Meta:
        model = StudentAttendance
        fields = "__all__"
        read_only_fields = ["is_active", "class_attendance"]


class ClassAttendanceSerializer(serializers.ModelSerializer, SMSTemplateMixin):
    school = serializers.PrimaryKeyRelatedField(
        queryset=SchoolAdmin.objects.only(
            "id",
            "preferences",
            "account__sms_api",
        ).all()
    )
    # class_info =
    teacher = serializers.IntegerField(required=False)
    attendances = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
    )

    class Meta:
        model = ClassAttendance
        fields = "__all__"
        read_only_fields = ["is_active"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        data = kwargs.get("data", {})
        school_id = data.get("school")
        self.fields["class_info"] = serializers.PrimaryKeyRelatedField(
            queryset=ClassInfo.objects.only("id").filter(school=school_id)
        )
        self.fields["teacher"] = serializers.PrimaryKeyRelatedField(
            queryset=Staff.objects.only("id").filter(school=school_id),
            required=False,
        )

    def validate(self, attrs):
        user_role = self.context.get("user_role")
        if user_role == UserRoles.ROLE_STAFF and attrs.get("teacher") is None:
            raise serializers.ValidationError(
                {"teacher": "Teacher cannot be null for staffs."}
            )

        return attrs

    def create(self, validated_data):
        attendances = validated_data.pop("attendances")
        with transaction.atomic():
            if isinstance(attendances, list) and len(attendances) > 0:
                lookup_params = ["school", "class_info", "date"]  # unique
                lookup_params = {key: validated_data[key] for key in lookup_params}
                created = False

                qs = ClassAttendance.objects.filter(**lookup_params).order_by("-id")
                if qs.exists():
                    class_attd = qs.first()
                    created = False
                else:
                    class_attd = ClassAttendance.objects.create(**validated_data)
                    created = True

                if created:
                    # Absent-student SMS goes out automatically on this path —
                    # attendance marked by a teacher in the app/web. Attendance
                    # taken by RFID/UHF readers never reaches this serializer
                    # (rfid/services/AttendanceReg.py writes the rows directly),
                    # so those schools keep sending manually from the
                    # "Send Messages" flow (AbsentSMSView).
                    # status arrives as a bool from the app, but a client may
                    # send it string-encoded — Django stores those as False too,
                    # so read them as absent here as well.
                    absent_students = [
                        attd.get("student")
                        for attd in attendances
                        if attd.get("status") in (False, "false", "False", 0, "0")
                    ]
                    # NB: rows are persisted unconditionally — they used to be
                    # nested inside the SMS branch, so attendance silently failed
                    # to save whenever the SMS lookup raised.
                    # only_plain: a row's class_attendance_id would override
                    # the roll call set here -- another school's, even.
                    attendances = (
                        StudentAttendance(
                            class_attendance=class_attd,
                            student_id=attd.pop("student"),
                            reason=attd.pop("reason", ""),
                            **only_plain(StudentAttendance, attd)
                        )
                        for attd in attendances
                    )
                    StudentAttendance.objects.bulk_create(attendances)
                    #
                    self.sendAbsentSMSOnSave(
                        validated_data, class_attd, absent_students
                    )
                return class_attd, created

    def sendAbsentSMSOnSave(self, validated_data, class_attd, absent_students):
        """
        Fire the absent-student SMS for a freshly saved (app/web) attendance,
        gated by the school's `sms_on_absences` preference. The message itself is
        built and sent by `SMSTemplateMixin.send_absent_sms` — same template
        (type 4), same placeholders, same gateway as always.

        Sent in a worker thread: the gateway call can take tens of seconds and the
        teacher's save must not wait on it.
        """
        if not absent_students:
            return
        try:
            school = validated_data["school"]
            sms_api = school.account.sms_api
            send_sms_on_absences = school.preferences.get("sms_on_absences") or False
            send_sms_on_absences = self.getBooleanValue(send_sms_on_absences)
        except:
            return
        if not (sms_api and send_sms_on_absences):
            return
        students = Student.objects.filter(id__in=absent_students)
        _in_background(
            self.sendAndMarkAbsentSMS,
            school.id,
            class_attd.class_info_id,
            class_attd.date,
            students,
            sms_api,
        )

    def sendAndMarkAbsentSMS(self, school_id, class_info_id, date, students, sms_api):
        """Send, then flag the class as messaged so the manual "Send Messages"
        page does not charge the school for a second round today."""
        status = self.send_absent_sms(school_id, students, sms_api)
        if status is not None and 200 <= status < 300:
            mark_absent_sms_sent(school_id, class_info_id, date)
        return status

    def getBooleanValue(self, value):
        if not value:
            return None
        try:
            boolean_field = serializers.BooleanField()
            status_value = boolean_field.to_internal_value(value)
            return status_value
        except serializers.ValidationError:
            return None

    # `send_absent_sms` / `template_type_attendance` live on SMSTemplateMixin
    # (inherited); AbsentSMSView calls the same helper for the manual flow.


# DOCS


class AttendanceParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    class_info = serializers.IntegerField(required=False)
    student = serializers.IntegerField(required=False)
    date = serializers.DateField(required=False, help_text="Get data for X date")
    date_from = serializers.DateField(required=False, help_text="Get data from date")
    date_to = serializers.DateField(required=False, help_text="Get data upto date")
    overall = serializers.BooleanField(
        required=False, help_text="Get classwise overall report"
    )
    summary = serializers.BooleanField(required=False, help_text="Get datewise summary")

    def get_fields(self):
        fields = super().get_fields()
        fields["from"] = fields.pop("date_from")
        fields["to"] = fields.pop("date_to")
        return fields


class AttendanceUpdateBodySerializer(serializers.Serializer):
    class_info = serializers.IntegerField()
    class_attendance = serializers.IntegerField(help_text="Attendance pk")
    attendances = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False,
    )
