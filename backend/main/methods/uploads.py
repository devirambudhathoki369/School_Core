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


def reject_active_content(files):
    """The uploaded files whose type would run in a browser, by name."""
    return [
        getattr(f, "name", "")
        for f in files or []
        if hasattr(f, "name") and is_active_content(f.name)
    ]
