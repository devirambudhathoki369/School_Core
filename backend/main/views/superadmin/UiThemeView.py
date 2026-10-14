"""Which interface theme each school's screens are drawn in.

  GET  /api/manage/ui-themes            (superadmin)
       every active school with its theme, plus the list of themes to choose
       from, so the picker never keeps its own copy of the options.

  PUT  /api/manage/ui-themes            (superadmin)
       set one school's theme.  {"school": <id>, "ui_theme": "<key>"}

PRESENTATION ONLY. A theme decides colour and surface; it can never change what
a page shows, what it filters, or what it totals. Schools read their own theme
from their profile — it rides along with the login payload — so there is no
public endpoint here to keep in step.
"""

from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from ..BaseViews import SecuredAPIView
from ...models.SchoolAdmin import SchoolAdmin
from ...constants.ui_theme import UI_THEME_CHOICES, UI_THEME_KEYS, safe_theme


class ManageUiThemesView(SecuredAPIView):
    """Superadmin: list every school's interface theme, and set one."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        schools = SchoolAdmin.objects.filter(is_active=True).values(
            "id", "name", "address", "logo", "ui_theme"
        ).order_by("name")
        return Response({
            "schools": [
                {
                    "id": s["id"],
                    "name": s["name"],
                    "address": s["address"],
                    "logo": s["logo"],
                    # Normalised on the way out: a row holding a key the
                    # frontend no longer has would otherwise render unstyled.
                    "ui_theme": safe_theme(s["ui_theme"]),
                }
                for s in schools
            ],
            "themes": [{"value": key, "label": label} for key, label in UI_THEME_CHOICES],
        })

    def put(self, request):
        school_id = request.data.get("school")
        theme = request.data.get("ui_theme")
        if not school_id or theme not in UI_THEME_KEYS:
            return self.RESPONSE__INVALID_REQUEST

        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            return self.RESPONSE__NOT_FOUND

        school.ui_theme = theme
        school.save(update_fields=["ui_theme"])
        return Response({"school": school.id, "ui_theme": school.ui_theme})
