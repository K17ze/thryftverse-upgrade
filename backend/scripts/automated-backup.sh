#!/usr/bin/env bash
set -euo pipefail

##
# ThryftVerse — automated PostgreSQL backup script.
#
# Creates a compressed, encrypted pg_dump and uploads it to S3 (or GCS).
# Retains backups for 30 days and sends a webhook notification on failure.
#
# Designed to be run via cron or the Docker backup sidecar:
#   0 2 * * * /path/to/automated-backup.sh
#
# Environment variables:
#   POSTGRES_HOST          — PostgreSQL host (required)
#   POSTGRES_PORT          — PostgreSQL port (default: 5432)
#   POSTGRES_USER          — PostgreSQL user (required)
#   POSTGRES_PASSWORD      — PostgreSQL password (required)
#   POSTGRES_DB            — Database name (required)
#   BACKUP_ENCRYPTION_KEY  — If set, encrypts with openssl AES-256-CBC
#   S3_BACKUP_BUCKET       — S3 bucket name (required for S3 upload)
#   S3_BACKUP_PREFIX       — S3 key prefix (default: db-backups)
#   AWS_REGION             — AWS region (for S3 CLI)
#   AWS_ACCESS_KEY_ID      — AWS access key
#   AWS_SECRET_ACCESS_KEY  — AWS secret key
#   BACKUP_RETENTION_DAYS  — Delete backups older than N days (default: 30)
#   ALERTING_WEBHOOK_URL   — Slack/Discord webhook for failure notifications
#
# @module automated-backup
##

POSTGRES_HOST="${POSTGRES_HOST:?FATAL: POSTGRES_HOST is required}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:?FATAL: POSTGRES_USER is required}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?FATAL: POSTGRES_PASSWORD is required}"
POSTGRES_DB="${POSTGRES_DB:?FATAL: POSTGRES_DB is required}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
S3_BACKUP_PREFIX="${S3_BACKUP_PREFIX:-db-backups}"
ALERTING_WEBHOOK_URL="${ALERTING_WEBHOOK_URL:-}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
BACKUP_REQUIRE_ENCRYPTION="${BACKUP_REQUIRE_ENCRYPTION:-}"

if { [ "$BACKUP_REQUIRE_ENCRYPTION" = "true" ] || [ "${NODE_ENV:-}" = "production" ]; } && [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "FATAL: BACKUP_ENCRYPTION_KEY is required when BACKUP_REQUIRE_ENCRYPTION=true or NODE_ENV=production" >&2
  exit 1
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BASE_NAME="thryftverse_${TIMESTAMP}"
DUMP_FILE="${BACKUP_DIR}/${BASE_NAME}.dump"
ENCRYPTED_FILE="${BACKUP_DIR}/${BASE_NAME}.dump.enc"
CHECKSUM_FILE=""

mkdir -p "$BACKUP_DIR"

send_alert() {
  local message="$1"
  if [ -z "$ALERTING_WEBHOOK_URL" ]; then
    return 0
  fi
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$message\"}" \
    "$ALERTING_WEBHOOK_URL" || true
}

cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    send_alert "❌ **Automated DB backup FAILED** for database ${POSTGRES_DB} on ${POSTGRES_HOST}. Exit code: ${exit_code}"
  fi
  rm -f "$DUMP_FILE" "$CHECKSUM_FILE"
  exit $exit_code
}

trap cleanup EXIT

echo "[$(date -u)] Starting pg_dump of ${POSTGRES_DB} from ${POSTGRES_HOST}:${POSTGRES_PORT}..."

pg_dump \
  --host "$POSTGRES_HOST" \
  --port "$POSTGRES_PORT" \
  --username "$POSTGRES_USER" \
  --format custom \
  --compress 9 \
  --no-owner \
  --no-privileges \
  --verbose \
  --file "$DUMP_FILE" \
  "$POSTGRES_DB"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "[$(date -u)] pg_dump completed: ${DUMP_FILE} (${DUMP_SIZE})"

UPLOAD_FILE="$DUMP_FILE"

if [ -n "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "[$(date -u)] Encrypting backup with AES-256-CBC..."
  BACKUP_ENCRYPTION_KEY="$BACKUP_ENCRYPTION_KEY" openssl enc \
    -aes-256-cbc \
    -salt -pbkdf2 \
    -in "$DUMP_FILE" \
    -out "$ENCRYPTED_FILE" \
    -pass env:BACKUP_ENCRYPTION_KEY

  rm -f "$DUMP_FILE"
  UPLOAD_FILE="$ENCRYPTED_FILE"
  echo "[$(date -u)] Encrypted backup: ${ENCRYPTED_FILE}"
fi

if [ -n "$S3_BACKUP_BUCKET" ]; then
  S3_KEY="${S3_BACKUP_PREFIX}/$(basename "$UPLOAD_FILE")"
  echo "[$(date -u)] Uploading to s3://${S3_BACKUP_BUCKET}/${S3_KEY}..."

  CHECKSUM_FILE="${UPLOAD_FILE}.sha256"
  sha256sum "$UPLOAD_FILE" | awk '{print $1}' > "$CHECKSUM_FILE"
  S3_CHECKSUM_KEY="${S3_BACKUP_PREFIX}/$(basename "$CHECKSUM_FILE")"

  aws s3 cp "$UPLOAD_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_KEY}" --no-progress --sse aws:kms
  aws s3 cp "$CHECKSUM_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_CHECKSUM_KEY}" --no-progress --sse aws:kms

  rm -f "$CHECKSUM_FILE"
  CHECKSUM_FILE=""

  echo "[$(date -u)] Pruning S3 backups older than ${BACKUP_RETENTION_DAYS} days..."
  CUTOFF_DATE=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null || date -u -v-${BACKUP_RETENTION_DAYS}d +"%Y-%m-%d" 2>/dev/null || echo "")
  if [ -n "$CUTOFF_DATE" ]; then
    aws s3 ls "s3://${S3_BACKUP_BUCKET}/${S3_BACKUP_PREFIX}/" --page-size 1000 | while read -r line; do
      OBJ_DATE=$(echo "$line" | awk '{print $1}')
      OBJ_KEY=$(echo "$line" | awk '{print $4}')
      if [ "$OBJ_DATE" \< "$CUTOFF_DATE" ] && [ -n "$OBJ_KEY" ]; then
        echo "[$(date -u)] Deleting expired S3 backup: ${OBJ_KEY}"
        aws s3 rm "s3://${S3_BACKUP_BUCKET}/${S3_BACKUP_PREFIX}/${OBJ_KEY}" --no-progress || true
      fi
    done
  fi
else
  echo "[$(date -u)] S3_BACKUP_BUCKET not set — skipping S3 upload."
fi

echo "[$(date -u)] Pruning local backups older than ${BACKUP_RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "thryftverse_*.dump*" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete || true

rm -f "$UPLOAD_FILE"
echo "[$(date -u)] Backup complete."
