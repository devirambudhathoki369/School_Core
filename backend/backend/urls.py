"""
URL configuration for backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from monitor.views import live_system_monitor

urlpatterns = [
    path("admin/", admin.site.urls),
    path("auth/", include("account.urls")),
    path(
        "api/",
        include(
            (
                [
                    path("", include(("main.urls.v1", "main"), namespace="api")),
                    path("v1/", include(("main.urls.v1", "main"), namespace="v1")),
                    path("v2/", include(("main.urls.v2", "main"), namespace="v2")),
                ],
                "api",
            )
        ),
    ),
    path(
        "accounting/",
        include(
            (
                [
                    path(
                        "",
                        include(
                            ("accounting.urls.v1", "accounting"),
                            namespace="accounting",
                        ),
                    ),
                    path(
                        "v1/",
                        include(
                            ("accounting.urls.v1", "accounting"),
                            namespace="accounting v1",
                        ),
                    ),
                    # v2
                ],
                "accounting",
            )
        ),
    ),
    path(
        "library/",
        include(
            (
                [
                    path(
                        "", include(("library.urls.v1", "library"), namespace="library")
                    ),
                    path(
                        "v1/",
                        include(("library.urls.v1", "library"), namespace="library v1"),
                    ),
                ],
                "library",
            )
        ),
    ),
    path(
        "hostel/",
        include(
            (
                [
                    path("", include(("hostel.urls.v1", "hostel"), namespace="hostel")),
                    path(
                        "v1/",
                        include(("hostel.urls.v1", "hostel"), namespace="hostel v1"),
                    ),
                ],
                "hostel",
            )
        ),
    ),
    path(
        "extra-billing/",
        include(
            (
                [
                    path(
                        "",
                        include(
                            ("extra_billing.urls.v1", "extra_billing"),
                            namespace="extra billing",
                        ),
                    ),
                    path(
                        "v1/",
                        include(
                            ("extra_billing.urls.v1", "extra_billing"),
                            namespace="extra billing v1",
                        ),
                    ),
                ],
                "extra_billing",
            )
        ),
    ),
    # rfid
    path("iclock/", include("rfid.urls.device")),
    path("rfid/", include("rfid.urls.v1")),
    #
    path("__debug__/", include("debug_toolbar.urls")),
    path("__live_usage__/", live_system_monitor, name="live_system_monitor"),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
