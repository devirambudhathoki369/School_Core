"""Keep parents linked as student records change (mobile/SPEC.md §4).

The sync runs after the save commits and never raises into it: a problem
linking a parent must not stop the office saving a student.
"""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from main.models.Student import Student, StudentGuardianInfo

logger = logging.getLogger(__name__)


def _sync_later(student_id):
    def run():
        from .guardians import sync_student

        try:
            student = Student.objects.select_related("class_info__school", "guardian_info").filter(pk=student_id).first()
            if student is not None:
                sync_student(student)
        except Exception:
            logger.exception("mobile guardian sync failed for student %s", student_id)

    transaction.on_commit(run)


@receiver(post_save, sender=Student, dispatch_uid="mobileapi.sync_student")
def student_saved(sender, instance, raw=False, **kwargs):
    if not raw:
        _sync_later(instance.pk)


@receiver(post_save, sender=StudentGuardianInfo, dispatch_uid="mobileapi.sync_guardian_info")
def guardian_info_saved(sender, instance, raw=False, **kwargs):
    if raw:
        return
    student_id = Student.objects.filter(guardian_info=instance).values_list("pk", flat=True).first()
    if student_id:
        _sync_later(student_id)
