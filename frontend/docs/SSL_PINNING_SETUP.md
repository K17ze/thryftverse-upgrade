# SSL Public-Key Pinning Setup

This document explains how to generate SPKI SHA-256 hashes for SSL
public-key pinning, how to configure the TrustKit (iOS) and Android
`network_security_config.xml` pin sets, and how to run the local Docker
nginx TLS proxy for end-to-end pinning tests.

> **LOCAL DEV ONLY.** The hashes committed in the repository are derived
> from self-signed certificates. They let you test the pinning flow
> locally but **MUST be replaced with real production SPKI hashes** before
> any staging or production build. Search for `LOCAL DEV ONLY` across the
> codebase to find every site that needs updating.

---

## 1. Where pins live

| File | Platform | Purpose |
|------|----------|---------|
| `frontend/plugins/withTrustKit.js` | iOS | Injects `TSKPublicKeyHashes` into `Info.plist` via TrustKit. |
| `frontend/plugins/withAndroidSecurityXml.js` | Android | Generates `network_security_config.xml` with `<pin>` entries. |
| `frontend/src/utils/sslPinning.ts` | Runtime (both) | `SSL_PINNING_CONFIG` used by `react-native-ssl-public-key-pinning`. |
| `frontend/scripts/validate-ssl-pins.mjs` | Build guard | Fails a production build if any pin is a placeholder or local dev default. |

All four sites must use **the same** SPKI hash for a given domain.

---

## 2. Generating LOCAL DEV hashes

The local dev hashes let you test SSL pinning against the Docker backend
without needing real production certificates.

### Prerequisites

- **OpenSSL** — pre-installed on macOS/Linux; on Windows install
  [Git for Windows](https://git-scm.com/download/win) (bundles openssl) or
  use WSL.

### Run the generator

**macOS / Linux / Git Bash (Windows):**

```bash
./frontend/scripts/generate-local-spki-hashes.sh
```

**Windows PowerShell (without Git Bash):**

```powershell
.\frontend\scripts\generate-local-spki-hashes.ps1
```

The script:

1. Generates a self-signed CA key + cert (`ca.key`, `ca.crt`).
2. Generates a primary + backup server key + CSR for
   `api.thryftverse.local` and `cdn.thryftverse.local`.
3. Signs each server cert with the dev CA (825-day validity).
4. Extracts the base64 SHA-256 SPKI hash from each leaf cert.
5. Writes all artifacts to `docker/nginx/certs/`.
6. Prints the four hashes in the formats needed by TrustKit and Android.

### Current local dev hashes

```
API primary : Fb5JW02nuZPOD4wVU8nH+kr0jfWYj0EEmKbs1GiBVt0=
API backup  : q1gOabJwZJb8b6X5rZrGGzOstWkaJzr1elzO3XNwAeY=
CDN primary : VpPP8ycfh5u0OzPPQoQysNtalnE0WEXUJZZ/4/gU3Is=
CDN backup  : JP/p6hMm8Q8K/ieR8T/jMoAHQ6rABkLS3w/De5u9iPk=
```

These are already wired into `withTrustKit.js`,
`withAndroidSecurityXml.js`, and `sslPinning.ts`. If you regenerate the
certificates (e.g. after they expire) you must update all three files with
the new hashes.

---

## 3. Generating PRODUCTION hashes

Production hashes are extracted from the live TLS endpoint of each pinned
domain. This is an ops-team task run during deployment.

### Prerequisites

- `openssl` on a machine with network access to the production domain.

### Run the extractor

```bash
# Primary pin only
./frontend/scripts/generate-spki-hashes.sh api.thryftverse.com
./frontend/scripts/generate-spki-hashes.sh cdn.thryftverse.com

# Primary + every cert in the chain (to pick a backup pin)
./frontend/scripts/generate-spki-hashes.sh api.thryftverse.com 443 --all
```

The script connects to the domain, extracts the SPKI from the leaf
certificate, DER-encodes it, computes the SHA-256 digest, and base64-
encodes the result. With `--all` it also prints the SPKI hash of every
certificate in the chain so you can select a backup pin (typically the
intermediate CA).

### Setting production pins at build time

Production pins are injected via EAS build secrets / environment variables
so they never live in the repository:

| Env var | Domain |
|---------|--------|
| `EXPO_PUBLIC_SSL_PIN_API_PRIMARY` | `api.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_API_BACKUP` | `api.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_CDN_PRIMARY` | `cdn.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_CDN_BACKUP` | `cdn.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_STAGING_PRIMARY` | `api-staging.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_STAGING_BACKUP` | `api-staging.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_DEV_PRIMARY` | `api-dev.thryftverse.com` |
| `EXPO_PUBLIC_SSL_PIN_DEV_BACKUP` | `api-dev.thryftverse.com` |

Set these in your EAS build profile (`eas.json` → `production` → `env`)
or as EAS secrets:

```bash
eas secret:create --scope project \
  --name EXPO_PUBLIC_SSL_PIN_API_PRIMARY \
  --value "<hash from generate-spki-hashes.sh>"
```

When `__DEV__` is false, `sslPinning.ts` reads these env vars at runtime.
`withAndroidSecurityXml.js` reads them at prebuild time. If an env var is
absent both fall back to the local dev hash (fail-closed against the real
server) and `validate-ssl-pins.mjs` fails the production build.

---

## 4. Updating the TrustKit and Android configs

After generating hashes (local or production), update **all three** files:

### `frontend/plugins/withTrustKit.js`

```js
const PINNED_DOMAINS = {
  'api.thryftverse.com': {
    TSKPublicKeyHashes: [
      '<API_PRIMARY_HASH>',
      '<API_BACKUP_HASH>',
    ],
  },
  'cdn.thryftverse.com': {
    TSKPublicKeyHashes: [
      '<CDN_PRIMARY_HASH>',
      '<CDN_BACKUP_HASH>',
    ],
  },
};
```

### `frontend/plugins/withAndroidSecurityXml.js`

For production, set the `EXPO_PUBLIC_SSL_PIN_*` env vars (see above). The
plugin reads them at `expo prebuild` time and writes
`network_security_config.xml`. For local dev the plugin falls back to the
`LOCAL_DEV_HASHES` map automatically.

### `frontend/src/utils/sslPinning.ts`

In `__DEV__` the config uses `LOCAL_DEV_PINS` automatically. In
production it reads the `EXPO_PUBLIC_SSL_PIN_*` env vars via
`readProductionPin()`. No manual edit is needed for local dev; for
production just set the env vars.

---

## 5. Docker nginx TLS proxy setup

The Docker backend (`api` service) listens on plaintext HTTP port 4000.
To test SSL pinning we need TLS. The optional `nginx-tls` service
terminates TLS with the self-signed dev certs and forwards plaintext HTTP
to the `api` container.

### Architecture

```
App (simulator/emulator)
  │  HTTPS https://10.0.2.2:4443  (or localhost:4443)
  ▼
nginx-tls  (port 4443, self-signed dev cert)
  │  HTTP http://api:4000
  ▼
api  (port 4000, plaintext)
```

### Starting the TLS proxy

```bash
# Start the full stack + the TLS proxy
docker compose --profile tls up

# Or just the TLS proxy on top of an already-running stack
docker compose up -d
docker compose --profile tls up -d nginx-tls
```

The proxy listens on **https://localhost:4443** (and
`https://10.0.2.2:4443` from Android emulators).

