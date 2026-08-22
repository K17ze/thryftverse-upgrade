#!/usr/bin/env bash
set -euo pipefail

##
# ThryftVerse — secrets rotation policy checker.
#
# Lists all secrets used by the app (from config.ts and app.config.js),
# checks the age of each secret if tracked in a secrets manager, and alerts
# if any secret is older than 90 days. Documents the rotation procedure for
# each secret.
#
# Designed to be run via cron on the first of every month:
#   0 0 1 * * /path/to/secrets-rotation.sh
#
# Environment variables:
#   SECRETS_MANAGER_URL   — URL of the secrets manager API (optional)
#   SECRETS_MANAGER_TOKEN — Auth token for the secrets manager (optional)
#   ALERTING_WEBHOOK_URL  — Slack/Discord webhook for alerts (optional)
#   MAX_SECRET_AGE_DAYS   — Maximum secret age before alert (default: 90)
#   DRY_RUN               — If set to "1", report only; do not alert
#
# @module secrets-rotation
##

MAX_SECRET_AGE_DAYS="${MAX_SECRET_AGE_DAYS:-90}"
ALERTING_WEBHOOK_URL="${ALERTING_WEBHOOK_URL:-}"
SECRETS_MANAGER_URL="${SECRETS_MANAGER_URL:-}"
SECRETS_MANAGER_TOKEN="${SECRETS_MANAGER_TOKEN:-}"
DRY_RUN="${DRY_RUN:-0}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

##
# Secret registry — each entry defines:
#   name:     The environment variable / EAS secret name
#   source:   Where the secret is consumed (config.ts or app.config.js)
#   rotation: Human-readable rotation procedure
#
# When a secrets manager is available (SECRETS_MANAGER_URL set), the script
# queries it for the last-rotated timestamp. Otherwise it reports the secret
# as "untracked" and recommends manual verification.
##
declare -a SECRET_NAMES=(
  "SENTRY_AUTH_TOKEN"
  "SENTRY_ORG"
  "SENTRY_PROJECT"
  "EXPO_TOKEN"
  "EXPO_PROJECT_ID"
  "EXPO_PUBLIC_OTA_CODE_SIGNING_KEY"
  "EXPO_PUBLIC_POSTHOG_KEY"
  "EXPO_PUBLIC_SENTRY_DSN"
  "EXPO_PUBLIC_API_BASE_URL"
  "EXPO_PUBLIC_INTERCOM_APP_ID"
  "EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY"
  "EXPO_PUBLIC_INTERCOM_IOS_API_KEY"
  "EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_IDENTIFIER"
  "DATABASE_URL"
  "DATABASE_REPLICA_URL"
  "REDIS_URL"
  "KEY_SERVICE_CLIENT_TOKEN"
  "KEY_SERVICE_ADMIN_TOKEN"
  "S3_ACCESS_KEY"
  "S3_SECRET_KEY"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "MOLLIE_API_KEY"
  "RAZORPAY_KEY_ID"
  "RAZORPAY_KEY_SECRET"
  "LIVEKIT_API_KEY"
  "LIVEKIT_API_SECRET"
  "JWT_SECRET"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
)

