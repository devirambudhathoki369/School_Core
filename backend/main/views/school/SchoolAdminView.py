import logging

from django.db import transaction
from rest_framework.response import Response
from rest_framework import status

#
from account.auth.Authentication import (
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from account.views import ADMIN_PROFILE_RETURN_FIELDS

#
from main.constants.school_modules import CODE_OF_FLAG
from main.methods.schoolModules import (
    flags_of,
    granted_modules,
    module_flags,
    set_school_modules,
)
from main.models.SchoolAdmin import SchoolAdmin
from main.models.FiscalYears import EconomicYear
from main.methods.payrollClose import closePayrollAfterYearSwitch
from main.serializers.SchoolAdminSerializer import SchoolAdminSerializer
from main.views.BaseViews import SecuredAPIView


logger = logging.getLogger(__name__)


# FOR SUPERADMINS;
class SchoolAdminView(SecuredAPIView):
    authentication_classes = (
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    swagger_schema = None
    """ For ListCreateAPIView;
    serializer_class=SchoolAdminSerializer
    queryset=SchoolAdmin.objects.all()
    """

    def get(self, request):
        admins = list(
            SchoolAdmin.objects.values(
                "account__id", "account__username", *ADMIN_PROFILE_RETURN_FIELDS
            ).order_by("id")
        )
        # each school's facilities, from one query for all of them
        granted = granted_modules([admin["id"] for admin in admins])
        for admin in admins:
            admin.update(flags_of(granted[admin["id"]]))
        s = SchoolAdminSerializer(admins, many=True)
        return Response(s.data)

    def module_choices(self, data):
        """Take the facility flags (`uses_exams`, `uses_hostel`, ...) out of
        `data`: {module code: bool} for those it names, or None when one is not
        a true/false -- a flag is never guessed from "yes", 1 or ""."""
        chosen = {}
        for flag, code in CODE_OF_FLAG.items():
            if flag in data:
                value = data.pop(flag)
                if not isinstance(value, bool):
                    return None
                chosen[code] = value
        return chosen

    def post(self, request):
        data = request.data.copy()
        chosen = self.module_choices(data)
        if chosen is None:
            return self.RESPONSE__INVALID_REQUEST
        s = SchoolAdminSerializer(data=data)
        if s.is_valid():
            with transaction.atomic():
                ins = s.save()
                # A new school starts with the default modules (SchoolModule's
                # post_save); this makes them exactly what was ticked.
                set_school_modules(ins, chosen)
            return Response(self.prepResponse(ins, "added"))
        else:
            if "account" in s.errors and "username" in s.errors["account"]:
                return Response(
                    {"message": "Username already exists!"},
                    status=status.HTTP_409_CONFLICT,
                )
            # print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.pop("id", None)
        economic_year = request.data.pop("economic_year", None)
        apply = request.data.pop("apply", False)
        chosen = self.module_choices(request.data)
        if chosen is None:
            return self.RESPONSE__INVALID_REQUEST
        if id:
            ins = SchoolAdmin.objects.get(id=id)
            if ins:
                s = SchoolAdminSerializer(ins, data=request.data, partial=True)
                if s.is_valid():
                    with transaction.atomic():
                        ins = s.save()
                        set_school_modules(ins, chosen)
                    return Response(self.prepResponse(ins, "updated"))
                # else:
                #     print(s.errors)
        if economic_year and apply:
            with transaction.atomic():
                try:
                    previous = dict(SchoolAdmin.objects.values_list("id", "economic_year"))
                    SchoolAdmin.objects.all().update(economic_year=economic_year)
                    self.closePayrollLeftBehind(previous, economic_year)
                    return Response({"message": "Economic year has been applied!"})
                except Exception as e:
                    # print(e)
                    pass
        return self.RESPONSE__INVALID_REQUEST

    def closePayrollLeftBehind(self, previous, economic_year):
        """Close the payroll of the year the schools have just left.

        Only for a school that had already closed its books for that year: its
        payroll could not close then, because the year it was working in has
        nowhere to carry to. Kept in its own savepoint and never allowed to
        fail the switch itself -- every school in the system is waiting on
        that -- so a problem here is logged and the year still moves on.
        """
        try:
            with transaction.atomic():
                new_year = EconomicYear.objects.filter(id=economic_year).first()
                if new_year:
                    closePayrollAfterYearSwitch(previous, new_year)
        except Exception:
            logger.exception("payroll close after the economic year switch failed")

    def prepResponse(self, ins, action):
        return {
            "message": f"School has been succesfully {action}!",
            "school": {
                "id": ins.id,
                "account__username": ins.account.username,
                "name": ins.name,
                "address": ins.address,
                "contact": ins.contact,
                "telephone": ins.telephone,
                "estd_date": ins.estd_date,
                "pan_no": ins.pan_no,
                "email": ins.email,
                "renew_date": ins.renew_date,
                "slogan": ins.slogan,
                "about_us": ins.about_us,
                "test_account": ins.test_account,
                "uses_sms": ins.uses_sms,
                "uses_mobile_app": ins.uses_mobile_app,
                "test_account_str": ("yes" if ins.test_account == True else "no"),
                "uses_sms_str": ("yes" if ins.uses_sms == True else "no"),
                "uses_mobile_app_str": ("yes" if ins.uses_mobile_app == True else "no"),
                # the facilities, as saved
                **module_flags(ins.id),
                **(
                    {
                        "economic_year": ins.economic_year.id,
                        "economic_year__name": ins.economic_year.name,
                    }
                    if ins.economic_year
                    else {}
                ),
            },
        }
