# SchoolCore Docker setup

This setup runs the Next.js frontend, Django/Gunicorn API, PostgreSQL 17, Redis,
nginx, and optional scheduled jobs. Python and Node do not need to be installed
on the host to run the application. Docker Engine/Desktop and Docker Compose
2.24.4 or newer are required. Run the commands below from the repository root.

## 1. First start on your computer

```bash
cp .env.example .env
```

Fill in `SECRET_KEY`, `POSTGRES_ADMIN_PASSWORD`, `POSTGRES_MIGRATE_PASSWORD`, and
`POSTGRES_PASSWORD` in `.env`, using a different random value for each. Generate
one with this command, and run it four times:

```bash
openssl rand -hex 32
```

Alternatively, if Python is installed:

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

Then start the stack:

```bash
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 600
docker compose ps -a
```

The initial build downloads dependencies and compiles the frontend. Subsequent
builds reuse unchanged layers. `setup` exiting with code **0** is expected: it
runs migrations and collects static files once before the API starts.

| Address | Purpose |
| --- | --- |
| `http://localhost:18080` | Website |
| `http://localhost:18080/admin` | School admin portal |
| `http://localhost:18080/superadmin` | Product superadmin portal |
| `http://localhost:18081/healthz/` | API, database, and Redis readiness |
| `http://localhost:18081/admin/` | Django admin, separate from the school portal |

Use `localhost` consistently in the browser; mixing it with `127.0.0.1` changes
the cookie host. Local services bind to `127.0.0.1` by default. PostgreSQL, Redis,
Gunicorn, and Next.js have no published host ports.
Ports 18080/18081 avoid the existing application using port 8080 on this host.

The new database starts empty. To try the system with a complete sample school:

```bash
docker compose exec backend python manage.py seed_demo_school
```

This existing command refuses to seed a database that already contains a school.
It prints generated demo credentials for each role. Do not enable notification
jobs for a demo or a copy of production data.

For a real installation, provision your existing accounts/data, or create an
initial Django superuser:

```bash
docker compose exec backend python manage.py createsuperuser
```

This account can use Django's API-side `/admin/` and the frontend's `/superadmin`
sign-in, which accepts Django superusers with the `superuser` role. It is distinct
from the product's `SuperAdminAccount` model and from individual school admins.

## 2. How the services connect

```text
Browser :18080 -> nginx :8080 -> Next.js :3000
        :18081 -> nginx :8081 -> Django/Gunicorn :8000 -> PostgreSQL :5432
                                             -> Redis :6379
Next.js server-side requests -> backend:8000
Optional scheduler          -> same database and integration services

PostgreSQL + Redis healthy -> setup (migrate + collectstatic)
                          -> backend healthy -> frontend healthy -> nginx
```

Browser requests use `NEXT_PUBLIC_BASE_URL`. Server-side Next.js requests use
`INTERNAL_API_URL=http://backend:8000`, avoiding external DNS and CDN challenges.
Keep `backend` in `ALLOWED_HOSTS` for these requests and the health check.

## 3. What each file does