declare -A SECRET_SOURCES=(
  ["SENTRY_AUTH_TOKEN"]="app.config.js (EAS secret)"
  ["SENTRY_ORG"]="app.config.js (EAS secret)"
  ["SENTRY_PROJECT"]="app.config.js (EAS secret)"
  ["EXPO_TOKEN"]="EAS CLI authentication"
  ["EXPO_PROJECT_ID"]="app.json extra.eas.projectId"
  ["EXPO_PUBLIC_OTA_CODE_SIGNING_KEY"]="app.config.js (EAS secret, OTA code signing)"
  ["EXPO_PUBLIC_POSTHOG_KEY"]="PostHogProvider.tsx (analytics)"
  ["EXPO_PUBLIC_SENTRY_DSN"]="app.config.js (Sentry DSN)"
  ["EXPO_PUBLIC_API_BASE_URL"]="app.config.js (API base URL)"
  ["EXPO_PUBLIC_INTERCOM_APP_ID"]="app.config.js (Intercom)"
  ["EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY"]="app.config.js (Intercom)"
  ["EXPO_PUBLIC_INTERCOM_IOS_API_KEY"]="app.config.js (Intercom)"
  ["EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_IDENTIFIER"]="app.config.js (Stripe Apple Pay)"
  ["DATABASE_URL"]="backend/api/src/config.ts (PostgreSQL)"
  ["DATABASE_REPLICA_URL"]="backend/api/src/config.ts (PostgreSQL replica)"
  ["REDIS_URL"]="backend/api/src/config.ts (Redis)"
  ["KEY_SERVICE_CLIENT_TOKEN"]="backend/api/src/config.ts (key service)"
  ["KEY_SERVICE_ADMIN_TOKEN"]="backend/api/src/config.ts (key service admin)"
  ["S3_ACCESS_KEY"]="backend/api/src/config.ts (S3 / MinIO)"
  ["S3_SECRET_KEY"]="backend/api/src/config.ts (S3 / MinIO)"
  ["STRIPE_SECRET_KEY"]="backend/api (Stripe payments)"
  ["STRIPE_WEBHOOK_SECRET"]="backend/api (Stripe webhooks)"
  ["MOLLIE_API_KEY"]="backend/api (Mollie payments)"
  ["RAZORPAY_KEY_ID"]="backend/api (Razorpay payments)"
  ["RAZORPAY_KEY_SECRET"]="backend/api (Razorpay payments)"
  ["LIVEKIT_API_KEY"]="backend/api (LiveKit video)"
  ["LIVEKIT_API_SECRET"]="backend/api (LiveKit video)"
  ["JWT_SECRET"]="backend/api (JWT signing)"
  ["AWS_ACCESS_KEY_ID"]="backend/api (AWS SDK)"
  ["AWS_SECRET_ACCESS_KEY"]="backend/api (AWS SDK)"
)

