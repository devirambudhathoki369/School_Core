"""What `/me` and every sign-in answer say about the signed-in person."""
from main.methods.genClassname import getClassDetails
from main.models.Staff import Staff
from main.models.Student import Student

from .auth import linked_students
from .models import AppSession


def _media(request, file_field):
    if not file_field:
        return None
    try:
        return request.build_absolute_uri(file_field.url)
    except ValueError:
        return None


def _name(person) -> str:
    parts = [person.first_name, getattr(person, "middle_name", None), person.last_name]
    return " ".join(p.strip() for p in parts if p and p.strip())


def _class_name(student) -> str:
    try:
        return getClassDetails(None, cls=student.class_info)[0] or ""
    except Exception:
        return ""


def school_payload(school, request) -> dict:
    return {
        "id": school.id,
        "code": school.app_code,
        "name": school.name,
        "address": school.address or "",
        "logo_url": _media(request, school.logo),
    }


def student_payload(student, request) -> dict:
    return {
        "id": student.id,
        "name": _name(student),
        "class_name": _class_name(student),
        "roll_no": student.roll_no or None,
        "photo_url": _media(request, student.image),
    }


def me_payload(session: AppSession, request) -> dict:
    body = {
        "role": session.role_name,
        "session_id": str(session.id),
        "school": school_payload(session.school, request),
    }
    account = session.account
    if session.role == AppSession.PARENT:
        children = linked_students(account).select_related("class_info__section", "class_info__course").order_by(
            "first_name", "last_name", "id"
        )
        body["profile"] = {"name": account.name, "email": account.email, "phone_last_digits": account.phone[-3:]}
        body["children"] = [student_payload(s, request) for s in children]
    elif session.role == AppSession.STUDENT:
        student = Student.objects.select_related("class_info__section", "class_info__course").get(
            account=account, class_info__school_id=session.school_id
        )
        body["profile"] = {**student_payload(student, request), "username": account.username}
    elif session.role == AppSession.STAFF:
        staff = Staff.objects.select_related("role").get(account=account, school_id=session.school_id)
        body["profile"] = {
            "id": staff.id,
            "name": _name(staff),
            "designation": staff.role.role if staff.role_id else "",
            "photo_url": _media(request, staff.image),
            "username": account.username,
        }
        body["permissions"] = sorted({int(p) for p in (staff.permissions or []) if str(p).isdigit()})
    else:
        body["profile"] = {"name": session.school.name, "username": account.username}
    return body