| File | Task |
| --- | --- |
| `compose.yaml` | Defines all services, dependencies, ports, environment variables, health checks, volumes, and log rotation. The `jobs` profile contains the optional scheduler. |
| `compose.production.yaml` | Adds public HTTP/HTTPS ports and certificate mounting, chooses the production nginx template, and forces local HTTP mode off. Used together with `compose.yaml`. |
| `.env.example` | Safe template for Docker configuration. Contains no usable secrets. |
| `.env` | Your untracked configuration and passwords, read by Compose. Create it yourself; never commit it. |
| `.gitignore` | Keeps Docker secrets, root `.env`, and local backup archives out of Git. |
| `backend/Dockerfile` | Installs Python dependencies in a build stage, adds PostgreSQL 17 client tools, and runs Gunicorn as UID 10001 instead of root. |
| `backend/.dockerignore` | Excludes virtual environments, environment files, credentials, uploads, logs, dumps, and local caches from the backend build. |
| `backend/backend/docker_settings.py` | Uses the application's settings with container paths, console logging, CSRF origins, health routes, and explicit localhost HTTP cookie/CORS support. |
| `backend/backend/docker_urls.py` | Adds `/healthz/`, which checks database and Redis connectivity without returning secrets. |
| `backend/docker/setup.sh` | Runs Django checks, database migrations, and static collection. A failure prevents normal application startup. |
| `backend/docker/gunicorn.conf.py` | Binds Gunicorn on port 8000; controls workers/timeouts and sends access/error logs to Docker. The existing VPS Gunicorn configuration is separate. |
| `backend/docker/healthcheck.py` | Calls the internal Django readiness endpoint for Docker's health check. |
| `backend/docker/scheduler.py` | Executes opted-in notification jobs at Nepal-time schedules. Stores execution claims in a persistent SQLite file and locks out duplicate scheduler instances sharing that volume. |
| `backend/docker/test_scheduler.py` | Verifies schedules, disabled defaults, and duplicate prevention across restarts without sending any messages. |
| `backend/account/views.py` | Login/logout cookies now honor optional Django cookie settings; their existing secure production defaults remain the fallback. |
| `backend/account/test_cookie_settings.py` | Regression tests for local and production logout-cookie attributes. |
| `backend/main/migrations/0110_integrity_keys.py` | Explicit cross-app dependencies ensure all tables exist before date constraints are added on a fresh database. Already-applied constraints are not rerun. |
| `backend/main/test_migration_dependencies.py` | Verifies every table/date column used by that SQL exists in its historical migration state. |
| `frontend/Dockerfile` | Uses `npm ci`, builds Next.js, and copies standalone output plus public/static assets into a non-root Node runtime image. |
| `frontend/.dockerignore` | Prevents host `node_modules`, build output, and local `.env` files from entering the frontend image. |
| `frontend/next.config.js` | Existing `output: 'standalone'` configuration supplies the packaged Node server used by Docker. |
| `docker/postgres/init.sh` | Runs only when PostgreSQL initializes an empty data volume. Creates the application and migration roles using the existing SQL file. |
| `backend/tools/database/db_roles.sql` | Existing least-privilege SQL: the migration account owns tables; the app account receives data access and sequence rights. |
| `docker/nginx/default.conf.template` | Local web/API proxy configuration, public media/static serving, upload limits, and forwarding headers. |
| `docker/nginx/production.conf.template` | HTTPS virtual hosts, HTTP redirects, media/static serving, and internal proxy health endpoint. |
| `docker/secrets/.gitkeep` | Keeps the empty secrets directory in Git; actual credential files are ignored and mounted read-only at runtime. |
| `README.md` | Links to this guide. |

The root `.env` is independent of `backend/.env` and `frontend/.env*`. Compose
passes explicitly listed backend variables; placing a new variable in `.env`
alone does not automatically forward it into a container. The frontend receives
only the declared public build arguments plus its runtime settings.

## 4. Configuration and persistent data

`NEXT_PUBLIC_*` values are compiled into the browser bundle. Rebuild the frontend
after changing a domain, API address, Google Maps key, or other public value:

```bash
docker compose up -d --build frontend proxy
```

Backend environment changes require container recreation; `restart` alone does
not read changed Compose environment values:

```bash
docker compose up -d
```

Local HTTP mode keeps `DEBUG=false`, PostgreSQL, and Redis enabled. It permits
only localhost/127.0.0.1 HTTP origins and uses `SameSite=Lax` cookies without the
Secure flag. Production uses the application's secure cookie defaults. Do not
use local HTTP mode to serve a LAN or public deployment.

