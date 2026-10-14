"""
Turn the SECTIONS a +2 faculty was split into, into STREAMS of that faculty.

WHY THIS EXISTS
  A +2 faculty is not the bottom of the tree. "Class 11 ▸ Management" is split
  into Computer Science / Finance / Business / Hotel Management, and each of
  those can then have sections (A, B, …). With only `section` available, schools
  put the stream there — Great Araniko has Class 11 Management with sections
  named BUSINESS, Computer Science, FINANCE, Hotel Management — which spends the
  one level the class had on the stream and leaves nothing for real sections.
  Worse, sections of one class SHARE a subject set, so four streams with
  different optional subjects had to share nine subject rows.

  `ClassInfo.course` is that missing level. It is already part of the class
  identity everywhere it matters (fees resolve by it, subjects group by it, the
  academic-year close keys by it, promotion carries it), and every higher-ed
  rule is gated on `education_level in (4,5,8,9)`, so a level-3 course cannot
  wander into batch/semester logic. So a stream is a `Course` row of
  education_level 3, and this command moves a school's existing data onto it.

WHAT IT DOES  (per matched class row)
  section=<stream>, course=NULL   ->   course=<stream>, section=NULL

  IN PLACE. The row keeps its id, so every student, fee, ledger posting,
  invoice, result, timetable and attendance row that points at it still does —
  nothing is moved between classes and no money changes. What changes is the
  class's IDENTITY, which is why the subject set needs the attention below.

SUBJECTS
  Sections share their class's subjects; streams do not (that is the point). A
  faculty's subjects normally sit on its section-less row, which after the move
  is no longer in the stream's group — so marks entry for the stream would find
  no subjects at all. `--copy-subjects` copies that row's subjects to each
  stream, EXCEPT a subject named after a different stream: "OPT III. COMPUTER
  SCIENCE (TH)" goes to Computer Science only, while the three compulsories and
  OPT I / OPT II go to all of them. The distribution is printed before anything
  is written — read it.

SAFETY
  * Dry run unless --apply. Nothing is ever deleted; the emptied Section rows
    are left alone (they simply stop being offered, since the section pickers
    are fed from class rows).
  * Refuses to touch a row when the target identity is already taken by another
    class row — that is a merge, and a merge is not this command's business.
  * One transaction, and the class-name cache is dropped for every row it
    touched.

USAGE
    # look first — this writes nothing
    python manage.py streamify_faculty_sections --school 4 --faculty 2
    # only two of the sections, both grades, and hand the subjects out
    python manage.py streamify_faculty_sections --school 4 --faculty 2 \\
        --sections "Computer Science,FINANCE" --copy-subjects
    # do it
    python manage.py streamify_faculty_sections --school 4 --faculty 2 \\
        --copy-subjects --apply
"""

from collections import defaultdict

from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from main.models.ClassInfo import ClassInfo
from main.models.Course import Course
from main.models.Invoice import StudentInvoice
from main.models.Ledger import LedgerPosting
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student
from main.models.Subject import Subject
from main.models.ClassPeriod import ClassPeriod
from main.models.exams.Result import ClassResult
from main.choices.Education import FACULTY_CHOICES, GRADE_CHOICES

HIGHSCHOOL = 3
# +2 grades. Nothing else in level 3 exists, but naming them beats a magic list.
HIGHSCHOOL_GRADES = (14, 15)
GRADE_NAMES = dict(GRADE_CHOICES)
FACULTY_NAMES = dict(FACULTY_CHOICES)


