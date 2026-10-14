"""Bulk student photo upload.

POST /api/students/bulk-photos
Multipart body:
  school        — school id (required)
  class_info    — class id; students must belong to this class + school
  pairs[i][student] — student id
  pairs[i][photo]   — image file (jpg/jpeg/png)

Authenticated by both Admin and Staff tokens — the admin's whole-school view
and the staff (class teacher) flow share the endpoint. School scoping comes
from the token's profile (admin) or the staff's `school` FK; the caller-
supplied `school` is cross-checked against that.

Response: {"saved": N, "failed": [{student, reason}, ...]}
"""

import io
import os
from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

from ..models.Student import Student
from ..methods.uploads import is_safe_image
from .BaseViews import SecuredAPIView


ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4 MB cap per photo (post-compression on the client)
# Server-side resize target. The client compressor already produces ~700px
# JPEGs; this is the belt-and-suspenders pass that runs no matter what the
# client did, so a forged or unupdated client can never push a 10 MB file.
RESIZE_MAX_DIM = 800
RESIZE_QUALITY = 82


def compress_uploaded_image(uploaded):
    """Re-encode an uploaded image as a JPEG no larger than RESIZE_MAX_DIM on
    the long edge. Returns a new InMemoryUploadedFile the view can hand to
    ImageField.save. If anything goes wrong (PIL can't open it, unexpected
    mode, etc.) we return the original — the front-end already compressed
    once, so silently falling through is safer than 500-ing the batch."""
    try:
        from PIL import Image, ImageOps
    except Exception:
        return uploaded
    try:
        if hasattr(uploaded, "seek"):
            uploaded.seek(0)
        img = Image.open(uploaded)
        # Honour EXIF orientation so portrait shots aren't saved sideways.
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        long_edge = max(w, h)
        if long_edge > RESIZE_MAX_DIM:
            scale = RESIZE_MAX_DIM / float(long_edge)
            img = img.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                Image.LANCZOS,
            )
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=RESIZE_QUALITY, optimize=True)
        size = buf.tell()
        buf.seek(0)
        base = os.path.splitext(getattr(uploaded, "name", "photo") or "photo")[0]
        return InMemoryUploadedFile(
            buf, None, f"{base}.jpg", "image/jpeg", size, None
        )
    except Exception:
        try:
            if hasattr(uploaded, "seek"):
                uploaded.seek(0)
        except Exception:
            pass
        return uploaded


def _resolve_school_for_user(request, requested_school_id):
    """Resolve the school the caller is allowed to write to.

    `request.user` is an AdminAccount or StaffAccount row — NOT the SchoolAdmin
    or Staff row. The school id has to come from the reverse OneToOne:
      AdminAccount → SchoolAdmin (reverse accessor `schooladmin`); SchoolAdmin.id IS the school.
      StaffAccount → Staff (reverse accessor `staff`); Staff.school_id is the school.
    Accessing a missing reverse OneToOne raises DoesNotExist, so guard with try/except.
    If the caller supplied a `school` field we make sure it matches — this
    prevents an admin from one school from posting photos into another."""
    profile_school_id = None
    try:
        profile_school_id = request.user.schooladmin.id
    except Exception:
        try:
            profile_school_id = request.user.staff.school_id
        except Exception:
            profile_school_id = None
    if not requested_school_id:
        return profile_school_id
    try:
        requested = int(requested_school_id)
    except (TypeError, ValueError):
        return None
    if profile_school_id and int(profile_school_id) != requested:
        return None
    return requested


