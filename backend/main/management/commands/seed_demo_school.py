"""One complete demo school, and a superadmin, in an EMPTY database.

    createdb schoolcore_demo
    POSTGRES_NAME=schoolcore_demo python manage.py migrate
    POSTGRES_NAME=schoolcore_demo python manage.py seed_demo_school

It refuses to run where any school already exists, so it can never write demo
rows into a real school's database.

The school is coherent rather than random. Fees are posted month by month
through LedgerPostingSerializer and paid through StudentInvoiceSerializer, the
same paths the fee counter uses, so receipt numbers, title snapshots and the
header/detail discount rule all hold. Transport and hostel are billed as their
`tn` / `hs` pseudo-titles. Attendance follows the school week (Saturday off),
and every facility is switched on.
"""
import random
import secrets
from datetime import timedelta
from decimal import Decimal

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from nepali_datetime import date as ndate

from account.models import AdminAccount, StaffAccount, StudentAccount, SuperAdminAccount
from main.constants.payment import HOSTEL, TRANSPORTATION
from main.constants.school_modules import MODULE_CODES
from main.methods.academicYear import gen_class_key
from main.methods.nepaliDatetime import ndt_today
from main.methods.schoolModules import set_school_modules
from main.serializers.InvoiceSerializer import StudentInvoiceSerializer
from main.serializers.LedgerSerializer import LedgerPostingSerializer

BOYS = ["Aarav", "Prabin", "Bibek", "Sujan", "Nischal", "Aashish", "Samir", "Rohan", "Kiran", "Suman", "Anish", "Bikash",
        "Pratik", "Saugat", "Rajan", "Dipesh", "Manish", "Sandesh", "Ujjwal", "Aayush", "Sabin", "Nabin", "Roshan", "Prakash"]
GIRLS = ["Sneha", "Anusha", "Riya", "Aayusha", "Pooja", "Kritika", "Sarita", "Asmita", "Prakriti", "Sushma", "Nisha", "Bipana",
         "Srijana", "Rojina", "Anjali", "Sabina", "Manisha", "Puja", "Samjhana", "Smriti", "Sanjana", "Pratiksha", "Barsha", "Dikshya"]
SURNAMES = ["Shrestha", "Gurung", "Thapa", "Karki", "Adhikari", "Maharjan", "Tamang", "Rai", "Bhandari", "Basnet", "Poudel",
            "Lama", "KC", "Magar", "Sharma", "Joshi", "Khadka", "Bhattarai", "Neupane", "Rana", "Shahi", "Koirala", "Ghimire", "Dahal"]
PLACES = ["Baneshwor", "Koteshwor", "Kalanki", "Chabahil", "Balaju", "Lalitpur", "Bhaktapur", "Maharajgunj", "Thimi", "Kirtipur"]

# Pre-primary sits under "school" with grades 16/1/2/3, as every school on the
# system already has it; Class 1-10 are grades 4-13, two sections each.
PRE_PRIMARY = [16, 1, 2, 3]
SUBJECTS = {
    "pre": ["English", "Nepali", "Mathematics", "Drawing"],
    "low": ["English", "Nepali", "Mathematics", "Science", "Social Studies", "Health and PE"],
    "high": ["English", "Nepali", "Mathematics", "Science", "Social Studies", "Computer", "Health and PE"],
}
MONTHLY = {16: 3000, 1: 3200, 2: 3400, 3: 3600, **{g: 3800 + (g - 4) * 250 for g in range(4, 14)}}

# The generic scales schools on the system use; nothing school-specific.
GRADING_RULES = {
    1: [(0, 20, "Very Insufficient"), (20, 30, "Insufficient"), (30, 40, "Partially Acceptable"), (40, 50, "Acceptable"),
        (50, 60, "Satisfactory"), (60, 70, "Good"), (70, 80, "Very Good"), (80, 90, "Excellent"), (90, 100, "Outstanding")],
    2: [(0, 0.8, "Very Insufficient"), (0.8, 1.2, "Insufficient"), (1.2, 1.6, "Partially Acceptable"), (1.6, 2, "Acceptable"),
        (2, 2.4, "Satisfactory"), (2.4, 2.8, "Good"), (2.8, 3.2, "Very Good"), (3.2, 3.6, "Excellent"), (3.6, 4, "Outstanding")],
}

