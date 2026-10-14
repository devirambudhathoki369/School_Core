from django.db.models import Q
from main.models.SchoolAdmin import SchoolAdmin

"""
How to share a library?
1. Library to be shared -> preferences -> {shared_to:'<school-id>'}
2. Admin using shared library -> preferences -> {uses_shared_library: true}
"""


class SharedLibraryMixin:
    __key = "preferences__uses_shared_library"

    def sharedLibraryQ(self, school_id, contains_library_fk=False):
        """
        contains_library_fk: If querying model contains library fk?
        """
        sa = SchoolAdmin.objects.filter(id=school_id).values(self.__key).first()
        sa = sa.get(self.__key)
        if sa:
            if contains_library_fk:
                return Q(library__preferences__shared_to=school_id)
            return Q(preferences__shared_to=school_id)
        return None
