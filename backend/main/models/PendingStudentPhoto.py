"""Pool of student photos uploaded by an admin but not yet paired with a
specific student. The class teacher (or anyone with the right permission)
opens the per-class pool later and assigns each face to a name.

Lifecycle:
  1. POST /api/students/pending-photos  — admin uploads N images, all written
     here with `class_info` + uploader metadata. No student FK yet.
  2. GET  /api/students/pending-photos?class_info=… — staff pulls the pool.
  3. POST /api/students/pending-photos/pair — { pending_id, student } — the
     file is moved onto Student.image, then this row is hard-deleted (the
     file lives on Student.image now; keeping the row would double-count
     storage).
  4. DELETE /api/students/pending-photos?id=… — discard an unwanted upload.

The image lives on disk under `pending_student_photos/<year>/`; nothing in
this model is academic-year scoped because the photo is just an artifact.
"""

from django.db.models import ForeignKey, ImageField, CASCADE, SET_NULL

from .BaseModel import BaseModel, CustomCharField, _allow_empty


class PendingStudentPhoto(BaseModel):
    # Class the photo was uploaded *for*. The staff teaching this class will
    # see all rows with this FK in the pairing UI.
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    image = ImageField(upload_to="pending_student_photos/%Y/")
    # Optional caption uploaders can attach if a face is hard to recognise
    # without context (e.g. "back row, blue shirt"). Free-text.
    note = CustomCharField(min_length=1, max_length=120, **_allow_empty)
    # Audit: who uploaded. Nullable because user accounts can be removed
    # later and we'd rather keep the photo than cascade-delete it.
    uploader_staff = ForeignKey(
        "main.Staff", on_delete=SET_NULL, **_allow_empty,
        related_name="uploaded_pending_photos",
    )

    def __str__(self):
        return f"PendingStudentPhoto<{self.id}> class={self.class_info_id}"
