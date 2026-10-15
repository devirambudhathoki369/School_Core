from pathlib import Path
import os
from dotenv import load_dotenv
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.logging import ignore_logger

load_dotenv()

DEBUG = os.environ.get("DEBUG", "true").lower() == "true"
print("\t>> DEBUG MODE :", DEBUG)

# SENTRY
if not DEBUG:
    sentry_sdk.init(
        dsn=os.environ.get("SENTRY_DSN"),
        # Add data like request headers and IP for users,
        # see https://docs.sentry.io/platforms/python/data-management/data-collected/ for more info
        sample_rate=0.5,
        send_default_pii=False,
        integrations=[DjangoIntegration()],
        enable_tracing=True,
        enable_backpressure_handling=True,
        traces_sample_rate=0.1,
        #
        profiles_sample_rate=0.0,
        max_request_body_size="never",
        max_breadcrumbs=50,
        auto_enabling_integrations=False,
        send_client_reports=False,
    )
SENTRY_IGNORE_EXCEPTIONS = [
    "django.http.Http404",
    "django.core.exceptions.PermissionDenied",
    "django.core.exceptions.DisallowedHost",
]
ignore_logger("django.security.DisallowedHost")

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = (
    "django-insecure-=(=02wm2vy087o_yd748lrkh4f5$48_c+0jr!lqo0%^72$c38m"
    if DEBUG
    else os.environ.get("SECRET_KEY")
)

ALLOWED_HOSTS = (
    ("127.0.0.1", "localhost")
    if DEBUG
    else tuple(url for url in os.environ.get("ALLOWED_HOSTS", "").split(",") if url)
)
if DEBUG:
    print("\t>>", ALLOWED_HOSTS)

def _is_production_origin(origin):
    """
    Production trusts only https origins, and none on a platform the frontend
    has left.

    CORS here is CREDENTIALED (CORS_ALLOW_CREDENTIALS below), so every origin in
    the list can read any signed-in user's data through that user's browser. The
    production env still carried http://localhost:3000 and http://127.0.0.1:3000
    (anything listening on port 3000 of a user's machine could do exactly that)
    and two *.vercel.app names from before the frontend moved to the VPS — and a
    vercel.app name can be claimed by anyone once its project is gone. A week of
    access logs (2026-09-22..29) showed no traffic from any of them. Filtered here
    rather than only edited out of .env, so a stale env file cannot quietly bring
    them back.
    """
    origin = origin.strip().rstrip("/")
    return origin.startswith("https://") and not origin.endswith(".vercel.app")


CORS_ALLOWED_ORIGINS = (
    (
        "http://127.0.0.1:3000", "http://localhost:3000",
        "http://127.0.0.1:3001", "http://localhost:3001",
        "http://127.0.0.1:3002", "http://localhost:3002",
    )
    if DEBUG
    else tuple(
        url.strip()
        for url in os.environ.get("CORS_ALLOWED_ORIGINS").split(",")
        if url.strip() and _is_production_origin(url)
    )
)
CORS_ALLOW_CREDENTIALS = True
# Browsers hide non-safelist headers from cross-origin JS by default; expose
# Content-Disposition so the file-download frontend can read the filename
# instead of falling back to a generic ".bin" name.
CORS_EXPOSE_HEADERS = ("Content-Disposition",)
if DEBUG:
    print("\t>>", CORS_ALLOWED_ORIGINS)

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    #
    "corsheaders",
    "rest_framework",
    "django_extensions",
    "nepali_datetime_field",
    "drf_yasg",
    #
    "account",  # user-accounts
    "main",  # school-management
    "accounting",  # finance-accounting
    "library",  # school-library
    "hostel",  # school-hostel (per-school module, gated by SchoolAdmin.uses_hostel)
    # billing for people who are NOT students -- shutter tenants, canteen
    # contractors, offices renting school property (gated by
    # SchoolAdmin.uses_extra_billing)
    "extra_billing",
    "rfid",  # rfid/biometrics attendance
    #
    "django_cleanup.apps.CleanupConfig",
]
if DEBUG:
    INSTALLED_APPS.append("debug_toolbar")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "account.auth.middleware.ResetUsersContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
]

if DEBUG:
    MIDDLEWARE.append("debug_toolbar.middleware.DebugToolbarMiddleware")
    MIDDLEWARE.append("kolo.middleware.KoloMiddleware")

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
TEMPLATES[0]["DIRS"] = [BASE_DIR / "monitor" / "templates"]

WSGI_APPLICATION = "backend.wsgi.app"

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

POSTGRE = os.environ.get("POSTGRE", "").lower() == "true"