# Menu permissions (frontend/src/configs/permissions) for the two staff logins.
TEACHER_PERMISSIONS = [1, 1501, 1502, 1503, 1505, 604, 605, 650, 1652, 1702]
ACCOUNTANT_PERMISSIONS = [1, 103, 104, 105, 106, 107, 701, 702, 703, 704, 705, 706, 711, 712, 714, 1103, 1104, 1113]


def bs_str(d):
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def month_end(year, month):
    """The last day of a BS month (month 12 rolls into the next year)."""
    nxt = ndate(year + 1, 1, 1) if month == 12 else ndate(year, month + 1, 1)
    return nxt - timedelta(days=1)


def is_saturday(d):
    return d.to_datetime_date().weekday() == 5


def school_days_back(today, count):
    """The last `count` school days up to today, oldest first."""
    days, d = [], today
    while len(days) < count:
        if not is_saturday(d):
            days.append(d)
        d -= timedelta(days=1)
    return list(reversed(days))


def model(label):
    return apps.get_model(label)


class Command(BaseCommand):
    help = "Seed one complete demo school and a superadmin into an empty database."

    def add_arguments(self, parser):
        parser.add_argument("--school-name", default="Demo Secondary School")
        parser.add_argument("--admin-username", default="demoschool")  # the sign-in form wants 6-25 characters
        parser.add_argument("--superadmin-username", default="superadmin")
        parser.add_argument("--password", default=None,
                            help="password for every demo login; a random one is made and printed if left out")
        parser.add_argument("--seed", type=int, default=2083, help="random seed, so the school is reproducible")

    def handle(self, *args, **opts):
        if model("main.SchoolAdmin").objects.exists():
            raise CommandError("This database already has a school. The demo seed only runs on an empty one.")
        self.rng = random.Random(opts["seed"])
        # Random, because a default written here would be public and would open a superadmin.
        opts["password"] = opts["password"] or "Demo@" + secrets.token_urlsafe(9)
        with transaction.atomic():
            self.build(opts)
        self.stdout.write(self.style.SUCCESS(self.summary()))
        for who, username in (("Superadmin", opts["superadmin_username"]), ("School admin", opts["admin_username"]),
                              ("Teacher (staff)", "teacher"), ("Accountant (staff)", "accountant"), ("Student", "student")):
            self.stdout.write(f"  {who:20} {username} / {opts['password']}")

    def summary(self):
        counts = [(label, model(name).objects.count()) for label, name in (
            ("classes", "main.ClassInfo"), ("students", "main.Student"), ("staff", "main.Staff"),
            ("ledger rows", "main.StudentLedger"), ("receipts", "main.StudentInvoice"),
            ("attendance marks", "main.StudentAttendance"), ("results", "main.StudentResult"))]
        return "Demo school ready: " + ", ".join(f"{n} {label}" for label, n in counts)

    # ------------------------------------------------------------------ build
    def build(self, opts):
        today = ndt_today(as_string=False)
        y = today.year
        fy = y if today.month >= 4 else y - 1
        self.today = today

        # ---- the years: the fiscal year Shrawan-Ashadh, the academic year Baisakh-Chaitra
        ey = model("main.EconomicYear").objects.create(
            name=f"EY{fy}/{(fy + 1) % 1000:03d}", start_date=f"{fy}-04-01", end_date=bs_str(month_end(fy + 1, 3)))

        # ---- the superadmin, and the school with every facility on
        SuperAdminAccount.objects.create_user(username=opts["superadmin_username"], password=opts["password"],
                                              full_name="SchoolCore Superadmin")
        school = model("main.SchoolAdmin").objects.create(
            name=opts["school_name"], address="Baneshwor, Kathmandu", contact="9800000101", telephone="014000000",
            estd_date="2050-01-15", pan_no="609876543", email="info@demoschool.edu.np",
            account=AdminAccount.objects.create_user(username=opts["admin_username"], password=opts["password"]),
            renew_date=ey.end_date, economic_year=ey, slogan="Learning together, growing together",
            about_us="A demo school on SchoolCore, with a full year of sample records.",
            preferences={"sms_on_absences": True, "sms_on_bill_payment": True,
                         "birthday_sms_auto_wish": True, "staff_birthday_sms_auto_wish": True},
            attendance_in_time="09:30", attendance_out_time="15:30",
        )
        set_school_modules(school, {code: True for code in MODULE_CODES})
        ay = model("main.AcademicYear").objects.create(
            name=str(y), start_date=f"{y}-01-01", end_date=bs_str(month_end(y, 12)), school=school)
        model("accounting.AccountingEconomicYear").objects.create(
            name=ey.name, start_date=ey.start_date, end_date=ey.end_date, school=school)
        self.school, self.ay, self.ey = school, ay, ey

        self.make_classes()
        self.make_staff(opts["password"])
        self.make_students(opts["password"])
        self.make_hostel()
        self.make_transport()
        self.make_fees()
        self.post_and_collect()
        self.take_attendance()
        self.hold_exam()
        self.make_calendar_and_notices()
        self.make_library()
        self.make_canteen()
        self.make_inventory()

    # --------------------------------------------------------------- classes
    def make_classes(self):
        school, ay = self.school, self.ay
        Section, ClassInfo, Subject = model("main.Section"), model("main.ClassInfo"), model("main.Subject")
        a = Section.objects.create(section="A", school=school)
        b = Section.objects.create(section="B", school=school)
        self.classes = []
        for grade in PRE_PRIMARY:
            self.classes.append(ClassInfo.objects.create(education_level=2, grade=grade, section=a, school=school, academic_year=ay))
        for grade in range(4, 14):
            for section in (a, b):
                self.classes.append(ClassInfo.objects.create(education_level=2, grade=grade, section=section, school=school, academic_year=ay))
        model("main.AcademicYearMapping").objects.create(
            school=school, key=gen_class_key({"education_level": 2}), academic_year=ay)
        self.subjects = {}
        for ci in self.classes:
            names = SUBJECTS["pre"] if ci.grade in PRE_PRIMARY else SUBJECTS["low"] if ci.grade <= 8 else SUBJECTS["high"]
            self.subjects[ci.id] = [
                Subject.objects.create(subject=name, credit_hours=Decimal("4"), order=n, school=school, class_info=ci)
                for n, name in enumerate(names, start=1)
            ]

    # ----------------------------------------------------------------- staff
    def make_staff(self, password):
        rng, school, y = self.rng, self.school, self.today.year
        StaffRole, Staff, StaffOtherInfo = model("main.StaffRole"), model("main.Staff"), model("main.StaffOtherInfo")
        plan = [("Principal", 1, 65000), ("Vice Principal", 1, 52000), ("Teacher", 18, 32000), ("Accountant", 2, 30000),
                ("Librarian", 1, 24000), ("Office Assistant", 2, 20000), ("Driver", 2, 22000), ("Hostel Warden", 1, 25000)]
        self.staff = []
        for role_name, count, salary in plan:
            role, _ = StaffRole.objects.get_or_create(role=role_name)
            for _ in range(count):
                female = rng.random() < 0.5
                first, last = rng.choice(GIRLS if female else BOYS), rng.choice(SURNAMES)
                n = len(self.staff) + 1
                info = StaffOtherInfo.objects.create(
                    birth_date=f"{rng.randint(2030, 2058)}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                    gender=2 if female else 1, father_name=f"{rng.choice(BOYS)} {last}", mother_name=f"{rng.choice(GIRLS)} {last}",
                    email=f"{first.lower()}.{last.lower()}{n}@demoschool.edu.np", basic_salary=salary + rng.randint(0, 6) * 500,
                    qualification="M.Ed." if role_name in ("Principal", "Vice Principal") else "B.Ed." if role_name == "Teacher" else "+2",
                    joined_date=f"{rng.randint(2068, y - 1)}-{rng.randint(1, 12):02d}-01",
                )
                self.staff.append(Staff.objects.create(
                    role=role, first_name=first, last_name=last, primary_contact=f"98010{n:05d}",
                    location=rng.choice(PLACES), school=school, other_info=info,
                ))
        self.teacher = next(s for s in self.staff if s.role.role == "Teacher")
        self.teacher.account = StaffAccount.objects.create_user(username="teacher", password=password)
        self.teacher.permissions = TEACHER_PERMISSIONS
        self.teacher.save(update_fields=["account", "permissions"])
        accountant = next(s for s in self.staff if s.role.role == "Accountant")
        accountant.account = StaffAccount.objects.create_user(username="accountant", password=password)
        accountant.permissions = ACCOUNTANT_PERMISSIONS
        accountant.save(update_fields=["account", "permissions"])

    # -------------------------------------------------------------- students
    def make_students(self, password):
        rng, y = self.rng, self.today.year
        Student, Guardian = model("main.Student"), model("main.StudentGuardianInfo")
        self.students, serial = [], 0
        for ci in self.classes:
            size = rng.randint(14, 20) if ci.grade in PRE_PRIMARY else rng.randint(17, 24)
            age = {16: 3, 1: 4, 2: 5, 3: 6}.get(ci.grade, ci.grade + 3)
            names = []
            for _ in range(size):
                female = rng.random() < 0.48
                names.append((rng.choice(GIRLS if female else BOYS), rng.choice(SURNAMES), female))
            for roll, (first, last, female) in enumerate(sorted(names, key=lambda n: (n[0], n[1])), start=1):
                serial += 1
                guardian = Guardian.objects.create(
                    father_name=f"{rng.choice(BOYS)} {last}", mother_name=f"{rng.choice(GIRLS)} {last}",
                    guardian_contact=f"98{rng.randint(40000000, 69999999)}",
                    father_occupation=rng.choice([1, 2, 3, 4, 5, 7, 8]),  # main/choices/Occupation.py
                    guardian_location=rng.choice(PLACES),
                )
                self.students.append(Student.objects.create(
                    first_name=first, last_name=last, gender=2 if female else 1,
                    birth_date=f"{y - age - rng.randint(0, 1)}-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
                    location=guardian.guardian_location, class_info=ci, guardian_info=guardian, academic_year=self.ay,
                    roll_no=str(roll), regd_no=f"{y - rng.randint(0, 6)}{serial:04d}",
                ))
        login = self.students[len(self.students) // 2]
        login.account = StudentAccount.objects.create_user(username="student", password=password)
        login.save(update_fields=["account"])
        self.roster = {ci.id: [s for s in self.students if s.class_info_id == ci.id] for ci in self.classes}

    # ---------------------------------------------------- hostel and transport
    def make_hostel(self):
        rng, school = self.rng, self.school
        hostel = model("hostel.Hostel").objects.create(school=school, name="Demo school hostel", hostel_type=3,
                                                       warden=next(s for s in self.staff if s.role.role == "Hostel Warden"))
        block = model("hostel.HostelBlock").objects.create(hostel=hostel, name="Block A", floors=2)
        kind = model("hostel.HostelRoomType").objects.create(
            hostel=hostel, name="Four-bed room", bed_count=4, monthly_fee=Decimal(8000),
            admission_fee=Decimal(5000), security_deposit=Decimal(3000))
        beds = []
        for n in range(1, 7):
            room = model("hostel.HostelRoom").objects.create(hostel=hostel, block=block, room_no=f"A-{n:02d}",
                                                            floor=1 + (n > 3), room_type=kind, capacity=4)
            beds += [(room, model("hostel.HostelBed").objects.create(room=room, bed_no=str(b))) for b in range(1, 5)]
        seniors = [s for s in self.students if s.class_info.grade >= 9]
        boarders = rng.sample(seniors, min(20, len(seniors)))
        for st, (room, bed) in zip(boarders, beds):
            model("hostel.HostelAllocation").objects.create(
                school=school, student=st, hostel=hostel, room=room, bed=bed, academic_year=self.ay,
                check_in_date=f"{self.today.year}-01-15", monthly_fee=kind.monthly_fee, admission_fee=kind.admission_fee,
                security_deposit=kind.security_deposit, deposit_paid=True,
                emergency_contact_name=st.guardian_info.father_name, emergency_contact=st.guardian_info.guardian_contact,
                emergency_contact_relation="Father")
        self.hostel_fee = {st.id: int(kind.monthly_fee) for st in boarders}

    def make_transport(self):
        rng, school = self.rng, self.school
        stations = [model("main.BusStation").objects.create(station=p, school=school, fee=Decimal(fee))
                    for p, fee in zip(PLACES[:7], [1200, 1500, 1500, 1800, 1800, 2000, 2200])]
        self.bus_fee = {}
        for st in self.students:
            if st.id not in self.hostel_fee and rng.random() < 0.32:
                station = rng.choice(stations)
                model("main.StudentTransportationInfo").objects.create(
                    student=st, school=school, bus_station=station, start_date=f"{self.today.year}-01-05")
                self.bus_fee[st.id] = int(station.fee)

    # ------------------------------------------------------------------ fees
    def make_fees(self):
        rng, school = self.rng, self.school
        FeeTitle, Fee = model("main.FeeTitle"), model("main.Fee")
        self.monthly = FeeTitle.objects.create(title="Monthly fee", months=list(range(1, 13)), school=school)
        computer = FeeTitle.objects.create(title="Computer fee", months=list(range(1, 13)), school=school)
        exam = FeeTitle.objects.create(title="Terminal exam fee", months=[6, 11], school=school)
        self.title_months = {t.id: t.months for t in (self.monthly, computer, exam)}
        self.fees = {}
        for ci in self.classes:
            rows = {self.monthly.id: MONTHLY[ci.grade]}
            if ci.grade >= 7:
                rows[computer.id] = 500
            if ci.grade >= 4:
                rows[exam.id] = 600 + (ci.grade - 4) * 50
            for title_id, amount in rows.items():
                Fee.objects.create(title_id=title_id, fee=Decimal(amount), class_info=ci)
            self.fees[ci.id] = rows
        # A sibling discount on the monthly fee for a few families.
        self.discounted = set()
        for st in self.students:
            if rng.random() < 0.08:
                model("main.StudentDiscountInfo").objects.create(
                    student=st, school=school, title=self.monthly, percentage=Decimal(10),
                    remarks="Sibling discount", academic_year=self.ay)
                self.discounted.add(st.id)

    def charges(self, st, month):
        """{title key: amount} billed to one student for one month."""
        rows = {str(t): a for t, a in self.fees[st.class_info_id].items() if month in self.title_months[t]}
        if st.id in self.bus_fee:
            rows[TRANSPORTATION] = self.bus_fee[st.id]
        if st.id in self.hostel_fee:
            rows[HOSTEL] = self.hostel_fee[st.id]
        return rows

    def post_and_collect(self):
        """Post each month of this academic year that is also in this fiscal
        year, class by class; then collect, most families up to date and some a
        month or two behind, with a share of this month's paid today."""
        rng, today, y = self.rng, self.today, self.today.year
        self.months = list(range(4 if today.month >= 4 else 1, today.month + 1))
        for ci in self.classes:
            for m in self.months:
                rows = [{"student": st.id, "details": c, "total": sum(c.values())}
                        for st in self.roster[ci.id] if (c := self.charges(st, m))]
                posting = LedgerPostingSerializer(data={"months": [m], "class_info": ci.id, "economic_year": self.ey.id,
                                                        "academic_year": self.ay.id, "date": f"{y}-{m:02d}-01"})
                posting.is_valid(raise_exception=True)
                posting.save(studentLedgers=rows)

        payments = []
        for st in self.students:
            r = rng.random()
            behind = 0 if r < 0.58 else 1 if r < 0.82 else 2 if r < 0.93 else len(self.months)
            for m in self.months[:max(0, len(self.months) - behind)]:
                if m == today.month:
                    day = today.day if rng.random() < 0.2 else rng.randint(1, max(1, today.day - 1))
                else:
                    day = rng.randint(2, 26)
                d = ndate(y, m, day)
                if is_saturday(d) and d != today:
                    d -= timedelta(days=1)
                payments.append((bs_str(d), rng.random(), st, m))
        # Receipt numbers follow the calendar, as they would at a real counter.
        for date, _, st, m in sorted(payments, key=lambda p: (p[0], p[1])):
            details, paid, discount = {}, Decimal(0), Decimal(0)
            for title, amount in self.charges(st, m).items():
                amount = Decimal(amount)
                dis = (amount / 10).quantize(Decimal(1)) if st.id in self.discounted and title == str(self.monthly.id) else Decimal(0)
                # `amt` is the gross line: what was paid plus what was waived.
                details[title] = {"amt": str(amount), "dis": str(dis)} if dis else {"amt": str(amount)}
                paid += amount - dis
                discount += dis
            invoice = StudentInvoiceSerializer(data={
                "school": self.school.id, "student": st.id, "academic_year": self.ay.id, "economic_year": self.ey.id,
                "date": date, "payment_month": m, "isCashReceipt": False, "details": details,
                "total_paid": str(paid), "total_due": "0", "total_discount": str(discount),
                "mode": 1 if rng.random() < 0.7 else 2,
            })
            invoice.is_valid(raise_exception=True)
            invoice.save()

    # ------------------------------------------------------------ attendance
    def take_attendance(self):
        rng, school = self.rng, self.school
        ClassAttendance, StudentAttendance = model("main.ClassAttendance"), model("main.StudentAttendance")
        StaffAttendance = model("main.StaffAttendance")
        # Two classes have not been marked yet today, so the dashboard has
        # something to point at.
        unmarked_today = {ci.id for ci in rng.sample(self.classes, 2)}
        for d in school_days_back(self.today, 22):
            date = bs_str(d)
            for ci in self.classes:
                if d == self.today and ci.id in unmarked_today:
                    continue
                roll = ClassAttendance.objects.create(date=date, class_info=ci, school=school, teacher=self.teacher)
                marks = []
                for st in self.roster[ci.id]:
                    present = rng.random() < 0.93
                    reason = "" if present else rng.choice(["", "", "Sick", "Family function", "Out of station"])
                    marks.append(StudentAttendance(class_attendance=roll, student=st, status=present, reason=reason))
                StudentAttendance.objects.bulk_create(marks)
            marks = []
            for sf in self.staff:
                present = rng.random() < 0.95
                marks.append(StaffAttendance(staff=sf, school=school, date=date, status=present,
                                             reason="" if present else rng.choice(["Leave", "Training", "Sick"])))
            StaffAttendance.objects.bulk_create(marks)

    # ----------------------------------------------------------------- exams
    def hold_exam(self):
        rng, school, today = self.rng, self.school, self.today
        for kind, rules in GRADING_RULES.items():
            model("main.GradingRules").objects.create(
                school=school, type=kind, rules=[{"min": str(lo), "max": str(hi), "remarks": text} for lo, hi, text in rules])
        exam = model("main.Exam").objects.create(academic_year=self.ay, name="First terminal examination", school=school)
        days = school_days_back(today - timedelta(days=30), 10)
        published = bs_str(today - timedelta(days=12))
        ClassResult, StudentResult = model("main.ClassResult"), model("main.StudentResult")
        for ci in self.classes:
            subjects = self.subjects[ci.id]
            model("main.ExamSchedule").objects.create(
                exam=exam, class_info=ci, start_time="10:00 AM", end_time="1:00 PM",
                schedule={str(s.id): bs_str(days[n % len(days)]) for n, s in enumerate(subjects)})
            # Each student has a level they mostly score around.
            ability = {st.id: rng.gauss(68, 13) for st in self.roster[ci.id]}
            for subject in subjects:
                cr = ClassResult.objects.create(
                    exam=exam, class_info=ci, subject=subject, published_date=published,
                    criteria={"fm": 100, "pm": 40, "fm_th": 100, "pm_th": 40, "fm_pr": 0, "pm_pr": 0, "attendance": 0})
                rows = []
                for st in self.roster[ci.id]:
                    mark = Decimal(max(18, min(99, round(rng.gauss(ability[st.id], 8)))))
                    rows.append(StudentResult(student=st, class_result=cr, theory=mark, practical=Decimal(0),
                                              total=mark, result=mark >= 40, absent=False))
                StudentResult.objects.bulk_create(rows)

    # ---------------------------------------------------- calendar and notices
    def make_calendar_and_notices(self):
        school, today, y = self.school, self.today, self.today.year
        for start, end, kind, colour, text in [
            (f"{y}-01-01", f"{y}-01-01", 1, "#d63e6a", "New Year"),
            (f"{y}-01-15", f"{y}-01-15", 4, "#1baf7a", "New session begins"),
            (bs_str(today - timedelta(days=40)), bs_str(today - timedelta(days=31)), 2, "#2a78d6", "First terminal examination"),
            (bs_str(today - timedelta(days=12)), bs_str(today - timedelta(days=12)), 3, "#eda100", "First terminal results"),
            (f"{y}-06-24", f"{y}-07-05", 5, "#eb6834", "Dashain vacation"),
            (f"{y}-07-20", f"{y}-07-26", 5, "#eb6834", "Tihar vacation"),
            (bs_str(today + timedelta(days=25)), bs_str(today + timedelta(days=25)), 4, "#1baf7a", "Annual sports day"),
            (f"{y}-11-10", f"{y}-11-18", 2, "#2a78d6", "Second terminal examination"),
        ]:
            model("main.CalendarEvent").objects.create(start_date=start, end_date=end, type=kind, color=colour,
                                                       description=text, school=school)
        for days_ago, title, body in [
            (1, "Tihar vacation", "The school stays closed for Tihar. Classes resume the day after Bhai Tika."),
            (6, "Sports day houses", "Students will be told their houses this week. Practice starts after Tihar."),
            (12, "First terminal results published", "Results for every class are out. Guardians can see them in the app."),
            (20, "Fee collection hours", "The fee counter is open 9:30 to 3:30, Sunday to Friday."),
        ]:
            model("main.Notice").objects.create(title=title, description=body, school=school,
                                                date=bs_str(today - timedelta(days=days_ago)))
        for title, content in [
            ("Inter-school science exhibition", "Our Class 9 team took second place with a working model of a micro-hydro plant."),
            ("Tree planting day", "Students and staff planted 120 saplings along the school boundary."),
        ]:
            model("main.NewsEvent").objects.create(title=title, content=content, school=school)
        for ci in self.classes:
            if ci.grade >= 4 and ci.section.section == "A":
                for subject in self.subjects[ci.id][:2]:
                    model("main.Homework").objects.create(
                        title=f"{subject.subject}: chapter exercise", description="Complete the exercise at the end of the chapter.",
                        due_date=bs_str(today + timedelta(days=3)), class_info=ci, subject=subject, staff=self.teacher, school=school)

    # -------------------------------------------------------------- facilities
    def make_library(self):
        rng, school, today = self.rng, self.school, self.today
        library = model("library.Library").objects.create(school=school, name="Main library", address="Ground floor")
        Book, BookCopy = model("library.Book"), model("library.BookCopy")
        copies = []
        for title, author, subject, year in [
            ("Muna Madan", "Laxmi Prasad Devkota", "Nepali literature", "2073"),
            ("Seto Bagh", "Diamond Shumsher Rana", "Nepali literature", "2070"),
            ("Palpasa Cafe", "Narayan Wagle", "Nepali literature", "2075"),
            ("Shirishko Phool", "Parijat", "Nepali literature", "2072"),
            ("A Brief History of Time", "Stephen Hawking", "Science", "2074"),
            ("Wings of Fire", "A. P. J. Abdul Kalam", "Biography", "2076"),
            ("The Alchemist", "Paulo Coelho", "Fiction", "2077"),
            ("English Grammar in Use", "Raymond Murphy", "English", "2078"),
            ("Basic Mathematics, Class 10", "Curriculum Development Centre", "Mathematics", "2080"),
            ("Science and Technology, Class 9", "Curriculum Development Centre", "Science", "2080"),
        ]:
            book = Book.objects.create(
                school=school, library=library, entry_date=f"{today.year}-01-10", title=title, edition="1st",
                place_and_publisher="Kathmandu", quantity=3, price=rng.choice([350, 450, 550, 650]), published_year=year,
                broad_subject=subject, keywords=subject.lower(), personal_author=author)
            copies += [BookCopy.objects.create(book=book, entry_date=f"{today.year}-01-10") for _ in range(3)]
        readers = rng.sample([s for s in self.students if s.class_info.grade >= 7], 12)
        for n, (st, copy) in enumerate(zip(readers, rng.sample(copies, 12))):
            issued = today - timedelta(days=rng.randint(3, 25))
            model("library.BookIssue").objects.create(
                school=school, student=st, book=copy, issued_date=bs_str(issued),
                due_date=bs_str(issued + timedelta(days=14)),
                returned_date=bs_str(issued + timedelta(days=10)) if n % 3 == 0 else None)

    def make_canteen(self):
        school = self.school
        model("canteen.CanteenSettings").objects.create(school=school)
        snacks = model("canteen.CanteenCategory").objects.create(school=school, name="Snacks", order=1)
        meals = model("canteen.CanteenCategory").objects.create(school=school, name="Meals", order=2)
        drinks = model("canteen.CanteenCategory").objects.create(school=school, name="Drinks", order=3)
        for n, (name, price, category) in enumerate([
            ("Momo (plate)", 120, snacks), ("Samosa", 30, snacks), ("Chowmein", 100, snacks),
            ("Dal bhat set", 150, meals), ("Veg khana set", 130, meals),
            ("Milk tea", 25, drinks), ("Fresh juice", 60, drinks),
        ], start=1):
            model("canteen.CanteenItem").objects.create(school=school, category=category, name=name,
                                                        price=Decimal(price), order=n)

    def make_inventory(self):
        rng, school, today = self.rng, self.school, self.today
        Category, Item, Txn = model("main.InventoryCategory"), model("main.InventoryItem"), model("main.InventoryTransaction")
        stationery = Category.objects.create(name="Stationery", school=school)
        furniture = Category.objects.create(name="Furniture", school=school)
        for name, category, unit, price, bought, used in [
            ("Whiteboard marker", stationery, "pcs", 45, 200, 120), ("A4 paper", stationery, "ream", 650, 40, 22),
            ("Chalk", stationery, "box", 90, 60, 35), ("Student desk", furniture, "pcs", 4800, 20, 0),
            ("Chair", furniture, "pcs", 1500, 30, 0),
        ]:
            item = Item.objects.create(name=name, category=category, unit=unit, reorder_level=Decimal(10), school=school)
            Txn.objects.create(item=item, txn_type=1, quantity=Decimal(bought), unit_price=Decimal(price),
                               total=Decimal(bought * price), date=bs_str(today - timedelta(days=rng.randint(40, 80))),
                               academic_year=self.ay, economic_year=self.ey, supplier="Bagmati Suppliers", school=school)
            if used:
                Txn.objects.create(item=item, txn_type=2, quantity=Decimal(used),
                                   date=bs_str(today - timedelta(days=rng.randint(2, 30))), academic_year=self.ay,
                                   economic_year=self.ey, party_or_purpose="Classrooms", school=school)
