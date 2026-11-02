from __future__ import annotations

import logging
from typing import Awaitable, Callable

from django.http import HttpRequest, HttpResponse

logger = logging.getLogger("kolo")

DjangoView = Callable[[HttpRequest], HttpResponse]
DjangoAsyncView = Callable[[HttpRequest], Awaitable[HttpResponse]]


def kolo_web_home(request: HttpRequest) -> HttpResponse:
    html = f"""
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Kolo</title>

      <link rel="icon" href="favicon.ico">

      <!-- For light mode -->
      <link rel="icon" sizes="16x16" href="static/favicons/favicon-dark-16x16.png" media="(prefers-color-scheme: light)">
      <link rel="icon" sizes="32x32" href="static/favicons/favicon-dark-32x32.png" media="(prefers-color-scheme: light)">

      <!-- For dark mode -->
      <link rel="icon" sizes="16x16" href="static/favicons/favicon-light-16x16.png" media="(prefers-color-scheme: dark)">
      <link rel="icon" sizes="32x32" href="static/favicons/favicon-light-32x32.png" media="(prefers-color-scheme: dark)">

      <link rel="stylesheet" href="static/main.css" />
  </head>
  <body id="app">
  <script type="text/javascript" src="static/main.js"></script>
  </body>
"""

    return HttpResponse(html)
