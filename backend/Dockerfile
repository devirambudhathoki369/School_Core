# syntax=docker/dockerfile:1
FROM python:3.12-slim-trixie AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY requirements.txt .
RUN python -m venv /opt/venv && /opt/venv/bin/pip install -r requirements.txt

FROM python:3.12-slim-trixie AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" DJANGO_SETTINGS_MODULE=backend.docker_settings
# The in-app full-database download uses pg_dump; match the PostgreSQL 17 server.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 schoolcore \
    && useradd --uid 10001 --gid schoolcore --create-home schoolcore \
    && mkdir -p /data/media /data/private_media /data/static /data/logs /data/backup_jobs /data/scheduler \
    && chown -R schoolcore:schoolcore /data
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=schoolcore:schoolcore . .
USER schoolcore
EXPOSE 8000
CMD ["gunicorn", "--config", "docker/gunicorn.conf.py", "backend.wsgi:app"]
