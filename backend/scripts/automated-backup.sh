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
#   BACKUP_ENCRYPTION_KEY  — Encrypts with openssl AES-256-CBC
#                           (required when NODE_ENV=production or
#                           BACKUP_REQUIRE_ENCRYPTION=true)
#   S3_BACKUP_BUCKET       — S3 bucket name (required when NODE_ENV=production
#                           or BACKUP_REQUIRE_DESTINATION=true)
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
BACKUP_REQUIRE_DESTINATION="${BACKUP_REQUIRE_DESTINATION:-}"

if { [ "$BACKUP_REQUIRE_ENCRYPTION" = "true" ] || [ "${NODE_ENV:-}" = "production" ]; } && [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "FATAL: BACKUP_ENCRYPTION_KEY is required when BACKUP_REQUIRE_ENCRYPTION=true or NODE_ENV=production" >&2
  exit 1
fi

# Destination validation — an unencrypted dump with nowhere to go is not a
# backup. In production (or when BACKUP_REQUIRE_DESTINATION=true) the S3
# destination and its credentials must be configured before any work starts.
if { [ "$BACKUP_REQUIRE_DESTINATION" = "true" ] || [ "${NODE_ENV:-}" = "production" ]; } && [ -z "$S3_BACKUP_BUCKET" ]; then
  echo "FATAL: S3_BACKUP_BUCKET is required when BACKUP_REQUIRE_DESTINATION=true or NODE_ENV=production — a backup without a verified destination is not a backup" >&2
  exit 1
fi
if [ -n "$S3_BACKUP_BUCKET" ]; then
  if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
    echo "FATAL: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when S3_BACKUP_BUCKET is set" >&2
    exit 1
  fi
fi

export PGPASSWORD="$POSTGRES_PASSWORD"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
BASE_NAME="thryftverse_${TIMESTAMP}"
DUMP_FILE="${BACKUP_DIR}/${BASE_NAME}.dump"
ENCRYPTED_FILE="${BACKUP_DIR}/${BASE_NAME}.dump.enc"
CHECKSUM_FILE=""

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
    # Preserve the local artifact on failure — deleting it would leave zero
    # recoverable copies when the upload never completed.
    echo "[$(date -u)] Failure — preserving local artifacts in ${BACKUP_DIR} for operator recovery." >&2
  fi
  rm -f "$CHECKSUM_FILE"
  # The plaintext dump may only be dropped once a copy is VERIFIED at the
  # destination — a local encrypted artifact proves nothing about the remote
  # copy, so mere existence of $ENCRYPTED_FILE is not sufficient. When no
  # remote destination is configured (non-production only), the encrypted
  # artifact IS the backup and the plaintext must not linger on disk.
  if [ -n "$BACKUP_ENCRYPTION_KEY" ] && [ -f "$DUMP_FILE" ]; then
    if [ "$UPLOAD_VERIFIED" = "true" ] || [ -z "$S3_BACKUP_BUCKET" ]; then
      rm -f "$DUMP_FILE"
    fi
  fi
  exit $exit_code
}

# Upload verification state — read by the cleanup trap. Only a VERIFIED
# remote copy (head-object byte-length match, not local file existence)
# licenses deletion of the local plaintext dump.
UPLOAD_VERIFIED="false"

trap cleanup EXIT

# Create the scratch dir only after the trap is armed — a mkdir failure here
# must still page the operator, not exit silently.
mkdir -p "$BACKUP_DIR"

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

  # Plaintext is retained until the remote copy is VERIFIED (or proven
  # unnecessary) — see cleanup(). The encrypted artifact is what uploads.
  UPLOAD_FILE="$ENCRYPTED_FILE"
  echo "[$(date -u)] Encrypted backup: ${ENCRYPTED_FILE}"
fi

if [ -n "$S3_BACKUP_BUCKET" ]; then
  S3_KEY="${S3_BACKUP_PREFIX}/$(basename "$UPLOAD_FILE")"
  echo "[$(date -u)] Uploading to s3://${S3_BACKUP_BUCKET}/${S3_KEY}..."

  CHECKSUM_FILE="${UPLOAD_FILE}.sha256"
  sha256sum "$UPLOAD_FILE" | awk '{print $1}' > "$CHECKSUM_FILE"
  S3_CHECKSUM_KEY="${S3_BACKUP_PREFIX}/$(basename "$CHECKSUM_FILE")"

  # The snapshot-started-at metadata records the pg_dump START time — the
  # content boundary erasure verification compares against erased_at.
  aws s3 cp "$UPLOAD_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_KEY}" --no-progress --sse aws:kms \
    --metadata "snapshot-started-at=${TIMESTAMP}"

  # Verify the object actually landed: head-object must succeed AND report
  # the same byte length as the local artifact. A completed `aws s3 cp`
  # already implies success under set -e; this catches silent short-writes
  # and incompatible-but-200 responses from S3-compatible endpoints.
  LOCAL_SIZE=$(stat -c%s "$UPLOAD_FILE" 2>/dev/null || stat -f%z "$UPLOAD_FILE" 2>/dev/null || wc -c < "$UPLOAD_FILE" | tr -d ' ')
  REMOTE_SIZE=$(aws s3api head-object --bucket "$S3_BACKUP_BUCKET" --key "$S3_KEY" --query ContentLength --output text)
  if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
    echo "FATAL: upload verification failed for s3://${S3_BACKUP_BUCKET}/${S3_KEY} — remote size ${REMOTE_SIZE} != local size ${LOCAL_SIZE}" >&2
    exit 1
  fi

  aws s3 cp "$CHECKSUM_FILE" "s3://${S3_BACKUP_BUCKET}/${S3_CHECKSUM_KEY}" --no-progress --sse aws:kms
  aws s3api head-object --bucket "$S3_BACKUP_BUCKET" --key "$S3_CHECKSUM_KEY" --query ContentLength --output text > /dev/null
  UPLOAD_VERIFIED="true"
  echo "[$(date -u)] Upload verified: s3://${S3_BACKUP_BUCKET}/${S3_KEY} (${LOCAL_SIZE} bytes)"

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
  # No destination configured — this is only permitted outside production
  # (validated above). The artifact is kept locally; local retention pruning
  # below still bounds disk usage.
  echo "[$(date -u)] WARN: S3_BACKUP_BUCKET not set — no remote upload; keeping local artifact ${UPLOAD_FILE}." >&2
fi

echo "[$(date -u)] Pruning local backups older than ${BACKUP_RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "thryftverse_*.dump*" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete || true

# Only drop the local artifact once a copy is VERIFIED at the destination.
# A failed or skipped upload must never remove the only remaining copy.
if [ "$UPLOAD_VERIFIED" = "true" ]; then
  rm -f "$UPLOAD_FILE"
else
  echo "[$(date -u)] Local artifact retained: ${UPLOAD_FILE}"
fi
echo "[$(date -u)] Backup complete."
