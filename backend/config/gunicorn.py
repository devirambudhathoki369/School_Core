wsgi_app = "backend.wsgi:app"

loglevel = "debug"

workers = 4
timeout = 180


reload = False

accesslog = "/var/log/gunicorn/smsys-backend-access.log"
errorlog = "/var/log/gunicorn/smsys-backend-error.log"

access_log_format = (
    "%({X-Real-IP}i)s %(l)s %(u)s %(t)s \"%(r)s\" %(s)s %(b)s \"%(f)s\" \"%(a)s\" %(D)s %(p)s"
)

capture_output = True

pidfile = "/var/run/gunicorn/dev.pid"

daemon = False