### Installing the dev CA on a simulator/emulator

Because the cert is self-signed, the OS will not trust it by default.
TrustKit and Android's `network_security_config.xml` pin the **public
key**, not the CA, so pinning will still work once the SPKI hash matches.
However, for the TLS handshake to succeed you may need to install the dev
CA:

- **iOS Simulator:** `docker/nginx/certs/ca.crt` → drag into the
  simulator, then enable it in Settings → General → About → Certificate
  Trust Settings.
- **Android Emulator:** `adb root && adb push docker/nginx/certs/ca.crt
  /system/etc/security/cacerts/$(openssl x509 -in ca.crt -noout -subject_hash_old).0`

Alternatively, the nginx proxy serves the CA at
`https://localhost:4443/.well-known/ca` for easy download.

---

## 6. Verifying pinning works

1. Start the stack with the TLS profile:
   ```bash
   docker compose --profile tls up
   ```
2. Confirm the proxy is healthy:
   ```bash
   curl -k https://localhost:4443/health
   ```
3. Verify the SPKI hash matches the pin:
   ```bash
   echo | openssl s_client -connect localhost:4443 -servername api.thryftverse.local 2>/dev/null \
     | openssl x509 -pubkey -noout \
     | openssl pkey -pubin -outform der \
     | openssl dgst -sha256 -binary \
     | openssl enc -base64
   ```
   The output must equal `Fb5JW02nuZPOD4wVU8nH+kr0jfWYj0EEmKbs1GiBVt0=`
   (the API primary local dev hash).
4. Build a development client and run the app against
   `https://10.0.2.2:4443`. Check the console for
   `[sslPinning] status: ...` — it should report `active` (if
   `enforce: true`) or `configured-but-not-enforced` (if `enforce: false`).

---

## 7. Build-time validation

`frontend/scripts/validate-ssl-pins.mjs` runs as a prebuild guard. When
`EXPO_PUBLIC_SSL_PINNING_ENABLED=true` and
`EXPO_PUBLIC_ENVIRONMENT=production`, it fails the build if any pin in
`sslPinning.ts`, `withTrustKit.js`, or `network_security_config.xml` is a
placeholder or local dev default.

Run it manually:

```bash
cd frontend
EXPO_PUBLIC_SSL_PINNING_ENABLED=true EXPO_PUBLIC_ENVIRONMENT=production \
  node scripts/validate-ssl-pins.mjs
```

---

## 8. Production rollout checklist

See the header comment in `frontend/src/utils/sslPinning.ts` for the full
checklist. Summary:

1. Install `react-native-ssl-public-key-pinning` and create a dev build.
2. Generate real SPKI hashes for every pinned domain.
3. Verify at least one backup pin per domain is a different key pair.
4. Staged rollout with `enforce: false`; inspect logs for failures.
5. Flip `enforce: true` only after a clean rollout.
6. Subscribe to certificate transparency / rotation alerts.
7. Confirm a remote kill-switch (expo-updates runtime version) is in place.
