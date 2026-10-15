"""The facilities (modules) a superadmin gives a school, that the school gets
only those, and how they are stored (main.SchoolModule)."""

import io
import json
from importlib import import_module
from types import SimpleNamespace
from zipfile import ZipFile

from django.apps import apps as django_apps
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, connection, transaction
from django.db.models import ProtectedError
from django.test import SimpleTestCase, TestCase, TransactionTestCase
from django.urls import get_resolver
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, StaffAuthToken, SuperAdminAuthToken
from account.auth.context import users_context
from account.models import AdminAccount, StaffAccount, SuperAdminAccount
from main.constants.school_modules import (
    DEFAULT_ON,
    FLAG,
    LABEL,
    MODULE_CODES,
    MODULE_VIEWS,
    OPEN_VIEWS,
    module_for_view,
)
from main.methods.hostelRates import schoolUsesHostel
from main.methods.schoolModules import module_flags, set_school_modules
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.apps import sync_module_catalog
from main.models.SchoolModule import Module, SchoolModule
from main.models.Staff import Staff, StaffRole
from main.models.history_log.HistoryLog import HistoryLog
from main.models.inventory.Inventory import InventoryCategory
from main.services.database_backup import write_school_backup
from main.views.BaseViews import SecuredAPIView
from main.views.exams.ExamViews import ExamView

# one endpoint each module owns, as its own screens call it
MODULE_ENDPOINTS = {
    "exams": "/api/exams",
    "payroll": "/api/staff_payments",
    "accounting": "/accounting/ledgers",
    "library": "/library/libraries",
    "inventory": "/api/inventory/categories",
    "hostel": "/hostel/hostels",
    "extra_billing": "/extra-billing/parties",
}


def make_school(year, tag, **modules):
    """A school as any code path adds one; `modules` ({code: bool}) then set."""
    school = SchoolAdmin.objects.create(
        name=f"Module School {tag}", address="Test address", estd_date="2080-01-01",
        renew_date="2084-01-01", pan_no="123", email=f"{tag}@example.com",
        account=AdminAccount.objects.create(username=f"modules-{tag}"), economic_year=year,
    )
    if modules:
        set_school_modules(school, modules)
    return school


def client_for(token):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"IGNITE {token.key}")
    return client


def refused_for_module(response):
    return response.status_code == 403 and "not enabled for this school" in str(response.data)


def granted(school):
    return set(SchoolModule.objects.filter(school=school, is_active=True).values_list("module_id", flat=True))


class SchoolModuleGateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.full = make_school(cls.year, "full", hostel=True, extra_billing=True)
        cls.bare = make_school(cls.year, "bare", **{code: False for code in MODULE_CODES})

    def setUp(self):
        # an API call leaves its audit context behind (see test_payroll_close)
        self.addCleanup(users_context.set, None)
        self.full_admin = client_for(AdminAuthToken.objects.create(user=self.full.account))
        self.bare_admin = client_for(AdminAuthToken.objects.create(user=self.bare.account))

    def test_a_new_school_starts_with_the_modules_every_school_had(self):
        school = make_school(self.year, "plain")
        self.assertEqual(granted(school), set(DEFAULT_ON))
        self.assertEqual(set(DEFAULT_ON), {"exams", "payroll", "accounting", "library", "inventory"})

    def test_a_school_without_a_module_is_refused_its_endpoints(self):
        for code, path in MODULE_ENDPOINTS.items():
            with self.subTest(code):
                response = self.bare_admin.get(path, {"school": self.bare.id})
                self.assertEqual(response.status_code, 403, (path, response.data))
                self.assertIn("not enabled for this school", str(response.data))

    def test_a_school_with_the_module_reaches_them(self):
        for code, path in MODULE_ENDPOINTS.items():
            with self.subTest(code):
                response = self.full_admin.get(path, {"school": self.full.id})
                self.assertNotEqual(response.status_code, 403, (path, response.data))

    def test_writes_are_refused_too(self):
        response = self.bare_admin.post(
            "/api/inventory/categories", {"school": self.bare.id, "name": "Stationery"}, format="json")
        self.assertTrue(refused_for_module(response))
        self.assertFalse(InventoryCategory.objects.filter(school=self.bare).exists())

    def test_the_school_is_the_tokens_not_the_requests(self):
        # no school named at all: still the token's own school that is checked
        self.assertTrue(refused_for_module(self.bare_admin.get("/api/inventory/categories")))

    def test_a_staff_login_is_refused_with_its_school(self):
        account = StaffAccount.objects.create(username="modules-staff")
        Staff.objects.create(
            role=StaffRole.objects.create(role="Storekeeper"), first_name="Staff", last_name="Member",
            primary_contact="9800000000", location="Tulsipur", school=self.bare, account=account,
            permissions=[2301],
        )
        staff = client_for(StaffAuthToken.objects.create(user=account))
        response = staff.get("/api/inventory/categories", {"school": self.bare.id})
        self.assertTrue(refused_for_module(response))

    def test_what_every_school_needs_stays_open(self):
        # the header's accounting-year picker loads on every sign-in, and the
        # accounting year-close screen previews the payroll it would close
        for path in ("/accounting/economic_year", "/api/payroll/year_close"):
            with self.subTest(path):
                response = self.bare_admin.get(path, {"school": self.bare.id})
                self.assertFalse(refused_for_module(response), (path, response.status_code, response.data))

    def test_the_superadmin_is_not_bound_to_a_school(self):
        superadmin = SuperAdminAccount.objects.create(username="modules-sa")
        client = client_for(SuperAdminAuthToken.objects.create(user=superadmin))
        response = client.get("/api/inventory/categories", {"school": self.bare.id})
        self.assertEqual(response.status_code, 200, response.data)

    def test_superadmin_and_superuser_tokens_pass_the_gate(self):
        # not an admin / staff / student token: bound to no school
        request = SimpleNamespace(method="GET", auth=None, user=None, path="/api/exams")
        ExamView().enforce_school_modules(request)

    def test_an_account_of_no_school_is_refused(self):
        request = SimpleNamespace(method="GET", auth=None, user=None, path="/api/exams",
                                  _caller_school_ids=set())
        with self.assertRaises(PermissionDenied):
            ExamView().enforce_school_modules(request)

    def test_the_hostel_fee_titles_follow_the_hostel(self):
        self.assertTrue(schoolUsesHostel(self.full.id))
        self.assertFalse(schoolUsesHostel(self.bare.id))

    def test_switching_off_applies_at_once_and_deletes_nothing(self):
        InventoryCategory.objects.create(school=self.full, name="Stationery")
        superadmin = SuperAdminAccount.objects.create(username="modules-sa")
        provider = client_for(SuperAdminAuthToken.objects.create(user=superadmin))

        response = provider.put("/api/admins", {"id": self.full.id, "uses_inventory": False}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["school"]["uses_inventory"])
        self.assertTrue(refused_for_module(
            self.full_admin.get("/api/inventory/categories", {"school": self.full.id})))
        self.assertTrue(InventoryCategory.objects.filter(school=self.full, name="Stationery").exists())
        # only the module switched changed
        self.assertEqual(granted(self.full), set(MODULE_CODES) - {"inventory"})

        provider.put("/api/admins", {"id": self.full.id, "uses_inventory": True}, format="json")
        response = self.full_admin.get("/api/inventory/categories", {"school": self.full.id})
        self.assertEqual([row["name"] for row in response.data], ["Stationery"])


