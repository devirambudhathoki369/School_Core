"""Pending student photo pool — see PendingStudentPhoto.py for the lifecycle.

Endpoints (all under /api/students/pending-photos):
  POST   ?              multipart upload to the pool (admin step)
                        body: school, class_info, photos[]=<file>
                              (optional: notes[]=<str> aligned by index)
  GET    ?class_info=…  list pool rows for that class (staff pairing step)
  POST   /pair          { school, class_info, pending_id, student } — moves
                        the file to Student.image then hard-deletes the row.
                        Implemented as the same view's `put` method to avoid
                        a second URL pattern.
  DELETE ?id=…          discard one (or ?class_info=… to clear the whole pool)
"""

from django.db import transaction
from django.core.files import File
from django.core.files.storage import default_storage
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, JSONParser

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

from ..models.Student import Student
from ..models.PendingStudentPhoto import PendingStudentPhoto
from ..methods.classSections import sibling_class_info_ids
from ..methods.uploads import is_safe_image
from .BaseViews import SecuredAPIView
from .StudentBulkPhotoView import (
    _resolve_school_for_user,
    ALLOWED_CONTENT_TYPES,
    MAX_FILE_SIZE,
    compress_uploaded_image,
)


def _is_truthy(value):
    """Query params arrive as strings; treat the usual affirmatives as True."""
    return str(value).lower() in ("1", "true", "yes", "on")


def _resolve_staff_id_for_user(request):
    """If the caller is a Staff user, return their Staff.id so we can stamp
    uploaded photos with `uploader_staff`. Admins return None — there's no
    Staff row for them and the column is nullable for exactly that reason.

    `request.user` is the StaffAccount; the related Staff row hangs off the
    reverse OneToOne (`account.StaffAccount` ← `main.Staff.account`). The
    default reverse accessor is `staff`, and missing-relation access raises
    DoesNotExist rather than returning None."""
    try:
        return request.user.staff.id
    except Exception:
        return None