| Volume | Contents | Backup requirement |
| --- | --- | --- |
| `postgres_data` | PostgreSQL data and database roles | Essential; use logical dumps rather than copying a running PostgreSQL data directory. |
| `media` | Public school logos, photos, and uploads | Essential. Mounted read-only in nginx. |
| `private_media` | Identity/private documents | Essential. Accessible to Django only, never mounted in nginx. |
| `redis_data` | Redis cache/rate-limit state, persisted with AOF | Useful; not the system of record. Cache writes fail at the configured memory limit rather than silently evicting rate-limit keys. |
| `static` | Collected Django static assets | Regenerated by `setup`. |
| `backend_logs` | Rotating Django error/security files | Keep according to your operational retention policy. Also emitted to Docker logs. |
| `backup_jobs` | Temporary asynchronous backup-download jobs | Temporary exports, normally expire after one hour. Not a scheduled backup. |
| `scheduler_state` | Job execution claims | Preserve across scheduler restarts to prevent repeat sends. |

Docker prefixes volume names with the Compose project name, normally
`schoolcore_`. Keep `COMPOSE_PROJECT_NAME` stable: changing it selects another set
of volumes. Ordinary `docker compose down` preserves named volumes.

**Do not use `docker compose down -v` on data you need.** It deletes these volumes,
including the database and uploaded documents.

Database passwords in `.env` initialize roles only on the first start. Changing
them later does not update PostgreSQL roles; rotate the passwords in PostgreSQL
and update `.env` together. The migration password is given only to `setup`, not
to the normal API or scheduler. The PostgreSQL administrator password is given
only to `db`.

## 5. Everyday commands and updates

```bash
# Status, including the successful one-shot setup container
docker compose ps -a

# Application logs
docker compose logs --tail=100 backend frontend proxy
docker compose logs --tail=100 setup

# Interactive Django shell
docker compose exec backend python manage.py shell

# Stop/start while preserving data
docker compose stop
docker compose start

# Remove containers/network, keeping named volumes
docker compose --profile jobs down
```

For a code update, take a database/media backup, build first, pause writers, run
migrations explicitly, then recreate the application services:

```bash
docker compose build
docker compose --profile jobs stop proxy frontend backend scheduler
docker compose run --rm setup
docker compose up -d --wait --wait-timeout 600
# If you normally run notification jobs:
docker compose --profile jobs up -d scheduler
```

Run the startup command only if `setup` succeeds. For production, append the two
`-f` options from the next section to **every** Compose command. Image rollback
does not undo schema/data migrations; restoring a pre-upgrade backup may be
necessary. Do not change PostgreSQL major versions on an existing volume: use a
planned dump/restore or PostgreSQL upgrade procedure.

## 6. Production HTTPS

Point two domains at the host: for example `school.example.com` for Next.js and
`api.school.example.com` for Django. Obtain a trusted certificate covering **both**
names (a suitable wildcard certificate also works). Place the full chain and key
in `docker/secrets/tls/fullchain.pem` and `docker/secrets/tls/privkey.pem`, or set
`TLS_CERT_DIR` to an absolute certificate directory. Mount the whole directory
containing resolved certificate files; dangling Certbot symlinks will not work.
Certificate issuance/renewal remains the responsibility of your certificate
manager; it is not performed by this stack.

Update the root `.env`:

```dotenv
DOCKER_LOCAL_HTTP=false
WEB_HOST=school.example.com
API_HOST=api.school.example.com
NEXT_PUBLIC_DOMAIN=https://school.example.com
NEXT_PUBLIC_BASE_URL=https://api.school.example.com
ALLOWED_HOSTS=school.example.com,api.school.example.com,backend,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://school.example.com
CSRF_TRUSTED_ORIGINS=https://school.example.com,https://api.school.example.com
TLS_CERT_DIR=./docker/secrets/tls
```

