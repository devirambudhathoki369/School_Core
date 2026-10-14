#!/bin/bash
# Daily DB backup — rewritten 2026-07-04 after the 2026-07-03 outage:
# the old version wrote a ~2GB uncompressed .json to disk before gzipping,
# which filled the disk and killed PostgreSQL mid-write. Now everything
# streams, and the script refuses to run when the disk is nearly full.
#
# 2026-08-19: the .json.gz history was never pruned, so it had grown to 11GB
# (158 files back to March) on a 38GB disk — the same disk that has to hold
# PostgreSQL. Retention added below. The whole history was mirrored off-box
# first; the point of retention is that it can never build back up.
#
# NOTE: this file is tracked in the repo. It lives on the box only because
# cron calls it, but a server-only copy is one `git clean` from gone (see the
# config/gunicorn.py incident), and nothing would have told us it vanished.

cd /root/home/manish404/projects/smsys.backend || exit 1
source ../../.virtualenvs/smsysvenv/bin/activate

BACKUP_DIR="../../.backups"
TODAY=$(date +%F)

# guard: never start a backup that could fill the disk again
FREE_MB=$(df -Pm / | awk 'NR==2 {print $4}')
if [ "$FREE_MB" -lt 700 ]; then
  ./send-discord-alert.sh "🚨 **Backup SKIPPED** — only ${FREE_MB}MB free on /. Free up space, PostgreSQL dies if the disk fills (2026-07-03)."
  exit 1
fi

# 1) Django JSON dump (same flags/format as before, loaddata-compatible),
#    streamed straight into gzip — uncompressed JSON never touches the disk.
JSON_OUT="$BACKUP_DIR/$TODAY.json.gz"
set -o pipefail
python manage.py dumpdata \
  --exclude auth.permission \
  --exclude contenttypes \
  --natural-foreign \
  --indent 2 \
  | gzip -9 > "$JSON_OUT"
JSON_STATUS=$?
set +o pipefail
if [ "$JSON_STATUS" -ne 0 ]; then
  mv -f "$JSON_OUT" "$JSON_OUT.failed" 2>/dev/null
  ./send-discord-alert.sh "🚨 **Backup FAILED** — dumpdata exited $JSON_STATUS for $TODAY"
fi

# 2) Physical PostgreSQL backup (exact full restore incl. schema/indexes),
#    compressed as it writes. Keeps the last 7 pgdump-* files; prunes ONLY
#    files this job itself created — never touches the .json.gz history.
#    Restore: pg_restore -U postgres -d sm_sys_db --clean --if-exists <file>
PG_OUT="$BACKUP_DIR/pgdump-$TODAY.dump"
if (cd /tmp && sudo -u postgres pg_dump -Fc -Z 6 sm_sys_db) > "$PG_OUT"; then
  ls -1t "$BACKUP_DIR"/pgdump-*.dump 2>/dev/null | tail -n +8 | xargs -r rm --
else
  mv -f "$PG_OUT" "$PG_OUT.failed" 2>/dev/null
  ./send-discord-alert.sh "🚨 **Backup FAILED** — pg_dump failed for $TODAY"
fi

# 3) Retention for the JSON history: keep the last 14 days plus the 1st of
#    every month as long-term restore points. Without this the directory grows
#    ~84MB every single day and never gives anything back. Only files matching
#    the exact YYYY-MM-DD.json.gz shape this script writes are considered, so a
#    hand-placed file or a *.failed is never touched.
find "$BACKUP_DIR" -maxdepth 1 -type f \
     -regextype posix-extended -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}\.json\.gz' \
     -printf '%f\n' 2>/dev/null \
  | sort -r \
  | awk 'NR > 14 && $0 !~ /-01\.json\.gz$/' \
  | while read -r stale; do rm -f -- "$BACKUP_DIR/$stale"; done

echo "✅ Backup complete: $JSON_OUT"
ls -lh "$BACKUP_DIR" | tail -5

#
./backup-alert.sh