class SchoolFormTests(TestCase):
    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        superadmin = SuperAdminAccount.objects.create(username="modules-sa")
        self.provider = client_for(SuperAdminAuthToken.objects.create(user=superadmin))

    def new_school(self, username, **flags):
        return self.provider.post("/api/admins", {
            "account": {"username": username, "password": "secret123"},
            "name": "Chosen Facilities School", "address": "Tulsipur", "estd_date": "2080-01-01",
            "renew_date": "2084-01-01", "pan_no": "123", "email": f"{username}@example.com",
            "economic_year": self.year.id, **flags,
        }, format="json")

    def test_a_new_school_gets_only_the_facilities_chosen(self):
        chosen = {"uses_exams": True, "uses_payroll": False, "uses_accounting": False,
                  "uses_library": True, "uses_inventory": False, "uses_hostel": True,
                  "uses_extra_billing": False}
        response = self.new_school("newschool", **chosen)
        self.assertEqual(response.status_code, 200, response.data)
        school = SchoolAdmin.objects.get(account__username="newschool")
        self.assertEqual(granted(school), {"exams", "library", "hostel"})
        self.assertEqual(module_flags(school.id), chosen)
        self.assertEqual({flag: response.data["school"][flag] for flag in chosen}, chosen)
        # the previous release's columns are kept in step
        self.assertEqual((school.uses_hostel, school.uses_extra_billing), (True, False))

    def test_a_flag_that_is_not_true_or_false_is_refused(self):
        for value in ("yes", 1, "", None):
            with self.subTest(value=value):
                response = self.new_school(f"bad{abs(hash(str(value))) % 10000}", uses_payroll=value)
                self.assertEqual(response.status_code, 400)
        self.assertFalse(SchoolAdmin.objects.filter(name="Chosen Facilities School").exists())

    def test_the_school_list_and_the_admins_profile_carry_the_facilities(self):
        school = make_school(self.year, "listed", payroll=False)
        expected = {FLAG[code]: code in set(DEFAULT_ON) - {"payroll"} for code in MODULE_CODES}
        row = next(r for r in self.provider.get("/api/admins").data if r["id"] == school.id)
        self.assertEqual({flag: row[flag] for flag in expected}, expected)
        admin = client_for(AdminAuthToken.objects.create(user=school.account))
        profile = admin.get("/auth/profile").data
        profile = profile.get("profile", profile)
        self.assertEqual({flag: profile[flag] for flag in expected}, expected)

    def test_the_hostel_access_page_reads_and_writes_the_same_table(self):
        school = make_school(self.year, "hostel")
        response = self.provider.put("/hostel/manage/access", {"school": school.id, "uses_hostel": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("hostel", granted(school))
        listed = self.provider.get("/hostel/manage/access").data["schools"]
        self.assertTrue(next(s for s in listed if s["id"] == school.id)["uses_hostel"])
        row = next(r for r in self.provider.get("/api/admins").data if r["id"] == school.id)
        self.assertTrue(row["uses_hostel"])


class SchoolModuleStorageTests(TestCase):
    def setUp(self):
        self.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")

    def test_one_row_per_school_and_module(self):
        school = make_school(self.year, "unique")
        with self.assertRaises(IntegrityError), transaction.atomic():
            SchoolModule.objects.create(school=school, module_id="exams")

    def test_the_database_refuses_an_unknown_module(self):
        school = make_school(self.year, "check")
        with self.assertRaises(IntegrityError), transaction.atomic():
            SchoolModule.objects.create(school=school, module_id="exmas")
            # the foreign key is checked at the end of the transaction
            connection.check_constraints()

    def test_a_module_some_school_holds_cannot_leave_the_catalog(self):
        make_school(self.year, "protected")
        with self.assertRaises(ProtectedError):
            Module.objects.get(code="exams").delete()

    def test_the_catalog_is_what_the_code_defines(self):
        self.assertEqual(dict(Module.objects.values_list("code", "name")), dict(LABEL))
        # and comes back in step after drift, without touching what is right
        Module.objects.filter(code="payroll").update(name="Salaries")
        sync_module_catalog(django_apps.get_app_config("main"), apps=django_apps)
        self.assertEqual(dict(Module.objects.values_list("code", "name")), dict(LABEL))

    def test_switching_reuses_the_row_and_is_audited(self):
        school = make_school(self.year, "audit")
        row = SchoolModule.objects.get(school=school, module_id="payroll")
        superadmin = SuperAdminAccount.objects.create(username="modules-sa")
        # what token authentication leaves behind for the history log
        users_context.set({"user_id": superadmin.id, "ip_address": None, "school_id": None,
                           "user_type": ContentType.objects.get_for_model(SuperAdminAccount)})
        self.addCleanup(users_context.set, None)
        set_school_modules(school, {"payroll": False})
        set_school_modules(school, {"payroll": True})
        self.assertEqual(SchoolModule.objects.filter(school=school, module_id="payroll").count(), 1)
        self.assertEqual(SchoolModule.objects.get(school=school, module_id="payroll").pk, row.pk)
        logged = HistoryLog.objects.filter(object_id=row.pk, object_type__model="schoolmodule")
        # taken away, then given back -- each with who did it
        self.assertEqual([log.changes["is_active"] for log in logged.order_by("id")],
                         [["True", "False"], ["False", "True"]])
        self.assertTrue(all(log.user_id == superadmin.id for log in logged))

    def test_setting_the_same_again_changes_nothing(self):
        school = make_school(self.year, "idempotent")
        before = list(SchoolModule.objects.filter(school=school).values_list("pk", "is_active", "updated_at"))
        set_school_modules(school, {code: code in DEFAULT_ON for code in MODULE_CODES})
        after = list(SchoolModule.objects.filter(school=school).values_list("pk", "is_active", "updated_at"))
        self.assertEqual(before, after)

    def test_an_unknown_module_is_refused_before_the_database(self):
        school = make_school(self.year, "unknown")
        with self.assertRaises(ValueError):
            set_school_modules(school, {"exmas": True})


class SchoolModuleExportTests(TransactionTestCase):
    """The school export reads in its own snapshot transaction, so it runs
    outside a test-case transaction (like SchoolBackupSqlTests)."""

    def setUp(self):
        self.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")

    def test_the_school_export_carries_its_facilities(self):
        school = make_school(self.year, "export", payroll=False, hostel=True)
        output = io.BytesIO()
        write_school_backup(output, school.id)
        with ZipFile(output) as archive:
            manifest = json.loads(archive.read("manifest.json"))
            records = json.loads(archive.read("data.json"))
        self.assertEqual(manifest["school"]["modules"], module_flags(school.id))
        exported = {r["fields"]["module"]: r["fields"]["is_active"] for r in records
                    if r["model"] == "main.schoolmodule"}
        self.assertEqual(exported, {**{code: True for code in DEFAULT_ON}, "payroll": False, "hostel": True})
        self.assertEqual(manifest["table_coverage"]["main_schoolmodule"]["selection"], "school-owned")
        # the catalog rows its grants name travel with it, as shared data
        catalog = {r["pk"] for r in records if r["model"] == "main.module"}
        self.assertEqual(catalog, set(exported))
        self.assertEqual(manifest["table_coverage"]["main_module"]["selection"],
                         "referenced shared data only")

    def test_another_schools_facilities_are_not_exported(self):
        school = make_school(self.year, "mine")
        other = make_school(self.year, "theirs")
        output = io.BytesIO()
        write_school_backup(output, school.id)
        with ZipFile(output) as archive:
            records = json.loads(archive.read("data.json"))
        schools = {r["fields"]["school"] for r in records if r["model"] == "main.schoolmodule"}
        self.assertEqual(schools, {school.id})
        self.assertNotIn(other.id, schools)

    def test_a_switched_off_facility_still_exports_its_records(self):
        school = make_school(self.year, "off", inventory=False)
        InventoryCategory.objects.create(school=school, name="Stationery")
        output = io.BytesIO()
        write_school_backup(output, school.id)
        with ZipFile(output) as archive:
            records = json.loads(archive.read("data.json"))
        self.assertIn("Stationery", [r["fields"].get("name") for r in records
                                     if r["model"] == "main.inventorycategory"])


class SchoolModuleMigrationTests(TestCase):
    """The data step of 0105, run against the schools as they stood before it."""

    migration = import_module("main.migrations.0105_school_module")

    def test_every_school_keeps_exactly_what_it_had(self):
        year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        plain = make_school(year, "m-plain")
        hostel = make_school(year, "m-hostel")
        both = make_school(year, "m-both")
        # as they stood before 0105: no grants or catalog, only the two columns
        SchoolModule.objects.all().delete()
        Module.objects.all().delete()
        SchoolAdmin.objects.filter(pk=hostel.pk).update(uses_hostel=True)
        SchoolAdmin.objects.filter(pk=both.pk).update(uses_hostel=True, uses_extra_billing=True)

        self.migration.grant_what_schools_had(django_apps, connection.schema_editor())
        always = set(self.migration.ALWAYS_HAD)
        self.assertEqual(granted(plain), always)
        self.assertEqual(granted(hostel), always | {"hostel"})
        self.assertEqual(granted(both), always | {"hostel", "extra_billing"})

        # and back: the columns say what the table said
        SchoolAdmin.objects.update(uses_hostel=False, uses_extra_billing=False)
        set_school_modules(plain, {"extra_billing": True})
        SchoolAdmin.objects.update(uses_hostel=False, uses_extra_billing=False)
        self.migration.put_the_columns_back(django_apps, connection.schema_editor())
        columns = dict((pk, (h, e)) for pk, h, e in SchoolAdmin.objects.values_list(
            "pk", "uses_hostel", "uses_extra_billing"))
        self.assertEqual(columns[plain.pk], (False, True))
        self.assertEqual(columns[hostel.pk], (True, False))
        self.assertEqual(columns[both.pk], (True, True))

    def test_the_frozen_lists_are_what_the_code_defines(self):
        self.assertEqual(set(self.migration.ALWAYS_HAD), set(DEFAULT_ON))
        self.assertEqual(dict(self.migration.CATALOG), dict(LABEL))


class SchoolModuleRegistryTests(SimpleTestCase):
    @staticmethod
    def routed_views():
        """Every view class the URLconf routes to, by "<module>.<qualname>"."""
        found = {}

        def walk(patterns):
            for pattern in patterns:
                if hasattr(pattern, "url_patterns"):
                    walk(pattern.url_patterns)
                    continue
                view = getattr(pattern.callback, "view_class", None)
                if view is not None:
                    found[f"{view.__module__}.{view.__qualname__}"] = view

        walk(get_resolver().url_patterns)
        return found

    def test_every_gated_view_runs_the_gate(self):
        """A view outside SecuredAPIView would never call it."""
        gated = {name: view for name, view in self.routed_views().items() if module_for_view(name)}
        self.assertTrue(gated)
        for name, view in gated.items():
            self.assertTrue(issubclass(view, SecuredAPIView), name)

    def test_every_listed_view_exists(self):
        """A renamed view must not leave its module silently ungated."""
        names = self.routed_views()
        for code, prefixes in MODULE_VIEWS.items():
            self.assertIn(code, MODULE_CODES)
            for prefix in prefixes:
                self.assertTrue(any(name.startswith(prefix) for name in names), prefix)
        for name in OPEN_VIEWS:
            self.assertIn(name, names)

    def test_each_module_takes_what_its_screens_call(self):
        expected = {
            "main.views.exams.ResultViews.ResultView": "exams",
            "main.views.exams.SeatPlanView.SeatPlanView": "exams",
            "main.views.search.CertificateSearchView.CharacterCertificateSearchView": "exams",
            "main.views.InvoiceViewsStaff.StaffInvoiceView": "payroll",
            "main.views.LedgerViewsStaff.StaffLedgerView": "payroll",
            "accounting.views.JournalEntryView.JournalEntryView": "accounting",
            "library.views.BookIssueView.BookIssueView": "library",
            "main.views.inventory.InventoryViews.InventoryItemView": "inventory",
            # every school's
            "accounting.views.AccountingEconomicYearView.AccountingEconomicYearView": None,
            "main.views.closing.PayrollYearCloseView.PayrollYearCloseView": None,
            "main.views.StaffViews.StaffView": None,
            "main.views.CourseViews.CourseView": None,
            "main.views.InvoiceViews.InvoiceViews": None,
        }
        for name, code in expected.items():
            self.assertEqual(module_for_view(name), code, name)