Start with the production override:

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait --wait-timeout 600
docker compose -f compose.yaml -f compose.production.yaml exec backend python manage.py check --deploy
```

The override publishes ports 80 and 443 and removes the local 18080/18081 mappings.
Use the two real HTTPS domains in the browser. Use this same file combination
for logs, backups, updates, jobs, and shutdown. After renewing certificates:

```bash
docker compose -f compose.yaml -f compose.production.yaml exec proxy nginx -t
docker compose -f compose.yaml -f compose.production.yaml exec proxy nginx -s reload
```

This configuration assumes clients connect directly to nginx. If you add a CDN
or load balancer, configure nginx's real-IP trust for that provider's exact
trusted addresses before relying on per-client API throttles. Incoming forwarded
client headers are deliberately replaced by default. HSTS is not enabled
automatically; Django's deployment check may report the application's existing
HSTS/SSL-redirect warnings even though nginx handles HTTPS and HTTP redirects.

## 7. External integrations and scheduled jobs

Integration services remain external: Firebase push, SMS provider, TrackOn,
Google Maps, Sentry, and physical RFID/UHF readers are not emulated by Docker.

- Firebase: put the service-account JSON in `docker/secrets/firebase.json` and
  set `SERVICE_ACCOUNT_PATH=/run/secrets/schoolcore/firebase.json` plus `FCM_URL`.
- Bus tracking: put the existing tracking JSON in
  `docker/secrets/bus_tracking.json`, or configure the `TRACKON_*` variables.
- SMS: set the provider endpoint variables. School-specific encrypted API keys
  and recipient preferences remain in the database.
- Google Maps: set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and rebuild the frontend.
- RFID: point readers/bridges at the API domain; `/iclock/` and `/rfid/` routes
  are preserved. A UHF bridge that needs local reader hardware still runs on the
  machine/network connected to that reader. Legacy devices without HTTPS need
  an explicitly designed restricted gateway rather than disabling public HTTPS.

Make credential files readable by container UID 10001, with restricted host
permissions. Never add a service-account JSON or private key to a Docker build.
The frontend's optional HTTP Redis integration is different from Django's native
Redis connection; `redis://redis:6379/0` is passed to Django only.

The optional scheduler uses **Asia/Kathmandu** time:

| Flag | Schedule | Existing task |
| --- | --- | --- |
| `ENABLE_BIRTHDAY_PUSH` | 08:15 daily | `send_birthday_wishes` |
| `ENABLE_BIRTHDAY_SMS` | 08:30 daily | `send_birthday_sms` |
| `ENABLE_ABSENT_PUSH` | 11:30 daily | `send_absent_notifications` |
| `ENABLE_COLLECTION_SMS` | 18:00 daily | `backend/scripts/send_daily_collection.py` |
| `ENABLE_SMS_DELIVERY_SYNC` | Every quarter hour | `sync_sms_delivery --apply` |

Set only the flags you intend to enable to `true`, then:

```bash
docker compose --profile jobs up -d scheduler
docker compose logs -f scheduler
```

Stop any old host cron jobs for these same tasks before enabling the container.
Only run one scheduler. Execution claims are recorded before a job starts; a
failed or interrupted send is not retried automatically, and missed time slots
are not replayed. Inspect logs and recipients before manually repeating a job.
Long jobs run sequentially and may cause later slots to be missed. Existing
notification commands may log individual delivery failures even with exit 0.

The collection SMS job requires configured database Shareholder recipients, or
the legacy `shareholders.json` file. Prefer importing/managing recipients in the
database; the legacy file is intentionally excluded from the image.

Safe preview commands for the push jobs:

```bash
docker compose exec backend python manage.py send_birthday_wishes --dry-run
docker compose exec backend python manage.py send_absent_notifications --dry-run
```

## 8. Backup and restore

A database dump does not include uploaded files. Preserve the database, public
media, private media, `.env`/encryption keys, and integration secrets. Keep backup
copies outside the Docker host. For a consistent database-and-files snapshot,
pause writers while taking both backups; a PostgreSQL dump alone is transactionally
consistent without downtime.

Example consistent database-and-media backup (choose new filenames each time):

```bash
mkdir -p backups
docker compose --profile jobs stop proxy frontend backend scheduler
docker compose exec -T db sh -c 'pg_dump -U postgres -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > backups/schoolcore.dump
```

Confirm the dump command exited successfully. Stream both media volumes into a
host archive while the application and scheduler remain stopped:

