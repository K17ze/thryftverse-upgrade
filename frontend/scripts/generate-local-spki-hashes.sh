#!/usr/bin/env bash
#
# generate-local-spki-hashes.sh — Generate self-signed TLS certificates for
# local development and extract the SPKI SHA-256 hashes needed by TrustKit
# (iOS) and Android network_security_config.xml.
#
# This script creates a local dev CA, a primary + backup server certificate
# for the API domain and the CDN domain, signs them with the dev CA, and
# prints the base64 SHA-256 SPKI hash of each leaf certificate.
#
# The generated certificates are written to docker/nginx/certs/ so the
# optional nginx-tls Docker service can terminate TLS for local pinning
# tests against the Docker backend.
#
# !!! LOCAL DEV ONLY !!!
# The hashes and certificates produced by this script are for LOCAL
# DEVELOPMENT AND TESTING ONLY. They MUST NOT be used in production.
# Replace them with real SPKI hashes from your production certificates
# (see frontend/scripts/generate-spki-hashes.sh) before shipping.
#
# Usage:
#   ./generate-local-spki-hashes.sh
#
# Requirements:
#   - openssl (available on macOS/Linux or via Git for Windows on Windows)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
CERT_DIR="${REPO_ROOT}/docker/nginx/certs"

mkdir -p "${CERT_DIR}"
cd "${CERT_DIR}"

if ! command -v openssl &>/dev/null; then
  echo "Error: openssl is not installed or not in PATH." >&2
  echo "  macOS:  pre-installed" >&2
  echo "  Linux:  apt install openssl  /  yum install openssl" >&2
  echo "  Windows: install Git for Windows (includes openssl) or use WSL" >&2
  exit 1
fi

echo "==> Generating local dev CA..."
openssl genrsa -out ca.key 2048 2>/dev/null
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/C=NL/ST=North Holland/L=Amsterdam/O=ThryftVerse Dev/CN=ThryftVerse Local Dev CA" \
  -out ca.crt 2>/dev/null

# SAN config covering the local domains plus localhost and the Android
# emulator host alias (10.0.2.2). Both the .local and .com variants are
# included so the same cert can be used regardless of which hostname the
# app is configured to hit during local testing.
write_san_config() {
  local primary_dns="$1"
  local extra_dns="$2"
  cat > san.cnf <<EOF
[req]
distinguished_name = req_distinguished_name
[req_distinguished_name]
[v3_ext]
subjectAltName = @alt_names
[alt_names]
DNS.1 = ${primary_dns}
${extra_dns}
DNS.5 = localhost
IP.1  = 127.0.0.1
IP.2  = 10.0.2.2
EOF
}

gen_server_cert() {
  local name="$1"
  local cn="$2"
  local san_file="$3"
  echo "==> Generating ${name} certificate (CN=${cn})..."
  openssl genrsa -out "${name}.key" 2048 2>/dev/null
  openssl req -new -key "${name}.key" \
    -subj "/C=NL/ST=North Holland/L=Amsterdam/O=ThryftVerse Dev/CN=${cn}" \
    -out "${name}.csr" 2>/dev/null
  openssl x509 -req -in "${name}.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "${name}.crt" -days 825 -sha256 \
    -extfile "${san_file}" -extensions v3_ext 2>/dev/null
}

extract_spki() {
  local cert="$1"
  openssl x509 -in "${cert}" -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
}

# ── API domain ──────────────────────────────────────────────────────────
write_san_config "api.thryftverse.local" "DNS.2 = api.thryftverse.com
DNS.3 = cdn.thryftverse.local
DNS.4 = cdn.thryftverse.com"
gen_server_cert "api-primary" "api.thryftverse.local" "san.cnf"
gen_server_cert "api-backup"  "api.thryftverse.local" "san.cnf"

# ── CDN domain ──────────────────────────────────────────────────────────
write_san_config "cdn.thryftverse.local" "DNS.2 = cdn.thryftverse.com
DNS.3 = api.thryftverse.local
DNS.4 = api.thryftverse.com"
gen_server_cert "cdn-primary" "cdn.thryftverse.local" "san.cnf"
gen_server_cert "cdn-backup"  "cdn.thryftverse.local" "san.cnf"

# ── Extract and report hashes ───────────────────────────────────────────
API_PRIMARY=$(extract_spki "api-primary.crt")
API_BACKUP=$(extract_spki "api-backup.crt")
CDN_PRIMARY=$(extract_spki "cdn-primary.crt")
CDN_BACKUP=$(extract_spki "cdn-backup.crt")

echo ""
echo "================================================================"
echo "  LOCAL DEV SPKI SHA-256 hashes (base64)"
echo "  !!! LOCAL DEV ONLY — replace for production !!!"
echo "================================================================"
echo ""
echo "API primary : ${API_PRIMARY}"
echo "API backup  : ${API_BACKUP}"
echo "CDN primary : ${CDN_PRIMARY}"
echo "CDN backup  : ${CDN_BACKUP}"
echo ""
echo "Certificates written to: ${CERT_DIR}"
echo ""
echo "Update these files with the hashes above:"
echo "  - frontend/plugins/withTrustKit.js"
echo "  - frontend/plugins/withAndroidSecurityXml.js"
echo "  - frontend/src/utils/sslPinning.ts"
echo ""
echo "TrustKit (iOS) TSKPublicKeyHashes format:"
echo "  'api.thryftverse.com': ['${API_PRIMARY}', '${API_BACKUP}']"
echo "  'cdn.thryftverse.com': ['${CDN_PRIMARY}', '${CDN_BACKUP}']"
echo ""
echo "Android network_security_config.xml <pin> format:"
echo "  <pin digest=\"SHA-256\">${API_PRIMARY}</pin>"
echo "  <pin digest=\"SHA-256\">${API_BACKUP}</pin>"
echo ""