USE_PROD_DB_DURING_DEBUG = (
    os.environ.get("USE_PROD_DB_DURING_DEBUG", "").lower() == "true"
)

DATABASES = {
    "default": (
        {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
        if DEBUG and not POSTGRE and not USE_PROD_DB_DURING_DEBUG
        else {
            "ENGINE": "django.db.backends.postgresql_psycopg2",
            "NAME": os.environ.get("POSTGRES_NAME"),
            "USER": os.environ.get("POSTGRES_USER"),
            "PASSWORD": os.environ.get("POSTGRES_PASSWORD"),
            "HOST": os.getenv("POSTGRES_HOST", "localhost"),
            "PORT": os.environ.get("POSTGRES_PORT"),
            #
            "CONN_MAX_AGE": 60,  # 1 minute alive
        }
    )
}
CACHES = (
    {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "smsys-dev-cache",
        }
    }
    if DEBUG
    else {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": os.environ.get("REDIS_URL"),
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
)

if DEBUG:
    print(f'\t>> USING DATABASE > {DATABASES["default"]["ENGINE"]}\n')
    print(f'\t>> USING DATABASE > {DATABASES["default"]["NAME"]}\n')


# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = "/static/"
STATIC_ROOT = os.environ.get("STATIC_ROOT") or "static"
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

INTERNAL_IPS = ["127.0.0.1"]

# LOGGING
# Django's default config sends unhandled-view exceptions to `mail_admins` only,
# so on production a 500 left NO traceback anywhere on the box — the only copy
# was in Sentry (and at 50% sampling). Write them to a rotating file too.
# Rotation is capped deliberately: an uncapped log on this VPS is how the disk
# filled and took Postgres down on 2026-07-03.
LOG_DIR = os.environ.get("LOG_DIR") or str(BASE_DIR / "logs")
os.makedirs(LOG_DIR, exist_ok=True)
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "errors_file": {
            "level": "ERROR",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": os.path.join(LOG_DIR, "django-errors.log"),
            "maxBytes": 5 * 1024 * 1024,  # 5 MB per file
            "backupCount": 3,  # ≤ 20 MB total, ever
            "formatter": "verbose",
        },
        # Security events are WARNINGS, not errors, and the handler above only
        # accepts ERROR — so every tenant-boundary refusal written by
        # `account/auth/Authentication.py` went NOWHERE. Grepping
        # django-errors.log for "school-scope refused" returned nothing and read
        # as "no refusals have happened", which is the most misleading possible
        # answer from a security log. Its own file, at its own level.
        "security_file": {
            "level": "WARNING",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": os.path.join(LOG_DIR, "django-security.log"),
            "maxBytes": 2 * 1024 * 1024,  # 2 MB per file
            "backupCount": 3,  # ≤ 8 MB total, ever
            "formatter": "verbose",
        },
    },
    "loggers": {
        # unhandled exceptions in views land here, with the traceback attached
        "django.request": {
            "handlers": ["errors_file"],
            "level": "ERROR",
            "propagate": False,
        },
        "django": {
            "handlers": ["errors_file"],
            "level": "ERROR",
            "propagate": False,
        },
        # MUST come with its own entry. `django.security` otherwise propagates
        # up to `django` above, whose level is ERROR, and a WARNING is dropped
        # on the way. `propagate: False` stops it being written twice once a
        # genuine ERROR does arrive here.
        "django.security": {
            "handlers": ["security_file", "errors_file"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

MEDIA_URL = "/media/"
MEDIA_ROOT = os.environ.get("MEDIA_ROOT") or "media"

# Media refuses file types a browser would run (main/methods/uploads.py).
# Static storage is spelled out as what Django 5.1 already uses: it no longer
# reads STATICFILES_STORAGE above, and STORAGES replaces both.
STORAGES = {
    "default": {"BACKEND": "main.methods.uploads.UploadStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
    },
}
USE_URL = False

# ---------------------------------------------------------------------------
# TRANSPORT AND COOKIE SECURITY
#
# This block shipped commented out. Everything below is production-only, so a
# local `runserver` over plain http is unaffected — the reason it was switched
# off in the first place.
#
# The auth cookie itself was already `Secure; HttpOnly; SameSite=None` (set by
# hand in account/views.py), so the SESSION and CSRF cookies were the two still
# allowed to travel in the clear. Neither carries the auth token, but the CSRF
# cookie is what the frontend's axios client reads for `X-CSRFToken`, and a
# readable-in-transit CSRF token is a CSRF token that no longer proves anything.
#
# SECURE_SSL_REDIRECT is deliberately NOT enabled here: nginx terminates TLS in
# front of gunicorn and already redirects, and turning it on inside Django
# without SECURE_PROXY_SSL_HEADER set correctly is the classic way to produce an
# infinite redirect loop on a proxied deployment.
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    # The frontend must be able to read this one to echo it back as a header,
    # so it cannot be HttpOnly — that is how Django's CSRF protection works.
    CSRF_COOKIE_HTTPONLY = False
    # The frontend is a different origin (nirsabi.com → backend.nirsabi.com),
    # so these have to survive a cross-site request the way the auth cookie
    # already does. `None` REQUIRES `Secure`, which is set above.
    SESSION_COOKIE_SAMESITE = "None"
    CSRF_COOKIE_SAMESITE = "None"
    # Trust the proxy's protocol header, so Django knows the original request
    # was https even though it reaches gunicorn over http.
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_REFERRER_POLICY = "same-origin"
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    # HSTS is intentionally left OFF. It is the one setting here that cannot be
    # undone from the server side — once a browser has seen the header it will
    # refuse plain http for the whole max-age, subdomains included. Turn it on
    # deliberately, starting with a short max-age, once every subdomain
    # (backend, media, any school-specific host) is known to be https-only:
    #   SECURE_HSTS_SECONDS = 3600
    #   SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# How long a minted auth token stays valid, in days.
#
# Tokens had NO expiry at all: `AuthToken.created` was recorded and never read,
# so a key captured once worked forever. The auth COOKIE expires in 3 days, so
# this only really governs the mobile app, which holds its token itself — and a
# survey of the live table found thousands of staff and student tokens over a
# year old and still accepted.
#
# 90 days is deliberately generous: the cost of getting it wrong is a user being
# asked to sign in again, and this is a school product where an account may go
# untouched over a long holiday. Set AUTH_TOKEN_TTL_DAYS=0 to disable expiry
# entirely (the old behaviour) if it ever needs to be switched off in a hurry.
AUTH_TOKEN_TTL_DAYS = int(os.environ.get("AUTH_TOKEN_TTL_DAYS", "90") or 0)

# Whether a staff/admin token may be used against a school it does not belong
# to. `True` is the correct value; the switch exists only so a legitimate flow
# that trips the new check can be unblocked from the environment while it is
# investigated, rather than needing a redeploy.
ENFORCE_SCHOOL_SCOPE = (
    os.environ.get("ENFORCE_SCHOOL_SCOPE", "true").lower() != "false"
)

# Whether a ZKTeco reader with no push_comm_key may still use /iclock/*.
# Off until every reader (and its Device row) has a key: a keyless device is
# identified only by its serial, so anyone who knows it can read the card
# numbers and PINs queued for it and post punches as it. Turn on with
# ICLOCK_REQUIRE_PUSH_KEY=true once the fleet is keyed.
ICLOCK_REQUIRE_PUSH_KEY = (
    os.environ.get("ICLOCK_REQUIRE_PUSH_KEY", "false").lower() == "true"
)

# Whether a write carried by the session COOKIE may come from a browser origin
# this API does not trust (see BaseTokenAuthentication.enforce_trusted_origin —
# the cross-site request forgery guard). `True` is correct; `false` keeps the
# django.security log line but lets the request through, so a legitimate flow
# that trips it can be unblocked from the environment without a redeploy.
ENFORCE_ORIGIN_CHECK = (
    os.environ.get("ENFORCE_ORIGIN_CHECK", "true").lower() != "false"
)

# Which client address a rate limit counts against. DRF reads X-Forwarded-For,
# and with NUM_PROXIES unset it uses the WHOLE header — which the client writes
# its own first entries of — so every request could claim a fresh address and
# no per-client limit held. backend.nirsabi.com is Cloudflare-proxied
# (frontend/deploy/nginx-backend-internal.conf), so the chain is
# client → Cloudflare → nginx → gunicorn: Cloudflare appends the real client,
# nginx appends the Cloudflare edge. Two hops, so the client is the
# second-to-last entry; counting the last one would lump every user behind the
# same Cloudflare edge into one bucket. Set NUM_PROXIES if the chain changes.
# Only throttles read this (the sign-in lockout is keyed on username).
REST_FRAMEWORK = {
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "2") or 0),
}

# Per-client caps on the two endpoints that answer WITHOUT signing in.
PUBLIC_PROFILE_RATE = os.environ.get("PUBLIC_PROFILE_RATE") or "120/hour"
CONTACT_SEARCH_RATE = os.environ.get("CONTACT_SEARCH_RATE") or "60/hour"
