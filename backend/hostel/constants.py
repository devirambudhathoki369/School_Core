"""Domain vocabulary for the hostel module.

Kept in ONE place because three layers have to agree on every one of these
numbers — the model's `choices`, the serializer that labels a row for a report,
and the frontend's dropdowns (`smsys/src/configs/hostel.js`). A number that
means "vacated" in the database and "transferred" on screen is the kind of bug
that is only ever found in a fee dispute.
"""

# ---------------------------------------------------------------- hostel kind
HOSTEL_BOYS = 1
HOSTEL_GIRLS = 2
HOSTEL_MIXED = 3
HOSTEL_TYPE_CHOICES = (
    (HOSTEL_BOYS, "Boys"),
    (HOSTEL_GIRLS, "Girls"),
    (HOSTEL_MIXED, "Mixed"),
)

# ------------------------------------------------------------------ room state
ROOM_AVAILABLE = 1
ROOM_MAINTENANCE = 2   # temporarily unusable — no new allocation
ROOM_BLOCKED = 3       # deliberately withheld (staff room, store, quarantine)
ROOM_STATUS_CHOICES = (
    (ROOM_AVAILABLE, "Available"),
    (ROOM_MAINTENANCE, "Under maintenance"),
    (ROOM_BLOCKED, "Blocked"),
)
# Rooms that may take a new resident.
ROOM_ALLOCATABLE_STATUSES = (ROOM_AVAILABLE,)

# ------------------------------------------------------------------ allocation
ALLOC_ACTIVE = 1
ALLOC_VACATED = 2       # left the hostel
ALLOC_TRANSFERRED = 3   # closed because the student moved to another bed/room
ALLOCATION_STATUS_CHOICES = (
    (ALLOC_ACTIVE, "Active"),
    (ALLOC_VACATED, "Vacated"),
    (ALLOC_TRANSFERRED, "Transferred"),
)

# ------------------------------------------------------------------ attendance
ATT_PRESENT = 1
ATT_ABSENT = 2
ATT_ON_LEAVE = 3
ATT_LATE = 4
HOSTEL_ATTENDANCE_CHOICES = (
    (ATT_PRESENT, "Present"),
    (ATT_ABSENT, "Absent"),
    (ATT_ON_LEAVE, "On leave"),
    (ATT_LATE, "Late"),
)

# ----------------------------------------------------------- leave / gate pass
LEAVE_DAY_OUT = 1
LEAVE_HOME = 2
LEAVE_MEDICAL = 3
LEAVE_EMERGENCY = 4
LEAVE_TYPE_CHOICES = (
    (LEAVE_DAY_OUT, "Day out"),
    (LEAVE_HOME, "Home leave"),
    (LEAVE_MEDICAL, "Medical"),
    (LEAVE_EMERGENCY, "Emergency"),
)

LEAVE_PENDING = 1
LEAVE_APPROVED = 2
LEAVE_REJECTED = 3
LEAVE_RETURNED = 4
LEAVE_STATUS_CHOICES = (
    (LEAVE_PENDING, "Pending"),
    (LEAVE_APPROVED, "Approved"),
    (LEAVE_REJECTED, "Rejected"),
    (LEAVE_RETURNED, "Returned"),
)
# A student counted as away from the hostel right now.
LEAVE_AWAY_STATUSES = (LEAVE_APPROVED,)

# -------------------------------------------------------------------- complaint
COMPLAINT_MAINTENANCE = 1
COMPLAINT_ELECTRICAL = 2
COMPLAINT_PLUMBING = 3
COMPLAINT_CLEANLINESS = 4
COMPLAINT_MESS = 5
COMPLAINT_DISCIPLINE = 6
COMPLAINT_SECURITY = 7
COMPLAINT_OTHER = 8
COMPLAINT_CATEGORY_CHOICES = (
    (COMPLAINT_MAINTENANCE, "Maintenance"),
    (COMPLAINT_ELECTRICAL, "Electrical"),
    (COMPLAINT_PLUMBING, "Plumbing / water"),
    (COMPLAINT_CLEANLINESS, "Cleanliness"),
    (COMPLAINT_MESS, "Mess / food"),
    (COMPLAINT_DISCIPLINE, "Discipline"),
    (COMPLAINT_SECURITY, "Security"),
    (COMPLAINT_OTHER, "Other"),
)

COMPLAINT_OPEN = 1
COMPLAINT_IN_PROGRESS = 2
COMPLAINT_RESOLVED = 3
COMPLAINT_CLOSED = 4
COMPLAINT_STATUS_CHOICES = (
    (COMPLAINT_OPEN, "Open"),
    (COMPLAINT_IN_PROGRESS, "In progress"),
    (COMPLAINT_RESOLVED, "Resolved"),
    (COMPLAINT_CLOSED, "Closed"),
)
COMPLAINT_PENDING_STATUSES = (COMPLAINT_OPEN, COMPLAINT_IN_PROGRESS)

PRIORITY_LOW = 1
PRIORITY_NORMAL = 2
PRIORITY_HIGH = 3
PRIORITY_CHOICES = (
    (PRIORITY_LOW, "Low"),
    (PRIORITY_NORMAL, "Normal"),
    (PRIORITY_HIGH, "High"),
)

# ------------------------------------------------------------------------- mess
# Nepal's week starts on Sunday; the numbering follows the calendar the schools
# already read, NOT Python's Monday-first `weekday()`.
WEEKDAY_CHOICES = (
    (1, "Sunday"),
    (2, "Monday"),
    (3, "Tuesday"),
    (4, "Wednesday"),
    (5, "Thursday"),
    (6, "Friday"),
    (7, "Saturday"),
)

MEAL_BREAKFAST = 1
MEAL_LUNCH = 2
MEAL_SNACKS = 3
MEAL_DINNER = 4
MEAL_CHOICES = (
    (MEAL_BREAKFAST, "Breakfast"),
    (MEAL_LUNCH, "Lunch"),
    (MEAL_SNACKS, "Snacks"),
    (MEAL_DINNER, "Dinner"),
)


def label(choices, value, default=""):
    """`3 -> "Mixed"`. Used by serializers so a report never prints a raw code."""
    for key, text in choices:
        if key == value:
            return text
    return default