class PendingStudentPhotoView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
    )
    parser_classes = (MultiPartParser, JSONParser)

    # ----- POST: upload to pool ------------------------------------------
    def post(self, request):
        school_id = _resolve_school_for_user(
            request, request.data.get("school")
        )
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        try:
            class_info_id = int(request.data.get("class_info"))
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST

        photos = request.FILES.getlist("photos") or request.FILES.getlist("photos[]")
        notes_raw = (
            request.data.getlist("notes")
            if hasattr(request.data, "getlist")
            else []
        ) or []
        if not photos:
            return self.RESPONSE__INVALID_REQUEST

        uploader_staff_id = _resolve_staff_id_for_user(request)

        rejected = []
        to_create = []
        for idx, photo in enumerate(photos):
            content_type = (getattr(photo, "content_type", "") or "").lower()
            if content_type not in ALLOWED_CONTENT_TYPES:
                rejected.append({
                    "name": getattr(photo, "name", "?"),
                    "reason": f"unsupported type: {content_type or 'unknown'}",
                })
                continue
            if getattr(photo, "size", 0) > MAX_FILE_SIZE:
                rejected.append({
                    "name": getattr(photo, "name", "?"),
                    "reason": "file too large",
                })
                continue
            if not is_safe_image(photo):
                rejected.append({
                    "name": getattr(photo, "name", "?"),
                    "reason": "not an image",
                })
                continue
            note = notes_raw[idx] if idx < len(notes_raw) else None
            to_create.append((photo, note))

        if not to_create:
            return Response({"saved": 0, "failed": rejected}, status=400)

        saved = []
        with transaction.atomic():
            for photo, note in to_create:
                row = PendingStudentPhoto(
                    class_info_id=class_info_id,
                    school_id=school_id,
                    note=note or None,
                    uploader_staff_id=uploader_staff_id,
                )
                if hasattr(photo, "seek"):
                    try:
                        photo.seek(0)
                    except Exception:
                        pass
                photo = compress_uploaded_image(photo)
                row.image.save(photo.name, photo, save=False)
                row.save()
                saved.append(row.id)
        return Response({"saved": len(saved), "ids": saved, "failed": rejected})

    # ----- GET: list pool for a class ------------------------------------
    def get(self, request):
        school_id = _resolve_school_for_user(
            request, request.query_params.get("school")
        )
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        try:
            class_info_id = int(request.query_params.get("class_info"))
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST

        # When merging sections, pool photos uploaded to ANY section of this
        # grade are shown together (the matcher treats the grade as one pool).
        if _is_truthy(request.query_params.get("merge_sections")):
            class_ids = sibling_class_info_ids(class_info_id) or [class_info_id]
            pool_filter = {"class_info_id__in": class_ids}
        else:
            pool_filter = {"class_info_id": class_info_id}

        rows = (
            PendingStudentPhoto.objects.filter(
                school_id=school_id,
                is_active=True,
                **pool_filter,
            )
            .order_by("id")
            .values("id", "image", "note", "created_at", "uploader_staff_id")
        )
        data = []
        for r in rows:
            data.append({
                "id": r["id"],
                "image": (default_storage.url(r["image"]) if r["image"] else None),
                "note": r["note"] or "",
                "created_at": r["created_at"],
                "uploader_staff": r["uploader_staff_id"],
            })
        return Response({"data": data})

    # ----- PUT: pair one pending photo with a student --------------------
    def put(self, request):
        school_id = _resolve_school_for_user(
            request, request.data.get("school")
        )
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        try:
            pending_id = int(request.data.get("pending_id"))
            student_id = int(request.data.get("student"))
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST

        pending = (
            PendingStudentPhoto.objects.filter(
                id=pending_id, school_id=school_id, is_active=True
            ).first()
        )
        if not pending:
            return self.RESPONSE__NOT_FOUND
        # Allow pairing to a student in ANY sibling section of the photo's
        # grade, not only the exact class the photo was uploaded for. This is
        # what lets a photo uploaded under "Montessory" be matched to a student
        # sitting in "Montessory (ROSE)". Falls back to the photo's own class.
        class_ids = sibling_class_info_ids(pending.class_info_id) or [
            pending.class_info_id
        ]
        student = (
            Student.objects.filter(
                id=student_id,
                class_info_id__in=class_ids,
                class_info__school_id=school_id,
                is_active=True,
            ).first()
        )
        if not student:
            return Response(
                {"message": "Student not in this class."}, status=400
            )

        old_image_name = (
            student.image.name if student.image and student.image.name else None
        )

        # Re-open the pool file from storage, hand it to Student.image. Then
        # delete the pool row entirely — its file lives on Student now and we
        # don't want it counted twice.
        pool_path = pending.image.name
        with transaction.atomic():
            with default_storage.open(pool_path, "rb") as f:
                student.image.save(
                    pool_path.split("/")[-1],
                    File(f),
                    save=False,
                )
            student.updated_at = timezone.now()
            student.save(update_fields=["image", "updated_at"])
            # Hard-delete the row; its file is replaced by the new
            # Student.image. Keep the pool clean.
            pending.delete()

        # Best-effort cleanups outside the transaction.
        if pool_path:
            try:
                if default_storage.exists(pool_path):
                    default_storage.delete(pool_path)
            except Exception:
                pass
        if old_image_name and old_image_name != student.image.name:
            try:
                if default_storage.exists(old_image_name):
                    default_storage.delete(old_image_name)
            except Exception:
                pass

        return Response({"message": "Paired.", "student_image": student.image.url})

    # ----- DELETE: discard one or clear class pool -----------------------
    def delete(self, request):
        school_id = _resolve_school_for_user(
            request, request.query_params.get("school")
        )
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        single_id = request.query_params.get("id")
        class_info_id = request.query_params.get("class_info")
        qs = PendingStudentPhoto.objects.filter(
            school_id=school_id, is_active=True
        )
        if single_id:
            try:
                qs = qs.filter(id=int(single_id))
            except (TypeError, ValueError):
                return self.RESPONSE__INVALID_REQUEST
        elif class_info_id:
            try:
                qs = qs.filter(class_info_id=int(class_info_id))
            except (TypeError, ValueError):
                return self.RESPONSE__INVALID_REQUEST
        else:
            return self.RESPONSE__INVALID_REQUEST

        paths = list(qs.values_list("image", flat=True))
        count, _ = qs.delete()
        for p in paths:
            try:
                if p and default_storage.exists(p):
                    default_storage.delete(p)
            except Exception:
                pass
        return Response({"deleted": count})