declare -A SECRET_ROTATION_PROCEDURES=(
  ["SENTRY_AUTH_TOKEN"]="1. Go to Sentry → Settings → Auth Tokens. 2. Create a new token with project:releases and org:read scopes. 3. Update EAS secret: eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value <new-token>. 4. Delete the old token in Sentry."
  ["SENTRY_ORG"]="1. Verify the org slug in Sentry URL. 2. Update EAS secret if the org changes."
  ["SENTRY_PROJECT"]="1. Verify the project slug in Sentry. 2. Update EAS secret if the project changes."
  ["EXPO_TOKEN"]="1. Go to expo.dev → Settings → Access Tokens. 2. Create a new token. 3. Update GitHub secret EXPO_TOKEN. 4. Revoke the old token."
  ["EXPO_PROJECT_ID"]="1. Find the project ID in app.json extra.eas.projectId or expo.dev dashboard. 2. Update GitHub secret EXPO_PROJECT_ID if the project changes."
  ["EXPO_PUBLIC_OTA_CODE_SIGNING_KEY"]="1. Run: eas update:configure-code-signing --key-output-directory ../keys (generates a new key pair). 2. Update EAS secret EXPO_PUBLIC_OTA_CODE_SIGNING_KEY with the new private key. 3. Commit the new public certificate. 4. Build a new binary so the new public key is embedded."
  ["EXPO_PUBLIC_POSTHOG_KEY"]="1. Go to PostHog → Project Settings → API Keys. 2. Create a new project API key. 3. Update EAS secret EXPO_PUBLIC_POSTHOG_KEY. 4. Revoke the old key."
  ["EXPO_PUBLIC_SENTRY_DSN"]="1. Go to Sentry → Project Settings → Client Keys. 2. Create a new DSN. 3. Update EAS secret EXPO_PUBLIC_SENTRY_DSN. 4. Remove the old DSN after all clients have updated."
  ["EXPO_PUBLIC_API_BASE_URL"]="1. Deploy the new API endpoint. 2. Update EAS secret EXPO_PUBLIC_API_BASE_URL. 3. Publish an OTA update pointing to the new URL. 4. Verify the old endpoint is decommissioned."
  ["EXPO_PUBLIC_INTERCOM_APP_ID"]="1. Go to Intercom → Settings → Workspace. 2. Copy the new App ID. 3. Update EAS secret."
  ["EXPO_PUBLIC_INTERCOM_ANDROID_API_KEY"]="1. Go to Intercom → Settings → API Keys. 2. Generate a new Android API key. 3. Update EAS secret. 4. Revoke the old key."
  ["EXPO_PUBLIC_INTERCOM_IOS_API_KEY"]="1. Go to Intercom → Settings → API Keys. 2. Generate a new iOS API key. 3. Update EAS secret. 4. Revoke the old key."
  ["EXPO_PUBLIC_STRIPE_APPLE_MERCHANT_IDENTIFIER"]="1. Go to Apple Developer → Identifiers → Merchant IDs. 2. Verify or create the merchant ID. 3. Update EAS secret if changed."
  ["DATABASE_URL"]="1. Rotate the PostgreSQL password: ALTER USER thryftverse WITH PASSWORD '<new>'. 2. Update the connection string in the secrets manager / environment. 3. Restart the API. 4. Verify connectivity."
  ["DATABASE_REPLICA_URL"]="1. Rotate the replica PostgreSQL password. 2. Update the connection string. 3. Restart the API. 4. Verify replica connectivity."
  ["REDIS_URL"]="1. Rotate the Redis password: CONFIG SET requirepass '<new>'. 2. Update REDIS_URL in the secrets manager / environment. 3. Restart the API and workers. 4. Verify connectivity."
  ["KEY_SERVICE_CLIENT_TOKEN"]="1. Generate a new token in the key service. 2. Update the environment variable. 3. Restart the API. 4. Revoke the old token."
  ["KEY_SERVICE_ADMIN_TOKEN"]="1. Generate a new admin token in the key service. 2. Update the environment variable. 3. Restart the key service. 4. Revoke the old token."
  ["S3_ACCESS_KEY"]="1. Create a new access key in AWS IAM / MinIO. 2. Update S3_ACCESS_KEY and S3_SECRET_KEY. 3. Restart the API. 4. Disable the old access key."
  ["S3_SECRET_KEY"]="1. Create a new secret key in AWS IAM / MinIO. 2. Update S3_ACCESS_KEY and S3_SECRET_KEY. 3. Restart the API. 4. Disable the old key pair."
  ["STRIPE_SECRET_KEY"]="1. Go to Stripe Dashboard → Developers → API Keys. 2. Create a new restricted key. 3. Update the environment variable. 4. Revoke the old key."
  ["STRIPE_WEBHOOK_SECRET"]="1. Go to Stripe Dashboard → Developers → Webhooks. 2. Create a new webhook endpoint (or rotate the existing signing secret). 3. Update the environment variable. 4. Restart the API."
  ["MOLLIE_API_KEY"]="1. Go to Mollie Dashboard → Settings → API Keys. 2. Create a new live API key. 3. Update the environment variable. 4. Revoke the old key."
  ["RAZORPAY_KEY_ID"]="1. Go to Razorpay Dashboard → Settings → API Keys. 2. Generate a new key pair. 3. Update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. 4. Disable the old key."
  ["RAZORPAY_KEY_SECRET"]="1. Go to Razorpay Dashboard → Settings → API Keys. 2. Generate a new key pair. 3. Update RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. 4. Disable the old key."
  ["LIVEKIT_API_KEY"]="1. Go to LiveKit Cloud → Settings → API Keys. 2. Create a new API key. 3. Update LIVEKIT_API_KEY and LIVEKIT_API_SECRET. 4. Revoke the old key."
  ["LIVEKIT_API_SECRET"]="1. Go to LiveKit Cloud → Settings → API Keys. 2. Create a new API secret. 3. Update LIVEKIT_API_KEY and LIVEKIT_API_SECRET. 4. Revoke the old key."
  ["JWT_SECRET"]="1. Generate a new secret: openssl rand -base64 64. 2. Update JWT_SECRET in the environment. 3. Restart the API. 4. All existing JWTs become invalid (users must re-authenticate)."
  ["AWS_ACCESS_KEY_ID"]="1. Create a new IAM access key pair. 2. Update AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. 3. Restart the API. 4. Deactivate the old access key."
  ["AWS_SECRET_ACCESS_KEY"]="1. Create a new IAM access key pair. 2. Update AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. 3. Restart the API. 4. Deactivate the old access key."
)

send_alert() {
  local message="$1"
  if [ -z "$ALERTING_WEBHOOK_URL" ] || [ "$DRY_RUN" = "1" ]; then
    return 0
  fi
  curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"content\":\"$message\"}" \
    "$ALERTING_WEBHOOK_URL" || true
}

query_secret_age() {
  local secret_name="$1"
  if [ -z "$SECRETS_MANAGER_URL" ]; then
    echo "UNTRACKED"
    return
  fi
  local response
  response=$(curl -s -f \
    -H "Authorization: Bearer ${SECRETS_MANAGER_TOKEN}" \
    "${SECRETS_MANAGER_URL}/api/v1/secrets/${secret_name}/age" 2>/dev/null) || {
    echo "UNTRACKED"
    return
  }
  local age_days
  age_days=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('age_days','UNTRACKED'))" 2>/dev/null) || {
    echo "UNTRACKED"
    return
  }
  echo "$age_days"
}

