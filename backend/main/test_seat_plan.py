from types import SimpleNamespace

from django.test import TestCase

from account.models import AdminAccount
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo
from main.models.exams.Exam import Exam
from main.models.exams.SeatPlan import SeatAllocation, SeatPlanRoom, SeatPlanRoomClass
from main.views.exams.SeatPlanView import (
    SeatPlanClearView,
    SeatPlanListView,
    SeatPlanSeatingView,
    SeatPlanView,
    generate_rooms,
)


def seats(**filters):
    """Every saved seat matching `filters`, as comparable rows."""
    return sorted(
        SeatAllocation.objects.filter(**filters).values_list(
            "id", "room", "exam", "student", "class_info", "bench_no", "column", "sequence"
        )
    )


class SeatPlanClearTests(TestCase):
    """Clearing a room takes out what was asked for and nothing else."""

    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school, cls.year = cls.make_school("one")
        cls.other, cls.other_year = cls.make_school("two")
        cls.exam = Exam.objects.create(school=cls.school, academic_year=cls.year, name="First Terminal")
        cls.final = Exam.objects.create(school=cls.school, academic_year=cls.year, name="Final Exam")
        cls.other_exam = Exam.objects.create(school=cls.other, academic_year=cls.other_year, name="First Terminal")

        # class A is too big for the first room, so it carries on into the second
        cls.class_a = cls.make_class(cls.school, cls.year, 5, 9)
        cls.class_b = cls.make_class(cls.school, cls.year, 6, 4)
        cls.class_c = cls.make_class(cls.school, cls.year, 7, 3)
        cls.room_1 = SeatPlanRoom.objects.create(school=cls.school, name="Room 1", benches=5, seats_per_bench=2)
        cls.room_2 = SeatPlanRoom.objects.create(school=cls.school, name="Room 2", benches=5, seats_per_bench=2)
        for exam in (cls.exam, cls.final):
            for room, column, klass in (
                (cls.room_1, 1, cls.class_a), (cls.room_1, 2, cls.class_b),
                (cls.room_2, 1, cls.class_a), (cls.room_2, 2, cls.class_c),
            ):
                SeatPlanRoomClass.objects.create(room=room, exam=exam, class_info=klass, column=column)
            generate_rooms([cls.room_1, cls.room_2], exam.id)

        other_class = cls.make_class(cls.other, cls.other_year, 5, 4)
        cls.other_room = SeatPlanRoom.objects.create(school=cls.other, name="Room 1", benches=5, seats_per_bench=2)
        SeatPlanRoomClass.objects.create(room=cls.other_room, exam=cls.other_exam, class_info=other_class, column=1)
        generate_rooms([cls.other_room], cls.other_exam.id)

    @classmethod
    def make_school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email=f"{tag}@example.com",
            account=AdminAccount.objects.create(username=f"admin-{tag}"), economic_year=cls.fy,
        )
        year = AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        return school, year

    @classmethod
    def make_class(cls, school, year, grade, students):
        klass = ClassInfo.objects.create(school=school, academic_year=year, education_level=2, grade=grade)
        for roll in range(1, students + 1):
            Student.objects.create(
                first_name="Student", last_name=f"Number{roll}", birth_date="2070-01-01", gender=1,
                location="Tulsipur", class_info=klass, academic_year=year, roll_no=str(roll),
                guardian_info=StudentGuardianInfo.objects.create(
                    father_name="Father Name", mother_name="Mother Name", guardian_contact="9800000000",
                ),
            )
        return klass

    def clear(self, **body):
        body = {"school": self.school.id, "exam": self.exam.id, **body}
        return SeatPlanClearView().post(SimpleNamespace(data=body))

    def test_the_seating_the_tests_start_from(self):
        # room 1: five of class A beside four of class B; room 2: the other
        # four of class A beside three of class C
        self.assertEqual(SeatAllocation.objects.filter(room=self.room_1, exam=self.exam).count(), 9)
        self.assertEqual(SeatAllocation.objects.filter(room=self.room_2, exam=self.exam).count(), 7)

    def test_one_room_is_emptied_and_every_other_seat_is_left_alone(self):
        kept = seats(room=self.room_2) + seats(exam=self.final) + seats(room=self.other_room)
        kept_classes = SeatPlanRoomClass.objects.exclude(room=self.room_1, exam=self.exam).count()

        response = self.clear(room=self.room_1.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["seats_removed"], 9)
        self.assertEqual(response.data["message"], "Room 1 cleared!")
        self.assertFalse(SeatAllocation.objects.filter(room=self.room_1, exam=self.exam).exists())
        self.assertFalse(SeatPlanRoomClass.objects.filter(room=self.room_1, exam=self.exam).exists())
        # class A carried on into room 2: those students are NOT moved up, and
        # the same room keeps its seats for the other exam
        self.assertEqual(seats(room=self.room_2) + seats(exam=self.final) + seats(room=self.other_room), kept)
        self.assertEqual(SeatPlanRoomClass.objects.count(), kept_classes)
        self.assertTrue(SeatPlanRoom.objects.filter(id=self.room_1.id, is_active=True).exists())

    def test_the_answer_is_the_exams_seating_as_it_now_stands(self):
        response = self.clear(room=str(self.room_1.id))
        rooms = {room["id"]: room for room in response.data["rooms"]}
        self.assertEqual(list(rooms), [self.room_1.id, self.room_2.id])
        self.assertEqual((rooms[self.room_1.id]["classes"], rooms[self.room_1.id]["allocations"]), ([], []))
        self.assertEqual(len(rooms[self.room_2.id]["classes"]), 2)
        self.assertEqual(len(rooms[self.room_2.id]["allocations"]), 7)
        self.assertEqual(response.data["class_counts"][self.class_a.id], 9)

    def test_all_rooms_are_emptied_for_this_exam_only(self):
        kept = seats(exam=self.final) + seats(room=self.other_room)

        response = self.clear(room="all")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["seats_removed"], 16)
        self.assertFalse(SeatAllocation.objects.filter(exam=self.exam).exists())
        self.assertFalse(SeatPlanRoomClass.objects.filter(exam=self.exam).exists())
        self.assertEqual(seats(exam=self.final) + seats(room=self.other_room), kept)
        self.assertEqual(SeatPlanRoomClass.objects.filter(exam=self.final).count(), 4)
        # the exam no longer counts as seated, the other one still does
        plans = SeatPlanListView().get(SimpleNamespace(query_params={"school": self.school.id})).data["plans"]
        self.assertEqual([plan["exam"] for plan in plans], [self.final.id])

    def test_a_request_that_does_not_name_the_room_clears_nothing(self):
        before = seats()
        classes = SeatPlanRoomClass.objects.count()
        for room in (None, "", 0, "0", -1, "-1", "abc", "ALL", " all", True, False, [], [self.room_1.id],
                     {"id": self.room_1.id}, 1.5, "1.5", f"{self.room_1.id} ", "١"):
            with self.subTest(room=room):
                self.assertEqual(self.clear(room=room).status_code, 400)
        self.assertEqual(self.clear().status_code, 400)
        self.assertEqual(seats(), before)
        self.assertEqual(SeatPlanRoomClass.objects.count(), classes)

    def test_a_room_or_an_exam_of_another_school_is_refused(self):
        before = seats()
        self.assertEqual(self.clear(room=self.other_room.id).status_code, 404)
        self.assertEqual(self.clear(room=self.room_1.id, exam=self.other_exam.id).status_code, 400)
        self.assertEqual(self.clear(room="all", exam=self.other_exam.id).status_code, 400)
        self.assertEqual(self.clear(room="all", exam=None).status_code, 400)
        self.assertEqual(self.clear(room="all", school=None).status_code, 400)
        self.assertEqual(seats(), before)

    def test_clearing_twice_removes_nothing_more(self):
        self.clear(room=self.room_1.id)
        before = seats()
        again = self.clear(room=self.room_1.id)
        self.assertEqual((again.status_code, again.data["seats_removed"]), (200, 0))
        self.assertEqual(seats(), before)

    def test_a_cleared_room_can_be_seated_again(self):
        self.clear(room=self.room_1.id)
        body = {
            "school": self.school.id, "exam": self.exam.id,
            "rooms": [{"id": self.room_1.id, "classes": [{"class_info": self.class_b.id, "column": 1}]}],
        }
        response = SeatPlanSeatingView().post(SimpleNamespace(data=body))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(SeatAllocation.objects.filter(room=self.room_1, exam=self.exam).count(), 4)
        # seating again starts class A in room 2, the first room it is now in
        rolls = SeatAllocation.objects.filter(
            room=self.room_2, exam=self.exam, class_info=self.class_a
        ).order_by("sequence").values_list("student__roll_no", flat=True)
        self.assertEqual(list(rolls), ["1", "2", "3", "4", "5"])

    def test_the_page_reads_a_cleared_room_as_empty(self):
        self.clear(room=self.room_1.id)
        request = SimpleNamespace(query_params={"school": self.school.id, "exam": self.exam.id})
        rooms = {room["id"]: room for room in SeatPlanView().get(request).data["rooms"]}
        self.assertEqual((rooms[self.room_1.id]["classes"], rooms[self.room_1.id]["allocations"]), ([], []))
        self.assertEqual(len(rooms[self.room_2.id]["allocations"]), 7)
