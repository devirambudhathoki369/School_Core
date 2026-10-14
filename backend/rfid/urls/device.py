from django.urls import path
from ..views.device_calls import (
    getrequest,
    devicecmd,
    ping,
    cdata,
    registry,
    rtdata,
    push,
    querydata,
)

# device apis
urlpatterns = [
    path("getrequest", getrequest, name="polling"),
    path("devicecmd", devicecmd, name="device commands"),
    path("ping", ping, name="health ping"),
    path("cdata", cdata, name="attendance logs"),
    path("registry", registry, name="device registry"),
    # newer push firmware (InBio* panels) only
    path("rtdata", rtdata, name="clock sync"),
    path("push", push, name="config pull"),
    # where an access panel answers a DATA QUERY (and reports its counts)
    path("querydata", querydata, name="table query result"),
]
