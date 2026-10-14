from ...models.Staff import Staff
from ...methods.nameConcat import nameConcat


class StaffMap:
    def getSchoolStaffsMapped(seld, school_id):
        return {
            staff.get("account"): staff.get("name")
            for staff in Staff.objects.filter(
                school=school_id, is_active=True, account__isnull=False
            )
            .values("account")
            .annotate(name=nameConcat())
        }