```bash
docker compose run --rm -T --no-deps backend tar -C /data -czf - media private_media > backups/media.tar.gz
docker compose up -d --wait
# Restart scheduler explicitly if enabled in your deployment.
```

Restore into a **fresh, separately named project/database**, never over the only
copy of production data. Keep the original `SECRET_KEY` and/or
`FIELD_ENCRYPTION_KEYS`; otherwise encrypted school credentials cannot
be decrypted. Set the new project's `.env` and project name first, then start
only PostgreSQL and Redis, so setup does not migrate before importing:

```bash
docker compose up -d --wait db redis
docker compose exec -T db sh -c 'pg_restore -U postgres --role=schoolcore_migrate -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < backups/schoolcore.dump
docker compose run --rm -T --no-deps backend tar -C /data -xzf - < backups/media.tar.gz
docker compose run --rm setup
docker compose up -d --wait --wait-timeout 600
```

Use a trusted archive. The application user should own restored media files
(UID/GID 10001). Test login, file access, encryption, and a backup download before
switching real traffic. For an older plain `.sql.gz` dump, decompress it into
`psql` with `ON_ERROR_STOP` and use the migration role as object owner; do not feed
plain SQL to `pg_restore`. Keep existing production databases untouched during
the migration to Docker.

## 9. Troubleshooting and checks

| Symptom | Check |
| --- | --- |
| Compose asks for a variable | Create root `.env` and fill all four required secrets. |
| `setup` failed | `docker compose logs setup`; fix the error and run `docker compose run --rm setup`. |
| Database password failure after editing `.env` | Existing roles retain their original passwords. Rotate the database role too. Do not delete volumes to fix this. |
| Backend unhealthy | Check `logs backend`, PostgreSQL/Redis health, and that `backend` remains in `ALLOWED_HOSTS`. |
| Login works but subsequent calls fail locally | Use `localhost` for both configured URLs; enable `DOCKER_LOCAL_HTTP=true` only locally; check the configured CORS origin and rebuild after public URL changes. |
| Browser calls the old API | `NEXT_PUBLIC_BASE_URL` is a build-time value: rebuild/recreate `frontend`. |
| Images/documents disappeared | Check the project name and media volume; host `backend/media` is not automatically imported. |
| Permission denied on uploads | Restored volume contents must be writable by UID 10001. |
| HTTPS proxy will not start | Check the certificate directory, both filenames, permissions, and whether both domains are covered. |
| Port already allocated | Change `WEB_PORT`/`API_PORT` and their public URLs together, then rebuild the frontend. |
| Jobs do not send | Check the `jobs` profile, individual flags, integration credentials, recipients, and scheduler logs. |

Run the scheduler's isolated tests without a database:

```bash
docker compose run --rm --no-deps backend python -m unittest discover -s docker -p 'test_*.py'
```

Run the authentication and migration-order regression tests with isolated SQLite
test data (the profiler also needs a writable temporary directory):

```bash
docker compose run --rm --no-deps -e DEBUG=true -e KOLO_PATH=/tmp backend python manage.py test account.test_cookie_settings account.test_auth_hardening account.test_session_tokens main.test_migration_dependencies --settings=backend.test_settings
```

Validated during implementation: both image builds; migrations from an empty
PostgreSQL database; demo-school seeding; browser login, session restoration and
logout; HTTP and HTTPS proxy routing; public/static files and blocked private
files; full database export; scheduler startup with sending disabled; and all
25 regression tests. HTTPS routing was tested with a temporary local certificate;
a public deployment still needs your domains and trusted certificate.

The container builds use the repository's existing Python requirements and npm
lockfile. They do not upgrade application dependencies. Base images track their
specified language/database majors; use a deliberate rebuild with `--pull` to
pick up base-image patches, and test before deploying.

Implementation references: [Docker startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/),
[Next.js container guide](https://docs.docker.com/guides/nextjs/), and
[PostgreSQL official image](https://hub.docker.com/_/postgres).
