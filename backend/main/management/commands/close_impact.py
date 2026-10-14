"""
READ-ONLY pre-close impact report for higher-ed (batch/cohort) programs.

WHY THIS EXISTS
  `AcademicYearCloseView` rolls EVERY student in the closed class-group's net
  balance into a brand-new AcademicYear as an ``{ob: amount}`` StudentLedger.
  The payment screen (LedgerViews) renders any ``ob`` as "old dues". That is
  correct for a cohort that has just FINISHED a period (its balance really is
  now a prior-period due). It is WRONG for a junior cohort that is still sitting
  in the same year/semester: their live, running charges get swept into a new
  year and mislabelled as "old dues", and they are pushed into an academic year
  they have not reached yet.

  This command writes NOTHING. It tells you, before you close, exactly which
  cohorts a close would reclassify, so you can close only the cohorts that
  actually completed a period (and promote / graduate the rest instead).

WHAT IT REPORTS  (per school -> course -> cohort/batch)
  * every live higher-ed class-group, its level (year/sem), student count, and
    the NET running balance a close would sweep into "old dues";
  * TERMINAL vs JUNIOR: a level is JUNIOR when a higher level of the SAME
    (course, batch) still exists -> those students are continuing, so closing
    them is the exact bug above;
  * SHARED-CLOCK warning: when several live levels of one course resolve to the
    SAME mapped academic year, i.e. the cohorts are NOT on independent clocks,
    so a close cannot help but roll juniors too. This is the structural root and
    is called out explicitly.

USAGE
    python manage.py close_impact                 # every school
    python manage.py close_impact --school 62      # one school
    python manage.py close_impact --school 56 -v   # + per-student balances
"""

from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from main.models.Student import Student
from main.models.Invoice import StudentInvoice
from main.models.Ledger import StudentLedger
from main.models.ClassInfo import ClassInfo
from main.models.Course import Course
from main.models.FiscalYears import AcademicYear, AcademicYearMapping
from main.models.SchoolAdmin import SchoolAdmin
from main.views.fields import CLASS_DETAILS_FIELDS
from main.methods.academicYear import (
    gen_class_key, gen_class_key_no_batch, is_terminal_level,
)

# Education levels that run as batched cohorts (year/semester wise). Grade/school
# levels (1,2,3,10) promote together and are intentionally out of scope.
HIGHER_ED_LEVELS = (4, 5, 8, 9)
CENT = Decimal("0.01")
STATUS_RUNNING = 1


