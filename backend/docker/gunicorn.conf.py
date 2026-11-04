import os

bind = "0.0.0.0:8000"
workers = int(os.environ.get("GUNICORN_WORKERS", "3"))
timeout = int(os.environ.get("GUNICORN_TIMEOUT", "180"))
graceful_timeout = 30
accesslog = "-"
errorlog = "-"
capture_output = True
loglevel = "info"
# Django, behind the private Docker network, handles the trusted protocol header.
forwarded_allow_ips = "*"
