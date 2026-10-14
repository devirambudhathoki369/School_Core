from django.db import transaction
from rest_framework import serializers

#
from ...models.Student import Student
from ...models.exams.Result import ClassResult, StudentResult
from ...constants.marks_field import MARKS_FIELD_CONFIGS
from ...methods.subjectScope import is_subject_in_class_scope


class ClassResultSerializer(serializers.ModelSerializer):
    published_date = serializers.CharField(required=False)

    class Meta:
        model = ClassResult
        fields = "__all__"
        # The model's unique constraint is what actually keeps one header per
        # subject, and it is scoped to active rows. DRF derives a validator
        # from it that ignores that scope, which would both reject a re-entry
        # after the header was deleted and turn the idempotent save below
        # (`get_or_create`, how a double-submit is absorbed) into a 400.
        validators = []

    def validate(self, attrs):
        """Refuse marks filed under another class's subject.

        Every class has its own `Subject` row per subject name, so a stale
        subject id from the class the user was looking at a moment ago still
        saves — and the gradesheet then shows that name TWICE, once per row,
        with the other class's full/pass marks. Nothing downstream can tell the
        two apart, so it has to be stopped at the door.
        """
        subject = attrs.get("subject")
        class_info = attrs.get("class_info")
        if subject and class_info and not is_subject_in_class_scope(subject, class_info):
            raise serializers.ValidationError(
                {
                    "subject": (
                        f'"{subject.subject}" is not a subject of this class. '
                        "Re-select the subject and try again."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            # A marks header is identified by exam + class + subject and nothing
            # else. Matching on the whole payload (criteria included) made every
            # re-save with a changed full/pass mark mint a SECOND header for the
            # same subject, splitting one subject's marks across two rows that
            # every reader then has to de-duplicate. `is_active` stays in the
            # lookup so a header that was deliberately dropped does not block a
            # fresh entry.
            lookup = {
                "exam": validated_data.get("exam"),
                "class_info": validated_data.get("class_info"),
                "subject": validated_data.get("subject"),
                "is_active": True,
            }
            defaults = {
                key: value
                for key, value in validated_data.items()
                if key not in lookup
            }
            ins, created = ClassResult.objects.get_or_create(**lookup, defaults=defaults)
            empty = not created and not StudentResult.objects.filter(
                class_result=ins, is_active=True
            ).exists()
            if empty:
                # A header carrying no marks at all is a shell: it showed as an
                # empty column on the gradesheet AND made every attempt to enter
                # that subject's marks come back "already exists", with no way
                # out from the UI. Fill it in instead of refusing.
                for key, value in defaults.items():
                    setattr(ins, key, value)
                ins.save(update_fields=list(defaults) or None)
            if created or empty:
                student_results = self.context.get("student_results") or []
                students = {result.get("student") for result in student_results}
                # TODO: can remove this query below by passing student_id instead of student in StudentResult
                students = {
                    std.id: std for std in Student.objects.filter(id__in=students)
                }
                rows, seen = [], set()
                for res in student_results:
                    student_id = res.pop("student", None)
                    student = students.get(student_id)
                    if student is None:
                        # An id the page held for a student who is no longer
                        # there. Blowing up with a KeyError rolled the whole
                        # sheet back and read as a server fault; say which row.
                        raise serializers.ValidationError(
                            {
                                "student_marks": (
                                    f"Student {student_id} no longer exists. "
                                    "Reload the marks entry page and try again."
                                )
                            }
                        )
                    if student_id in seen:
                        # one row per student, whatever the page sent.
                        continue
                    seen.add(student_id)
                    rows.append(
                        StudentResult(class_result=ins, student=student, **res)
                    )
                StudentResult.objects.bulk_create(rows)
            # filling an empty shell counts as a save, not an "already exists".
            return ins, created or empty


class StudentResultSerializer(serializers.ModelSerializer):
    class_result = serializers.IntegerField()
    theory = serializers.DecimalField(**MARKS_FIELD_CONFIGS, required=False)
    practical = serializers.DecimalField(**MARKS_FIELD_CONFIGS, required=False)
    attendance = serializers.IntegerField(required=False)
    inclusion = serializers.DecimalField(**MARKS_FIELD_CONFIGS, required=False)
    absent = serializers.BooleanField(required=False)
    position_in_section = serializers.IntegerField(required=False)
    position_in_class = serializers.IntegerField(required=False)

    class Meta:
        model = StudentResult
        fields = "__all__"


# DOCS
class ResultParamsSerializer(serializers.Serializer):
    school = serializers.IntegerField()
    class_info = serializers.IntegerField(required=False)
    exam = serializers.IntegerField()
    subject = serializers.IntegerField(required=False)
    student = serializers.IntegerField(required=False)
    publish = serializers.BooleanField(required=False)
    extra_activities = serializers.BooleanField(required=False)
    school_info = serializers.BooleanField(required=False)
    type = serializers.CharField(
        default="number", required=False, help_text="result_type i.e. number or letter"
    )
    ledger = serializers.BooleanField(required=False)
    published_only = serializers.BooleanField(required=False)
