#!/bin/sh
set -eu
# The upstream entrypoint sources non-executable .sh files on an EMPTY volume.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
    --set app_password="$APP_PASSWORD" --set migrate_password="$MIGRATE_PASSWORD" \
    --file /opt/schoolcore/db_roles.sql
