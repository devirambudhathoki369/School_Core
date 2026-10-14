"""Send daily collection to shareholders!"""

import sys
import os
import django


current_path = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_path, "../../"))
if project_root not in sys.path:
    sys.path.append(project_root)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

#

from django.db.models import Q
from main.methods.collections import collection_totals
import json
from main.views.sms.SMSTemplateMixin import SMSTemplateMixin
from main.views.sms import placeholders as PH
from main.models.Invoice import StudentInvoice
from main.models.SchoolAdmin import SchoolAdmin
from main.models.SMSLog import SMS_TYPE_COLLECTION
from main.methods.nepaliDatetime import ndt_today


class SendDailyCollectionToShareholders(SMSTemplateMixin):
    FILENAME = "./shareholders.json"
    shareholders_list = {}
    today = None
    TEMPLATE = "Today's Collection Point of {school_name}: " + PH.Balance_Amount_PH

    def __init__(self, target_date=None) -> None:
        # Recipients now live in the DB (superadmin-managed Shareholder model).
        # Fall back to the legacy shareholders.json only if the table is empty,
        # so nothing breaks before/after the one-time import.
        self.shareholders_list = self._load_recipients()
        # target_date (Nepali "YYYY-MM-DD") lets us re-send a missed day;
        # defaults to today so the daily cron is unchanged.
        self.today = target_date or ndt_today()
        super().__init__()

    def _load_recipients(self):
        """{label: {"profile": school_id, "contacts": [num, ...]}} from the DB."""
        from main.models.superadmin.Shareholder import Shareholder

        rows = (
            Shareholder.objects.filter(is_active=True, school__is_active=True)
            .select_related("school")
            .values_list("school_id", "school__name", "contact")
        )
        recipients = {}
        for school_id, school_name, contact in rows:
            label = school_name or f"school_{school_id}"
            entry = recipients.setdefault(
                label, {"profile": school_id, "contacts": []}
            )
            entry["contacts"].append(contact)
        if recipients:
            return recipients
        # Legacy fallback: read the JSON file if the DB has no shareholders yet.
        with open(self.FILENAME, "r") as file:
            return json.load(file)

    def prepareCollections(self):
        schools = {}
        for school_accountName, details in self.shareholders_list.items():
            schoolId, contacts = details["profile"], details["contacts"]
            schools[schoolId] = contacts
        #
        schoolIds = list(schools.keys())
        # print(schoolIds)
        collection_map = collection_totals(Q(school__in=schoolIds, date=self.today))
        school_names = dict(
            SchoolAdmin.objects.filter(id__in=schoolIds).values_list("id", "name")
        )
        data = {}
        # data[schoolId] = {"contacts": [], "messages": []}
        for schoolId, contacts in schools.items():
            total_collection = collection_map.get(schoolId, 0) or 0
            user_data = {"balance": total_collection, "name": ""}
            # str.replace, not .format: school names may contain braces.
            template = self.TEMPLATE.replace(
                "{school_name}", (school_names.get(schoolId) or "").strip()
            )
            messages = [self.prepareMessage(template, user_data) for _ in contacts]
            data[schoolId] = {"contacts": contacts, "messages": messages}
        api_keys = self.getSchoolSMSAPIKey(schoolIds)
        return data, api_keys

    def getSchoolSMSAPIKey(self, schoolIds):
        api_keys = SchoolAdmin.objects.filter(id__in=schoolIds).values_list(
            "id", "account__sms_api"
        )
        return api_keys


if __name__ == "__main__":
    # Optional args:
    #   argv[1] = Nepali date "YYYY-MM-DD" to (re)send for a specific day
    #             (omit for today's daily run).
    #   --dry   = compute + print only, send nothing (for verifying a backfill).
    args = [a for a in sys.argv[1:] if a != "--dry"]
    dry = "--dry" in sys.argv
    target_date = args[0] if args else None

    pro = SendDailyCollectionToShareholders(target_date=target_date)
    data, api_keys = pro.prepareCollections()
    print(f"collection date: {pro.today}  schools: {len(data)}  dry={dry}")
    if api_keys:
        for schoolId, api_key in api_keys:
            if api_key:
                schoolMessages = data.get(schoolId)
                if dry:
                    print(f"  [dry] school {schoolId}: {schoolMessages['messages'][:1]} -> {len(schoolMessages['contacts'])} contact(s)")
                    continue
                pro.sendSMS(
                    schoolMessages,
                    api_key,
                    school=schoolId,
                    sms_type=SMS_TYPE_COLLECTION,
                )
