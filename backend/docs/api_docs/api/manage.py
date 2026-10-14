from drf_yasg import openapi

#
from . import (
    _successful_response,
    _boolean,
    SCHOOL_ID,
    CLASS_INFO_ID,
    STAFF_ID,
)

tags = ["management"]

# ---

FEES_COUNT = openapi.Parameter(
    in_=openapi.IN_QUERY, name="fees_count", type=openapi.TYPE_BOOLEAN
)
IS_CLASS_TEACHER = openapi.Parameter(
    in_=openapi.IN_QUERY, name="is_class_teacher", type=openapi.TYPE_BOOLEAN
)
ACADEMIC_YEAR = openapi.Parameter(
    in_=openapi.IN_QUERY,
    name="academic_year",
    type=openapi.TYPE_INTEGER,
    description=(
        "Optional. Omit to list every class the school has, including closed "
        "years. Send it to list only that year's classes — what a marks-entry "
        "or attendance screen wants."
    ),
)
class_details = {
    "id": "pk",
    "grade": "int",
    "faculty": "int",
    "course": "pk",
    "section": "pk",
    "year": "int",
    "semester": "int",
    "education_level": "int",
    "school": "int",
}
class_response = {
    "class_id": [
        "class_name",
        class_details,
        "fees_count: int (optional)",
    ]
}

CLASSES_API = {
    "get": {
        "tags": ["classes"],
        "operation_summary": "get classnames with details",
        "operation_description": "get classnames with details and fees-setup in classes (optional)",
        "manual_parameters": [SCHOOL_ID, STAFF_ID, IS_CLASS_TEACHER, FEES_COUNT, ACADEMIC_YEAR],
        "responses": {"200": _successful_response("get", [class_response])},
    },
    "post": {
        "tags": ["classes"],
        "operation_summary": "class setup",
        "responses": {"200": _successful_response("get", {"message": "Class saved!"})},
    },
}

# ---
class_period_tags = ["classes/periods management"]
CLASS_PERIOD_API = {
    "get": {
        "tags": class_period_tags,
        "operation_summary": "get class-periods",
        "operation_descsription": "get class-period details, subjects  and teachers if detailed is True.",
        "manual_parameters": [
            SCHOOL_ID,
            CLASS_INFO_ID,
            _boolean("subjects"),
            _boolean("teachers"),
            _boolean("detailed"),
            STAFF_ID,
        ],
    },
    "post": {
        "tags": class_period_tags,
        "operation_summary": "setup class/period",
        "responses": {
            "200": _successful_response(
                "post", {"message": "Periods saved successfully!"}
            )
        },
    },
    "put": {
        "tags": class_period_tags,
        "operation_summary": "update class/period",
        "operation_descsription": "update periods, assign teachers, subjects etc.",
        "responses": {
            "200": _successful_response(
                "put", {"message": "Periods updated successfully!"}
            )
        },
    },
}


# ---
FEES_API = {
    "get": {"tags": tags},
    "post": {
        "tags": tags,
        "responses": {
            "200": _successful_response(
                "post",
                {
                    "message": "Fee saved!",
                    "fee": {
                        "id": "pk",
                        "class_info": class_details,
                        "classname": "classname",
                        "title_id": "fee-title: pk",
                        "fee": "fee-amount: decimal",
                    },
                },
            )
        },
    },
    "put": {"tags": tags},
    "delete": {"tags": tags},
}

FEE_TITLES_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
}
# ---
SECTIONS_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
    "delete": {"tags": tags},
}

# ---
SUBJECTS_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
}

# ---
EXTRA_ACTIVITIES_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
}

#
STATIONS_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
    "delete": {"tags": tags},
}

#
STAFF_API = {
    "get": {"tags": tags},
    "post": {"tags": tags},
    "put": {"tags": tags},
}
