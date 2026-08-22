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
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <domain>"
  echo ""
  echo "Examples:"
  echo "  $0 api.thryftverse.com"
  echo "  $0 cdn.thryftverse.com"
  exit 1
fi

DOMAIN="$1"
PORT="${2:-443}"

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
echo "" >&2
echo "Remember to also generate a BACKUP pin (different intermediate or" >&2
echo "pre-generated backup key) for rotation safety." >&2