echo "================================================================"
echo " ThryftVerse — Secrets Rotation Report"
echo " Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo " Max secret age: ${MAX_SECRET_AGE_DAYS} days"
echo "================================================================"
echo ""

STALE_SECRETS=0
TRACKED_SECRETS=0
UNTRACKED_SECRETS=0

printf "%-45s %-12s %-15s %s\n" "SECRET" "AGE (days)" "STATUS" "SOURCE"
printf "%-45s %-12s %-15s %s\n" "------" "---------" "------" "------"

for secret_name in "${SECRET_NAMES[@]}"; do
  source="${SECRET_SOURCES[$secret_name]:-unknown}"
  procedure="${SECRET_ROTATION_PROCEDURES[$secret_name]:-No rotation procedure documented.}"

  age_days=$(query_secret_age "$secret_name")

  if [ "$age_days" = "UNTRACKED" ]; then
    UNTRACKED_SECRETS=$((UNTRACKED_SECRETS + 1))
    status="UNTRACKED"
    printf "%-45s %-12s %-15s %s\n" "$secret_name" "-" "$status" "$source"
  else
    TRACKED_SECRETS=$((TRACKED_SECRETS + 1))
    if [ "$age_days" -gt "$MAX_SECRET_AGE_DAYS" ]; then
      STALE_SECRETS=$((STALE_SECRETS + 1))
      status="STALE"
    else
      status="OK"
    fi
    printf "%-45s %-12s %-15s %s\n" "$secret_name" "$age_days" "$status" "$source"
  fi
done

echo ""
echo "================================================================"
echo " SUMMARY"
echo "================================================================"
echo " Total secrets:    ${#SECRET_NAMES[@]}"
echo " Tracked:          $TRACKED_SECRETS"
echo " Untracked:        $UNTRACKED_SECRETS"
echo " Stale (>${MAX_SECRET_AGE_DAYS}d): $STALE_SECRETS"
echo ""

if [ "$STALE_SECRETS" -gt 0 ]; then
  echo "================================================================"
  echo " STALE SECRETS — ROTATION REQUIRED"
  echo "================================================================"
  echo ""
  for secret_name in "${SECRET_NAMES[@]}"; do
    age_days=$(query_secret_age "$secret_name")
    if [ "$age_days" != "UNTRACKED" ] && [ "$age_days" -gt "$MAX_SECRET_AGE_DAYS" ]; then
      procedure="${SECRET_ROTATION_PROCEDURES[$secret_name]:-No rotation procedure documented.}"
      echo "--- $secret_name (age: ${age_days} days) ---"
      echo "Source: ${SECRET_SOURCES[$secret_name]:-unknown}"
      echo "Rotation procedure:"
      echo "  $procedure"
      echo ""
    fi
  done

  send_alert "⚠️ **Secrets Rotation Alert**: $STALE_SECRETS secret(s) are older than ${MAX_SECRET_AGE_DAYS} days and require rotation. See the latest secrets-rotation report for details."
fi

if [ "$UNTRACKED_SECRETS" -gt 0 ]; then
  echo "================================================================"
  echo " UNTRACKED SECRETS — RECOMMENDATION"
  echo "================================================================"
  echo ""
  echo "$UNTRACKED_SECRETS secret(s) are not tracked in a secrets manager."
  echo "Recommendation: integrate a secrets manager (AWS Secrets Manager,"
  echo "HashiCorp Vault, or Doppler) to track secret rotation timestamps."
  echo "Set SECRETS_MANAGER_URL and SECRETS_MANAGER_TOKEN to enable tracking."
  echo ""
fi

echo "================================================================"
echo " ROTATION PROCEDURES (all secrets)"
echo "================================================================"
echo ""
for secret_name in "${SECRET_NAMES[@]}"; do
  procedure="${SECRET_ROTATION_PROCEDURES[$secret_name]:-No rotation procedure documented.}"
  echo "--- $secret_name ---"
  echo "Source: ${SECRET_SOURCES[$secret_name]:-unknown}"
  echo "Procedure: $procedure"
  echo ""
done

echo "================================================================"
echo " Report complete."
echo " Next scheduled run: first of next month (cron: 0 0 1 * *)"
echo "================================================================"