class Command(BaseCommand):
    help = "READ-ONLY: report which cohorts an academic-year close would mislabel as old dues."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, default=None,
                            help="Limit to one school id.")
        parser.add_argument("--details", action="store_true",
                            help="Also print each student's swept balance.")

    # ------------------------------------------------------------------ handle
    def handle(self, *args, **opts):
        school_ids = ([opts["school"]] if opts.get("school")
                      else list(SchoolAdmin.objects.filter(is_active=True)
                                .values_list("id", flat=True)))
        verbose = opts.get("details")
        ay_name = {a["id"]: a["name"]
                   for a in AcademicYear.objects.values("id", "name")}

        any_report = False
        for school_id in school_ids:
            report = self._school_report(school_id, ay_name, verbose)
            if report:
                any_report = True
                self.stdout.write(report)
        if not any_report:
            self.stdout.write("No live higher-ed cohorts found for the given scope.")

    # ------------------------------------------------------------- one school
    def _school_report(self, school_id, ay_name, verbose):
        # 1) live higher-ed students -> their class-group + cohort key.
        rows = (Student.objects
                .filter(status=STATUS_RUNNING, is_active=True,
                        class_info__school=school_id,
                        class_info__education_level__in=HIGHER_ED_LEVELS)
                .values("id", "class_info", "batch",
                        *[f"class_info__{f}" for f in CLASS_DETAILS_FIELDS]))
        rows = list(rows)
        if not rows:
            return ""

        # 2) net running balance per student in their CURRENT mapped year — the
        #    exact amount a close would sweep into {ob:} (see calculateBalances).
        sids = [r["id"] for r in rows]
        net = defaultdict(Decimal)
        for r in (StudentLedger.objects
                  .filter(student_id__in=sids, is_active=True,
                          ledger_posting__is_active=True)
                  .values("student_id", "academic_year").annotate(t=Sum("total"))):
            net[(r["student_id"], r["academic_year"])] += r["t"] or Decimal(0)
        for r in (StudentInvoice.objects
                  .filter(student_id__in=sids, is_active=True, isCashReceipt=False)
                  .values("student_id", "academic_year")
                  .annotate(p=Sum("total_paid"), d=Sum("total_discount"))):
            net[(r["student_id"], r["academic_year"])] -= (
                (r["p"] or Decimal(0)) + (r["d"] or Decimal(0)))

        # 3) fold students into (course, batch) cohorts -> level -> class-group.
        # cohort key = (course_id, batch_id); level = (year or semester) value.
        cohorts = defaultdict(lambda: defaultdict(lambda: {
            "class_id": None, "ay": None, "students": [], "balance": Decimal(0)}))
        courses = {c["id"]: c for c in Course.objects.filter(school=school_id)
                   .values("id", "course", "total_years", "total_semesters")}
        course_names = {cid: c["course"] for cid, c in courses.items()}
        # Highest RUNNING level per course -> anything below it is a junior year.
        # Course-scoped (not cohort-scoped) so it works whether a school runs one
        # batch through the levels or one batch per level (see the guard docstring).
        course_top = defaultdict(int)
        ay_cache = {}  # class_id -> resolved academic_year id
        for r in rows:
            ci = {f: r[f"class_info__{f}"] for f in CLASS_DETAILS_FIELDS}
            ci["batch"] = r["batch"]
            level = ci.get("year") or ci.get("semester")
            if not level:
                continue
            course_id = ci.get("course")
            course_top[course_id] = max(course_top[course_id], level)
            cohort_key = (course_id, r["batch"])
            cid = r["class_info"]
            if cid not in ay_cache:
                ay_cache[cid] = self._resolve_ay(school_id, ci)
            ay_id = ay_cache[cid]
            bucket = cohorts[cohort_key][level]
            bucket["class_id"] = cid
            bucket["ay"] = ay_id
            bucket["course"] = course_id
            bucket["level_type"] = "year" if ci.get("year") else "semester"
            std_bal = net.get((r["id"], ay_id), Decimal(0)) if ay_id else Decimal(0)
            bucket["students"].append((r["id"], std_bal))
            if std_bal > CENT:
                bucket["balance"] += std_bal

        # per-course: which academic years each level maps to -> shared-clock when
        # one academic year is shared across MORE THAN ONE running level.
        course_ay_levels = defaultdict(lambda: defaultdict(set))  # course -> ay -> {levels}
        for (course_id, _batch), levels in cohorts.items():
            for level, b in levels.items():
                if b["ay"]:
                    course_ay_levels[course_id][b["ay"]].add(level)
        shared_courses = {
            course_id for course_id, ays in course_ay_levels.items()
            if any(len(lv) > 1 for lv in ays.values())
        }

        # 4) render.
        out = [self.style.MIGRATE_HEADING(f"\n=== School {school_id} ===")]
        flagged_total = Decimal(0)
        for (course_id, batch_id), levels in sorted(
                cohorts.items(), key=lambda kv: (str(kv[0][0]), str(kv[0][1]))):
            cname = course_names.get(course_id, f"course {course_id}")
            batch_txt = f"batch#{batch_id}" if batch_id else "NO-BATCH (un-stamped)"
            top = course_top.get(course_id, max(levels))  # highest RUNNING level in course

            out.append(f"\n  {cname} / {batch_txt}")
            if course_id in shared_courses:
                out.append(self.style.ERROR(
                    "    SHARED CLOCK: 2+ running levels of this course map to one "
                    "academic year -> a close cannot spare the junior levels."))
            course = courses.get(course_id, {})
            for level in sorted(levels):
                b = levels[level]
                # Prefer program length; fall back to highest-running-level.
                terminal = is_terminal_level(
                    level, b["level_type"],
                    course.get("total_years"), course.get("total_semesters"))
                is_junior = (not terminal) if terminal is not None else (level < top)
                basis = "program-length" if terminal is not None else "highest-running"
                n_students = len(b["students"])
                ayn = ay_name.get(b["ay"], b["ay"]) if b["ay"] else "UNMAPPED(None)"
                tag = (self.style.WARNING("JUNIOR — closing MISLABELS running dues")
                       if is_junior else
                       self.style.SUCCESS(f"terminal / graduating [{basis}]"))
                out.append(
                    f"    {b['level_type']} {level}: {n_students} students, "
                    f"AY={ayn}, sweep={b['balance']}  [{tag}]")
                if is_junior:
                    flagged_total += b["balance"]
                if verbose:
                    for sid, bal in sorted(b["students"], key=lambda x: -x[1]):
                        if bal > CENT:
                            out.append(f"        student {sid}: {bal}")

        out.append(self.style.MIGRATE_HEADING(
            f"\n  >>> Running balance a close would MISLABEL as old dues "
            f"(junior levels only): {flagged_total}"))
        return "\n".join(out)

    # ------------------------------------------------------ academic-year resolve
    def _resolve_ay(self, school_id, ci):
        """Current academic year id for a class. Tries the batch-aware key first
        (gen_class_key), then falls back to the pre-batch key — batch-stamped
        classes (e.g. Nawa Nepal) often only have a mapping on the non-batch key,
        so the batch-aware lookup alone returns None and hides the real sweep."""
        for key in (gen_class_key(ci), gen_class_key_no_batch(ci)):
            if not key:
                continue
            ay = (AcademicYearMapping.objects
                  .filter(key=key, school=school_id).order_by("-id")
                  .values_list("academic_year", flat=True).first())
            if ay:
                return ay
        return None
