# Thryftverse — Production Deployment Guide

> **Audience:** DevOps / backend team responsible for provisioning and deploying the production environment.  
> **Last updated:** May 2026  
> **Stack:** Node.js API (Fastify) · Key Service (Node.js) · ML Service (Python/FastAPI) · PostgreSQL · Redis · S3-compatible object storage · Expo React Native mobile app

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Accounts](#2-prerequisites--accounts)
3. [Generate Production Secrets](#3-generate-production-secrets)
4. [PostgreSQL — Neon](#4-postgresql--neon)
5. [Redis — Upstash](#5-redis--upstash)
6. [Object Storage — Cloudflare R2](#6-object-storage--cloudflare-r2)
7. [Email — Resend](#7-email--resend)
8. [Error Tracking — Sentry](#8-error-tracking--sentry)
9. [Backend Services — Railway](#9-backend-services--railway)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Database Migrations](#11-database-migrations)
12. [Health Check Verification](#12-health-check-verification)
13. [Mobile App — EAS Build & Store Submission](#13-mobile-app--eas-build--store-submission)
14. [DNS & Domain Setup](#14-dns--domain-setup)
15. [Post-Deploy Checklist](#15-post-deploy-checklist)
16. [Cost Summary](#16-cost-summary)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                      Mobile App                          │
│              (iOS App Store / Google Play)               │
│               Expo React Native — EAS Build              │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS
                         ▼
┌──────────────────────────────────────────────────────────┐
│                   Railway (Backend)                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │     api      │  │ key-service  │  │  ml-service   │  │
│  │ Node/Fastify │  │  Node.js     │  │ Python/FastAPI│  │
│  │  port 4000   │  │  port 4100   │  │   port 8000   │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
└─────────┼────────────────┼──────────────────────────────┘
          │                │ (internal private network)
     ─────┼────────────────┼──────────────────────────────
          │                │
    ┌─────▼──────┐   ┌─────▼───────┐   ┌────────────────┐
    │  Neon      │   │   Upstash   │   │ Cloudflare R2  │
    │ PostgreSQL │   │    Redis    │   │  Object Store  │
    └────────────┘   └─────────────┘   └────────────────┘
```

### Services at a glance

| Service | Technology | Hosted on | Exposed publicly |
|---|---|---|---|
| `api` | Node.js 20 / Fastify / TypeScript | Railway | Yes — HTTPS |
| `key-service` | Node.js 20 / TypeScript | Railway | **No** — internal only |
| `ml-service` | Python 3.11 / FastAPI | Railway | **No** — internal only |
| PostgreSQL | PostgreSQL 16 | Neon (managed) | No — connection string only |
| Redis | Redis 7 | Upstash (managed) | No — connection string only |
| Object Storage | S3-compatible | Cloudflare R2 | Public read (media files) |
| Email | SMTP/API | Resend | Outbound only |

---

## 2. Prerequisites & Accounts

Create accounts on each platform before starting. All links are provided.

| Platform | URL | Purpose | Cost |
|---|---|---|---|
| **Railway** | https://railway.app | Deploy api, key-service, ml-service | ~$5–20/service/mo |
| **Neon** | https://neon.tech | Managed PostgreSQL | $19/mo (Pro) |
| **Upstash** | https://upstash.com | Managed Redis | Pay-per-use |
| **Cloudflare** | https://dash.cloudflare.com | R2 object storage | $0.015/GB/mo |
| **Resend** | https://resend.com | Transactional email | $20/mo |
| **Sentry** | https://sentry.io | Error tracking & performance | $26/mo |
| **Expo** | https://expo.dev | EAS Build & OTA updates | $99/mo (Production) |
| **Apple Developer** | https://developer.apple.com | iOS App Store publishing | $99/year |
| **Google Play Console** | https://play.google.com/console | Android Play Store publishing | $25 one-time |

---

## 3. Generate Production Secrets

**Never reuse development secrets in production.** Generate each value independently.

### On Windows (PowerShell)

```powershell
# Generate a random 64-character hex string (for most secrets)
[System.BitConverter]::ToString((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) })).Replace("-","").ToLower()

# Generate KEY_SERVICE_MASTER_KEY_B64 (must be exactly 32 bytes, base64-encoded)
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

### On macOS/Linux

```bash
# General secrets
openssl rand -hex 64

# KEY_SERVICE_MASTER_KEY_B64 (32-byte base64)
openssl rand -base64 32
```

### Secrets to generate

Run the command once for each of the following — every value must be unique:

| Variable | Description |
|---|---|
| `AUTH_ACCESS_TOKEN_SECRET` | Signs JWT access tokens (15-min expiry) |
| `AUTH_REFRESH_TOKEN_SECRET` | Signs JWT refresh tokens (30-day expiry) |
| `KEY_SERVICE_MASTER_KEY_B64` | **32-byte base64** master key for encryption at rest |
| `KEY_SERVICE_CLIENT_TOKEN` | Shared secret: api → key-service runtime calls |
| `KEY_SERVICE_ADMIN_TOKEN` | Shared secret: api → key-service admin actions |
| `API_SECURITY_ADMIN_TOKEN` | Admin header for maintenance routes |
| `API_INTERNAL_SERVICE_TOKEN` | Dedicated scheduler/worker identity for internal mutation routes |
| `ONEZE_ATTESTATION_SIGNING_SECRET` | Signs daily 1ze attestation artifacts |

> **Important:** Store these in a password manager (1Password, Bitwarden) or a secrets manager (AWS Secrets Manager, Doppler) before putting them into Railway. Do not paste them into Slack, email, or documents.

---

## 4. PostgreSQL — Neon

### Step-by-step

1. Go to https://neon.tech and sign up / log in.
2. Click **New Project**.
3. Fill in:
   - **Project name:** `thryftverse-production`
   - **Region:** Choose the region closest to your Railway deployment (e.g. `EU West` if Railway is `eu-west`).
   - **PostgreSQL version:** `16`
4. Click **Create Project**.
5. On the project dashboard, go to **Connection Details**.
6. Set **Role** to your default role, **Database** to `thryftverse` (or create one).
7. Copy the connection string. It looks like:
   ```
   postgresql://thryftverse:<password>@ep-xxx-xxx.eu-west-2.aws.neon.tech/thryftverse?sslmode=require
   ```

### What to set in Railway

```
DATABASE_URL=postgresql://thryftverse:<password>@ep-xxx.eu-west-2.aws.neon.tech/thryftverse?sslmode=require
```

### Read Replica (optional but recommended for production)

1. In your Neon project, go to **Branches** → **Create Branch**.
2. Name it `read-replica`, select **Read replica**.
3. Copy its connection string.
4. Set in Railway:
   ```
   DATABASE_REPLICA_URL=postgresql://thryftverse:<password>@ep-yyy.eu-west-2.aws.neon.tech/thryftverse?sslmode=require
   ```

### Backups

- Neon Pro includes **7-day point-in-time recovery (PITR)** — no additional configuration needed.
- For manual logical backups, run from any machine with `pg_dump`:
  ```bash
  pg_dump "<DATABASE_URL>" > backup-$(date +%Y%m%d).sql
  ```

---

## 5. Redis — Upstash

### Step-by-step

1. Go to https://upstash.com and sign up / log in.
2. Click **Create Database**.
3. Fill in:
   - **Name:** `thryftverse-production`
   - **Region:** Match your Railway region (e.g. `EU West 1`)
   - **Type:** `Regional` (not Global — lower latency for single-region)
   - **TLS:** Enabled (required)
4. Click **Create**.
5. On the database page, scroll to **REST API** section — but you need the **Redis connection URL**, not the REST URL.
6. Click **Details** tab → copy the value under **Redis URL**. It looks like:
   ```
   rediss://default:<password>@trusty-xxx.upstash.io:6379
   ```
   > Note: `rediss://` (with double `s`) means TLS — this is correct.

### What to set in Railway

```
REDIS_URL=rediss://default:<password>@trusty-xxx.upstash.io:6379
```

---

## 6. Object Storage — Cloudflare R2

R2 is S3-compatible, has zero egress fees, and includes a free public CDN URL.

### Step-by-step

#### 6.1 Create the bucket

1. Go to https://dash.cloudflare.com → select your account.
2. In the left sidebar, click **R2 Object Storage** → **Create bucket**.
3. Fill in:
   - **Bucket name:** `thryftverse-media`
   - **Location:** Choose a region close to your users (e.g. `EEUR` for Europe)
4. Click **Create bucket**.

#### 6.2 Enable public access

1. Inside the bucket, click **Settings** tab.
2. Under **Public access** → click **Allow Access**.
3. You will get a public URL like: `https://pub-<hash>.r2.dev`
4. Optionally, connect a **custom domain** (e.g. `cdn.thryftverse.app`) under **Custom Domains** in the same settings tab.

#### 6.3 Create an API token

1. Back on the R2 overview page, click **Manage R2 API Tokens** (top right).
2. Click **Create API Token**.
3. Fill in:
   - **Token name:** `thryftverse-api-production`
   - **Permissions:** `Object Read & Write`
   - **Specify bucket:** `thryftverse-media`
4. Click **Create API Token**.
5. Copy the **Access Key ID** and **Secret Access Key** — these are shown only once.

#### 6.4 Get your Account ID

1. Go to the R2 overview page.
2. Copy the **Account ID** shown in the top-right of the page.

### What to set in Railway

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://pub-<hash>.r2.dev        # or your custom CDN domain
S3_REGION=auto
S3_ACCESS_KEY=<Access Key ID from step 6.3>
S3_SECRET_KEY=<Secret Access Key from step 6.3>
S3_BUCKET=thryftverse-media
S3_FORCE_PATH_STYLE=false
MEDIA_PROCESSING_ENABLED=true
MEDIA_PUBLICATION_GATE_ENABLED=true
```

> **Key difference from local dev:** `S3_FORCE_PATH_STYLE` must be `false` for R2 (it was `true` for local MinIO). No code changes needed — this is only an env var.

---

## 7. Email — Resend

### Step-by-step

1. Go to https://resend.com and sign up / log in.
2. Go to **Domains** → **Add Domain**.
3. Enter `thryftverse.app` (your domain).
4. Resend will give you DNS records to add to your domain registrar:
   - `MX` record
   - `TXT` (SPF) record
   - `CNAME` (DKIM) records
5. Add those records in your DNS provider (Cloudflare or your registrar).
6. Click **Verify** in Resend — wait for DNS propagation (up to 30 min).
7. Once verified, go to **API Keys** → **Create API Key**.
8. Name it `thryftverse-production`, set **Full Access**.
9. Copy the key (shown only once).

### What to set in Railway

```
AUTH_EMAIL_PROVIDER=resend
AUTH_EMAIL_FROM=noreply@thryftverse.app
RESEND_API_KEY=re_<your_key>
```

---

## 8. Error Tracking — Sentry

### Step-by-step

1. Go to https://sentry.io and sign up / log in.
2. Click **Create Project**.
3. Select platform: **Node.js**.
4. Name: `thryftverse-api`.
5. Copy the **DSN** — it looks like: `https://abc123@o123456.ingest.sentry.io/789`
6. Repeat for a second project for the mobile app: platform **React Native**, name `thryftverse-mobile`.

### What to set in Railway (api service)

```
SENTRY_DSN=https://abc123@o123456.ingest.sentry.io/789
SENTRY_TRACES_SAMPLE_RATE=0.15
```

---

## 9. Backend Services — Railway

Railway supports Docker deployments from a GitHub monorepo. You will create **3 separate services** pointing to different Dockerfiles within the same repo.

### Step-by-step

#### 9.1 Connect the repository

1. Go to https://railway.app and log in.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Authorize Railway to access your GitHub organization/account.
4. Select the `thryftverse` repository.
5. Railway will ask which service to create first — follow steps below for each.

#### 9.2 Create the `api` service

1. In the new project, click **New Service** → **GitHub Repo** → select `thryftverse`.
2. Under **Settings** → **Source**:
   - **Root Directory:** `backend/api`
   - **Dockerfile Path:** `Dockerfile`
3. Under **Settings** → **Networking**:
   - Click **Generate Domain** — Railway gives you a URL like `thryftverse-api.railway.app`
   - This is your `EXPO_PUBLIC_API_BASE_URL`
4. Under **Settings** → **Deploy**:
   - **Start Command:** leave blank (Dockerfile CMD handles it: `npm run migrate && npm run serve`)
5. Go to **Variables** tab → add all variables from [Section 10](#10-environment-variables-reference) under **api variables**.

#### 9.3 Create the `key-service` service

1. Click **New Service** → **GitHub Repo** → select `thryftverse`.
2. Under **Settings** → **Source**:
   - **Root Directory:** `backend/key-service`
   - **Dockerfile Path:** `Dockerfile`
3. Under **Settings** → **Networking**:
   - **Do NOT generate a public domain** — this service must be private.
   - Railway internal hostname will be: `key-service.railway.internal`
4. Go to **Variables** tab → add key-service variables from [Section 10](#10-environment-variables-reference).

#### 9.4 Create the `ml-service` decision-baseline service

This service contains deterministic recommendation and pricing baselines. It is
not a trained image-classification, forecasting, or reinforcement-learning
system; `/classify-image` intentionally returns `501` until a trained provider
is installed.

1. Click **New Service** → **GitHub Repo** → select `thryftverse`.
2. Under **Settings** → **Source**:
   - **Root Directory:** `backend/ml-service`
   - **Dockerfile Path:** `Dockerfile`
3. Under **Settings** → **Networking**:
   - **Do NOT generate a public domain** — private service only.
   - Railway internal hostname: `ml-service.railway.internal`
4. Go to **Variables** tab → add:
   ```
   PORT=8000
   ```

#### 9.5 Update internal service URLs in `api` variables

Once key-service and ml-service are created, Railway assigns them internal hostnames. Set these in the `api` service variables:

```
KEY_SERVICE_URL=http://key-service.railway.internal:4100
ML_SERVICE_URL=http://ml-service.railway.internal:8000
```

> Railway internal networking uses the service name as hostname. Confirm exact hostnames in **Settings → Networking → Private Networking** for each service.

#### 9.6 Set up automatic deployments

By default, Railway deploys on every push to the default branch. To restrict to a specific branch:
1. Go to each service → **Settings** → **Source**.
2. Set **Branch** to `main` (or your production branch).

---

## 10. Environment Variables Reference

### `api` service — complete variable list

Set all of these in the Railway `api` service **Variables** tab.

```bash
# ── Runtime ──────────────────────────────────────────────
NODE_ENV=production
PORT=4000

# ── Database ─────────────────────────────────────────────
DATABASE_URL=postgresql://...neon.tech/thryftverse?sslmode=require
DATABASE_REPLICA_URL=                          # optional, leave blank if no replica

# ── Redis ────────────────────────────────────────────────
REDIS_URL=rediss://default:<password>@trusty-xxx.upstash.io:6379

# ── Key Service ──────────────────────────────────────────
KEY_SERVICE_URL=http://key-service.railway.internal:4100
KEY_SERVICE_CLIENT_TOKEN=<generated>
KEY_SERVICE_ADMIN_TOKEN=<generated>

# ── Object Storage (Cloudflare R2) ───────────────────────
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_PUBLIC_ENDPOINT=https://pub-<hash>.r2.dev
S3_REGION=auto
S3_ACCESS_KEY=<r2_access_key_id>
S3_SECRET_KEY=<r2_secret_access_key>
S3_BUCKET=thryftverse-media
S3_FORCE_PATH_STYLE=false

# ── ML Service ───────────────────────────────────────────
ML_SERVICE_URL=http://ml-service.railway.internal:8000

# ── Auth ─────────────────────────────────────────────────
AUTH_ACCESS_TOKEN_SECRET=<generated>
AUTH_REFRESH_TOKEN_SECRET=<generated>
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000
AUTH_EMAIL_PROVIDER=resend
AUTH_EMAIL_FROM=noreply@thryftverse.app
RESEND_API_KEY=re_<your_key>

# ── OAuth ────────────────────────────────────────────────
GOOGLE_OAUTH_CLIENT_IDS=<android_client_id>,<ios_client_id>,<web_client_id>
APPLE_OAUTH_AUDIENCE=com.thryftverse.app

# ── API Security ─────────────────────────────────────────
API_SECURITY_ADMIN_TOKEN=<generated>
API_INTERNAL_SERVICE_TOKEN=<generated-independent-token>
API_ENABLE_MOCK_WEBHOOKS=false
API_RATE_LIMIT_MAX=140
API_RATE_LIMIT_WINDOW=1 minute

# ── KYC ──────────────────────────────────────────────────
KYC_DEFAULT_VENDOR=persona
KYC_VERIFICATION_BASE_URL=https://verify.thryftverse.app/session

# ── Payments ─────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_live_<key>
STRIPE_PUBLISHABLE_KEY=pk_live_<key>
STRIPE_WEBHOOK_SECRET=whsec_<secret>
PAYMENT_METADATA_HMAC_SECRET=<dedicated-random-secret>
STRIPE_APPLE_PAY_MERCHANT_IDENTIFIER=             # optional; required to expose Apple Pay
STRIPE_GOOGLE_PAY_ENABLED=false                    # enable only after Google Pay approval/build configuration
RAZORPAY_KEY_ID=                               # optional
RAZORPAY_KEY_SECRET=                           # optional
RAZORPAY_WEBHOOK_SECRET=                       # optional
WISE_API_KEY=                                  # optional
WISE_WEBHOOK_SECRET=                           # optional

# ── Shipping (optional) ───────────────────────────────────
EASYSHIP_API_KEY=
EASYSHIP_API_BASE_URL=https://public-api.easyship.com/2024-09
EASYSHIP_WEBHOOK_SECRET=
SHIPPING_FALLBACK_LABEL_BASE_URL=https://thryftverse.app/mock-shipping

# ── Payout / Reconciliation ───────────────────────────────
DAILY_PAYOUT_VELOCITY_LIMIT_GBP=2000
PAYOUT_MANUAL_REVIEW_THRESHOLD_GBP=500
RECONCILIATION_SCHEDULE_UTC_HOUR=2
RECONCILIATION_MISMATCH_THRESHOLD_GBP=1
RECONCILIATION_CRITICAL_MISMATCH_THRESHOLD_GBP=10
OPS_ALERT_INTERVAL_MS=60000
PLATFORM_REVENUE_SWEEP_INTERVAL_MS=21600000

# ── Alerting ─────────────────────────────────────────────
ALERTING_WEBHOOK_URLS=https://hooks.slack.com/services/xxx
ALERTING_ADMIN_USER_IDS=

# ── Observability ────────────────────────────────────────
SENTRY_DSN=https://xxx@o123456.ingest.sentry.io/789
SENTRY_TRACES_SAMPLE_RATE=0.15
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_HTTP_URL=                   # leave blank unless you have a collector

# ── Notifications ────────────────────────────────────────
EXPO_PUSH_API_URL=https://exp.host/--/api/v2/push/send
PUSH_DEFAULT_CHANNEL=default

# ── 1ze Monetary System ───────────────────────────────────
ONEZE_ATTESTATION_SIGNING_SECRET=<generated>
ONEZE_SUPPLY_DRIFT_THRESHOLD_IZE=10
ONEZE_ENABLE_DIRECT_REDEMPTION=false
ONEZE_RESERVE_POLICY_ENABLED=true
ONEZE_RESERVE_RATIO_MIN=0.30
ONEZE_RESERVE_RATIO_MAX=0.60
ONEZE_FX_SYNC_ENABLED=true
ONEZE_FX_SYNC_INTERVAL_MS=86400000
ONEZE_FX_PROVIDER_URL=https://api.exchangerate.host/latest
ONEZE_FX_PROVIDER_API_KEY=<live-provider-key>
ONEZE_FX_PROVIDER_BASE_CURRENCY=INR
ONEZE_AUTO_ADJUST_ENABLED=true
ONEZE_AUTO_ADJUST_INTERVAL_MS=3600000
ONEZE_AUTO_ADJUST_STEP_BPS=50
ONEZE_AUTO_ADJUST_LOOKBACK_HOURS=24
ONEZE_AUTO_ADJUST_HIGH_STRESS_THRESHOLD=0.85
ONEZE_AUTO_ADJUST_LOW_STRESS_THRESHOLD=0.35
ONEZE_AUTO_ADJUST_HIGH_REDEMPTION_RATE=0.80
ONEZE_AUTO_ADJUST_LOW_REDEMPTION_RATE=0.25
AUCTION_SWEEP_INTERVAL_MS=30000
```

---

### `key-service` variables

```bash
NODE_ENV=production
PORT=4100
KEY_SERVICE_ALLOWED_KEYS=profile,message,wallet
KEY_SERVICE_REGION=eu-west
KEY_SERVICE_COUNTRY=NL
KEY_SERVICE_MASTER_KEY_B64=<generated — 32-byte base64>
KEY_SERVICE_CLIENT_TOKEN=<same value as api's KEY_SERVICE_CLIENT_TOKEN>
KEY_SERVICE_ADMIN_TOKEN=<same value as api's KEY_SERVICE_ADMIN_TOKEN>
```

---

### `ml-service` variables

```bash
PORT=8000
```

---

## 11. Database Migrations

Migrations run automatically when the `api` container starts. The Dockerfile CMD is:
```
npm run migrate && npm run serve
```

This means:
- On every Railway deploy, migrations are applied before the server starts.
- The process is safe to run repeatedly — migrations are idempotent.
- If a migration fails, the deploy fails and Railway will not route traffic to the new instance.

To manually trigger or inspect migrations, use the Railway **Shell** tab on the `api` service:
```bash
npm run migrate
```

---

## 12. Health Check Verification

After all services are deployed, verify connectivity by hitting the deep health endpoint:

```
GET https://thryftverse-api.railway.app/health/deep
```

Expected response:
```json
{
  "status": "ok",
  "checks": {
    "db": "ok",
    "replica": "not_configured",
    "redis": "ok",
    "keyService": "ok",
    "mlService": "ok",
    "s3": "ok"
  }
}
```

If any check returns `error`:
- `db` → verify `DATABASE_URL` and Neon is running
- `redis` → verify `REDIS_URL` and TLS (`rediss://`)
- `keyService` → verify `KEY_SERVICE_URL` uses Railway internal hostname and correct port 4100
- `mlService` → verify `ML_SERVICE_URL` uses Railway internal hostname and correct port 8000
- `s3` → verify R2 credentials and `S3_FORCE_PATH_STYLE=false`

---

## 13. Mobile App — EAS Build & Store Submission

### 13.1 Prerequisites

| Requirement | Notes |
|---|---|
| Apple Developer account | https://developer.apple.com — $99/year |
| Google Play Console account | https://play.google.com/console — $25 one-time |
| Expo account (Production plan) | https://expo.dev — $99/mo |
| EAS CLI installed | `npm install -g eas-cli` |

### 13.2 App identifiers (already configured)

```
iOS Bundle Identifier:  com.thryftverse.app
Android Package:        com.thryftverse.app
```

### 13.3 Fill in `eas.json`

Open `frontend/eas.json` and replace the placeholder values:

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-real-apple-id@example.com",
      "ascAppId": "1234567890",     ← from App Store Connect → App → General → Apple ID
      "appleTeamId": "ABCDE12345"  ← from developer.apple.com → Membership
    },
    "android": {
      "serviceAccountKeyPath": "./google-service-account.json",
      "track": "production"
    }
  }
}
```

### 13.4 Create `frontend/.env.production`

Copy from `frontend/.env.production.example` and set:

```bash
EXPO_PUBLIC_API_BASE_URL=https://thryftverse-api.railway.app   # your Railway api URL
EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS=false
```

Set the API base to the host only. The mobile client appends the canonical
`/api/v1` prefix. The backend temporarily accepts `/v1/*` and unversioned
routes for compatibility, but unversioned responses are marked deprecated.

### 13.5 Get the Google Service Account JSON

1. Go to Google Play Console → **Setup** → **API access**.
2. Link to a Google Cloud project.
3. Click **Create new service account**.
4. Grant the service account **Release Manager** permissions.
5. Download the JSON key file.
6. Save it as `frontend/google-service-account.json`.
7. This file is already in `.gitignore` — do not commit it.

### 13.6 Build for both platforms

```bash
cd frontend
npm install

# Login to Expo
eas login

# Build for iOS and Android simultaneously
eas build --platform all --profile production
```

EAS builds run on Expo's cloud infrastructure. Build time is approximately:
- iOS: 15–25 minutes
- Android: 10–20 minutes

You will receive an email when builds are complete.

### 13.7 Submit to stores

```bash
# Submit iOS to App Store Connect (TestFlight first, then production)
eas submit --platform ios --profile production

# Submit Android to Google Play (internal track → production)
eas submit --platform android --profile production
```

### 13.8 App Store Connect — iOS (one-time setup before first submission)

1. Go to https://appstoreconnect.apple.com.
2. Click **My Apps** → **+** → **New App**.
3. Fill in:
   - **Platform:** iOS
   - **Name:** Thryftverse
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** `com.thryftverse.app`
   - **SKU:** `thryftverse-ios-1`
4. Complete the **App Information**, **Pricing**, and **App Privacy** sections.
5. Submit for **TestFlight** internal testing first, then submit for **App Review**.

### 13.9 Google Play Console — Android (one-time setup before first submission)

1. Go to https://play.google.com/console.
2. Click **Create app**.
3. Fill in app name, language, app type (App), free/paid.
4. Complete the **Store listing**, **Content rating** questionnaire, and **App content** declarations.
5. Upload the `.aab` file (EAS will do this automatically via `eas submit`).
6. Start with **Internal testing** → promote to **Production** after testing.

---

## 14. DNS & Domain Setup

Your production environment references `thryftverse.app`. Add these DNS records in Cloudflare (or your registrar):

| Type | Name | Value | Purpose |
|---|---|---|---|
| `CNAME` | `api` | `thryftverse-api.railway.app` | Backend API |
| `CNAME` | `cdn` | `pub-<hash>.r2.dev` | Media CDN (or point to R2 custom domain) |
| `CNAME` | `verify` | _(your KYC provider URL)_ | KYC session redirect |
| `TXT` | `@` | _(from Resend)_ | Email SPF |
| `CNAME` | `resend._domainkey` | _(from Resend)_ | Email DKIM |

After setting `api.thryftverse.app` as a custom domain, update Railway:
1. Go to `api` service → **Settings** → **Networking** → **Custom Domain**.
2. Enter `api.thryftverse.app`.
3. Railway will show a `CNAME` target — ensure your DNS points to it.

Then update in `.env.production` and in Expo:
```
EXPO_PUBLIC_API_BASE_URL=https://api.thryftverse.app
```

And rebuild the mobile app with EAS.

---

## 15. Post-Deploy Checklist

Work through this checklist in order after all services are deployed:

- [ ] `GET /api/v1/health/deep` returns all checks as `ok`
- [ ] `POST /api/v1/auth/signup` creates a user and sends a welcome email (check inbox)
- [ ] `POST /api/v1/auth/login` returns access + refresh tokens
- [ ] `POST /uploads/presign` returns a presigned R2 URL; upload a test file and verify it's publicly accessible via `S3_PUBLIC_ENDPOINT`
- [ ] `GET /recommendations/:userId` returns results (ML service is reachable)
- [ ] `GET /realtime/ws` WebSocket connection establishes
- [ ] Stripe webhook endpoint responds: configure `https://api.thryftverse.app/webhooks/stripe` in Stripe dashboard
- [ ] Push notification test: `POST /notifications/push/test` delivers a push notification to a test device
- [ ] 1ze oracle is live: `GET /oracle/gold/latest` returns a valid price
- [ ] KYC flow starts: `POST /compliance/kyc/sessions` returns a session URL
- [ ] Mobile app (TestFlight / internal Android track) connects to production API successfully
- [ ] Sentry dashboard receives at least one event (trigger a test error)
- [ ] Set `API_ENABLE_MOCK_WEBHOOKS=false` is confirmed (it should already be false)

---

## 16. Cost Summary

Monthly estimated cost for a production deployment:

| Service | Provider | Estimated Cost |
|---|---|---|
| PostgreSQL (Pro) | Neon | $19/mo |
| Redis | Upstash | $5–15/mo |
| Object Storage | Cloudflare R2 | $5–20/mo |
| API service | Railway | $10–20/mo |
| Key service | Railway | $5–10/mo |
| ML service | Railway | $5–10/mo |
| Transactional email | Resend | $20/mo |
| Error tracking | Sentry | $26/mo |
| EAS Build (mobile) | Expo Production | $99/mo |
| Apple Developer | Apple | $8/mo ($99/yr) |
| Google Play Console | Google | $25 one-time |
| Domain | Cloudflare/Registrar | $10–15/yr |
| **Total (approx)** | | **~$207–253/mo** |

---

*Document maintained by the Thryftverse engineering team. Update this file when infrastructure changes are made.*

---

## 17. Rollback Runbook

This runbook covers rollback procedures for every layer of the Thryftverse stack. Always roll back in order of blast radius: stop the bleeding first, then restore correctness.

### 17.1 OTA Update Rollback (Expo Updates)

When a bad JS bundle or asset update was pushed via OTA and the native binary is unaffected:

1. **Identify the bad update.**
   ```bash
   eas update:list --channel preview
   eas update:list --channel production
   ```
   Note the update ID and publishing timestamp.

2. **Revert the update on the affected channel.**
   ```bash
   # Revert the most recent update on a specific channel
   eas update:revert --channel preview
   eas update:revert --channel production
   ```
   `eas update:revert` rolls back to the previous update on that channel. Run it once per revert needed (each invocation steps back one update).

3. **Verify the revert.**
   - On a test device, force-close the app and reopen. The `checkAutomatically: ON_LOAD` policy (set in `app.json`) means the app fetches the latest update on next launch.
   - Confirm the runtime version and update ID via `eas update:list` or the Expo dashboard.

4. **If the revert is insufficient** (the previous update is also broken), keep reverting until a known-good update is reached, or fall through to a native rollback (§17.2).

> **Note:** OTA rollbacks only affect users who have already downloaded the bad update. Users who have not yet opened the app will receive the reverted (good) update on next launch.

### 17.2 Native Build Rollback (App Store / Play Store)

When the shipped native binary itself is broken (crash on launch, native module failure):

#### iOS — App Store Connect

1. Go to **App Store Connect → My Apps → Thryftverse → Activity → All Builds**.
2. Select the previous approved build (the last known-good version).
3. If the bad build is still in review, **reject the submission** to prevent it from going live.
4. If the bad build is already live:
   - Submit the previous build for review as a new version (App Store does not support re-activating an old binary directly).
   - Use **Phased Release** to roll out gradually: App Store Connect → Pricing and Availability → Phased Release. You can pause at 1%, 2%, 5%, 10%, 20%, 50% and 100%.
   - If the issue is severe, halt the phased release and submit a hotfix build via EAS:
     ```bash
     cd frontend
     eas build --platform ios --profile production
     eas submit --platform ios --profile production
     ```

#### Android — Google Play Console

1. Go to **Google Play Console → Thryftverse → Production**.
2. Under **Releases**, find the current production release and click **Manage**.
3. Click **Create new release** and upload the previous `.aab` (or a hotfix build).
4. Use **Staged rollout** to control the percentage of users who receive the update (1% → 10% → 50% → 100%).
5. If the bad build has not reached 100%, you can **halt** the rollout immediately from the Console.

#### EAS Build for hotfix

```bash
cd frontend
# Build a hotfix native binary
eas build --platform all --profile production
# Submit to both stores
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

### 17.3 Database Migration Rollback

**Important:** The Thryftverse migration system (`backend/api/src/db/migrate.ts`) is forward-only — it applies `.sql` files from `backend/api/src/db/migrations/` and records them in the `schema_migrations` table. There are **no down migrations** — the 108 SQL migration files do not include reverse/down counterparts, and `migrate.ts` has no rollback command.

To roll back a schema change:

1. **Assess the migration.** Read the offending `.sql` file to understand exactly what it created or altered (tables, columns, indexes, constraints, seed data).

2. **Write a manual revert SQL script.** Craft `DROP`, `ALTER TABLE ... DROP COLUMN`, or `DELETE` statements that reverse the migration. Run it against the production database via the Neon SQL editor or a psql session:
   ```bash
   # Via Neon's connection string (read from DATABASE_URL secret)
   psql "$DATABASE_URL" -f revert_<migration_name>.sql
   ```

3. **Remove the migration record** so the migration system does not consider it applied:
   ```sql
   DELETE FROM schema_migrations WHERE name = '<migration_file_name>.sql';
   ```
   Only do this if you also physically revert the schema. If you keep the schema change but want to re-run a corrected migration, update the file in place and delete the record.

4. **Restore from backup if data was lost.** If the migration corrupted or destroyed data and cannot be manually reversed, restore from the most recent `pg_dump` backup (see §17.5 and the scheduled backup workflow):
   ```bash
   # Restore a custom-format dump
   pg_restore --clean --if-exists --no-owner --no-privileges \
     -d "$DATABASE_URL" backups/thryftverse_<timestamp>.dump
   ```
   **Warning:** Restoring from backup loses all data written after the backup timestamp. Use this only as a last resort.

5. **Coordinate with the backend team.** Any manual schema revert must be reviewed by at least two engineers before execution on production.

### 17.4 Backend Service Rollback (Railway / Docker)

Each backend service (`api`, `key-service`, `ml-service`) is deployed on Railway from a Docker image. Railway retains deployment history.

1. **Identify the last known-good deployment.**
   - Go to **Railway → `<service>` → Deployments**.
   - Find the most recent deployment with a green (healthy) status before the issue started.

2. **Redeploy the previous deployment.**
   - Click the previous deployment → **Redeploy**.
   - Railway will spin up a new instance using the same image tag / commit.
   - Traffic is automatically routed to the new instance once it passes the health check.

3. **If using explicit Docker image tags** (Docker registry):
   ```bash
   # Tag and push a known-good image
   docker tag thryftverse-api:<good-sha> ghcr.io/<org>/thryftverse-api:<good-sha>
   docker push ghcr.io/<org>/thryftverse-api:<good-sha>
   ```
   Then update the Railway service to pull that specific image tag.

4. **Verify the rollback.**
   ```bash
   curl https://api.thryftverse.app/api/v1/health/deep
   ```
   All checks must return `ok`.

5. **Database migrations caveat.** If the bad deployment ran new migrations on startup (the Dockerfile CMD is `npm run migrate && npm run serve`), rolling back the image will not reverse the schema. See §17.3 for migration rollback. The rolled-back image may fail to start if it expects a schema that no longer exists — in that case, revert the migration first, then redeploy the old image.

### 17.5 Frontend State Rollback (Zustand / SecureStore)

If a bad update left corrupt or incompatible state on the device:

1. **Zustand persist store.** The app uses Zustand with `persist` middleware. To clear it:
   - On the device, the persisted state lives in `AsyncStorage` under the store key.
   - A code-level clear can be shipped via OTA:
     ```typescript
     import { useAppStore } from '@/state/store';
     // On next launch, if a "force-clear" flag is set, purge persisted state
     await useAppStore.persist.clearStorage();
     ```
   - Alternatively, instruct affected users to uninstall and reinstall the app.

2. **SecureStore (expo-secure-store).** Sensitive items (auth tokens, biometric keys) are stored in the Keychain/Keystore via `expo-secure-store`.
   - Clear on next launch by shipping an OTA update that deletes known keys:
     ```typescript
     import * as SecureStore from 'expo-secure-store';
     await SecureStore.deleteItemAsync('accessToken');
     await SecureStore.deleteItemAsync('refreshToken');
     ```
   - This forces a re-login on next launch, which is the safest state after a rollback.

3. **Verify.** After the OTA update with the clear logic, affected users will be logged out and start from a clean state. Monitor Sentry for any new errors related to stale state.

### 17.6 Communication Protocol

During any rollback, follow this communication sequence:

| Step | Action | Audience |
|---|---|---|
| 1 | Acknowledge the issue in the `#incidents` Slack/Discord channel | Engineering team, on-call |
| 2 | Post a status update on the public status page (`status.thryftverse.app`) | All users |
| 3 | Notify the product manager and customer support lead | Internal stakeholders |
| 4 | If payment or auth is affected, notify the compliance lead | Compliance, legal |
| 5 | After rollback completes, post a "service restored" update | All users, internal |
| 6 | Schedule a postmortem within 48 hours | Engineering team |

**Status page templates:**

- Investigating: *"We are investigating reports of [symptom]. Some users may experience [impact]. We will update within 30 minutes."*
- Mitigating: *"We have identified the issue and are rolling back [component]. Service should be restored within [ETA]."*
- Resolved: *"The issue has been resolved by rolling back [component]. We will publish a postmortem within 48 hours."*

---

## 18. Incident Response Runbook

### 18.1 Severity Levels

| Severity | Definition | Examples | Response Time |
|---|---|---|---|
| **SEV1** | Total or critical outage; payment, authentication, or data loss | API down, Stripe webhooks failing, auth login broken, DB data corruption | Page on-call immediately; respond within 5 minutes |
| **SEV2** | Partial outage or major feature degraded | Recommendations offline, push notifications failing, WebSocket disconnected, search unavailable | Page on-call; respond within 30 minutes |
| **SEV3** | Degraded performance or minor feature broken | Slow API response (>2s p95), image upload intermittent, a non-critical screen crashes | Notify on-call via Slack; respond within 2 hours |

### 18.2 First Response

1. **Acknowledge.** The first responder posts in `#incidents`:
   ```
   🚨 [SEVx] [brief description] — acknowledged by @responder
   Time: <UTC timestamp>
   Affected: <users/feature>
   ```

2. **Page the on-call engineer** if not already responding. Use the PagerDuty/Opsgenie rotation or the `@oncall` Slack mention.

3. **Create a war room.** Open a dedicated Slack/Discord channel or huddle:
   - Channel name: `#inc-<date>-<short-description>` (e.g., `#inc-20260501-auth-down`)
   - Invite: on-call engineer, backend lead, frontend lead, product manager, DevOps
   - Pin the incident summary and a running timeline

4. **Update the status page.** Post an "Investigating" message (see §17.6 templates).

5. **Assign roles:**
   - **Incident Commander (IC):** coordinates communication, makes go/no-go decisions, owns the timeline. Does not write code.
   - **Responder(s):** investigate and implement the fix.
   - **Communications Lead:** updates the status page and stakeholders. (Can be the IC for SEV3.)

### 18.3 Investigation

1. **Sentry release filter.** Go to Sentry → Issues and filter by the most recent release tag. If the issue appeared after a new deployment, the release filter narrows to errors introduced by that release:
   - Sentry → Releases → select the latest release → compare with previous.
   - Look for new error types, spike in error rate, or TTI (Time to Interactive) regression.

2. **Fastify logs.** The API service logs are available via Railway:
   - Railway → `api` service → **Logs** tab.
   - Filter by error level: search for `"level":50` (error) or `"level":40` (warn) in the structured JSON logs.
   - Check for repeated 5xx responses, database connection errors, or timeout patterns.

3. **Database query logs.** Neon provides query insights:
   - Neon Console → **Query Insights** / **Slow Queries**.
   - Look for queries that suddenly increased in duration or that are blocking other queries.
   - Check for lock contention: `SELECT * FROM pg_locks WHERE NOT granted;`
   - Check active connections: `SELECT count(*) FROM pg_stat_activity;`

4. **EAS Observe / TTI regression.** If the issue is mobile-side:
   - Use `eas update:list` to verify which update is live on each channel.
   - Check Expo dashboard for update adoption metrics.
   - If TTI regressed (app takes too long to become interactive), inspect the most recent OTA update for heavy synchronous work on the JS thread.
   - Use Sentry Performance (if enabled) to compare TTI/FCP across releases.

5. **Redis / Upstash.** Check the Upstash console for:
   - Connection count and memory usage.
   - Evicted keys (may indicate cache thrashing).
   - Slow commands log.

6. **S3 / R2.** Check Cloudflare R2 dashboard for:
   - Upload error rate.
   - Bucket storage and request metrics.

### 18.4 Mitigation

Choose the fastest action that stops the bleeding, in priority order:

1. **Feature flag disable.** If the issue is isolated to a feature behind a flag:
   - Disable the flag via the admin API or environment variable.
   - This is the lowest-risk mitigation — no rollback needed.

2. **Rate limit increase.** If the API is being overwhelmed (thundering herd, retry storm):
   - Temporarily increase rate limits via environment variables on Railway and redeploy.
   - Or enable a circuit breaker if one exists for the affected endpoint.

3. **OTA hotfix.** If the issue is in the JS bundle and a fix is ready:
   ```bash
   cd frontend
   eas update --channel preview --message "hotfix: <description>"
   eas update --channel production --message "hotfix: <description>"
   ```
   OTA updates reach users on next app launch (within minutes for active users).

4. **Native rollback.** If the issue is in the native binary, see §17.2.

5. **Backend rollback.** If the issue is in a backend service, see §17.4.

6. **Database rollback.** If the issue is a bad migration, see §17.3.

7. **Traffic shedding.** As a last resort, if the system is under catastrophic load:
   - Enable a maintenance page on Railway (return 503 from a health check).
   - Shed non-critical traffic (recommendations, search, notifications) and keep only auth + payments alive.

### 18.5 Resolution

1. **Confirm recovery.** Before declaring resolved:
   - `GET /api/v1/health/deep` returns all checks `ok`.
   - Sentry error rate returns to baseline.
   - API p95 latency is under threshold.
   - No new user reports for 15 minutes.

2. **Close the incident.**
   - Post a "Resolved" update on the status page.
   - Post a summary in `#incidents` and close the war room channel.

3. **Postmortem.** Within 48 hours, create a postmortem document using this template:

   ```markdown
   # Postmortem: [Incident Title]

   **Date:** [UTC date]
   **Severity:** SEVx
   **Duration:** [start → end, in minutes]
   **Incident Commander:** [name]
   **Responders:** [names]

   ## Summary
   [1–2 sentence description of what happened and user impact]

   ## Timeline (all times UTC)
   | Time | Event |
   |---|---|
   | HH:MM | Alert triggered / user report |
   | HH:MM | On-call acknowledged |
   | HH:MM | Root cause identified |
   | HH:MM | Mitigation applied |
   | HH:MM | Service restored |
   | HH:MM | Incident closed |

   ## Root Cause
   [Technical explanation of why the issue occurred]

   ## Impact
   - Users affected: [number or %]
   - Requests failed: [count]
   - Revenue impact: [if applicable]

   ## What Went Well
   - [e.g., alert fired within 1 minute]

   ## What Went Poorly
   - [e.g., rollback took 40 minutes due to unclear runbook]

   ## Action Items
   | Action | Owner | Due | Status |
   |---|---|---|---|
   | [e.g., Add down migrations for payments tables] | [name] | [date] | open |
   | [e.g., Add alert for Stripe webhook failure rate > 1%] | [name] | [date] | open |

   ## Lessons Learned
   [Process or architecture improvements]
   ```

4. **Action items tracking.** All postmortem action items must be tracked as GitHub issues with the `incident-action-item` label and an assigned owner and due date. The IC is responsible for verifying all items are created within 48 hours.

### 18.6 On-Call Rotation Guidance

- **Rotation cadence:** Weekly rotation (Monday 00:00 UTC → next Monday 00:00 UTC).
- **Primary on-call:** First responder for all alerts. Must be reachable within 5 minutes for SEV1.
- **Secondary on-call:** Backup if primary is unreachable. Takes over if primary is already handling an incident.
- **Handoff:** On Monday, the outgoing primary writes a handoff note in `#oncall` covering any open issues, ongoing investigations, and watch-items.
- **Follow-the-sun:** If the team spans time zones, align rotation so primary on-call is always in a waking timezone.
- **No-code-freeze policy:** On-call engineers do not deploy non-urgent changes during their shift to avoid self-inflicted incidents.
- **Alert fatigue:** If an alert fires more than 3 times without a real incident, it must be tuned or silenced within 24 hours. File a GitHub issue with label `alert-tuning`.
