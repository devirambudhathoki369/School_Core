#!/bin/bash
# Cron wrapper that reads the receipts of the app's pushes
# (manage.py mobile_push_receipts). Scheduled every 15 minutes via root crontab:
#   */15 * * * * /path/to/backend/check_push_receipts.sh >> /var/log/schoolcore-push-receipts.log 2>&1
#
# TRACKED in the repo on purpose: server-only cron scripts get wiped by a
# deploy's `git reset --hard` (see send_daily_collection.sh / config/gunicorn.py).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

VENV=/root/home/manish404/.virtualenvs/smsysvenv/bin/python
"$VENV" manage.py mobile_push_receipts "$@"