class Command(BaseCommand):
    help = (
        "Move a +2 faculty's stream-sections onto ClassInfo.course "
        "(dry run unless --apply)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, required=True)
        parser.add_argument(
            "--faculty", type=int, required=True,
            help=f"Faculty to convert, one of {sorted(FACULTY_NAMES)}.",
        )
        parser.add_argument(
            "--grades", default=",".join(str(g) for g in HIGHSCHOOL_GRADES),
            help="Comma-separated grades (default 14,15 = eleven,twelve).",
        )
        parser.add_argument(
            "--sections", default="",
            help="Comma-separated section NAMES to convert. Default: all of them.",
        )
        parser.add_argument(
            "--copy-subjects", action="store_true",
            help="Copy the faculty's subject set to each stream (see the docstring).",
        )
        parser.add_argument(
            "--apply", action="store_true",
            help="Write the change. Without it, nothing is saved.",
        )

    # ------------------------------------------------------------------ handle
    def handle(self, *args, **opts):
        school_id = opts["school"]
        faculty = opts["faculty"]
        apply = opts["apply"]
        copy_subjects = opts["copy_subjects"]

        school = SchoolAdmin.objects.filter(id=school_id).values("id", "name").first()
        if not school:
            raise CommandError(f"school {school_id} not found")
        if faculty not in FACULTY_NAMES:
            raise CommandError(f"faculty {faculty} is not one of {sorted(FACULTY_NAMES)}")
        grades = self._int_list(opts["grades"])
        stray = [g for g in grades if g not in HIGHSCHOOL_GRADES]
        if stray:
            raise CommandError(f"{stray} are not +2 grades {HIGHSCHOOL_GRADES}")
        wanted = [s.strip() for s in opts["sections"].split(",") if s.strip()]

        head = (
            f"{school['name']} (school {school_id}) — "
            f"{FACULTY_NAMES[faculty]}, grades {', '.join(GRADE_NAMES[g] for g in grades)}"
        )
        self.stdout.write(head)
        self.stdout.write("=" * len(head))

        rows = list(
            ClassInfo.objects.filter(
                school=school_id,
                education_level=HIGHSCHOOL,
                faculty=faculty,
                grade__in=grades,
                course__isnull=True,
                section__isnull=False,
            )
            .select_related("section")
            .order_by("grade", "section__section", "id")
        )
        if wanted:
            lowered = {w.lower() for w in wanted}
            rows = [r for r in rows if r.section.section.lower() in lowered]
        self._report_leftover_parents(school_id, faculty, grades)
        if not rows:
            self.stdout.write(
                "\nNothing to convert: no section-bearing, stream-less class rows match."
            )
            return

        # ------------------------------------------------ streams to create/reuse
        names = []
        for r in rows:
            name = r.section.section.strip()
            if name not in names:
                names.append(name)
        courses, to_create = {}, []
        for name in names:
            existing = (
                Course.objects.filter(
                    school=school_id,
                    education_level=HIGHSCHOOL,
                    faculty=faculty,
                    course__iexact=name,
                )
                .order_by("id")
                .first()
            )
            courses[name] = existing
            if not existing:
                to_create.append(name)

        self.stdout.write("\nStreams")
        for name in names:
            got = courses[name]
            self.stdout.write(
                f"  {name:<22} {'reuse course #' + str(got.id) if got else 'CREATE'}"
            )

        # ------------------------------------------------------- per-row report
        self.stdout.write("\nClass rows")
        self.stdout.write(
            f"  {'id':>6} {'grade':<8} {'section -> stream':<34} "
            f"{'std':>5} {'fees':>5} {'post':>5} {'inv':>5} {'res':>4} {'subj':>5} {'per':>4}"
        )
        blocked = []
        for r in rows:
            name = r.section.section.strip()
            clash = (
                ClassInfo.objects.filter(
                    school=school_id,
                    education_level=HIGHSCHOOL,
                    faculty=faculty,
                    grade=r.grade,
                    course=courses[name],
                    section__isnull=True,
                    year__isnull=True,
                    semester__isnull=True,
                    batch__isnull=True,
                )
                .exclude(id=r.id)
                .values_list("id", flat=True)
                .first()
                if courses[name]
                else None
            )
            if clash:
                blocked.append((r.id, name, clash))
            self.stdout.write(
                f"  {r.id:>6} {GRADE_NAMES.get(r.grade, r.grade):<8} "
                f"{name + ' -> ' + name:<34} "
                f"{Student.objects.filter(class_info=r.id).count():>5} "
                f"{r.fee_set.count():>5} "
                f"{LedgerPosting.objects.filter(class_info=r.id).count():>5} "
                f"{StudentInvoice.objects.filter(class_info=r.id).count():>5} "
                f"{ClassResult.objects.filter(class_info=r.id).count():>4} "
                f"{Subject.objects.filter(class_info=r.id).count():>5} "
                f"{ClassPeriod.objects.filter(class_info=r.id).count():>4}"
                + ("   << BLOCKED" if clash else "")
            )
        if blocked:
            self.stdout.write("\nBLOCKED — the stream class already exists as another row:")
            for rid, name, clash in blocked:
                self.stdout.write(f"  row {rid} ({name}) would collide with row {clash}")
            self.stdout.write(
                "Merging two class rows moves students and money between them, which this\n"
                "command will not do. Sort those out first, then run it again."
            )
            return

        # ------------------------------------------------------------- subjects
        plan = self._subject_plan(school_id, faculty, grades, rows, names)
        if copy_subjects:
            self.stdout.write("\nSubjects to copy")
            if not plan:
                self.stdout.write("  none — the faculty rows carry no subjects")
            for (grade, parent_id), per_stream in sorted(plan.items()):
                self.stdout.write(
                    f"  from row {parent_id} ({GRADE_NAMES.get(grade, grade)})"
                )
                for name, subjects in sorted(per_stream.items()):
                    titles = ", ".join(s.subject for s in subjects) or "nothing"
                    self.stdout.write(f"    {name:<22} {titles}")
        elif plan:
            self.stdout.write(
                "\nNote: the faculty's subjects sit on its section-less row, which these\n"
                "streams will no longer share. Pass --copy-subjects to hand each stream\n"
                "its own set, or the marks entry screen will offer them nothing."
            )

        if not apply:
            self.stdout.write(
                f"\nDRY RUN — {len(rows)} class row(s), {len(to_create)} stream(s) to create."
                "\nRe-run with --apply to write it."
            )
            return

        # ---------------------------------------------------------------- apply
        with transaction.atomic():
            for name in to_create:
                courses[name] = Course.objects.create(
                    school_id=school_id,
                    education_level=HIGHSCHOOL,
                    faculty=faculty,
                    course=name,
                )
            touched = []
            for r in rows:
                name = r.section.section.strip()
                r.course = courses[name]
                r.section = None
                r.save(update_fields=["course", "section"])
                touched.append(r.id)
            copied = 0
            if copy_subjects:
                copied = self._copy_subjects(plan, rows, courses)
            # class names are cached per row id and every one of these changed
            cache.delete_many([f"classnames:v2:{cid}" for cid in touched])

        self.stdout.write(
            f"\nDONE — {len(touched)} class row(s) moved onto streams, "
            f"{len(to_create)} stream(s) created, {copied} subject row(s) copied."
        )
        self.stdout.write(
            "The section rows themselves were left in place; they are simply no longer\n"
            "used by these classes. Add real sections (A, B) under a stream when needed."
        )

    # ---------------------------------------------------------- leftover parents
    def _report_leftover_parents(self, school_id, faculty, grades):
        """Students still sitting on the faculty's stream-less row.

        Once the streams exist, that row is a leftover — a class of "Management,
        no stream". It is harmless when empty, but a student left on it is in no
        stream, and its subject list is the loose one (a row whose course is NULL
        matches every stream's subjects, so it reads as a long duplicated list).
        Both are fixed by moving the student into a stream, which is the school's
        decision, not this command's.
        """
        for grade in grades:
            parent = (
                ClassInfo.objects.filter(
                    school=school_id,
                    education_level=HIGHSCHOOL,
                    faculty=faculty,
                    grade=grade,
                    course__isnull=True,
                    section__isnull=True,
                    is_active=True,
                )
                .order_by("id")
                .first()
            )
            if not parent:
                continue
            held = Student.objects.filter(class_info=parent.id, is_active=True).count()
            if not held:
                continue
            self.stdout.write(
                f"\nNOTE: row {parent.id} ({GRADE_NAMES.get(grade, grade)}, no stream) "
                f"still holds {held} student(s). Move them into a stream "
                f"(Enrollment > Class Promotion); until then they are in no stream and "
                f"that row's subject list shows every stream's subjects at once."
            )

    # -------------------------------------------------------------- subject plan
    def _subject_plan(self, school_id, faculty, grades, rows, names):
        """{(grade, parent_row_id): {stream_name: [Subject, ...]}}

        The parent is the faculty's section-less, stream-less row — where the
        subjects of "Class 11 Management" live today. A subject whose name
        mentions one of the streams belongs to that stream alone; everything
        else is shared by all of them.
        """
        grades_with_rows = {r.grade for r in rows}
        plan = {}
        for grade in grades:
            if grade not in grades_with_rows:
                continue
            parent = (
                ClassInfo.objects.filter(
                    school=school_id,
                    education_level=HIGHSCHOOL,
                    faculty=faculty,
                    grade=grade,
                    course__isnull=True,
                    section__isnull=True,
                )
                .order_by("id")
                .first()
            )
            if not parent:
                continue
            subjects = list(
                Subject.objects.filter(class_info=parent.id, is_active=True).order_by("order", "id")
            )
            if not subjects:
                continue
            per_stream = defaultdict(list)
            stream_names = [n for n in names if n]
            for subject in subjects:
                title = (subject.subject or "").lower()
                owners = [n for n in stream_names if n.lower() in title]
                for name in (owners or stream_names):
                    per_stream[name].append(subject)
            plan[(grade, parent.id)] = dict(per_stream)
        return plan

    def _copy_subjects(self, plan, rows, courses):
        by_class = {(r.grade, r.course_id): r for r in rows}
        copied = 0
        for (grade, _parent_id), per_stream in plan.items():
            for name, subjects in per_stream.items():
                target = by_class.get((grade, courses[name].id))
                if not target:
                    continue
                held = set(
                    Subject.objects.filter(class_info=target.id)
                    .values_list("subject", flat=True)
                )
                for s in subjects:
                    if s.subject in held:
                        continue
                    Subject.objects.create(
                        school_id=s.school_id,
                        class_info_id=target.id,
                        type=s.type,
                        order=s.order,
                        code=s.code,
                        subject=s.subject,
                        credit_hours=s.credit_hours,
                        code_pr=s.code_pr,
                        subject_pr=s.subject_pr,
                        credit_hours_pr=s.credit_hours_pr,
                    )
                    copied += 1
        return copied

    @staticmethod
    def _int_list(raw):
        out = []
        for part in str(raw).split(","):
            part = part.strip()
            if not part:
                continue
            try:
                out.append(int(part))
            except ValueError:
                raise CommandError(f"'{part}' is not a number")
        return out
