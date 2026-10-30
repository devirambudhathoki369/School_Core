"""App listing details behind the per-school privacy policy.

  GET /api/app/listing?school=<id>   one school's app identity   (public)
  GET /api/app/listing               every app school's identity (superadmin)
  PUT /api/app/listing               edit one school's listing   (superadmin)

The GET is deliberately public and unauthenticated. Google Play's policy
crawler fetches the privacy policy URL with no session and no JavaScript, and
the page is server-rendered from this response — so anything this endpoint
refuses to answer becomes a policy page that names the wrong app.

Nothing here is private: a school's name, address, office phone and office
email are already printed on its own website, its notices, and the Play listing
the policy belongs to. No student, staff or financial data is reachable through
this view.
"""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from account.auth.Authentication import SuperAdminTokenAuthentication
from .BaseViews import SecuredAPIView
from ..models.SchoolAdmin import SchoolAdmin
from ..models.superadmin.AppListing import SchoolAppListing


# The publisher is the same legal entity for every build — the schools are
# licensees, not developers, and Play shows Cent IT as the developer on all of
# them. Only the app's own name and description change per school.
DEVELOPER_NAME = "Cent IT Solution Pvt. Ltd."
DEVELOPER_EMAIL = "centit37@gmail.com"
DEVELOPER_WEBSITE = "https://nirsabi.com"
DEFAULT_APP_NAME = "SchoolCore"


def default_description(app_name):
    """The product paragraph, with this build's name in it.

    Wording follows the description Google Play already reviewed for
    SchoolCore; only the name is swapped, so a per-school policy makes the
    same claims about the same software.
    """
    return (
        f"{app_name} is a school management system used by the institution named "
        f"in this policy to run its day-to-day operations. It handles student and "
        f"staff enrolment, attendance, student billing, staff payroll and "
        f"accounting, exams, marks entry and result tabulation, and it produces "
        f"the reports the school's administrators work from. Guardians, students "
        f"and staff use the mobile app to see the records the school keeps for "
        f"them. At {app_name}, safeguarding the privacy of our users is paramount. "
        f"We employ advanced security measures to protect personal data and adhere "
        f"to stringent data protection standards to ensure the confidentiality and "
        f"integrity of the information entrusted to us."
    )


def _absolute(request, image):
    if not image:
        return ""
    try:
        return request.build_absolute_uri(image.url)
    except ValueError:
        return ""


def _listing(request, school, listing=None):
    """Everything the policy page needs, with every blank filled in.

    A school with no `SchoolAppListing` row must still render a complete and
    accurate policy, so each override falls back to the school's own record
    rather than to an empty string.
    """
    listing = listing or getattr(school, "app_listing", None)
    app_name = (getattr(listing, "app_name", "") or school.name).strip()
    description = (getattr(listing, "description", "") or "").strip()
    return {
        "school_id": school.id,
        "school_name": school.name,
        "school_address": school.address or "",
        "school_email": school.email or "",
        "school_contact": school.contact or school.telephone or "",
        "school_logo": _absolute(request, school.logo),
        "uses_mobile_app": school.uses_mobile_app,
        #
        "app_name": app_name,
        "app_description": description or default_description(app_name),
        "has_custom_description": bool(description),
        "package_name": getattr(listing, "package_name", "") or "",
        "play_url": getattr(listing, "play_url", "") or "",
        "support_email": (
            getattr(listing, "support_email", "") or school.email or DEVELOPER_EMAIL
        ),
        #
        "developer": DEVELOPER_NAME,
        "developer_email": DEVELOPER_EMAIL,
        "website": DEVELOPER_WEBSITE,
    }


def default_listing():
    """The un-branded SchoolCore policy, for `/privacy_policy` with no school."""
    return {
        "school_id": None,
        "school_name": "",
        "app_name": DEFAULT_APP_NAME,
        "app_description": default_description(DEFAULT_APP_NAME),
        "developer": DEVELOPER_NAME,
        "developer_email": DEVELOPER_EMAIL,
        "website": DEVELOPER_WEBSITE,
        "support_email": DEVELOPER_EMAIL,
    }


class PublicAppListingView(APIView):
    """Read one school's app identity, with no token at all.

    Built as a plain `APIView` for the same reason `PublicSupportInfoView` is:
    `SecuredAPIView` raises as soon as it has authenticators and none match, so
    a public endpoint cannot be made by relaxing it.
    """

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()
    swagger_schema = None

    def get(self, request):
        school_id = (
            request.query_params.get("school")
            or request.query_params.get("schoolid")
            or request.query_params.get("school_id")
        )
        try:
            school_id = int(school_id)
        except (TypeError, ValueError):
            return Response(
                {"message": "A school id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        school = (
            SchoolAdmin.objects.select_related()
            .filter(id=school_id, is_active=True)
            .first()
        )
        if not school:
            # The caller is a page being crawled, not a person. Say plainly that
            # this id has no app so the page can fall back to the generic policy
            # instead of rendering a school name it guessed at.
            return Response(
                {"message": "No app listing for that school."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(_listing(request, school))


class AppListingView(SecuredAPIView):
    """Superadmin editing of the per-school listings."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        school_id = request.query_params.get("school")
        schools = SchoolAdmin.objects.filter(is_active=True).select_related()
        if school_id:
            school = schools.filter(id=school_id).first()
            if not school:
                return self.RESPONSE__NOT_FOUND
            return Response(_listing(request, school))

        # Only the schools that actually ship an app — the rest have no store
        # listing to describe, and padding the console with them hides the ones
        # that matter.
        schools = schools.filter(uses_mobile_app=True).order_by("name")
        return Response([_listing(request, school) for school in schools])

    def put(self, request):
        school = SchoolAdmin.objects.filter(
            id=request.data.get("school") or request.data.get("school_id")
        ).first()
        if not school:
            return self.RESPONSE__NOT_FOUND

        listing, _ = SchoolAppListing.objects.get_or_create(school=school)
        for field in ("app_name", "package_name", "description", "play_url", "support_email"):
            if field in request.data:
                setattr(listing, field, (request.data.get(field) or "").strip())
        listing.save()
        return Response(
            {
                "message": "App listing updated!",
                "listing": _listing(request, school, listing),
            }
        )
