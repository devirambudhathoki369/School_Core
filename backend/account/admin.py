from django.contrib import admin

# Register your models here.
from .models import SuperAdminAccount, AdminAccount, StaffAccount, StudentAccount
from .auth.AuthToken import (
    UserAuthToken,
    SuperAdminAuthToken,
    AdminAuthToken,
    StaffAuthToken,
    StudentAuthToken,
    #
    AuthTokenAdmin,
)

# admins
admin.site.register(SuperAdminAccount)
admin.site.register(SuperAdminAuthToken)
admin.site.register(AdminAccount)
admin.site.register(AdminAuthToken, AuthTokenAdmin)
# student
admin.site.register(StudentAccount)
admin.site.register(StudentAuthToken)
# staff
admin.site.register(StaffAccount)
admin.site.register(StaffAuthToken)
#
admin.site.register(UserAuthToken)
