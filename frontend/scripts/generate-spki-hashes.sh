#!/usr/bin/env bash
#
# generate-spki-hashes.sh — Generate SPKI SHA-256 hashes for SSL pinning.
#
# Connects to the specified domain, extracts the Subject Public Key Info
# (SPKI) from the leaf certificate, DER-encodes it, computes the SHA-256
# digest, and base64-encodes the result — the exact format required by
# both Android's network_security_config.xml and iOS's TrustKit.
#
# Usage:
#   ./generate-spki-hashes.sh api.thryftverse.com
#   ./generate-spki-hashes.sh cdn.thryftverse.com
#
# Requirements:
#   - openssl (available on macOS/Linux or via Git Bash on Windows)
#
# Output:
#   Prints the base64-encoded SHA-256 SPKI hash, ready to paste into:
#     - frontend/android/app/src/main/res/xml/network_security_config.xml
#     - frontend/plugins/withTrustKit.js (iOS TrustKit config)
#
# Always generate TWO pins per domain:
#   1. Primary: the current certificate's SPKI hash (this script).
#   2. Backup: a different intermediate in the chain, or a pre-generated
#      backup key pair (see network_security_config.xml header comment).
#
# Usage:
#   ./generate-spki-hashes.sh <domain> [port] [--all]
#
#   --all  Also print the SPKI hash of every certificate in the chain so
#          you can pick a backup pin (typically an intermediate CA).
#
# Examples:
#   ./generate-spki-hashes.sh api.thryftverse.com
#   ./generate-spki-hashes.sh cdn.thryftverse.com 443 --all
#
set -euo pipefail

ALL_CHAIN=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --all) ALL_CHAIN=1 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [ ${#ARGS[@]} -lt 1 ]; then
  echo "Usage: $0 <domain> [port] [--all]"
  echo ""
  echo "Examples:"
  echo "  $0 api.thryftverse.com"
  echo "  $0 cdn.thryftverse.com 443 --all"
  exit 1
fi

DOMAIN="${ARGS[0]}"
PORT="${ARGS[1]:-443}"

if ! command -v openssl &>/dev/null; then
  echo "Error: openssl is not installed or not in PATH." >&2
  echo "  macOS:  pre-installed"
  echo "  Linux:  apt install openssl  /  yum install openssl"
  echo "  Windows: install Git for Windows (includes openssl) or use WSL" >&2
  exit 1
fi

echo "Connecting to ${DOMAIN}:${PORT}..." >&2
echo "" >&2

# Extract the SPKI from the leaf certificate and compute the SHA-256 hash.
# The -servername flag enables SNI so the correct certificate is served.
HASH=$(openssl s_client -connect "${DOMAIN}:${PORT}" -servername "${DOMAIN}" 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64)

if [ -z "${HASH}" ]; then
  echo "Error: Failed to generate SPKI hash for ${DOMAIN}:${PORT}" >&2
  echo "  Check that the domain is reachable and openssl is working correctly." >&2
  exit 1
fi

echo "SPKI SHA-256 hash for ${DOMAIN}:${PORT}:" >&2
echo "" >&2
echo "${HASH}"
echo "" >&2
echo "Paste this into:" >&2
echo "  - frontend/android/app/src/main/res/xml/network_security_config.xml" >&2
echo "  - frontend/plugins/withTrustKit.js (TSKPublicKeyHashes)" >&2
echo "  - frontend/src/utils/sslPinning.ts (SSL_PINNING_CONFIG.domains)" >&2
echo "" >&2

if [ "${ALL_CHAIN}" -eq 1 ]; then
  echo "Full certificate chain SPKI hashes (for backup pin selection):" >&2
  echo "" >&2
  # Save the full chain to a temp PEM, then split into individual certs.
  TMP_PEM="$(mktemp)"
  trap 'rm -f "${TMP_PEM}"' EXIT
  openssl s_client -connect "${DOMAIN}:${PORT}" -servername "${DOMAIN}" -showcerts 2>/dev/null \
    | sed -n '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/p' > "${TMP_PEM}"

  # Use awk to split the PEM bundle into individual certificates and compute
  # the SPKI hash of each one.
  idx=0
  awk 'BEGIN{c=0} /-----BEGIN CERTIFICATE-----/{c++} {print > "/tmp/_thryft_cert_" c ".pem"} /-----END CERTIFICATE-----/{}' "${TMP_PEM}"
  for f in /tmp/_thryft_cert_*.pem; do
    [ -f "$f" ] || continue
    ch=$(openssl x509 -in "$f" -pubkey -noout 2>/dev/null \
      | openssl pkey -pubin -outform der 2>/dev/null \
      | openssl dgst -sha256 -binary 2>/dev/null \
      | openssl enc -base64)
    [ -n "$ch" ] && echo "  [${idx}] ${ch}" >&2
    idx=$((idx + 1))
    rm -f "$f"
  done

  echo "" >&2
  echo "Pick a DIFFERENT entry (typically [1], the intermediate) as the" >&2
  echo "backup pin, or pre-generate a separate backup key pair." >&2
  echo "" >&2
else
  echo "Remember to also generate a BACKUP pin (different intermediate or" >&2
  echo "pre-generated backup key) for rotation safety. Use --all to see" >&2
  echo "every SPKI hash in the certificate chain." >&2
  echo "" >&2
fi