def _iter_pairs(request):
    """Walk the flat multipart form looking for `pairs[i][student]` +
    `pairs[i][photo]`. Yields (index, student_id_str, uploaded_file).

    DRF's MultiPartParser preserves the raw keys, so we just regex over them
    to collect indices then look each one up — no array reconstruction
    middleware required."""
    seen_indices = set()
    for key in list(request.data.keys()) + list(request.FILES.keys()):
        # match "pairs[<digits>][student]" or "pairs[<digits>][photo]"
        if key.startswith("pairs[") and ("][student]" in key or "][photo]" in key):
            idx = key.split("[", 1)[1].split("]", 1)[0]
            seen_indices.add(idx)
    for idx in sorted(seen_indices, key=lambda x: int(x) if x.isdigit() else 0):
        student_id = request.data.get(f"pairs[{idx}][student]")
        photo = request.FILES.get(f"pairs[{idx}][photo]")
        if student_id and photo:
            yield idx, str(student_id), photo


class StudentBulkPhotoView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
    )
    parser_classes = (MultiPartParser,)

    def post(self, request):
        school_id = _resolve_school_for_user(
            request, request.data.get("school")
        )
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        class_info_id = request.data.get("class_info")
        if not class_info_id:
            return self.RESPONSE__INVALID_REQUEST
        try:
            class_info_id = int(class_info_id)
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST

        pairs = list(_iter_pairs(request))
        if not pairs:
            return self.RESPONSE__INVALID_REQUEST

        # Validate each upload BEFORE we touch the DB so a bad batch fails
        # fast and atomically — no half-saved state.
        rejected = []
        valid_pairs = []
        for idx, student_id_str, photo in pairs:
            try:
                student_id = int(student_id_str)
            except (TypeError, ValueError):
                rejected.append({"student": student_id_str, "reason": "bad student id"})
                continue
            content_type = (getattr(photo, "content_type", "") or "").lower()
            if content_type not in ALLOWED_CONTENT_TYPES:
                rejected.append(
                    {"student": student_id, "reason": f"unsupported type: {content_type or 'unknown'}"}
                )
                continue
            if getattr(photo, "size", 0) > MAX_FILE_SIZE:
                rejected.append({"student": student_id, "reason": "file too large"})
                continue
            if not is_safe_image(photo):
                rejected.append({"student": student_id, "reason": "not an image"})
                continue
            valid_pairs.append((student_id, photo))

        if not valid_pairs:
            return Response({"saved": 0, "failed": rejected}, status=400)

        # One query to fetch every targeted student, scoped to the class+school
        # the caller claimed. Students that don't match are silently rejected
        # rather than 404'd — typical when the page is stale (a student was
        # moved out of this class between page-load and submit).
        student_ids = [sid for sid, _ in valid_pairs]
        students = {
            s.id: s
            for s in Student.objects.filter(
                id__in=student_ids,
                class_info_id=class_info_id,
                class_info__school_id=school_id,
                is_active=True,
            )
        }

        saved = 0
        updated_at = timezone.now()
        old_paths_to_delete = []
        with transaction.atomic():
            for student_id, photo in valid_pairs:
                student = students.get(student_id)
                if not student:
                    rejected.append(
                        {"student": student_id, "reason": "not in this class"}
                    )
                    continue
                # Hold the previous file path so we can clean it up AFTER the
                # transaction commits — never inside, in case the slow disk
                # holds the row lock.
                if student.image and getattr(student.image, "name", None):
                    old_paths_to_delete.append(student.image.name)
                # Reset the file pointer just in case the validator above
                # left it past the end, then run the server-side resize so
                # the saved file is bounded regardless of what the client did.
                if hasattr(photo, "seek"):
                    try:
                        photo.seek(0)
                    except Exception:
                        pass
                photo = compress_uploaded_image(photo)
                student.image.save(photo.name, photo, save=False)
                student.updated_at = updated_at
                student.save(update_fields=["image", "updated_at"])
                saved += 1

        # Best-effort cleanup of old files. A failure here doesn't matter —
        # the DB row already points at the new file.
        if old_paths_to_delete:
            storage = None
            try:
                from django.core.files.storage import default_storage as storage
            except Exception:
                storage = None
            for path in old_paths_to_delete:
                try:
                    if storage and storage.exists(path):
                        storage.delete(path)
                except Exception:
                    pass

        return Response({"saved": saved, "failed": rejected})
