from main.models.SchoolAdmin import SchoolAdmin


def extractSchoolSMSAPIKey(school: int):
    school = (
        SchoolAdmin.objects.select_related("account")
        .only("account__sms_api")
        .get(id=school)
    )
    if school:
        return school.account.sms_api
