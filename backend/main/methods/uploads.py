import mimetypes
import os

from django.core.exceptions import SuspiciousFileOperation
from django.core.files.storage import FileSystemStorage

# File types a browser will RUN rather than display. Uploads are served from
# the API's own origin (formatImagePath prefixes NEXT_PUBLIC_BASE_URL), so an
# HTML or SVG file opened from there executes with the viewer's session — a
# student's "homework" could act as the teacher who opens it. Documents,
# images, audio, video and archives are unaffected.
ACTIVE_CONTENT_EXTENSIONS = {
    "htm",
    "html",
    "xhtml",
    "xht",
    "shtml",
    "mht",
    "mhtml",
    "svg",
    "svgz",
    "xml",
    "xsl",
    "xslt",
    "js",
    "mjs",
    "swf",
    "php",
    "phtml",
}


SCRIPTABLE_TYPES = {
    "text/xml",
    "application/xml",
    "text/xsl",
    "text/mathml",
    "text/vnd.wap.wml",
    "text/x-component",
    "application/x-shockwave-flash",
}


# What homework may be. A teacher opens these on their own computer, so an .exe
# or .hta a browser would never run is still not something to hand them.
HOMEWORK_EXTENSIONS = {
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "csv",
    "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp",
    "mp3", "m4a", "wav", "ogg", "mp4", "mov", "webm",
}


def is_scriptable_type(content_type):
    """
    True for a served type a browser renders as a document that can run script.

    Any `*+xml` type is opened as an XML document, and an XML document runs a
    <script> in the XHTML namespace -- so .rss, .atom, .kml, .smil, .mml and
    the hundred other XML formats are as live as .html. An extension list
    cannot keep up with them; the type table the server serves by can.
    """
    content_type = (content_type or "").lower()
    return (
        "html" in content_type
        or "javascript" in content_type
        or "ecmascript" in content_type
        or content_type.endswith("+xml")
        or content_type in SCRIPTABLE_TYPES
    )


def is_active_content(name):
    ext = os.path.splitext(str(name or "").strip().rstrip("."))[1].lower()
    if ext.lstrip(".") in ACTIVE_CONTENT_EXTENSIONS:
        return True
    guessed = mimetypes.guess_type("upload" + ext)[0] if ext else None
    return is_scriptable_type(guessed)


class UploadStorage(FileSystemStorage):
    """
    Media storage that will not write a file a browser would run.

    Uploads are served from the API's own origin, so one HTML or SVG file in
    media is script running as whoever opens its link. Each upload path checks
    its own files, but a path that forgets -- a direct `.save()`, a new
    endpoint -- used to store whatever it was handed. Every FileField and
    ImageField write ends here, so this is the one check none can skip.
    """

    def _save(self, name, content):
        if is_active_content(name):
            raise SuspiciousFileOperation(
                "Refused to store %r: browsers run that file type." % name
            )
        return super()._save(name, content)


def is_safe_image(upload):
    """
    True when `upload` really is a raster image with an image file name.

    The photo endpoints accepted a file on its multipart Content-Type — a
    header the uploader writes — and kept the uploader's file name, so
    `x.html` declared as image/jpeg was saved as x.html and served from the
    API's origin. (The resize step hands back the ORIGINAL file whenever Pillow
    can't open it, which is exactly the case for HTML.) These are the checks a
    Django form's ImageField runs: an image extension, and Pillow decoding it.
    """
    from django import forms
    from django.core.exceptions import ValidationError
    from django.core.validators import validate_image_file_extension

    if is_active_content(getattr(upload, "name", "")):
        return False
    try:
        validate_image_file_extension(upload)
        forms.ImageField().to_python(upload)
        return True
    except ValidationError:
        return False
    finally:
        if hasattr(upload, "seek"):
            try:
                upload.seek(0)
            except Exception:
                pass


def reject_active_content(files):
    """The uploaded files whose type would run in a browser, by name."""
    return [
        getattr(f, "name", "")
        for f in files or []
        if hasattr(f, "name") and is_active_content(f.name)
    ]


def reject_non_homework(files):
    """The uploaded files that are not on the homework list, by name."""
    return [
        getattr(f, "name", "")
        for f in files or []
        if hasattr(f, "name")
        and os.path.splitext(str(f.name).strip().rstrip("."))[1].lower().lstrip(".") not in HOMEWORK_EXTENSIONS
    ]
