from main.models.Staff import Staff
from main.methods.nameConcat import nameConcat


def getAccountant(accountant_acc_id):
    if not accountant_acc_id:
        return None
    staff = (
        Staff.objects.filter(account=accountant_acc_id)
        .annotate(name=nameConcat())
        .values("name")
    ).first()
    return staff.get("name")
