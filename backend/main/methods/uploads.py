import os

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


def is_active_content(name):
    ext = os.path.splitext(str(name or "").strip().rstrip("."))[1]
    return ext.lower().lstrip(".") in ACTIVE_CONTENT_EXTENSIONS


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
