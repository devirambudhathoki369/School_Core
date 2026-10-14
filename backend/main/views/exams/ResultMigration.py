from django.db.models import F, Window, Q, Subquery, OuterRef, Count, IntegerField
from django.db.models.functions import RowNumber
from django.utils import timezone

#
from collections import defaultdict
from ...models.exams.Result import ClassResult, StudentResult
from ...methods.sectionChange import is_same_grade


class InstanceClone:
    def clone(self, Model, ids: list, extra_update: dict = {}):
        items = Model.objects.filter(id__in=ids).select_for_update()
        cloned = []
        for e in items:
            e.pk = None
            for field, value in extra_update.items():
                setattr(e, field, value)
            cloned.append(e)
        Model.objects.bulk_create(cloned)


class ResultMigrationMixin(InstanceClone):
    def migrate(
        self,
        student_ids: list,
        academic_year: int,
        previous_class: int,
        current_class: int,
    ):
        # Results never cross grades. A section change stays within one grade, so
        # this passes; a cross-grade move (results carried by operator choice)
        # is refused here so another grade's subjects can't leak onto the sheet.
        if not is_same_grade(previous_class, current_class):
            return
        cr_to_update, updated_at = self.extractClassResults(
            academic_year, previous_class, current_class
        )

        self.handleClassResults(student_ids, cr_to_update, updated_at)

    def getMappedClassResults(
        self,
        academic_year: int,
        previous_class: int,
        exam_ids: list = None,
        subject_ids: list = None,
    ):
        """
        {subject_id: [unique class_result_ids], ...}
        """
        query = Q(
            class_info=previous_class,
            exam__academic_year=academic_year,
            is_active=True,
        )
        if subject_ids:
            query &= Q(subject__in=subject_ids)
        if exam_ids:
            query &= Q(exam__in=exam_ids)
        results = (
            ClassResult.objects.filter(query)
            .annotate(
                row_number=Window(
                    expression=RowNumber(),
                    partition_by=[F("exam"), F("subject")],
                    order_by=F("id").desc(),
                )
            )
            .filter(row_number=1)
            .only("id", "exam_id", "subject_id")
        )
        mapped_data = defaultdict(lambda: defaultdict(dict))
        for e in results:
            mapped_data[e.subject_id][e.exam_id] = e.id
        return mapped_data

    def extractClassResults(self, academic_year, previous_class, current_class):
        mapped_class_results = self.getMappedClassResults(academic_year, previous_class)
        mapped_class_results2 = self.getMappedClassResults(academic_year, current_class)
        # print(">>", mapped_class_results)
        # print(">>", mapped_class_results2)
        #
        subject_ids = mapped_class_results.keys()
        cr_to_update = defaultdict(lambda: defaultdict(dict))
        cr_ids_to_duplicate = set()
        cloned_exam_ids = set()
        cloned_subject_ids = set()
        requires_duplication = False
        #
        for subject_id in subject_ids:
            class_results = mapped_class_results.get(subject_id)
            current_class_result = mapped_class_results2.get(subject_id) or {}
            # print(class_results, current_class_result, "\n")
            if class_results:
                for exam_id, cr_id in class_results.items():
                    new_cr_id = current_class_result.get(exam_id)
                    if new_cr_id:
                        cr_to_update[cr_id] = new_cr_id
                    else:
                        requires_duplication = True
                        cr_ids_to_duplicate.add(cr_id)
                        cloned_exam_ids.add(exam_id)
                        cloned_subject_ids.add(subject_id)

        current_time = timezone.now()
        if requires_duplication:
            # print("TO DUPLICATE")
            # print(cr_ids_to_duplicate)
            # print(cloned_exam_ids)
            # print(cloned_subject_ids)
            #
            extra_update = {
                "class_info_id": current_class,
                "created_at": current_time.date(),
                "updated_at": current_time,
            }
            #
            self.clone(ClassResult, cr_ids_to_duplicate, extra_update)
            mapped_class_results2 = self.getMappedClassResults(
                academic_year, current_class, cloned_exam_ids, cloned_subject_ids
            )
            # print(">>", mapped_class_results2)
            for subject_id in cloned_subject_ids:
                class_results = mapped_class_results.get(subject_id)
                cloned_class_result = mapped_class_results2.get(subject_id) or {}
                if class_results:
                    for exam_id, cr_id in class_results.items():
                        new_cr_id = cloned_class_result.get(exam_id)
                        if new_cr_id:
                            cr_to_update[cr_id] = new_cr_id

        return cr_to_update, current_time

    def handleClassResults(self, student_ids: list, cr_to_update: dict, updated_at):
        # print("TO UPDATE", cr_to_update)
        class_results_to_update = list(cr_to_update.keys())
        student_results = (
            StudentResult.objects.filter(
                student__in=student_ids,
                is_active=True,
                class_result__in=class_results_to_update,
            )
            .only("id", "student_id", "class_result_id")
            .select_for_update()
        )
        # print(student_results)
        #
        # A student moved back to a section they were in before can still own an
        # active row on the destination header (left behind by the earlier move).
        # Moving onto it would break uniq_active_student_result_per_student and
        # 500 the whole update. The carried row is the one the sheet shows now,
        # so it wins; the leftover is soft-retired (is_active=False, reversible).
        dest_rows = StudentResult.objects.filter(
            student__in=student_ids,
            is_active=True,
            class_result__in=set(cr_to_update.values()),
        ).values_list("id", "student_id", "class_result_id")
        dest_by_key = {(std, cr): sr_id for sr_id, std, cr in dest_rows}
        moving_keys = {
            (e.student_id, cr_to_update.get(e.class_result_id))
            for e in student_results
        }
        stale_ids = [
            sr_id for key, sr_id in dest_by_key.items() if key in moving_keys
        ]
        if stale_ids:
            StudentResult.objects.filter(id__in=stale_ids).update(
                is_active=False, updated_at=updated_at
            )
        #
        for stdRes in student_results:
            new_cr = cr_to_update.get(stdRes.class_result_id)
            if new_cr:
                setattr(stdRes, "class_result_id", new_cr)
                setattr(stdRes, "updated_at", updated_at)
        StudentResult.objects.bulk_update(
            student_results, ["class_result_id", "updated_at"]
        )
        # Disable Empty Class Results
        empty_class_results = ClassResult.objects.filter(
            id__in=class_results_to_update
        ).annotate(
            results_count=Subquery(
                StudentResult.objects.filter(class_result=OuterRef("id"))
                .values("class_result")
                .annotate(count=Count("id"))
                .values("count")[:1],
                output_field=IntegerField(),
            )
        )
        empty_class_results.filter(results_count=0).update(is_active=False)
