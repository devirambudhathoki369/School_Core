from django.db.models import Q

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from .BaseViews import SharedLibraryMixin
from ..models.Library import Library
from ..serializers.LibrarySerializers import LibrarySerializer


class LibraryView(SecuredAPIView, SharedLibraryMixin):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request, preferences=False):
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        as_options = request.query_params.get("as_options")
        as_options = self.getBooleanValue(as_options)
        preferences = request.query_params.get("preferences")
        preferences = self.getBooleanValue(preferences)
        RETURN_FIELDS = ["id", "name"]
        if preferences:
            RETURN_FIELDS.append("preferences")

        if school_id:
            q = Q(school=school_id)
            sharedLibQ = self.sharedLibraryQ(school_id)
            q |= sharedLibQ or Q()
            if id:
                q &= Q(id=id)
            libraries = Library.objects.filter(q)
            if as_options:
                libraries = libraries.values(*RETURN_FIELDS)
                libraries = [{"value": e["id"], "name": e["name"]} for e in libraries]
            else:
                RETURN_FIELDS.extend(["address", "contacts"])
                libraries = libraries.values(*RETURN_FIELDS)
            return Response(libraries)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = LibrarySerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Library created!"})
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            lib = Library.objects.filter(id=id, school=school_id).first()
            if lib:
                s = LibrarySerializer(instance=lib, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Library updated!"})
        return self.RESPONSE__INVALID_REQUEST
