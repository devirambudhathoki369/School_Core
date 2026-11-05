"""Parents from student records, and the school-issued family codes
(mobile/SPEC.md §2 and §4).

One rule links a number to its students, used both by ``link_guardians``
(the backfill) and by the signal that follows later changes:

- a number that is not a Nepali mobile number is skipped;
- one guardian per school and number;
- if every student sharing the number has the same family name, they are
  linked; otherwise the links wait for the school's review, because the
  number may be the school's own or a relative's.

Links the school decided, or added itself, are never changed here.
"""
import re
import secrets
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from main.models.Guardian import EMAIL_REGEX, MOBILE_PHONE_REGEX, Guardian, StudentGuardian
from main.models.Student import Student

from .models import FamilyCode
from .tokens import code_hash

STUDENT_RUNNING = 1
FAMILY_CODE_DAYS = 7
# No 0/O, 1/I/L: a code read out over the phone or copied from paper.
FAMILY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
FAMILY_CODE_LENGTH = 8


def normalize_phone(raw) -> str | None:
    digits = re.sub(r"\D", "", str(raw or ""))
    if len(digits) == 13 and digits.startswith("977"):
        digits = digits[3:]
    return digits if re.fullmatch(MOBILE_PHONE_REGEX, digits) else None


def normalize_email(raw) -> str | None:
    email = str(raw or "").strip().lower()
    return email if len(email) <= 254 and re.fullmatch(EMAIL_REGEX, email) else None


def _family(student) -> str:
    return re.sub(r"\s+", " ", (student.last_name or "").strip().lower())


def _guardian_name(info) -> str:
    for name in (info.guardian_name, info.father_name, info.mother_name):
        if name and name.strip():
            return re.sub(r"\s+", " ", name.strip())[:100]
    return ""


@dataclass
class LinkReport:
    students: int = 0
    not_mobile: int = 0
    guardians_new: int = 0
    links_linked: int = 0
    links_review: int = 0
    emails_set: int = 0
    email_conflicts: list = field(default_factory=list)

    def add(self, other: "LinkReport"):
        for name in ("students", "not_mobile", "guardians_new", "links_linked", "links_review", "emails_set"):
            setattr(self, name, getattr(self, name) + getattr(other, name))
        self.email_conflicts += other.email_conflicts


def _active_students(school):
    return Student.objects.filter(
        class_info__school=school, is_active=True, status=STUDENT_RUNNING
    ).select_related("guardian_info")


def _link_number(school, phone, students, report: LinkReport):
    names = Counter(_guardian_name(s.guardian_info) for s in students)
    names.pop("", None)
    name = names.most_common(1)[0][0] if names else ""
    guardian, created = Guardian.objects.get_or_create(school=school, phone=phone, defaults={"name": name})
    if created:
        report.guardians_new += 1
    elif not guardian.name and name:
        guardian.name = name
        guardian.save(update_fields=["name", "updated_at"])

    state = StudentGuardian.LINKED if len({_family(s) for s in students}) == 1 else StudentGuardian.NEEDS_REVIEW
    now = timezone.now()
    for student in students:
        link, made = StudentGuardian.objects.get_or_create(
            student=student,
            guardian=guardian,
            defaults={
                "relation": StudentGuardian.GUARDIAN,
                "state": state,
                "source": StudentGuardian.FROM_RECORD,
                "decided_at": None if state == StudentGuardian.NEEDS_REVIEW else now,
            },
        )
        if not made:
            continue
        if state == StudentGuardian.LINKED:
            report.links_linked += 1
            if not StudentGuardian.objects.filter(student=student, is_primary=True).exists():
                StudentGuardian.objects.filter(pk=link.pk).update(is_primary=True)
        else:
            report.links_review += 1
    return guardian


def _set_emails(school, guardians_students, report: LinkReport):
    """Put each record email on one guardian of the school.

    An address seen with several numbers stays with the guardian who has
    the most students, and the others are reported instead of guessed at.
    """
    by_email = defaultdict(list)
    for guardian, students in guardians_students:
        emails = Counter(normalize_email(s.guardian_info.guardian_email) for s in students)
        emails.pop(None, None)
        if emails:
            by_email[emails.most_common(1)[0][0]].append((len(students), guardian))
    for email, owners in by_email.items():
        owners.sort(key=lambda pair: (-pair[0], pair[1].pk))
        owner = owners[0][1]
        taken = Guardian.objects.filter(school=school, email=email).exclude(pk=owner.pk).exists()
        if owner.email is None and not taken:
            owner.email = email
            owner.save(update_fields=["email", "updated_at"])
            report.emails_set += 1
        for _, other in owners[1:]:
            report.email_conflicts.append((email, other.phone))


def link_school(school) -> LinkReport:
    """Create the school's guardians and links from its active students."""
    report = LinkReport()
    by_phone = defaultdict(list)
    for student in _active_students(school):
        report.students += 1
        phone = normalize_phone(student.guardian_info.guardian_contact)
        if phone is None:
            report.not_mobile += 1
            continue
        by_phone[phone].append(student)
    done = []
    for phone, students in sorted(by_phone.items()):
        done.append((_link_number(school, phone, students, report), students))
    _set_emails(school, done, report)
    return report


def sync_student(student) -> None:
    """Follow one student's contact on record: drop the stale link, add the new."""
    school = student.class_info.school
    if not school.uses_mobile_app:
        return
    phone = normalize_phone(student.guardian_info.guardian_contact) if student.guardian_info_id else None
    with transaction.atomic():
        stale = StudentGuardian.objects.filter(student=student, source=StudentGuardian.FROM_RECORD)
        if phone:
            stale = stale.exclude(guardian__phone=phone)
        stale.delete()
        if phone and student.is_active and student.status == STUDENT_RUNNING:
            sharing = [
                s for s in _active_students(school).filter(guardian_info__guardian_contact__contains=phone)
                if normalize_phone(s.guardian_info.guardian_contact) == phone
            ]
            _link_number(school, phone, sharing, LinkReport())


def normalize_family_code(raw) -> str:
    return re.sub(r"[\s-]", "", str(raw or "")).upper()


def issue_family_code(guardian, *, admin=None, staff=None) -> str:
    """A new single-use family code; any earlier live one is cancelled."""
    code = "".join(secrets.choice(FAMILY_ALPHABET) for _ in range(FAMILY_CODE_LENGTH))
    now = timezone.now()
    with transaction.atomic():
        FamilyCode.objects.filter(guardian=guardian, used_at__isnull=True, revoked_at__isnull=True).update(
            revoked_at=now
        )
        FamilyCode.objects.create(
            guardian=guardian,
            code_hash=code_hash(code),
            issued_by_admin=admin,
            issued_by_staff=staff,
            created_at=now,
            expires_at=now + timedelta(days=FAMILY_CODE_DAYS),
        )
    return f"{code[:4]}-{code[4:]}"
