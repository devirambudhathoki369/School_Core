"""Homework messages: a student and the teacher who set a homework
(mobile/SPEC.md §5). The rules are in `mobileapi/threads.py`."""
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response

from main.models.Homework import HomeworkMessage
from main.models.Student import Student

from .. import threads
from ..access import not_found, staff_of, student_for
from ..auth import STUDENT_RUNNING
from ..errors import MobileError
from ..idempotency import idempotent
from ..models import AppSession
from ..throttles import MessageSendThrottle
from .base import MobileAPIView
from .staff import MessageOut, _fields_error, _own_homework_or_404
from .students import STUDENT_ID, _homework_for


class ThreadOut(serializers.Serializer):
    homework_id = serializers.IntegerField()
    homework_title = serializers.CharField()
    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    teacher_name = serializers.CharField()
    can_write = serializers.BooleanField(help_text="False for parents, who read the thread only")
    items = MessageOut(many=True, help_text="Newest first, 30 at a time")
    next_cursor = serializers.CharField(allow_null=True)


class MessageIn(serializers.Serializer):
    body = serializers.CharField(max_length=HomeworkMessage.MAX_LENGTH)


HOMEWORK_ID = OpenApiParameter("homework_id", int, OpenApiParameter.PATH)
THREAD_STUDENT = OpenApiParameter("student_id", int, OpenApiParameter.PATH, description="The student of the thread")
CURSOR = OpenApiParameter("cursor", str)


def _body(request) -> str:
    given = MessageIn(data=request.data)
    if not given.is_valid():
        raise MobileError("invalid", "Write a message of up to 500 characters.", fields=_fields_error(given.errors))
    return given.validated_data["body"]


def _students_homework(student, homework_id):
    homework = _homework_for(student).filter(pk=homework_id).first()
    if homework is None:
        raise not_found("That homework was not found.")
    return homework


class StudentThreadView(MobileAPIView):
    """The student's thread with the teacher; their parents read it too."""

    throttle_classes = (*MobileAPIView.throttle_classes, MessageSendThrottle)

    @extend_schema(parameters=[STUDENT_ID, HOMEWORK_ID, CURSOR], responses=ThreadOut)
    def get(self, request, student_id, homework_id):
        student = student_for(request, student_id)
        homework = _students_homework(student, homework_id)
        own = request.auth.role == AppSession.STUDENT
        body = threads.thread_payload(request, homework, student, can_write=own,
                                      reader=threads.STUDENT if own else None)
        return Response(ThreadOut(body).data)

    @extend_schema(parameters=[STUDENT_ID, HOMEWORK_ID], request=MessageIn, responses={201: MessageOut})
    @idempotent
    def post(self, request, student_id, homework_id):
        student = student_for(request, student_id)
        if request.auth.role != AppSession.STUDENT:
            raise MobileError("forbidden", "Parents can read these messages, but only the student writes them.",
                              status.HTTP_403_FORBIDDEN)
        homework = _students_homework(student, homework_id)
        message = threads.send(homework, student, _body(request))
        return Response(MessageOut(threads.message_payload(message)).data, status=status.HTTP_201_CREATED)


def _thread_student(homework, student_id) -> tuple[Student, bool]:
    """The student of a thread on the teacher's homework, and whether the
    teacher may write to them: a student of the homework's class now. A
    student who has left the class keeps their thread, to read only."""
    try:
        student_id = int(student_id)
    except (TypeError, ValueError):
        raise not_found()
    student = Student.objects.filter(
        pk=student_id, class_info=homework.class_info_id, is_active=True, status=STUDENT_RUNNING
    ).first()
    if student is not None:
        return student, True
    if HomeworkMessage.objects.filter(homework=homework, student_id=student_id).exists():
        return Student.objects.get(pk=student_id), False
    raise not_found("That student is not in this homework's class.")


class StaffThreadView(MobileAPIView):
    """The teacher's thread with one student on their own homework."""

    throttle_classes = (*MobileAPIView.throttle_classes, MessageSendThrottle)

    @extend_schema(parameters=[HOMEWORK_ID, THREAD_STUDENT, CURSOR], responses=ThreadOut)
    def get(self, request, homework_id, student_id):
        staff = staff_of(request)
        homework = _own_homework_or_404(staff, homework_id)
        student, can_write = _thread_student(homework, student_id)
        body = threads.thread_payload(request, homework, student, can_write=can_write, reader=threads.TEACHER)
        return Response(ThreadOut(body).data)

    @extend_schema(parameters=[HOMEWORK_ID, THREAD_STUDENT], request=MessageIn, responses={201: MessageOut})
    @idempotent
    def post(self, request, homework_id, student_id):
        staff = staff_of(request)
        homework = _own_homework_or_404(staff, homework_id)
        student, can_write = _thread_student(homework, student_id)
        if not can_write:
            raise MobileError("left_class", "This student is no longer in the class.", status.HTTP_409_CONFLICT)
        message = threads.send(homework, student, _body(request), staff=staff)
        return Response(MessageOut(threads.message_payload(message)).data, status=status.HTTP_201_CREATED)
