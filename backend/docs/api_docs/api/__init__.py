from drf_yasg import openapi

SCHOOL_ID = openapi.Parameter(
    in_=openapi.IN_QUERY, name="school", type=openapi.TYPE_INTEGER, required=True
)
CLASS_INFO_ID = openapi.Parameter(
    in_=openapi.IN_QUERY, name="class_info", type=openapi.TYPE_INTEGER, required=True
)
STAFF_ID = openapi.Parameter(
    in_=openapi.IN_QUERY, name="staff", type=openapi.TYPE_INTEGER
)


def _boolean(name, required=False, description=""):
    return openapi.Parameter(
        in_=openapi.IN_QUERY,
        name=name,
        description=description,
        type=openapi.TYPE_BOOLEAN,
    )


def NAME(description):
    return openapi.Parameter(
        in_=openapi.IN_BODY,
        name="name",
        description=description,
        type=openapi.TYPE_STRING,
    )


START_DATE = openapi.Parameter(
    in_=openapi.IN_BODY,
    name="start_date",
    type=openapi.TYPE_STRING,
    description="date in B.S",
)
END_DATE = openapi.Parameter(
    in_=openapi.IN_BODY,
    name="start_date",
    type=openapi.TYPE_STRING,
    description="date in B.S",
)


def _successful_response(method, example):
    return openapi.Response(
        f"Successful {method} response",
        examples={"application/json": example},
    )
