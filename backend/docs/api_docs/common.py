from drf_yasg import openapi

COMMON_RESPONSES = {
    "400": openapi.Response(description="Bad request"),
    "404": openapi.Response(description="Not found"),
    "500": openapi.Response(description="Internal server error"),
    "200": openapi.Response(description="Successful"),
}
