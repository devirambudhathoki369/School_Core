from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from rest_framework import permissions
from drf_yasg.generators import OpenAPISchemaGenerator
import re

#
from account.auth.Authentication import AdminTokenAuthentication


class SMSysSchemaGenerator(OpenAPISchemaGenerator):
    version_pattern = re.compile(r"/v\d+/")

    def pathValidates(self, path):
        isNotValid = path.startswith("/api/") and not self.version_pattern.search(path)
        return False if isNotValid else True

    def get_path_item(self, path, view_cls, operations):
        if self.pathValidates(path):
            return super().get_path_item(path, view_cls, operations)


schema_view = get_schema_view(
    openapi.Info(
        title="SMSys API Documentation",
        default_version="v1",
        description="",
        terms_of_service="https://www.google.com/policies/terms/",
        contact=openapi.Contact(email="centit@gmail.com"),
        license=openapi.License(name="BSD License"),
    ),
    public=False,
    permission_classes=(permissions.IsAuthenticated,),
    authentication_classes=(AdminTokenAuthentication,),
    generator_class=SMSysSchemaGenerator,
)
