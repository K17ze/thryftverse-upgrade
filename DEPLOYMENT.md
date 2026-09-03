# Thryftverse — Production Deployment & Jurisdictional Resilience Guide

> **Audience:** DevOps / backend team responsible for provisioning and deploying the production environment, plus founders/legal counsel advising on jurisdictional structure.
> **Last updated:** August 2026
> **Stack:** Node.js API (Fastify) · Key Service (Node.js) · ML Service (Python/FastAPI) · PostgreSQL · Redis · S3-compatible object storage · Expo React Native mobile app
> **Resilience posture:** This guide now covers both *how to deploy* (§§1–18) and *how to deploy so no single government or entity can seize, block, or compel the entire platform* (§§19–25). The latter is the "Telegram playbook" — studied, adapted, and honestly assessed for what it can and cannot achieve.

---

## Table of Contents

**Operational deployment (existing):**

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
17. [Rollback Runbook](#17-rollback-runbook)
18. [Incident Response Runbook](#18-incident-response-runbook)

**Jurisdictional resilience & scalable sovereignty (new, August 2026):**

19. [Jurisdictional Resilience Strategy — The Telegram Playbook, Honestly Assessed](#19-jurisdictional-resilience-strategy--the-telegram-playbook-honestly-assessed)
20. [Multi-Region Scaling Path](#20-multi-region-scaling-path)
21. [Legal Structure Layering](#21-legal-structure-layering)
22. [Data Residency & Sovereign Hosting](#22-data-residency--sovereign-hosting)
23. [Alternative App Distribution for Blocked Regions](#23-alternative-app-distribution-for-blocked-regions)
24. [The Psychology of Each Jurisdictional Decision](#24-the-psychology-of-each-jurisdictional-decision)
25. [Threat Model & Honest Limits](#25-threat-model--honest-limits)
26. [Sources & Citations (August 2026)](#26-sources--citations-august-2026)

**Multi-country deployment (new, September 2026):**

27. [Multi-Country Deployment Matrix](#27-multi-country-deployment-matrix)
28. [Per-Region Payment Provider Setup](#28-per-region-payment-provider-setup)
29. [Per-Region Regulatory Compliance](#29-per-region-regulatory-compliance)
30. [Per-Region App Distribution](#30-per-region-app-distribution)
31. [Per-Region KYC Configuration](#31-per-region-kyc-configuration)
32. [Multi-Currency & Localization](#32-multi-currency--localization)
33. [Per-Region Tax Compliance](#33-per-region-tax-compliance)
34. [Per-Region Shipping Integration](#34-per-region-shipping-integration)
35. [Per-Region Data Residency](#35-per-region-data-residency)
36. [Multi-Country Launch Checklist](#36-multi-country-launch-checklist)
37. [Validation Report — September 2026](#37-validation-report--september-2026)

---

## 1. Architecture Overview

### 1.1 Day-1 launch configuration (EU-jurisdiction, §§2–18 + §20)

```
┌──────────────────────────────────────────────────────────┐
│                      Mobile App                          │
│   iOS App Store · Google Play · Direct APK · Self-OTA    │
│               Expo React Native — EAS Build              │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS + Cloudflare Anycast
                         ▼
┌──────────────────────────────────────────────────────────┐
│              Cloudflare (global anycast)                 │
│   DNS · WAF · R2 (EU jurisdiction bucket) · CDN          │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│           Railway Amsterdam (EU, primary)                │
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
    │  Neon EU   │   │  Upstash EU │   │ Cloudflare R2  │
    │ PostgreSQL │   │   Redis     │   │  (EU bucket)   │
    │  Amsterdam │   │  EU West    │   │  jurisdiction  │
    └────────────┘   └─────────────┘   │  = "eu"        │
                                       └────────────────┘
```

**Day-1 jurisdictional exposure:** Backend + data + Redis + object storage + key-service all in **EU (Amsterdam, GDPR jurisdiction)**. DNS via Cloudflare anycast (global, no single seizure point). Payments multi-provider (Stripe US for cards, Razorpay IN, Mollie EU, Wise UK — no single payment jurisdiction). Build/distribution via Expo/Apple/Google (US — but these only touch build artifacts and store distribution, not user data). Legal structure: BVI holding + Swiss/Dubai operating + Foundation stake (formed pre-launch per §21). This is the Telegram playbook adapted for a commerce platform — see §§19–25.

### 1.2 Target (multi-jurisdiction, after §§19–25)

```
                    ┌─────────────────────────┐
                    │   Mobile App (global)   │
                    │  App Store / Play /     │
                    │  Direct APK / OTA /     │
                    │  Third-party stores     │
                    └───────────┬─────────────┘
                                │ HTTPS + Anycast DNS
                                ▼
              ┌──────────────────────────────────┐
              │   Cloudflare (anycast, global)   │ ← DNS + WAF + R2 (EU jurisdiction)
              │   NOT a single point of seizure  │
              └─────────────────┬────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
  │  EU region  │       │  IN region  │       │  SG region  │
  │  (Amsterdam)│       │  (Mumbai)   │       │ (Singapore) │
  │  api + key  │       │  api + key  │       │  api + key  │
  │  Neon EU    │       │  Neon IN    │       │  Neon SG    │
  │  Upstash EU │       │  Upstash IN │       │  Upstash SG │
  └─────────────┘       └─────────────┘       └─────────────┘
         │                      │                      │
         └──────────┬───────────┘──────────────────────┘
                    ▼
         ┌────────────────────────┐
         │  Legal: BVI holding    │  ← Telegram Group Inc. pattern
         │  + Dubai/Swiss operating│ ← Telegram FZ-LLC / Proton AG pattern
         │  + Foundation governance │ ← Signal/Proton pattern (anti-buyout)
         └────────────────────────┘
```

**Key difference from current:** No single jurisdiction contains all of: the legal entity, the servers, the team, the DNS, the payments, and the data. A government can compel *one layer* but not *all layers simultaneously*.

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

### 17.7 Staged OTA Rollout Procedure

Per the 2026 August Expo EAS Update production playbook, OTA updates must use staged rollouts gated by EAS Observe metrics (crash rate, TTI regression). Each stage is published via the **OTA Staged Rollout** GitHub Actions workflow (`.github/workflows/ota-staged-rollout.yml`), which runs typecheck + tests before publishing and targets a GitHub `environment` (`production` or `preview`) so manual approval gates can be enforced between stages.

| Stage | Rollout | Minimum monitor window | Gate before progressing |
|---|---|---|---|
| 1 | 1% | 1 hour | EAS Observe crash rate ≤ 1% and no TTI regression > 20% |
| 2 | 10% | 4 hours | EAS Observe crash rate ≤ 1% and no TTI regression > 20% |
| 3 | 25% | 8 hours | EAS Observe crash rate ≤ 1% and no TTI regression > 20% |
| 4 | 50% | 24 hours | EAS Observe crash rate ≤ 1% and no TTI regression > 20% |
| 5 | 100% | Full rollout | Mark complete; continue monitoring for 24 hours |

**Procedure:**

1. **Stage 1 — Publish at 1%.** Trigger the *OTA Staged Rollout* workflow with `channel=production`, `rollout_percentage=1`, and a descriptive `message`. After it succeeds, open EAS Observe and monitor the crash rate and TTI for **1 hour**.
2. **Stage 2 — Progress to 10%.** Re-trigger the workflow with `rollout_percentage=10` and the same `message`. Monitor EAS Observe for **4 hours**.
3. **Stage 3 — Progress to 25%.** Re-trigger with `rollout_percentage=25`. Monitor for **8 hours**.
4. **Stage 4 — Progress to 50%.** Re-trigger with `rollout_percentage=50`. Monitor for **24 hours**.
5. **Stage 5 — Progress to 100%.** Re-trigger with `rollout_percentage=100` for the full rollout. Continue monitoring for 24 hours after completion.

**Abort criteria — trigger rollback immediately:**

- Crash rate > **1%** at any stage, OR
- TTI regression > **20%** versus the previous baseline, OR
- Any SEV1/SEV2 incident attributed to the OTA update.

When abort criteria are met, trigger the **OTA Rollback** workflow (`.github/workflows/ota-rollback.yml`) with `channel=production` and `method=rollback` (rolls back to the embedded bundle) or `method=republish` (republish a prior update group via the EAS CLI). Follow §17.6 for incident communication.

**Workflow links:**

- Staged rollout: [`.github/workflows/ota-staged-rollout.yml`](.github/workflows/ota-staged-rollout.yml)
- Rollback: [`.github/workflows/ota-rollback.yml`](.github/workflows/ota-rollback.yml)

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

---

## 19. Jurisdictional Resilience Strategy — The Telegram Playbook, Honestly Assessed

> **Honest premise:** You cannot fully "escape" government control. Every server is in some jurisdiction. Every person is in some jurisdiction. Every payment provider is regulated somewhere. Pavel Durov was detained in France in August 2024 despite Telegram's BVI holding, Dubai operating entity, and distributed servers. The goal is **resilience and reduced exposure**, not invulnerability. The goal is that no *single* government can seize, block, or compel the *entire* platform with one order. That is achievable. Total immunity is not.

### 19.1 What Telegram actually did (verified, August 2026)

| Layer | Telegram's choice | Why | Verified source |
|---|---|---|---|
| **Holding entity** | Telegram Group Inc. — British Virgin Islands (BVI) | Tax-neutral, English common law, no foreign ownership restrictions, globally recognised by banks/investors | LegalClarity, NZZ, RevenueMemo (2026) |
| **Operating entity** | Telegram FZ-LLC — Dubai Media City, UAE | Low tax, minimal regulatory interest in internal operations, residency available for team | examineip AS62041, NZZ |
| **Servers** | Own ASN (AS62041, RIPE-registered), DCs in Amsterdam, Frankfurt, Singapore | Own infrastructure = no cloud provider can be compelled to shut them down; multi-jurisdiction = no single government seizure | examineip, SourceFeed |
| **Data architecture** | Sticky home-DC: account sticks to one DC, files stay where uploaded, clients handle `MIGRATE_X` redirects | Spreads legal control of cloud-chat data across jurisdictions; each DC is independently operable | SourceFeed |
| **Ownership** | Durov holds >50% through BVI/Dubai entity network; no VC, no board | No external pressure points; but **this is the fatal flaw** — one person = one pressure point | RevenueMemo, LegalClarity |
| **Funding** | No traditional VC; ads + subscriptions + TON (crypto) | No investor jurisdiction to pressure; TON brought Telegram back as primary steward in May 2026 | RevenueMemo |

### 19.2 What Proton did (the privacy-first alternative)

| Layer | Proton's choice | Why | 2026 update |
|---|---|---|---|
| **Jurisdiction** | Switzerland (Proton AG, Geneva) | Outside EU/US; Swiss Criminal Code §271 prohibits sharing with foreign law enforcement without Swiss court approval; constitutional right to privacy | **Moving some infrastructure OUT of Switzerland** in 2026 due to VÜPF surveillance ordinance amendments — relocated Lumo AI to Germany/Norway. Switzerland is no longer unconditional. |
| **Ownership** | Proton Foundation (Swiss non-profit) since June 2024 | Structurally rules out VC/PE acquisition pressure; no profit motive to compromise privacy | EU Vetted (2026) |
| **Infrastructure** | Own Swiss datacentres, ISO 27001 | No cloud provider dependency for encrypted data at rest | heise (2026) |
| **Sub-processors** | US vendors (Stripe, Zendesk) only for ancillary, non-content functions | CLOUD Act exposure rated "none" for encrypted mailbox data | EU Vetted |

### 19.3 What Signal did (the non-profit maximalist approach)

| Layer | Signal's choice | Why |
|---|---|---|
| **Entity** | Signal Foundation (501(c)(3) nonprofit, US) + Signal Messenger LLC (subsidiary) | No shareholders, no equity, cannot be sold or acquired; if dissolved, assets go to another nonprofit. "The inability to cash out is the single strongest structural protection." |
| **Funding** | Donations + Brian Acton's $50M seed | No ads, no investors, no data monetization pressure |
| **Servers** | US-based | Accepts US jurisdiction but minimises data held (E2E encrypted, minimal metadata) |

### 19.4 The three proven patterns, distilled

```
Pattern A — Telegram (jurisdictional arbitrage):
  BVI holding + Dubai operating + own ASN + multi-jurisdiction DCs
  Strength: no single cloud provider to compel
  Weakness: single-person ownership = single pressure point (Durov arrest proved this)

Pattern B — Proton (Swiss fortress + foundation):
  Swiss jurisdiction + own datacentres + non-profit foundation ownership
  Strength: strongest legal privacy protections + no acquisition pressure
  Weakness: Switzerland is not static (VÜPF 2026 proves jurisdictions drift)

Pattern C — Signal (non-profit + minimal data):
  US nonprofit + E2E encryption + hold almost nothing
  Strength: cannot be compelled to hand over what you don't have
  Weakness: still under US jurisdiction; depends on encryption doing the work
```

### 19.5 Recommended ThryftVerse pattern — Hybrid (B + A elements)

ThryftVerse is a commerce platform, not a messaging app. It *must* hold transaction data, payment records, and shipping addresses — it cannot be Signal. But it can borrow from Proton (foundation governance + strong jurisdiction) and Telegram (distributed infrastructure + jurisdictional layering).

**Recommended structure:**

```
Legal:     BVI holding (ThryftVerse Group Ltd) — owns IP, brand, contracts
           + Swiss or Dubai operating entity — employs team, signs vendor contracts
           + Foundation stake (10-20%) — blocks hostile acquisition, signals mission

Infrastructure: Multi-region (EU + IN + SG), no single cloud provider holds all layers
                Cloudflare (anycast DNS + WAF, jurisdictional R2) — cannot be seized in one place
                Neon/Upstash replicas per region — data residency per market
                Key-service in EU jurisdiction (strongest encryption-at-rest protections)

Payments:  Stripe (US) for cards — unavoidable, it's the industry standard
           + Razorpay (IN) for India — local provider, Indian jurisdiction
           + Mollie (EU) for Europe — Dutch jurisdiction, GDPR-bound
           + Wise (UK) for cross-border payouts — UK jurisdiction
           No single payment jurisdiction.

Team:      Distributed across at least 2 jurisdictions (no single government can detain all key personnel)

Data:      Encryption at rest (key-service, already implemented)
           + User data residency per region (EU users → EU DC, IN users → IN DC)
           + No bulk data export capability — no single API call dumps all user data
```

### 19.6 What this does NOT do (honest limits)

- Does not make ThryftVerse immune to lawful court orders in any jurisdiction where it operates.
- Does not prevent a government from blocking the app's DNS or IP in their country (only alternative distribution — §23 — addresses that).
- Does not prevent payment providers from cutting service (Stripe can always de-platform; the multi-provider routing is the mitigation).
- Does not prevent a founder from being detained (the Durov lesson — distribute ownership and decision-making, not just servers).
- Does not exempt ThryftVerse from tax, AML/KYC, or marketplace facilitator obligations in any jurisdiction where it has sellers or buyers.

**This is risk reduction, not risk elimination. The goal is that seizing the platform requires coordinated action across multiple jurisdictions simultaneously, which is harder, slower, and more visible than compelling a single US vendor.**

---

## 20. Day-1 Multi-Region Launch Configuration

> **Decision:** ThryftVerse launches in the EU-jurisdiction-resilient configuration from day one. There is no "Phase 0 = 100% US" step. The first production deploy is already in Amsterdam with EU-jurisdiction R2, EU Neon, EU Upstash, and the key-service in the EU. IN and SG regions are added when those country clusters have real users — but the architecture is ready for them on day one.

### 20.1 Why day-one, not phased

A 2025 Cloudflare analysis of 10,000 web apps found that **76% of multi-region apps had no measurable latency advantage** for end users — multi-region for *latency* alone is usually over-engineering [[Vibe Coder Blog, 2026](https://blog.vibecoder.me/multi-region-deployment-low-latency)]. But ThryftVerse is going multi-region for **jurisdictional resilience**, not latency. The rationale:

- **Legal structure is hard to change post-launch.** Moving the primary database jurisdiction after you have users means migrating their data across borders — which itself triggers GDPR/DPDP transfer notifications. Launching in the right jurisdiction from day one avoids this.
- **Vendor accounts are tied to regions at creation.** A Neon project created in US-east cannot be "moved" — you create a new one in EU West and migrate. Creating in the right region first is free; migrating later costs engineering time + downtime.
- **The cost delta is negligible.** Neon, Upstash, Railway, and Cloudflare R2 all charge the same in EU regions as in US regions. The only delta is ~$0–30/mo for R2 EU jurisdictional storage. There is no financial reason to launch US-first.
- **Reputation is set at launch.** A platform that launches as "EU-jurisdiction, multi-provider, foundation-governed" sends a different signal than one that launches US-only and "promises to move later." Users and adversaries both calibrate at launch.

### 20.2 Day-1 launch configuration (the actual deploy target)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile App                               │
│   iOS App Store · Google Play · Direct APK · Self-hosted OTA    │
│                  Expo React Native — EAS Build                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + Cloudflare Anycast DNS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            Cloudflare (global anycast, NOT a US seizure point)   │
│   DNS · WAF · R2 (EU jurisdiction bucket) · CDN                  │
│   Source: Cloudflare R2 jurisdictional buckets — verified        │
│   Aug 2026, GitHub issue #5513 fixed, Pages+Workers both support │
│   https://github.com/cloudflare/workers-sdk/issues/5513          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────────┐
        ▼                  ▼                      ▼
  ┌──────────────┐  ┌──────────────┐      ┌──────────────┐
  │  EU (primary)│  │  IN (replica)│      │  SG (replica)│
  │  Amsterdam   │  │  Singapore*  │      │  Singapore   │
  │  ─────────── │  │  ─────────── │      │  ─────────── │
  │  Railway api │  │  Neon SG     │      │  Neon SG     │
  │  key-service │  │  (logical    │      │  (logical    │
  │  ml-service  │  │   replication│      │   replication│
  │  Neon primary│  │   from EU)   │      │   from EU)   │
  │  Upstash EU  │  │  Upstash IN  │      │  Upstash SG  │
  │  R2 EU bucket│  │  Railway SG  │      │  Railway SG  │
  │              │  │  (closest)   │      │              │
  │  * Neon has  │  │              │      │              │
  │    no Mumbai │  │              │      │              │
  │    region —  │  │              │      │              │
  │    Singapore │  │              │      │              │
  │    is closest│  │              │      │              │
  └──────────────┘  └──────────────┘      └──────────────┘
        │                  │                      │
        │    Key-service STAYS in EU (encryption   │
        │    keys under EU law — no key disclosure │
        │    mandate equivalent to UK RIPA)        │
        │                                          │
        ▼                                          ▼
  ┌──────────────────────────────────────────────────────┐
  │  Legal: BVI holding + Swiss/Dubai operating +        │
  │  Foundation stake (formed pre-launch, see §21)       │
  └──────────────────────────────────────────────────────┘
```

### 20.3 Day-1 infrastructure provisioning (concrete steps)

These replace the region selections in §§4–9. Follow the *original steps* in those sections but with these region/jurisdiction choices:

| Service | Original (§) | Day-1 region | Jurisdiction |
|---|---|---|---|
| Neon PostgreSQL | §4 | **EU West (Amsterdam)** — `eu-west-2.aws.neon.tech` | EU (GDPR) |
| Upstash Redis | §5 | **EU West 1** — `trusty-xxx.upstash.io` | EU (GDPR) |
| Cloudflare R2 | §6 | **EEUR (Eastern Europe)** + `jurisdiction: "eu"` in wrangler | EU (data cannot be replicated to US by Cloudflare) |
| Railway (api, key, ml) | §9 | **Amsterdam** for all 3 services | EU (GDPR) |
| Key-service env | §10 | `KEY_SERVICE_REGION=eu-west`, `KEY_SERVICE_COUNTRY=NL` (already set) | EU (NL — strongest encryption protections) |
| Resend (email) | §7 | EU region (Resend supports EU sending region) | EU |
| Sentry (errors) | §8 | EU-hosted Sentry (Sentry offers EU data residency, `sentry.io/organizations/<org>/settings/data-residency/`) | EU |
| Expo EAS Build | §13 | US (unavoidable — Expo is US-only for build compute) | US (build artifacts only, not user data) |
| Apple / Google | §13 | US (unavoidable for store submission) | US (store distribution only) |

**What is US-only on day one (and why that is acceptable):**
- **Expo EAS Build** — build compute only; produces signed binaries. No user data flows through Expo. The *runtime* (OTA updates) can be self-hosted in EU (see §23.3).
- **Apple App Store / Google Play** — distribution channels only. The app talks to the EU backend, not to Apple/Google, after install.
- **Stripe (cards)** — payment processing. Stripe is US-regulated but card data is PCI-scoped and never touches ThryftVerse servers. Multi-provider routing (Razorpay IN, Mollie EU, Wise UK) ensures Stripe is not the only payment path.

### 20.4 IN and SG regions — ready on day one, deployed when users demand

The architecture is multi-region-ready from day one. The IN and SG replicas are provisioned when:

| Region | Trigger to provision | What gets deployed |
|---|---|---|
| **IN (Singapore — closest to India)** | First 1,000 Indian MAU OR when Razorpay goes live (whichever first) | Neon Singapore (logical replication from EU primary — Neon has no Mumbai region), Upstash Mumbai (ap-south-1), Railway Singapore (closest to IN), Cloudflare geo-rule routing IN users to SG read path |
| **SG (Singapore)** | First 1,000 Asia-Pacific MAU outside IN | Neon Singapore replica, Upstash Singapore, Railway Singapore, Cloudflare geo-rule routing CHINA_NEARBY + GLOBAL-Asia users to SG |

**Why not provision IN/SG on day one with zero users:** cost. Each region adds ~$40–80/mo in replica compute + storage. With zero users, that is pure burn. The architecture is ready; the deploy is gated on real demand. This is not "phasing in resilience" — the resilience (EU primary, multi-provider, distributed jurisdiction) is already live. The IN/SG replicas are *latency* optimizations, not *resilience* additions.

### 20.5 Railway multi-region specifics (August 2026)

> **Verified August 2026:** Railway's official documentation lists **4 metal regions**: US West (California), US East (Virginia), EU West (Amsterdam), and Southeast Asia (Singapore) [[Railway docs, 2026](https://docs.railway.com/deployments/regions)]. A Railway blog post mentions "seven regions" as a forward-looking statement, but the docs and the multi-region failover guide confirm only 4 are currently available [[Railway multi-region guide, 2026](https://docs.railway.com/guides/multi-region-api-failover)]. The blog's additional regions are part of the Gen2 hardware rollout planned for Q3 2026 and beyond [[Railway Summer 2026 update](https://blog.railway.com/p/railway-summer-update-2026)].

Railway's 4 metal regions:

| Name | Location | Region identifier |
|---|---|---|
| US West Metal | California, USA | `us-west2` |
| US East Metal | Virginia, USA | `us-east4-eqdc4a` |
| EU West Metal | Amsterdam, Netherlands | `europe-west4-drams3a` |
| Southeast Asia Metal | Singapore | `asia-southeast1-eqsg3a` |

A service's region can change with **no downtime** unless a volume is attached. For stateless services (api, key-service, ml-service), deploy replicas across regions using `multiRegionConfig` in `railway.json` or the dashboard Scale section. Railway routes traffic to the nearest healthy region automatically. **Keep replicas stateless** — no sticky sessions, no local volumes. All state goes to Neon/Upstash/R2.

> **Railway limitation (honest):** Railway has only 4 metal regions with a single EU option (Amsterdam) and nothing in South America, Middle East, Oceania, or Africa [[ComparEdge, 2026](https://comparedge.com/tools/railway/deployment-regions)]. For IN users, the closest Railway region is Singapore (~50ms from Mumbai). If IN latency becomes critical, consider Fly.io (Mumbai region available) or direct AWS ECS in `ap-south-1` as a future evolution.

### 20.6 Neon replica specifics

**Important (verified August 2026):** Neon read replicas are **same-region only** — they cannot be created in a different region than the primary project [[Neon docs, 2026](https://neon.com/docs/introduction/read-replicas)]. Cross-region replication requires creating a **separate Neon project** in the target region and using **Neon-to-Neon logical replication** (publications + subscriptions) [[Neon docs, 2026](https://neon.com/docs/guides/logical-replication-neon-to-neon)]. This is a critical architectural constraint:

- **Same-region read replicas** (within EU): Lightweight, provision in seconds, decoupled compute/storage [[Neon Blog, 2026](https://neon.com/blog/the-problem-with-postgres-replicas)]. Use for read-scaling within the EU region.
- **Cross-region "replicas"** (EU → SG/US): Must be **separate Neon projects** with logical replication. This means the SG/US "replica" is actually an independent database that receives streamed changes via Postgres logical replication. It has its own compute, its own storage, and replication lag depends on network distance.

**Neon's available regions (verified August 2026):**
- AWS US East (N. Virginia) — `aws-us-east-1`
- AWS US East (Ohio) — `aws-us-east-2`
- AWS US West (Oregon) — `aws-us-west-2`
- AWS Europe (Frankfurt) — `aws-eu-central-1`
- AWS Europe (London) — `aws-eu-west-2`
- AWS Asia Pacific (Singapore) — `aws-ap-southeast-1`
- AWS Asia Pacific (Sydney) — `aws-ap-southeast-2`
- AWS South America (São Paulo) — `aws-sa-east-1`

> **Neon has NO Mumbai region.** The closest Neon region to India is Singapore (`aws-ap-southeast-1`, ~50ms from Mumbai). For true Mumbai-latency Postgres, consider AWS RDS in `ap-south-1` or Fly.io (Mumbai region available) as a future evolution. For day-one, Singapore is sufficient — the latency difference between Singapore and Mumbai for read queries is ~30-50ms, which is acceptable for a commerce platform.

Route read-heavy queries (feed, listings, recommendations) to the nearest cross-region logical replica. Writes always go to the EU primary — the primary's region is chosen for *jurisdiction*, not latency.

### 20.7 Active-active writes (future, not day one)

Active-active multi-region writes require either CockroachDB, Neon's global writes, or application-level sharding by user region. High complexity, high cost, only justified at >100K MAU with genuine write-latency complaints [[Vibe Coder Blog, 2026](https://blog.vibecoder.me/multi-region-deployment-low-latency)]. **Do not attempt on day one.** The day-one architecture is single-write-primary (EU) + read-replicas (IN/SG when provisioned). This is the correct starting point.

---

## 21. Legal Structure Layering

> **Disclaimer:** This section is a pattern guide based on publicly verified structures used by Telegram, Proton, Signal, and BVI fintech companies as of August 2026. It is not legal advice. Engage a qualified cross-border corporate lawyer before implementing any of these structures. The patterns are legitimate jurisdictional arbitrage — they are not tax evasion or money laundering, and they must be implemented with full compliance with AML/KYC, FATCA/CRS, economic substance, and beneficial ownership rules in every relevant jurisdiction.

### 21.1 The holding + operating split

```
ThryftVerse Group Ltd (BVI)          ← Holding: owns IP, brand, domain, contracts
  │
  ├── ThryftVerse Operations AG (CH)  ← Operating: employs team, signs vendor contracts
  │   or ThryftVerse FZ-LLC (Dubai)   ← Alternative: Dubai if team is there
  │
  ├── ThryftVerse Foundation (CH)     ← Mission-locked stake (10-20% of equity)
  │                                    ← Blocks hostile acquisition (Proton/Signal pattern)
  │
  └── ThryftVerse Payments Ltd (??)   ← Payments sub-entity (jurisdiction depends on
                                        primary payment regulator)
```

### 21.2 Why BVI for the holding (verified, 2026)

- Zero tax on foreign income; no corporate, capital gains, or inheritance tax
- One director, one shareholder, no residency requirements — accessible for single founders
- English common law — globally recognised by banks and investors
- 356,000+ business companies registered; established fintech precedent
- BVI Business Companies Act blends UK + Delaware company law — "transaction fluent" with US/UK counsel
- **But:** economic substance requirements apply (must have real activity in BVI or qualify as a holding entity with pure equity holding); FATCA/CRS reporting applies; beneficial ownership registry exists

### 21.3 Why Switzerland or Dubai for the operating entity

**Switzerland (Proton pattern):**
- Outside EU and US jurisdiction
- Swiss Criminal Code §271: companies cannot share info with foreign law enforcement under criminal penalty
- Constitutional right to privacy + strict data protection (FADP)
- **2026 caveat:** VÜPF surveillance ordinance amendments are pushing Proton to move some infrastructure to Germany/Norway. Switzerland is not unconditional. Monitor.
- Requires genuine substance: majority of leadership, board, employees, main datacentre in Switzerland

**Dubai (Telegram pattern):**
- Low tax, minimal regulatory interest in internal operations
- Residency available for team members
- UAE has data protection law (Federal Decree-Law No. 45 of 2021) but enforcement is lighter than EU
- **2026 caveat:** UAE has been increasing cooperation with international law enforcement; not a privacy fortress in the Swiss sense

**Recommendation for ThryftVerse:** Switzerland if the priority is privacy/legal protection; Dubai if the priority is team residency and low friction. They are not mutually exclusive — Proton shows you can have a Swiss operating entity with infrastructure partially in Germany/Norway.

### 21.4 The Foundation stake (anti-acquisition lock)

Proton (June 2024) and Signal (2018) both use a foundation/non-profit structure to prevent acquisition pressure. For ThryftVerse:

- Transfer 10–20% of equity to a Swiss foundation (Stiftung) or a purpose trust
- The foundation's charter mandates that it cannot sell its stake to a for-profit buyer and must vote against any acquisition that compromises the platform's mission
- This structurally prevents a hostile buyout — no acquirer can reach 100% without the foundation's consent
- It also signals to users that the platform is mission-aligned, not exit-aligned

### 21.5 What this costs (rough, 2026)

| Item | One-time | Ongoing |
|---|---|---|
| BVI company formation (via registered agent) | $1,500–3,000 | $400–800/yr (registered agent + government fees) |
| Swiss GmbH/AG formation | $2,000–5,000 | $1,500–3,000/yr (accounting, registered office) |
| Swiss Foundation (Stiftung) | $3,000–8,000 | $1,000–2,000/yr |
| Cross-border tax/legal advice (setup) | $5,000–15,000 | $3,000–8,000/yr (ongoing compliance) |
| **Total** | **~$11,500–31,000** | **~$5,900–13,800/yr** |

This is the cost of jurisdictional resilience. It is not cheap, but it is far cheaper than a single adverse government action that shuts down the platform.

---

## 22. Data Residency & Sovereign Hosting

### 22.1 The principle

User data should reside in the jurisdiction of the user's region, not in a single global database under one jurisdiction. This means:

- EU users → EU datacentre (GDPR, no CLOUD Act for data at rest in EU)
- IN users → IN datacentre (DPDP Act 2023)
- SG/Asia users → SG datacentre (PDPA)
- US users → US datacentre (acceptable, US jurisdiction)

### 22.2 Day-1 implementation (EU primary, IN/SG on demand)

| Layer | Day-1 (launch) | IN (when ≥1K MAU) | SG (when ≥1K APAC MAU) |
|---|---|---|---|
| Neon Postgres | **EU West primary (Frankfurt or London)** | + Singapore logical replication (separate project) | + Singapore logical replication (separate project) |
| Upstash Redis | **EU West** | + Mumbai (ap-south-1) | + Singapore |
| Cloudflare R2 | **`jurisdiction: "eu"` bucket** | + APAC bucket (if needed) | + APAC bucket (if needed) |
| Railway compute | **Amsterdam (all 3 services)** | + Singapore (closest to IN) | + Singapore (second) |
| Key-service | **EU (encryption keys under EU/NL law)** | EU (stays — keys never leave EU) | EU (stays — keys never leave EU) |
| Backups | **Encrypted, stored in EU** | EU (primary) + SG (secondary copy) | EU (primary) + SG (secondary copy) |

**Key-service stays in EU regardless of user region.** Encryption keys are the crown jewel. EU has the strongest encryption-at-rest legal protections (no key disclosure mandates equivalent to UK RIPA [[Proton VPN transparency report, 2026](https://protonvpn.com/blog/transparency-report)]). The key-service already exists (`backend/key-service/`) with `KEY_SERVICE_REGION=eu-west` and `KEY_SERVICE_COUNTRY=NL` already set in the env vars (§10).

### 22.3 What NOT to put in a single jurisdiction

- **Encryption keys** — if a government compels key disclosure, all data is compromised. Keep keys in the strongest jurisdiction (EU/Switzerland).
- **User PII at rest** — distribute by user region so no single subpoena reaches all users.
- **Payment credentials** — Stripe holds these (PCI scope); ThryftVerse never stores raw card data. This is already correct.
- **Backup archives** — store encrypted backups in a *different* jurisdiction than the primary data, so a seizure of the primary does not also seize the backups.

### 22.4 Cloudflare R2 jurisdictional buckets (2026 verified)

R2 supports `jurisdiction: "eu"` in wrangler config. This restricts bucket data to EU datacentres. Combined with Cloudflare's anycast DNS, this means:

- DNS resolution is global (anycast — no single point of seizure)
- Object storage is EU-jurisdiction-bound (cannot be replicated to US by Cloudflare)
- CDN serving is global (low latency everywhere, data stays in EU)

```jsonc
// wrangler.jsonc — R2 binding with EU jurisdiction
{
  "r2_buckets": [
    {
      "binding": "MEDIA",
      "bucket_name": "thryftverse-media-eu",
      "jurisdiction": "eu"
    }
  ]
}
```

> **Verified August 2026:** Cloudflare fixed the Pages + R2 jurisdictional binding bug (GitHub issue #5513). Both Workers and Pages now support jurisdictional R2 buckets.

---

## 23. Alternative App Distribution for Blocked Regions

### 23.1 The problem (verified, August 2026)

| Region | Block | Cause |
|---|---|---|
| Iran | App Store inaccessible | US sanctions (IP/payment geolocation) + Iranian censorship of Apple CDN |
| China | Google Play blocked since 2012 | Great Firewall; Android users use Huawei/Xiaomi/OPPO/Vivo/Tencent stores |
| Russia | Google Play partially restricted | Google Play billing suspended; developer verification (2026) exempts sanctioned nations |
| Future risk | Any government can block DNS or IP | National firewalls, ISP-level blocking |

### 23.2 The Telegram answer: own distribution

Telegram distributes via:
1. App Store / Google Play (where available)
2. Direct APK download from telegram.org (Android, where Play is blocked)
3. Direct IPA via enterprise cert / TestFlight (iOS, limited)
4. Third-party stores (Iran, China)
5. **OTA updates** — the app updates itself without store review

### 23.3 ThryftVerse's existing OTA capability

ThryftVerse already has **EAS Update** (OTA) configured with staged rollouts (§17.7). This is the most powerful jurisdictional-resilience tool the app has:

- OTA updates bypass App Store / Play Store review entirely
- A government that blocks the App Store cannot block OTA (it goes through Expo's servers, or can be self-hosted)
- OTA can push code changes, feature flags, and even jurisdiction-specific configurations

**Upgrade for resilience:** Self-host the EAS Update server (Expo supports self-hosted update servers via `expo-updates` + custom URL). This removes Expo (US company) as a single point of compulsion for OTA distribution. The update server can be hosted in the EU jurisdiction alongside the key-service.

### 23.4 Direct APK distribution (Android)

For regions where Google Play is blocked (China, Iran, future blocks):

1. Build the APK/AAB via EAS as normal
2. Host the APK on `download.thryftverse.app` (served via Cloudflare, anycast, no single point of blockage)
3. Sign the APK with the production signing key (already configured in EAS)
4. Provide a QR code on the marketing site for direct download
5. Use Android's `package="com.thryftverse.app"` — the APK installs alongside any Play Store version

**Cost:** ~$0 (Cloudflare Pages/Workers can serve the APK). The signing key is the critical asset — store it in a hardware security module or a multi-sig wallet, not on a single laptop.

### 23.5 Direct iOS distribution (limited but possible)

iOS is harder because Apple controls the only install path. Options:

1. **App Store (default)** — works everywhere the App Store is accessible
2. **TestFlight** — for beta users in blocked regions (still requires App Store access)
3. **Enterprise Distribution** ($299/yr Apple Enterprise Program) — for internal distribution; not meant for public, Apple can revoke
4. **Web app (PWA)** — a fallback for regions where no native install is possible; limited functionality but no install gatekeeper

**Honest assessment:** iOS users in sanctioned regions (Iran) are structurally locked out unless they change their Apple ID region. There is no clean technical solution — this is a political problem, not an engineering one. The mitigation is to ensure Android users (the majority in most blocked regions) can always get the app via direct APK.

### 23.6 Chinese Android stores

If ThryftVerse targets Chinese users, distribution requires:

1. A **Chinese business license** (营业执照) — requires a Chinese entity or a local publisher partner (e.g., AppInChina)
2. Submission to **multiple stores**: Huawei AppGallery, Xiaomi GetApps, OPPO App Market, Vivo App Store, Tencent MyApp
3. Compliance with **Chinese content regulations** — the government can demand takedowns
4. **ICP filing** for the download domain

**Honest assessment:** China is not a jurisdiction you can be "resilient" in — you either comply with Chinese regulations or you are blocked. The Telegram playbook does not work in China; even Telegram is blocked there. If China is a target market, accept the regulatory cost. If it is not, do not pretend to serve it.

---

## 24. The Psychology of Each Jurisdictional Decision

Per AGENTS.md §4, flagship quality comes from understanding *why* a decision is made, not just *what* the decision is. Each jurisdictional decision has a psychological dimension — what it signals to users, team, investors, and adversaries.

### 24.1 BVI Holding — "We are a global company, not a national one"

**Psychology:** A BVI holding signals that ThryftVerse is not owned by any one country. It tells users "your data is not automatically under the jurisdiction of the country where the founder happened to be born." It tells investors "this is an internationally structured company, not a domestic startup that can be regulated out of existence by one government."

**What makes it flagship:** The structure is invisible to users but visible to adversaries. A government considering whether to compel data access sees a BVI holding + Swiss operating entity and calculates: "this requires an MLAT (Mutual Legal Assistance Treaty) request, not a subpoena." That calculation is the resilience.

**What it is NOT:** It is not a tax dodge. BVI companies with real operations elsewhere pay tax in the operating jurisdiction. It is not secrecy — FATCA/CRS reporting and beneficial ownership registries exist. It is *jurisdictional optionality* — the freedom to choose which courts have authority over which parts of the business.

### 24.2 Multi-Region Infrastructure — "No single seizure reaches all our users"

**Psychology:** A user in Mumbai knows their data is in Mumbai, not in a US datacentre subject to a US subpoena they have never heard of. A user in Berlin knows their data is under GDPR, not under the CLOUD Act. This is not abstract — it is the difference between "I trust this app" and "I don't know who has my data."

**What makes it flagship:** The user does not need to think about it. The app just works, fast, wherever they are, and the legal protection is a side effect of good architecture. The flagship move is to make resilience invisible — the user never sees a "your data is in the EU" banner; they just get fast, locally-jurisdiction-bound service.

### 24.3 Foundation Stake — "This cannot be bought out from under you"

**Psychology:** A user considering whether to build their livelihood on ThryftVerse (as a seller) asks: "What if this gets acquired by a company I don't trust?" The foundation stake answers: "It can't — a foundation controls 15% and is legally bound to block any acquisition that compromises the mission." This is the Proton/Signal pattern, and it is the single most powerful trust signal a platform can send.

**What makes it flagship:** It is a *structural* guarantee, not a *promise*. A founder can promise "we'll never sell your data" and break that promise. A foundation with a charter that legally prevents the sale is a guarantee that survives founder departure, investor pressure, and financial distress. It is the difference between trust and trustworthiness.

### 24.4 Alternative Distribution — "We will reach you even if your government blocks us"

**Psychology:** A user in a country where the App Store is blocked (Iran) or Google Play is blocked (China) feels abandoned by most apps. An app that provides a direct APK download, a QR code on the website, and OTA updates that bypass store review signals: "We engineered for your situation. You are not an afterthought."

**What makes it flagship:** The download page is not a fallback — it is a first-class surface. It has clear instructions, a QR code, a checksum for verification, and a signed APK. It works on a slow connection. It does not require the user to "enable unknown sources" with scary warnings without explaining why. The flagship move is to make alternative distribution feel normal, not sketchy.

### 24.5 Self-Hosted OTA — "We control our own updates"

**Psychology:** When an app's updates go through Apple/Google, the app is at the mercy of store review delays, rejections, and regional blocks. Self-hosted OTA means the platform can push a fix, a feature, or a jurisdiction-specific configuration without asking permission. This signals to users: "We are not a client of Apple and Google; we are a platform that happens to be distributed through them."

**What makes it flagship:** The user never sees a "pending App Store review" delay for a critical fix. The update just arrives. The resilience is invisible — until it matters, and then it is the difference between a 2-week outage and a 2-hour fix.

### 24.6 Distributed Team — "No single detention reaches the whole platform"

**Psychology:** The Durov arrest (August 2024) was the most important lesson in platform resilience in the last decade. A single person who owns and controls the entire platform is a single point of failure — not just technically, but legally and personally. A distributed team across multiple jurisdictions means no single government can detain the person who has the keys.

**What makes it flagship:** This is not about the user — it is about the platform's survival. A flagship platform is one that survives the loss of any single person. This means: multi-sig for critical keys, documented runbooks that any team member can execute, distributed decision-making authority, and no single founder who is the sole point of contact for vendors, banks, or regulators.

### 24.7 Encryption at Rest with EU Keys — "We cannot hand over what we cannot decrypt"

**Psychology:** If a government compels ThryftVerse to hand over user data, the response is: "Here is the encrypted data. The keys are in the EU, under EU law, and we cannot legally export them to you." This is the Proton pattern — Proton handed over encrypted data to Swiss authorities but could not decrypt it because the keys are user-side.

**What makes it flagship:** The encryption is not a feature the user toggles — it is the default state of the system. The key-service already exists (`backend/key-service/`) with `KEY_SERVICE_REGION=eu-west` and `KEY_SERVICE_COUNTRY=NL`. The flagship move is to ensure the key-service is the *only* path to decryption, that it is in the EU, and that there is no "admin override" that bypasses it.

---

## 25. Threat Model & Honest Limits

### 25.1 What the jurisdictional resilience strategy protects against

| Threat | Protected? | How |
|---|---|---|
| Single government subpoena for all user data | **Yes** | Data is distributed across EU/IN/SG; no single jurisdiction has all of it |
| Cloud provider compelled to shut down service | **Partially** | Multi-provider (Neon, Upstash, Cloudflare, Railway); but Cloudflare is a single DNS layer — consider secondary DNS |
| App Store / Play Store block in one country | **Yes (Android)** | Direct APK + OTA; iOS is harder |
| Hostile acquisition of the platform | **Yes** | Foundation stake blocks it |
| Founder detention pressure | **Partially** | Distributed team + multi-sig keys reduces but does not eliminate single-person risk |
| Bulk surveillance / mass data request | **Yes** | EU jurisdiction + encryption at rest + no bulk export API |
| Payment provider de-platforming | **Partially** | Multi-provider routing (7 providers); but Stripe is hard to replace for cards |
| DNS-level national blocking | **Partially** | Cloudflare anycast is hard to block at ISP level but not impossible; consider domain fronting / alternative domains |
| Server physical seizure | **Yes** | Multi-jurisdiction; seizing one DC does not seize the platform |
| Insider threat / rogue admin | **Partially** | Key-service + audit logs; but single-founder access is still a risk |

### 25.2 What it does NOT protect against (honest)

| Threat | Why not |
|---|---|
| Coordinated multi-government action (e.g., US + EU + India simultaneously) | If multiple jurisdictions coordinate, distributed infrastructure does not help. This is rare but possible (e.g., terrorism investigations). |
| A government where the founder is physically present detaining the founder | The Durov lesson. Distributed ownership mitigates but does not eliminate this. The founder must choose their physical jurisdiction carefully. |
| A payment regulator (e.g., RBI, FINMA, FCA) revoking the platform's payment licence in that jurisdiction | Payment regulation is local; multi-provider routing does not help if the *platform* is banned from operating in a country. |
| A court ordering the platform to implement a backdoor | No jurisdictional structure prevents a court order in a jurisdiction where the platform operates. Only end-to-end encryption (where the platform does not hold the keys) prevents this — but ThryftVerse is a commerce platform and must hold transaction data. |
| Switzerland changing its laws (VÜPF 2026) | Jurisdictions drift. Proton is moving infrastructure out of Switzerland in 2026 because of surveillance law changes. No jurisdiction is permanent. |
| A sufficiently determined nation-state attacker (NSA, GCHQ, MSS) | Nation-state attackers can compromise infrastructure regardless of jurisdiction. The goal is to make it *expensive and visible*, not impossible. |

### 25.3 The honest bottom line

The Telegram playbook is **not** a way to become above the law. It is a way to ensure that *ordinary* government overreach — a single subpoena, a single cloud-provider compulsion, a single store block, a single acquisition attempt — does not take down the platform. It raises the cost of adverse action from "one court order" to "coordinated multi-jurisdiction action with public visibility." That is a meaningful, achievable, and legitimate goal.

It is **not** a way to evade lawful obligations. ThryftVerse must still:
- Comply with tax law in every jurisdiction where it has operations
- Comply with AML/KYC (already implemented — `KYC_DEFAULT_VENDOR=persona`)
- Comply with marketplace facilitator tax obligations (Stripe Tax — see the commerce research report)
- Comply with data protection law (GDPR in EU, DPDP in India, PDPA in Singapore)
- Respond to lawful court orders in jurisdictions where it operates
- Honour takedown requests for illegal content

The structure makes the platform *resilient*, not *lawless*. The distinction matters.

### 25.4 Day-1 launch checklist (pre-launch, non-negotiable)

These are done **before the first user signs up**, not after. Launching without these means launching with 100% US-vendor exposure — the opposite of the Telegram playbook.

| # | Action | Effort | When | Why |
|---|---|---|---|---|
| 1 | **BVI holding company formation** | M | Pre-launch | Legal structure is hard to change post-launch; vendor contracts should be signed by the right entity from day one [[Conyers, 2026](https://www.conyers.com/publications/view/mondaq-venture-capital-comparative-guide-british-virgin-islands/)] |
| 2 | **Swiss GmbH/AG or Dubai FZ-LLC operating entity** | M | Pre-launch | Employs team, signs vendor contracts in the operating jurisdiction [[Proton, 2026](https://proton.me/blog/switzerland)] |
| 3 | **Foundation stake (10–20% equity transfer)** | M | Pre-launch | Anti-acquisition lock; structurally prevents hostile buyout from day one [[EU Vetted, 2026](https://euvetted.com/p/proton-mail)] |
| 4 | **Neon project in EU West (Amsterdam)** | S | Pre-launch | Primary database under EU jurisdiction (GDPR); creating in the right region first is free, migrating later is not [[Neon, 2026](https://neon.com/blog/the-problem-with-postgres-replicas)] |
| 5 | **Upstash in EU West** | S | Pre-launch | Redis under EU jurisdiction |
| 6 | **Railway services in Amsterdam** | S | Pre-launch | Compute under EU jurisdiction [[ComparEdge, 2026](https://comparedge.com/tools/railway/deployment-regions)] |
| 7 | **Cloudflare R2 with `jurisdiction: "eu"`** | S | Pre-launch | Object storage EU-bound; data cannot be replicated to US by Cloudflare [[Cloudflare GitHub #5513, fixed Aug 2026](https://github.com/cloudflare/workers-sdk/issues/5513)] |
| 8 | **Key-service in EU (NL) — already configured** | S | Pre-launch | Encryption keys under EU/NL law; `KEY_SERVICE_REGION=eu-west`, `KEY_SERVICE_COUNTRY=NL` already in §10 env vars |
| 9 | **Self-hosted EAS Update server in EU** | M | Pre-launch | OTA updates bypass Expo (US) — removes US dependency for runtime updates [[Expo docs, 2026](https://docs.expo.dev/versions/latest/sdk/stripe/)] |
| 10 | **Direct APK download page on Cloudflare** | S | Pre-launch | Android users in blocked regions can install without Google Play [[AppInChina, 2026](https://appinchina.co/blog/google-play-store-in-china-everything-you-need-to-know/)] |
| 11 | **Multi-sig for critical keys (signing, DB, encryption)** | M | Pre-launch | No single person can compromise all keys; the Durov lesson [[LegalClarity, 2026](https://legalclarity.org/who-owns-telegram-and-why-it-stays-private/)] |
| 12 | **Cross-border tax/legal counsel engaged** | M | Pre-launch | Ensure structure is compliant (AML/KYC, FATCA/CRS, economic substance) [[Appleby, 2026](https://www.applebyglobal.com/publications/2026-guide-to-fintech-in-the-british-virgin-islands/)] |

**Post-launch (gated on real demand):**

| # | Action | Trigger | Why |
|---|---|---|---|
| 13 | IN region (Neon Singapore logical replication + Upstash Mumbai, Railway Singapore) | ≥1K Indian MAU or Razorpay live | DPDP Act compliance + latency |
| 14 | SG region (Neon + Upstash Singapore) | ≥1K APAC MAU outside IN | PDPA compliance + latency |
| 15 | Secondary DNS provider (not just Cloudflare) | When Cloudflare dependency is a measured risk | DNS resilience |
| 16 | Distributed team across ≥2 jurisdictions | When team grows beyond 5 people | Durov lesson — no single detention reaches the whole platform |
| 17 | Active-active writes (CockroachDB or Neon global) | >100K MAU with write-latency complaints | Latency, not resilience |

**The day-one launch is the resilient configuration. Everything in the pre-launch table is done before the first user. Everything in the post-launch table is gated on real demand. There is no "Phase 0 = 100% US" step.**

---

## 26. Sources & Citations (August 2026)

Every jurisdictional claim in §§19–25 is backed by a primary or authoritative source, accessed August 2026. Inline links appear in the relevant sections; this section consolidates them for verification.

### Telegram structure & infrastructure

| Claim | Source | URL |
|---|---|---|
| Telegram Group Inc. incorporated in BVI; Telegram FZ-LLC in Dubai; Durov detained Aug 2024, released Nov 2025 | LegalClarity — "Who Owns Telegram and Why It Stays Private" | https://legalclarity.org/who-owns-telegram-and-why-it-stays-private/ |
| Telegram ownership structure, BVI + Dubai, Durov multi-citizenship, TON stewardship May 2026 | RevenueMemo — "Who owns Telegram? Ownership structure explained" | https://www.revenuememo.com/p/who-owns-telegram |
| Telegram FZ-LLC AS62041, Dubai UAE, RIPE-registered, DCs in Amsterdam/Frankfurt/Singapore | examineip — AS62041 Telegram FZ LLC | https://examineip.com/isp/as62041-telegram/ |
| Telegram shell companies, empty offices, Dubai tax residency, Berlin/London/Singapore history | NZZ — "Telegram's maker hides behind shell firms and empty offices" | https://www.nzz.ch/english/telegrams-maker-hides-behind-shell-firms-and-empty-offices-ld.1846214 |
| Telegram sticky home-DC architecture, MIGRATE_X redirects, 5 DCs | SourceFeed — "Telegram's Sticky Home-DC Architecture" | https://sourcefeed.dev/a/telegrams-sticky-home-dc-architecture |

### Proton structure & Switzerland

| Claim | Source | URL |
|---|---|---|
| Switzerland outside EU/US jurisdiction; Swiss Criminal Code §271; constitutional right to privacy; FADP | Proton — "Why is Proton based in Switzerland?" | https://proton.me/blog/switzerland |
| Proton AG Geneva, Foundation-controlled since June 2024, no CLOUD Act exposure, ISO 27001, own Swiss datacentres | EU Vetted — "Proton Mail EU & privacy compliance profile" | https://euvetted.com/p/proton-mail |
| Proton moving infrastructure OUT of Switzerland due to VÜPF surveillance ordinance; Lumo AI relocated to Germany/Norway | heise online — "Proton relocates parts of its infrastructure from Switzerland" | https://www.heise.de/en/news/Surveillance-Proton-relocates-parts-of-its-infrastructure-from-Switzerland-10538664.html |
| Proton VPN transparency report: 458 orders, all denied (no logs); Swiss law requires target notification | Proton VPN — Transparency report | https://protonvpn.com/blog/transparency-report |

### Signal structure

| Claim | Source | URL |
|---|---|---|
| Signal Foundation 501(c)(3) nonprofit; no shareholders; cannot be sold; assets go to another nonprofit if dissolved | LegalClarity — "Who Owns Signal Foundation?" | https://legalclarity.org/who-owns-signal-foundation-nonprofit-structure-explained/ |
| Signal Foundation + Signal Messenger LLC structure; Brian Acton $50M seed; donor-supported | Signal Foundation — official site | https://signalfoundation.org/ |
| Signal nonprofit status, 501(c)(3), donor-funded, no ads | CharitySense — Signal Foundation Nonprofit Due Diligence | https://data.charitysense.com/charity/824506840 |

### BVI legal structure

| Claim | Source | URL |
|---|---|---|
| BVI 356,000+ business companies; fintech holding/operating structures; VASP Act 2022; token issuances | Appleby — "Guide To Fintech In The British Virgin Islands 2025/2026" | https://www.applebyglobal.com/publications/2026-guide-to-fintech-in-the-british-virgin-islands/ |
| BVI Business Companies Act; English common law; zero tax on foreign income; economic substance; FATCA/CRS; beneficial ownership | Conyers — "Venture Capital Comparative Guide - BVI" | https://www.conyers.com/publications/view/mondaq-venture-capital-comparative-guide-british-virgin-islands/ |
| BVI holding company: zero tax, one director/shareholder, no residency, remote setup, $400–800/yr | Air Corporate — "BVI Holding Company: Structure, Uses, and Setup" | https://air-corporate.com/offshore/blog/bvi-holding-company |
| BVI fintech laws 2026; no specific crypto regulations; VASP Act exclusions for token sales | ICLG — "Fintech Laws and Regulations 2026 \| British Virgin Islands" | https://iclg.com/practice-areas/fintech-laws-and-regulations/british-virgin-islands/ |

### Multi-region & infrastructure

| Claim | Source | URL |
|---|---|---|
| 76% of multi-region apps have no measurable latency advantage; multi-region justified only with ≥30% users on another continent | Vibe Coder Blog — "Multi Region Deployment for Low Latency Without Pain in 2026" | https://blog.vibecoder.me/multi-region-deployment-low-latency |
| Railway 4 metal regions (CA, VA, Amsterdam, Singapore); no downtime region change unless volume attached; only 1 EU option | ComparEdge — "Railway Deployment, Regions & Data Residency 2026" | https://comparedge.com/tools/railway/deployment-regions |
| Neon read replicas lightweight (decoupled compute/storage); provision in minutes not hours | Neon Blog — "The problem with Postgres replicas" | https://neon.com/blog/the-problem-with-postgres-replicas |
| Fly.io globally distributed Postgres; writer + replicas; Fly-Replay header for write routing | Fly.io Blog — "Globally Distributed Postgres" | https://fly.io/blog/globally-distributed-postgres/ |
| Cloudflare R2 jurisdictional buckets; `jurisdiction: "eu"` in wrangler; Pages+Workers both support (bug #5513 fixed) | Cloudflare GitHub Issue #5513 | https://github.com/cloudflare/workers-sdk/issues/5513 |
| Cloudflare R2 data location / jurisdictional restrictions docs | Cloudflare Docs — R2 data location | https://developers.cloudflare.com/r2/reference/data-location/#jurisdictional-restrictions |
| Cloudflare Pages vs Workers 2026: Workers now serve static assets; unified frontend+backend deploy | Mecanik — "Cloudflare Pages vs Workers: Which to Use in 2026" | https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/ |

### Alternative app distribution

| Claim | Source | URL |
|---|---|---|
| Iranian third-party iOS stores; US sanctions + Iranian censorship = 100% unofficial iOS distribution; sideloading via enterprise certs | arxiv — "Taking a Bite Out of the Forbidden Fruit: Iranian iOS App Stores" | https://arxiv.org/pdf/2604.26343v1 |
| Google Android developer verification 2026; sanctioned nations exempted but cannot verify internationally | Ars Technica — "Google plans to exempt sanctioned nations from Android developer verification" | https://arstechnica.com/gadgets/2026/07/google-plans-to-exempt-sanctioned-nations-from-android-developer-verification/ |
| Google Play blocked in China since 2012; Android users use Huawei/Xiaomi/OPPO/Vivo/Tencent; Chinese business license required | AppInChina — "Google Play Store in China: Everything You Need To Know" | https://appinchina.co/blog/google-play-store-in-china-everything-you-need-to-know/ |
| Iran iPhone VPN install catch-22; Apple ID region change workaround; sanctions + censorship compounding | Univista — "Why You Can't Install a VPN/VLESS Client on an iPhone in Iran" | https://univista.me/guide/vpn-for-iphone-iran/?lang=en |
| Expo `@stripe/stripe-react-native` config plugin; `expo-updates` self-hosted update servers supported | Expo Docs — Stripe SDK | https://docs.expo.dev/versions/latest/sdk/stripe/ |

### Encryption & key disclosure law

| Claim | Source | URL |
|---|---|---|
| EU has no key disclosure mandate equivalent to UK RIPA; encryption at rest under EU law is strongest practical protection | Proton VPN transparency report (Swiss §271 analog in EU member states) | https://protonvpn.com/blog/transparency-report |
| Proton zero-access encryption; cannot read or hand over user messages; only encrypted data provided to authorities | Proton — "What is encrypted within Proton Mail?" | https://proton.me/support/what-is-encrypted-within-protonmail |

---

## 27. Multi-Country Deployment Matrix

> The backend (`lib/countryCapabilities.ts`) already implements 7 country clusters with per-cluster payment gateways, currencies, tax rules, shipping carriers, restricted items, age restrictions, and data retention policies. This section maps each target market to its deployment configuration.

### 27.1 Country cluster mapping

The backend resolves each user's country to one of 7 clusters. The cluster determines every payment, tax, shipping, and regulatory behaviour:

| Cluster | Countries | Default currency | Primary gateway | Tax type | Data residency jurisdiction |
|---|---|---|---|---|---|
| **IN** | India | INR | Razorpay → Stripe | GST 18% | IN (DPDP Act 2023) |
| **US** | United States | USD | Stripe | Sales tax 7.25% | US (CCPA/CPRA) |
| **UK** | United Kingdom | GBP | Stripe → Mollie | VAT 20% | UK (UK GDPR / DPA 2018) |
| **EUROPE** | All EU/EEA + CH, NO, IS (47 countries) | EUR | Mollie → Stripe | VAT 21% | EU (GDPR) |
| **MIDDLE_EAST** | AE, BH, EG, IL, IQ, IR, JO, KW, LB, OM, PS, QA, SA, SY, TR, YE | AED | Tap → Stripe | VAT 5% | Per-country PDPL |
| **CHINA_NEARBY** | CN, HK, ID, JP, KR, MN, MO, MY, PH, SG, TH, TW, VN | USD | Stripe | VAT 13% | Per-country (PIPL for CN) |
| **GLOBAL** | Everything else (LATAM, Africa, Oceania) | USD | Stripe | None | EU primary (GDPR) |

### 27.2 Country-to-cluster resolution (from `countryCapabilities.ts`)

```
IN:              ['IN']
US:              ['US']
UK:              ['GB']
MIDDLE_EAST:     ['AE','BH','EG','IL','IQ','IR','JO','KW','LB','OM','PS','QA','SA','SY','TR','YE']
CHINA_NEARBY:    ['CN','HK','ID','JP','KR','MN','MO','MY','PH','SG','TH','TW','VN']
EUROPE:          ['AL','AD','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FO',
                  'FR','GB','GI','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME',
                  'MK','MT','NL','NO','PL','PT','RO','RS','SE','SI','SK','SM','UA','VA','XK']
GLOBAL:          everything else
```

> **Note:** GB appears in both EUROPE and UK sets. The UK cluster takes priority (checked first in `resolveCountryCluster`). This is correct — UK users get UK-specific VAT (20%) and GBP, not EU-wide EUR defaults.

### 27.3 Per-region deployment timeline

| Region | When to provision | Neon region | Upstash region | Railway region | R2 bucket | Trigger |
|---|---|---|---|---|---|---|
| **EU (primary)** | Day 1 (pre-launch) | EU West (Amsterdam) | EU West 1 | Amsterdam | `jurisdiction: "eu"` | Always |
| **US** | Day 1 or when ≥1K US MAU | US East (Virginia) | US East 1 | Virginia | US bucket | Stripe is already US; add data residency when US user base grows |
| **UK** | When ≥1K UK MAU | EU West (London read replica) | EU West 1 | Amsterdam | EU bucket (shared) | UK GDPR compliance; read replica in London for latency |
| **IN** | When ≥1K IN MAU or Razorpay live | Singapore (closest — Neon has no Mumbai) | Mumbai (ap-south-1) | Singapore (closest) | APAC bucket | DPDP Act compliance + Razorpay |
| **SG/Asia** | When ≥1K APAC MAU outside IN | Singapore (ap-southeast-1) | Singapore | Singapore | APAC bucket | PDPA compliance + latency |
| **GCC/Middle East** | When ≥1K GCC MAU or Tap live | EU West (read replica) | EU West | Amsterdam (closest Railway) | EU bucket | Tap payment integration; no Railway ME region exists |
| **China** | Only if pursuing Chinese market | Not recommended (see §27.6) | Not recommended | Not available | Not available | Requires ICP filing + Chinese entity (see §23.6) |
| **Africa** | When ≥1K Africa MAU or Flutterwave live | EU West (read replica) | EU West | Amsterdam | EU bucket | Flutterwave integration |
| **LATAM** | When ≥1K LATAM MAU | US East (read replica) | US East 1 | Virginia | US bucket | Stripe handles LATAM; no local provider yet |
| **Oceania** | When ≥1K AU/NZ MAU | Singapore (read replica) | Singapore | Singapore | APAC bucket | Stripe handles AU/NZ |

### 27.4 Gateway availability per cluster (from backend code)

| Cluster | Commerce | Co-own | Wallet top-up | Wallet withdrawal | 1ze wallet | Payout priority |
|---|---|---|---|---|---|---|
| **IN** | oneze → Razorpay → Stripe | Razorpay → Stripe | Razorpay → Stripe | Razorpay | oneze | Razorpay → Stripe |
| **US** | oneze → Stripe | Stripe | Stripe | Stripe | oneze | Stripe |
| **UK** | oneze → Stripe → Mollie | Stripe → Mollie | Stripe → Mollie | Stripe → Mollie | oneze | Stripe → Mollie |
| **EUROPE** | oneze → Mollie → Stripe | Mollie → Stripe | Mollie → Stripe | Mollie → Stripe | oneze | Mollie → Stripe |
| **MIDDLE_EAST** | oneze → Tap → Stripe | Tap → Stripe | Tap → Stripe | Tap → Stripe | oneze | Tap → Stripe |
| **CHINA_NEARBY** | oneze → Stripe | Stripe | Stripe | Stripe | oneze | Stripe |
| **GLOBAL** | oneze → Stripe | Stripe | Stripe | Stripe | oneze | Stripe → Mollie |

> Gateways are filtered at runtime by `isGatewayConfigured()` — only gateways with valid API keys in the environment are exposed. If no cluster-specific gateway is configured, the system falls back to Stripe, then to mock mode (dev only).

### 27.5 Flutterwave for Africa

The backend includes `flutterwave_africa` as a gateway type. Africa is currently in the GLOBAL cluster (Stripe fallback). To activate Flutterwave:

1. Sign up at https://flutterwave.com
2. Get API credentials (secret key, public key, webhook secret)
3. Set env vars: `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`
4. Add an `AFRICA` cluster to `countryCapabilities.ts` with Flutterwave as primary gateway
5. Add African country codes to the cluster mapping
6. Configure Flutterwave webhook endpoint: `https://api.thryftverse.app/webhooks/flutterwave`

### 27.6 China — honest assessment

China is structurally different from every other market. The backend includes a `CHINA_NEARBY` cluster, but deploying to China requires:

| Requirement | Details | Cost |
|---|---|---|
| Chinese business license (营业执照) | Required for app store listings and ICP filing | Via local partner (AppInChina ~$2K/yr) |
| ICP filing | Required for any domain serving Chinese users | Free but requires Chinese entity |
| Data localisation | PIPL requires personal data of Chinese citizens to be stored in China | Chinese cloud provider (Alibaba Cloud / Tencent Cloud) |
| Content moderation | Government can demand takedowns; real-name verification required | Compliance team |
| Payment integration | WeChat Pay / Alipay (not Stripe) | Chinese payment licence or partner |
| App stores | Google Play blocked; must list on Huawei, Xiaomi, OPPO, Vivo, Tencent | Per-store review |

**Recommendation:** Do not attempt China at launch. The `CHINA_NEARBY` cluster serves the *surrounding* markets (Japan, Korea, Southeast Asia, Hong Kong, Taiwan) where Stripe works and data residency is less restrictive. China itself requires a dedicated market entry strategy with local partners.

### 27.7 Environment variables for multi-country deployment

Add these to the `api` service variables when each provider goes live:

```bash
# ── Razorpay (India) ──────────────────────────────────────
RAZORPAY_KEY_ID=rzp_live_<key>
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook_secret>

# ── Mollie (Europe) ───────────────────────────────────────
MOLLIE_API_KEY=live_<key>
MOLLIE_WEBHOOK_SECRET=<webhook_secret>

# ── Tap (Middle East / GCC) ───────────────────────────────
TAP_SECRET_KEY=sk_live_<key>
TAP_WEBHOOK_SECRET=<webhook_secret>

# ── Flutterwave (Africa) ──────────────────────────────────
FLUTTERWAVE_SECRET_KEY=FLWSECK-<key>
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-<key>
FLUTTERWAVE_WEBHOOK_SECRET=<webhook_secret>

# ── Wise (UK / cross-border payouts) ──────────────────────
# NOTE: Wise gateway is disabled in code until a certified adapter
# is implemented. Do not enable until the adapter is built.
WISE_API_KEY=
WISE_WEBHOOK_SECRET=

# ── Easyship (shipping labels, multi-region) ──────────────
EASYSHIP_API_KEY=<key>
EASYSHIP_API_BASE_URL=https://public-api.easyship.com/2024-09
EASYSHIP_WEBHOOK_SECRET=<webhook_secret>
```

---

## 28. Per-Region Payment Provider Setup

### 28.1 Razorpay (India)

1. Go to https://razorpay.com → sign up / log in
2. Complete KYC (business PAN, bank account, GST registration)
3. Go to **Settings** → **API Keys** → **Generate Key**
4. Copy the **Key ID** (`rzp_live_...`) and **Key Secret**
5. Set up webhook: **Settings** → **Webhooks** → **Add Webhook**
   - URL: `https://api.thryftverse.app/webhooks/razorpay`
   - **Payment events:** `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`
   - **Payout events (RazorpayX):** `payout.pending`, `payout.queued`, `payout.initiated`, `payout.processed`, `payout.updated`, `payout.reversed`, `payout.failed`, `payout.rejected`, `payout.downtime.started`, `payout.downtime.resolved` [[Razorpay docs, 2026](https://razorpay.com/docs/webhooks/payouts/)]
   - Copy the webhook secret (used for HMAC-SHA256 signature verification via `X-Razorpay-Signature` header)
6. Set env vars: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
7. Activate **Razorpay X** for payouts (vendor payouts to Indian bank accounts)

### 28.2 Mollie (Europe)

1. Go to https://www.mollie.com → sign up / log in
2. Complete verification (business registration, bank account)
3. Go to **Developers** → **API Keys** → copy the **Live API key** (`live_...`)
4. Set up webhooks: Mollie now supports **next-gen Webhook Subscriptions API** (not just per-payment webhooks) [[Mollie docs, 2026](https://docs.mollie.com/reference/webhooks-new)]. Subscribe to events via the Webhooks API:
   - **Payment events:** `payment.authorized`, `payment.canceled`, `payment.expired`, `payment.failed`, `payment.paid`, `payment.pending`
   - **Payout events:** `payout.initiated`, `payout.processing-at-bank`, `payout.completed`, `payout.canceled`, `payout.failed`
   - Webhook signing uses SHA256 (HMAC) signature for payload verification
   - Alternatively, set up webhooks via the dashboard (simpler but less flexible)
5. Set env vars: `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET` (if using signed webhooks)
6. For payouts: Mollie supports payouts to European bank accounts (SEPA). Enable in dashboard. Payout webhook events: `payout.initiated`, `payout.processing-at-bank`, `payout.completed`, `payout.canceled`, `payout.failed` [[Mollie docs, 2026](https://docs.mollie.com/gu/reference/payouts-api-webhooks)].

### 28.3 Tap (Middle East / GCC)

1. Go to https://www.tap.company → sign up / log in
2. Complete KYC (business registration, trade license)
3. Go to **Developers** → **API Keys** → copy the **Secret Key** (`sk_live_...`)
4. Set up webhook: **Developers** → **Webhooks** → **Add**
   - URL: `https://api.thryftverse.app/webhooks/tap`
   - Events: `charge.created`, `charge.captured`, `charge.failed`, `refund.created`, `payout.created`, `payout.failed`
   - Copy the webhook secret
5. Set env vars: `TAP_SECRET_KEY`, `TAP_WEBHOOK_SECRET`
6. Tap supports payments in AED, SAR, KWD, QAR, OMR, BHD, EGP, JOD

### 28.4 Flutterwave (Africa)

1. Go to https://flutterwave.com → sign up / log in
2. Complete KYC (business registration, bank account)
3. Go to **Settings** → **API Keys** → copy **Secret Key** (`FLWSECK-...`) and **Public Key** (`FLWPUBK-...`)
4. Set up webhook: **Settings** → **Webhooks**
   - URL: `https://api.thryftverse.app/webhooks/flutterwave`
   - Secret: copy the **Webhook Secret Hash**
   - Events: `successful`, `failed`, `cancelled`, `refunded`
5. Set env vars: `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_PUBLIC_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`
6. Flutterwave supports NGN, GHS, KES, UGX, TZS, ZAR, RWF, EGP, USD

### 28.5 Webhook endpoint summary

> **Stripe API version note (verified August 2026):** The latest Stripe API version is **`2026-08-26.dahlia`** (released August 26, 2026), the fourth release in Stripe's flora-named versioning model (Acacia → Basil → Clover → Dahlia) [[Stripe changelog, 2026](https://docs.stripe.com/changelog/dahlia)]. The stripe-node SDK v22.6.0 pins this version [[stripe-node v22.6.0, 2026](https://github.com/stripe/stripe-node/releases/tag/v22.6.0)]. Webhook endpoints use the account's default API version, which can be upgraded in the Stripe Dashboard (Workbench). The API version on existing webhook endpoints cannot be set independently — it follows the account default. Verify your account's API version in the Stripe Dashboard before going live.

The backend's `/webhooks/:provider` route handles all providers. Configure each provider's webhook URL:

| Provider | Webhook URL | Env var for secret |
|---|---|---|
| Stripe | `https://api.thryftverse.app/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| Razorpay | `https://api.thryftverse.app/webhooks/razorpay` | `RAZORPAY_WEBHOOK_SECRET` |
| Mollie | Per-payment (no global endpoint) | `MOLLIE_WEBHOOK_SECRET` (if used) |
| Tap | `https://api.thryftverse.app/webhooks/tap` | `TAP_WEBHOOK_SECRET` |
| Flutterwave | `https://api.thryftverse.app/webhooks/flutterwave` | `FLUTTERWAVE_WEBHOOK_SECRET` |

---

## 29. Per-Region Regulatory Compliance

### 29.1 Data protection laws by region

| Region | Law | Key obligations | Data residency | Fines |
|---|---|---|---|---|
| **EU** | GDPR (Regulation 2016/679) | Consent, DPO, breach notification (72h), right to erasure, data portability | EU/EEA (or adequacy decision) | Up to €20M or 4% global revenue |
| **UK** | UK GDPR + DPA 2018 | Same as EU GDPR + UK-specific ICO registration | UK (or adequacy) | Up to £17.5M or 4% |
| **US** | CCPA/CPRA (California) + state laws | Right to know, delete, opt-out of sale. No federal law yet | No requirement (but state laws emerging) | Up to $7,500 per intentional violation |
| **India** | DPDP Act 2023 + DPDP Rules 2025 (notified Nov 13, 2025) | Consent, breach notification (72h to DPB), data fiduciary obligations, consent manager registration, Significant Data Fiduciary (SDF) obligations | India (for sensitive data; cross-border transfer allowed except to government-blocked countries) | Up to ₹250 crore |
| **Singapore** | PDPA | Consent, purpose limitation, breach notification (3 days), DPO appointment | No strict requirement | Up to S$1M |
| **China** | PIPL + DSL + CSL + PIP Certification Measures (effective Jan 1, 2026) | Consent, separate consent for sensitive data, data localisation, security assessment for cross-border transfer, three legal transfer routes: CAC Security Assessment, Standard Contract filing, PIP Certification | China (personal data must be stored in China) | Up to ¥50M or 5% revenue |
| **Japan** | APPI (amended 2022) | Consent, purpose specification, breach notification, cross-border transfer restrictions | No strict requirement | Up to ¥100M |
| **South Korea** | PIPA | Consent, breach notification, cross-border transfer restrictions, pseudonymisation | No strict requirement | Up to 3% of revenue |
| **UAE** | PDPL (Federal Decree-Law 45/2021) | Consent, breach notification (72h), data subject rights | UAE (for government data) | Up to AED 5M |
| **Saudi Arabia** | PDPL (2021, amended 2023) | Consent, breach notification, data localisation for sensitive data | Saudi Arabia (sensitive data) | Up to SAR 5M |
| **Brazil** | LGPD | Consent, DPO, breach notification, rights similar to GDPR | No strict requirement | Up to 2% of revenue (max R$50M) |
| **Australia** | Privacy Act 1988 (amended 2024) | APPs, breach notification (Notifiable Data Breaches scheme) | No strict requirement | Up to AUD 50M |
| **South Africa** | POPIA | Consent, breach notification, data subject rights | No strict requirement | Up to ZAR 10M or 10 years imprisonment |

### 29.2 Compliance actions per region

| Region | Action required | When |
|---|---|---|
| **EU** | Appoint EU Representative (if no EU establishment); register with local DPA; implement DPA with all processors | Pre-launch |
| **UK** | Register with ICO (£40-60/yr); appoint UK Representative (if outside UK); implement UK GDPR transfer mechanisms | Pre-launch if UK users |
| **US** | CCPA opt-out mechanism in app; privacy policy updated; data processing agreement with Stripe | Pre-launch if CA users |
| **India** | Register as Data Fiduciary; implement consent manager integration (consent manager obligations effective Nov 13, 2026); comply with DPDP Rules 2025 (substantial provisions effective May 13, 2027); appoint DPO if classified as Significant Data Fiduciary | Pre-launch if IN users (full compliance by May 2027) |
| **Singapore** | Appoint DPO; register with PDPC | Pre-launch if SG users |
| **China** | ICP filing; security assessment for cross-border data; data localisation; real-name verification | Only if pursuing China market |
| **UAE/KSA** | Register with relevant data authority; data localisation for sensitive data | When GCC users |
| **Brazil** | Appoint DPO; register with ANPD | When BR users |
| **Australia** | Register with OAIC; implement NDB procedure | When AU users |

### 29.3 Cross-border data transfer mechanisms

| From → To | Mechanism | Notes |
|---|---|---|
| EU → Non-EU | Standard Contractual Clauses (SCCs) + Transfer Impact Assessment | Required for Stripe (US), any non-EU processor |
| UK → Non-UK | UK IDTA or UK Addendum to EU SCCs | Post-Brexit requirement |
| India → Non-India | Standard contractual clauses (DPDP rules pending) | Sensitive personal data must stay in India |
| China → Non-China | Three routes: (1) CAC Security Assessment (for CIIOs, important data, >1M individuals' data), (2) Standard Contract filing (for <100K individuals, non-sensitive), (3) PIP Certification (effective Jan 1, 2026, for 100K-1M individuals) [[CAC, 2026](https://china-gateway360.com/cross-border-data-transfer-2026-3-tier-compliance-foreign-firms/)] | PIPL Article 38 — very restrictive; CAC published official Q&A on July 24, 2026 clarifying implementation |
| Japan → Non-Japan | Consent + adequacy or contract | APPI Article 28 |

---

## 30. Per-Region App Distribution

### 30.1 Distribution channels by region

| Region | Primary | Secondary | Blocked |
|---|---|---|---|
| **Global** | Apple App Store, Google Play | Direct APK, OTA | — |
| **China** | Huawei AppGallery, Xiaomi GetApps, OPPO App Market, Vivo App Store, Tencent MyApp | Direct APK | Google Play (blocked since 2012) |
| **Iran** | Direct APK, third-party iOS stores | — | App Store (limited), Google Play (limited) |
| **Russia** | RuStore (VK), direct APK | App Store (limited), Google Play (billing suspended) | — |
| **Samsung devices** | Samsung Galaxy Store | Google Play | — |
| **Amazon devices** | Amazon Appstore | Google Play (sideload) | — |

### 30.2 Chinese app stores — setup checklist

If pursuing the Chinese market (see §27.6 for honest assessment):

1. **Chinese business license** — via local partner (AppInChina, Yozosoft) or Chinese entity
2. **ICP filing** — for download domain (`download.thryftverse.app` or `.cn` domain)
3. **Submit to each store:**

| Store | URL | Requirements | Review time |
|---|---|---|---|
| Huawei AppGallery | https://developer.huawei.com | Business license, software copyright (软著) | 3-7 days |
| Xiaomi GetApps | https://dev.mi.com | Business license | 3-5 days |
| OPPO App Market | https://open.oppomobile.com | Business license | 3-5 days |
| Vivo App Store | https://dev.vivo.com.cn | Business license | 3-5 days |
| Tencent MyApp | https://open.tencent.com | Business license, ICP filing | 5-10 days |

4. **Content compliance:** No content that violates Chinese regulations (political, adult, gambling). Government can demand takedowns.
5. **Data localisation:** User data must be stored in China (PIPL). Requires Chinese cloud provider.

### 30.3 Direct APK distribution (all regions)

Already covered in §23.4. Key additions for multi-country:

1. Host APK on `download.thryftverse.app` (Cloudflare Pages, anycast)
2. Provide per-region download page with language localisation
3. Include SHA-256 checksum for verification
4. Sign with production key (stored in multi-sig, not single laptop)
5. QR code on marketing site for direct install
6. Versioned APKs: `thryftverse-{version}-android.apk`

### 30.4 Self-hosted OTA (jurisdictional resilience)

Already covered in §23.3. For multi-country:

1. Self-host EAS Update server in EU (alongside key-service)
2. Configure `expo-updates` to use custom URL: `https://updates.thryftverse.app`
3. OTA updates bypass App Store / Play Store review entirely
4. Per-region update channels: `production-eu`, `production-in`, `production-sg`, `production-me`
5. Staged rollout per region (§17.7) — don't push to all regions simultaneously

---

## 31. Per-Region KYC Configuration

### 31.1 KYC vendors in the backend

The backend supports three KYC vendors (`KYC_DEFAULT_VENDOR` env var):

| Vendor | Env vars required | Coverage | Notes |
|---|---|---|---|
| **Persona** | `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `PERSONA_WEBHOOK_SECRET` | Global (190+ countries) | Default in DEPLOYMENT.md §10 |
| **Stripe Identity** | `STRIPE_SECRET_KEY` + Stripe Identity activated | US, UK, EU, AU, CA, IE, IN (growing) | Already integrated; needs activation at https://dashboard.stripe.com/identity/application |
| **Onfido** | `ONFIDO_API_KEY`, `ONFIDO_WEBHOOK_TOKEN` | Global (195 countries) | Alternative; strong in UK/EU |

### 31.2 Per-region KYC requirements

| Region | ID type | Additional requirements | Recommended vendor |
|---|---|---|---|
| **India** | Aadhaar (12-digit), PAN (10-digit) | RBI KYC norms; video KYC for high-value | Persona or Onfido (Aadhaar API via UIDAI) |
| **UAE** | Emirates ID (17-digit) | ICP verification; residency visa check | Persona (Emirates ID supported) |
| **Saudi Arabia** | Iqama / National ID | NAFATH verification | Persona or Onfido |
| **China** | 身份证 (National ID, 18-digit) | Real-name verification (实名认证); face recognition | Local provider (if pursuing China) |
| **UK** | Passport / Driving Licence | Right to work check (if seller) | Stripe Identity or Onfido |
| **EU** | National ID card / Passport | eIDAS compliance for electronic identification | Persona or Onfido |
| **US** | SSN / Driver's Licence / Passport | OFAC sanctions check; state-level ID verification | Stripe Identity or Persona |
| **Japan** | My Number Card / Driver's Licence | My Number system for tax | Persona or Onfido |
| **South Korea** | 주민등록번호 (Resident Registration Number) | I-PIN or mobile phone verification | Persona or local provider |
| **Brazil** | CPF / CNPJ | Receita Federal verification | Persona or Onfido |
| **Singapore** | NRIC / FIN | SingPass/MyInfo verification | Persona or Onfido |

### 31.3 KYC flow per region

The backend's KYC flow (`/compliance/kyc/sessions`) is vendor-agnostic. Per-region configuration:

```bash
# Global default
KYC_DEFAULT_VENDOR=persona
KYC_VERIFICATION_BASE_URL=https://verify.thryftverse.app/session

# For India (if using Aadhaar-specific verification)
# Consider adding a region-specific KYC vendor override:
# KYC_VENDOR_IN=persona  (or a local Aadhaar verification provider)

# For Middle East (Emirates ID / Iqama)
# Persona supports these ID types natively

# For China (if pursuing)
# KYC_VENDOR_CN=<local-provider>  (requires local integration)
```

### 31.4 KYC verification levels

The backend supports tiered verification (from compliance code):

| Tier | Requirements | Unlocks |
|---|---|---|
| **Tier 0** (unverified) | Email + phone only | Browse, bid (low value) |
| **Tier 1** (basic) | Government ID + selfie | List items, buy (medium value), wallet top-up |
| **Tier 2** (enhanced) | ID + address proof + liveness check | High-value trades, co-own trading, payouts |
| **Tier 3** (enhanced+) | Source of funds + business documents | Institutional accounts, bulk trading |

---

## 32. Multi-Currency & Localization

### 32.1 Currency support by cluster (from backend)

| Cluster | Default | Supported | Payout default | Payout supported |
|---|---|---|---|---|
| IN | INR | INR, USD, GBP, EUR | INR | INR, USD |
| US | USD | USD, GBP, EUR | USD | USD |
| UK | GBP | GBP, EUR, USD | GBP | GBP, EUR, USD |
| EUROPE | EUR | EUR, GBP, USD | EUR | EUR, GBP, USD |
| MIDDLE_EAST | AED | AED, USD, EUR | AED | AED, USD |
| CHINA_NEARBY | USD | USD, EUR, GBP | USD | USD |
| GLOBAL | USD | USD, GBP, EUR | USD | USD, GBP, EUR |

### 32.2 1ze stablecoin as a universal medium

The 1ze stablecoin system (`/wallet/1ze/*` endpoints) provides a currency-agnostic medium of exchange:

- Mint 1ze by depositing fiat (GBP, EUR, USD, INR, AED)
- 1ze is pegged to a basket with FX rates synced via `ONEZE_FX_PROVIDER_URL`
- Use 1ze for commerce, co-own trading, and wallet transfers across regions
- Withdraw 1ze to local fiat via `/wallet/1ze/withdrawals/quote`
- This eliminates the need for direct currency conversion between users in different regions

### 32.3 FX rate configuration

```bash
# 1ze FX sync (already in §10 env vars)
ONEZE_FX_SYNC_ENABLED=true
ONEZE_FX_SYNC_INTERVAL_MS=86400000          # daily sync
ONEZE_FX_PROVIDER_URL=https://api.exchangerate.host/latest
ONEZE_FX_PROVIDER_API_KEY=<live-provider-key>
ONEZE_FX_PROVIDER_BASE_CURRENCY=INR         # base currency for FX basket
ONEZE_AUTO_ADJUST_ENABLED=true              # auto-adjust reserve ratio
```

### 32.4 Localization requirements

| Region | Language(s) | Script | RTL? | Notes |
|---|---|---|---|---|
| US, UK, AU, CA, Global | English | Latin | No | Default |
| EU (DE, AT, CH) | German | Latin | No | |
| EU (FR, BE, LU) | French | Latin | No | |
| EU (ES, PT, IT, NL, PL, etc.) | Per-country | Latin | No | |
| India | English + Hindi + regional (Tamil, Telugu, Bengali, etc.) | Devanagari + Latin | No | English is primary for commerce |
| Middle East (SA, AE, KW, QA, OM, BH) | Arabic + English | Arabic | **Yes** | RTL layout required |
| Middle East (IL) | Hebrew + English | Hebrew | **Yes** | RTL layout required |
| Middle East (TR) | Turkish | Latin | No | |
| China | Simplified Chinese | Hanzi | No | Requires localisation |
| Japan | Japanese | Kanji + Kana | No | |
| Korea | Korean | Hangul | No | |
| Southeast Asia | Per-country (Thai, Vietnamese, Indonesian, Malay, etc.) | Per-country | No | |
| Brazil | Portuguese (BR) | Latin | No | |

### 32.5 RTL implementation notes

The mobile app must support RTL for Arabic and Hebrew users:

1. Expo React Native supports RTL via `I18nManager.forceRTL(true)`
2. Layout must use `marginStart`/`marginEnd` instead of `marginLeft`/`marginRight`
3. Icons that imply direction (chevrons, back arrows) must flip
4. Text alignment must use `textAlign: 'auto'` (respects RTL)
5. Test with both LTR and RTL in the simulator

---

## 33. Per-Region Tax Compliance

### 33.1 Tax rules by cluster (from backend code)

| Cluster | Tax type | Standard rate | Reduced rate | Threshold (GBP) | Basis | Digital services |
|---|---|---|---|---|---|---|
| IN | GST | 18% | 5% | 40,000 | Destination | 18% |
| US | Sales tax | 7.25% | — | 80,000 | Destination | — |
| UK | VAT | 20% | 5% | 85,000 | Destination | 20% |
| EUROPE | VAT | 21% | 7% | 85,000 | Destination | 21% |
| MIDDLE_EAST | VAT | 5% | — | 15,000 | Destination | 5% |
| CHINA_NEARBY | VAT | 13% | 9% | 50,000 | Destination | 13% |
| GLOBAL | None | 0% | — | — | — | — |

### 33.2 Tax registration requirements

| Region | Registration | Authority | When to register |
|---|---|---|---|
| **EU** | VAT MOSS / OSS (One Stop Shop) | Each member state's tax authority | When selling digital services to EU consumers; or when cross-border physical goods exceed €10K threshold |
| **UK** | VAT registration | HMRC | When taxable turnover exceeds £90,000 (2026) |
| **US** | Sales tax registration | Each state's DOR | When economic nexus established in a state (varies by state; typically $100K sales or 200 transactions) |
| **India** | GST registration | GSTN | When aggregate turnover exceeds ₹40 lakh (goods) or ₹20 lakh (services) |
| **Saudi Arabia** | VAT registration | ZATCA | When taxable supplies exceed SAR 375,000 (mandatory) or SAR 40,000 (voluntary) |
| **UAE** | VAT registration | FTA | When taxable supplies exceed AED 375,000 |
| **Australia** | GST registration | ATO | When GST turnover exceeds AUD 75,000 |
| **Singapore** | GST registration | IRAS | When taxable turnover exceeds SGD 1M |
| **Japan** | Consumption tax registration | NTA | When taxable sales exceed ¥10M |
| **Brazil** | ICMS / ISS registration | State/Municipality | When operating in Brazil |

### 33.3 Stripe Tax integration

Stripe Tax can automate tax calculation and collection for US, EU, UK, AU, CA, and other regions. To enable:

1. Activate Stripe Tax in the Dashboard: https://dashboard.stripe.com/tax
2. Set `STRIPE_TAX_ENABLED=true` in env vars (if the backend supports this flag)
3. Configure tax registrations in Stripe Dashboard for each region where you have nexus
4. Stripe Tax calculates the correct rate based on buyer's location and product tax code
5. For regions Stripe Tax doesn't cover (India GST, GCC VAT), the backend's per-cluster tax rules apply

### 33.4 ZATCA e-invoicing (Saudi Arabia)

> **Updated August 2026:** ZATCA Phase 2 (Integration Phase) is now **mandatory for all VAT-registered businesses** in Saudi Arabia. Wave 24 (deadline June 30, 2026) captured every business with taxable turnover exceeding SAR 375,000 — the mandatory VAT registration threshold [[EY, 2026](https://taxnews.ey.com/news/2026-1705-saudi-arabia-announces-25th-wave-of-phase-2-e-invoicing-integration)]. Wave 25 (deadline February 1, 2027) extends to businesses with turnover exceeding SAR 187,500 (the voluntary registration threshold) [[SRR, 2026](https://srrconsultants.com/articles/zatca-phase-2-integration-requirements)].

**What Phase 2 requires:**
- **B2B (Tax Invoices):** Must be submitted to ZATCA's Fatoora platform via API for **clearance** before sharing with the buyer. ZATCA validates the XML and adds a cryptographic stamp + QR code.
- **B2C (Simplified Tax Invoices):** Must be **reported** to Fatoora within **24 hours** of generation.
- **Invoice format:** UBL 2.1 XML (or PDF/A-3 with embedded XML), Arabic + English content
- **Mandatory fields:** UUID, previous invoice hash, ZATCA cryptographic stamp, QR code (9 fields TLV base64)
- **EGS registration:** Each e-invoice generation solution must be onboarded with ZATCA and obtain a CSID (Client-Side ID)

**Implementation for ThryftVerse:**
1. Register with ZATCA (Fatoora portal: https://fatoora.zatca.gov.sa)
2. Integrate with a ZATCA-compliant e-invoicing solution (or build a custom EGS)
3. Wire Phase 2 clearance into the payment-success webhook so finance never touches it manually [[Mantiqi, 2026](https://mantiqi.com/blog/zatca-phase-2-einvoicing-guide-saudi-2026)]
4. Each invoice must include a QR code and cryptographic stamp
5. **This is required when Saudi commercial activity begins** — not optional, not deferred. If ThryftVerse has Saudi sellers generating invoices, ZATCA Phase 2 compliance is mandatory from the first invoice.

---

## 34. Per-Region Shipping Integration

### 34.1 Carriers by cluster (from backend code)

| Cluster | Carriers | Price from (GBP) | ETA (days) | Tracking |
|---|---|---|---|---|
| **IN** | Delhivery, Blue Dart, India Post | 1.35 - 2.20 | 1-6 | Yes |
| **US** | USPS, UPS, FedEx | 2.15 - 3.35 | 1-5 | Yes |
| **UK** | Evri, Royal Mail, DPD | 2.89 - 4.50 | 1-3 | Yes |
| **EUROPE** | DHL Parcel, GLS, DPD EU | 2.95 - 3.35 | 1-5 | Yes |
| **MIDDLE_EAST** | Aramex, DHL Express, Fetchr | 2.30 - 3.60 | 1-4 | Yes |
| **CHINA_NEARBY** | SF Express, Cainiao, DHL eCommerce Asia | 1.95 - 3.20 | 1-5 | Yes |
| **GLOBAL** | (none — explicit shipping-unavailable state) | — | — | — |

### 34.2 Easyship integration (multi-carrier shipping labels)

The backend supports Easyship for shipping label generation:

1. Go to https://www.easyship.com → sign up
2. Complete account setup (warehouse address, product categories)
3. Go to **Settings** → **API** → generate API key
4. Set env vars: `EASYSHIP_API_KEY`, `EASYSHIP_API_BASE_URL`, `EASYSHIP_WEBHOOK_SECRET`
5. Easyship provides rates from 250+ carriers globally, including all carriers listed above
6. Webhook URL: `https://api.thryftverse.app/shipping/webhooks/easyship`

### 34.3 Customs and restricted items

The backend defines restricted items per cluster (from `countryCapabilities.ts`). Key restrictions:

| Region | Restricted | Prohibited |
|---|---|---|
| **IN** | Electronics (BIS cert), Cosmetics (CDSCO) | Weapons, Counterfeit |
| **US** | Firearms (FFL), Pharmaceuticals (FDA), Cosmetics (FDA) | Ivory, Counterfeit |
| **UK** | Knives (Offensive Weapons Act), Electronics (UKCA/CE), Cosmetics (UKCPNP) | Ivory, Counterfeit |
| **EU** | Electronics (CE), Cosmetics (CPNP), Hazardous materials (REACH) | Ivory, Counterfeit |
| **ME** | Alcohol (regional), Pharmaceuticals (MoH), Cosmetics (SFDA) | Adult content, Ivory, Counterfeit |
| **CN** | Electronics (CCC), Cosmetics (NMPA), Pharmaceuticals (NMPA) | Adult content, Ivory, Counterfeit |
| **GLOBAL** | — | Counterfeit, Ivory, Weapons |

### 34.4 Shipping zone configuration

The backend defines shipping zones per cluster:

| Zone | Countries included |
|---|---|
| `domestic` | Same country as seller |
| `regional` | Same cluster (e.g., EU sellers → EU buyers) |
| `europe` | All EUROPE cluster countries |
| `north_america` | US, CA, MX |
| `asia_pacific` | CHINA_NEARBY cluster + AU, NZ |
| `middle_east` | MIDDLE_EAST cluster |
| `global` | Worldwide |

---

## 35. Per-Region Data Residency

### 35.1 Data residency matrix

| Region | Primary DB | Read replica | Redis | Object storage | Key-service | Backup |
|---|---|---|---|---|---|---|
| **EU (primary)** | Neon EU West (Amsterdam) | — | Upstash EU West | R2 `jurisdiction: "eu"` | EU (NL) | EU + SG (secondary) |
| **US** | (EU primary) | Neon US East (Virginia) | (EU primary) | R2 US bucket | EU (stays) | EU + US |
| **UK** | (EU primary) | Neon EU West (London) | (EU primary) | R2 EU bucket (shared) | EU (stays) | EU |
| **IN** | (EU primary) | Neon Singapore (logical replication — no Mumbai region) | Upstash Mumbai (ap-south-1) | R2 APAC bucket | EU (stays) | EU + SG |
| **SG/Asia** | (EU primary) | Neon Singapore (logical replication) | Upstash Singapore | R2 APAC bucket | EU (stays) | EU + SG |
| **GCC** | (EU primary) | Neon EU West (read replica) | (EU primary) | R2 EU bucket | EU (stays) | EU |
| **Africa** | (EU primary) | Neon EU West (read replica) | (EU primary) | R2 EU bucket | EU (stays) | EU |
| **LATAM** | (EU primary) | Neon US East (read replica) | (EU primary) | R2 US bucket | EU (stays) | EU + US |
| **Oceania** | (EU primary) | Neon Singapore (read replica) | (EU primary) | R2 APAC bucket | EU (stays) | EU + SG |
| **China** | China (Alibaba/Tencent Cloud) | — | China | China | China (separate) | China |

### 35.2 Key principles

1. **Key-service never leaves EU.** Encryption keys are the crown jewel. EU/NL has the strongest encryption-at-rest legal protections (no key disclosure mandate equivalent to UK RIPA). All regions route encryption/decryption through the EU key-service.

2. **Writes always go to EU primary.** The day-one architecture is single-write-primary (EU) + read-replicas. Active-active writes are a future evolution (§20.7) for >100K MAU.

3. **Read replicas for latency, not jurisdiction.** Read replicas reduce query latency for users far from the EU primary. They do not change the jurisdiction of the primary write path. Data residency for compliance is handled at the storage layer (R2 jurisdictional buckets) and by routing specific user data to region-specific tables/columns when required (future enhancement).

4. **China requires full local stack.** If pursuing the Chinese market, PIPL requires personal data of Chinese citizens to be stored in China. This means a completely separate deployment (Chinese cloud provider, Chinese DB, Chinese Redis, Chinese key-service). This is not a read replica — it is a parallel infrastructure. Do not attempt without a Chinese entity and local partner.

5. **Backups in two jurisdictions.** Primary backup in EU (same as primary data). Secondary backup in a different jurisdiction (SG for APAC users, US for Americas) so a single seizure does not destroy all backups.

### 35.3 Neon cross-region replication provisioning

> **Critical (verified August 2026):** Neon read replicas are **same-region only**. Cross-region replication requires creating **separate Neon projects** in each target region and setting up **Neon-to-Neon logical replication** (Postgres publications + subscriptions). This is not a native read replica — it is an independent database that receives streamed changes.

```bash
# EU primary (always — Frankfurt or London)
DATABASE_URL=postgresql://...eu-central-1.aws.neon.tech/thryftverse?sslmode=require

# US cross-region logical replica (when ≥1K US MAU)
# Create a separate Neon project in aws-us-east-1, then set up logical replication
DATABASE_REPLICA_URL_US=postgresql://...us-east-1.aws.neon.tech/thryftverse?sslmode=require

# UK cross-region logical replica (when ≥1K UK MAU)
# Create a separate Neon project in aws-eu-west-2 (London), then set up logical replication
DATABASE_REPLICA_URL_UK=postgresql://...eu-west-2.aws.neon.tech/thryftverse?sslmode=require

# IN cross-region logical replica (when ≥1K IN MAU)
# Neon has NO Mumbai region — use Singapore (closest to India, ~50ms from Mumbai)
# Create a separate Neon project in aws-ap-southeast-1, then set up logical replication
DATABASE_REPLICA_URL_IN=postgresql://...ap-southeast-1.aws.neon.tech/thryftverse?sslmode=require

# SG cross-region logical replica (when ≥1K APAC MAU)
# Same Singapore project as IN (or a separate one if scale demands)
DATABASE_REPLICA_URL_SG=postgresql://...ap-southeast-1.aws.neon.tech/thryftverse?sslmode=require
```

**Setting up Neon-to-Neon logical replication:**
1. Enable logical replication on the EU primary project (changes `wal_level` to `logical` — **irreversible**)
2. Create a publication on the EU primary: `CREATE PUBLICATION thryftverse_pub FOR ALL TABLES;`
3. Create a separate Neon project in the target region (e.g., Singapore)
4. Create a subscription on the target project: `CREATE SUBSCRIPTION thryftverse_sub CONNECTION 'postgresql://...eu-primary...' PUBLICATION thryftverse_pub;`
5. The target project now receives streamed changes. Route read-heavy queries to it.
6. Monitor replication lag via `pg_stat_subscription` on the target.

> The backend's query layer must route read-heavy queries (feed, listings, recommendations) to the nearest cross-region logical replica. Write queries always go to the EU primary. This routing logic should be implemented in the DB connection pool configuration.

### 35.4 Cloudflare R2 multi-region buckets

> **Updated August 2026:** Cloudflare R2 now supports **three jurisdictions**: `eu` (European Union), `us` (United States, shipped August 17, 2026), and `fedramp` (FedRAMP boundary) [[Cloudflare R2 data location docs, 2026](https://developers.cloudflare.com/r2/reference/data-location/)]. The `us` jurisdiction guarantees storage and processing inside the United States, reachable only at `https://<ACCOUNT_ID>.us.r2.cloudflarestorage.com` [[DEV Community, Aug 2026](https://dev.to/mr_manushukla/cloudflare-r2-us-jurisdiction-shipped-17-august-2026-4-things-it-breaks-42nn)]. The jurisdiction **cannot be changed after bucket creation** — choose correctly at creation time.

```jsonc
// EU bucket (primary, jurisdictional — data cannot leave EU)
{
  "r2_buckets": [
    { "binding": "MEDIA_EU", "bucket_name": "thryftverse-media-eu", "jurisdiction": "eu" }
  ]
}

// US bucket (when US data residency needed — jurisdictional, shipped Aug 2026)
{
  "r2_buckets": [
    { "binding": "MEDIA_US", "bucket_name": "thryftverse-media-us", "jurisdiction": "us" }
  ]
}

// APAC bucket (when IN/SG data residency needed — no APAC jurisdiction yet, use location hint)
{
  "r2_buckets": [
    { "binding": "MEDIA_APAC", "bucket_name": "thryftverse-media-apac", "location_hint": "apac" }
  ]
}
```

> **Note:** R2 does not yet have an `apac` or `in` jurisdiction — only `eu`, `us`, and `fedramp`. For APAC data residency, use a `location_hint` (best-effort, not a legal guarantee). If strict APAC data residency is required (e.g., for PIPL compliance in China), use a Chinese cloud provider instead.

Route uploads to the correct bucket based on the user's country cluster. Media for EU users → EU bucket, IN users → APAC bucket, US users → US bucket.

---

## 36. Multi-Country Launch Checklist

### Pre-launch (non-negotiable, before first user)

| # | Action | Region | Effort | When |
|---|---|---|---|---|
| 1 | EU primary deployment (§§4-9) | EU | S | Pre-launch |
| 2 | Stripe configured (live keys + webhooks) | Global | S | Pre-launch |
| 3 | Key-service in EU (NL) | EU | S | Pre-launch |
| 4 | Cloudflare R2 with `jurisdiction: "eu"` | EU | S | Pre-launch |
| 5 | KYC vendor configured (Persona or Stripe Identity) | Global | S | Pre-launch |
| 6 | Privacy policy + terms of service (multi-jurisdiction) | Global | M | Pre-launch |
| 7 | GDPR consent flow in app | EU/UK | S | Pre-launch |
| 8 | CCPA opt-out mechanism in app | US | S | Pre-launch |
| 9 | Data processing agreements with all processors | Global | M | Pre-launch |
| 10 | Direct APK download page | Global | S | Pre-launch |
| 11 | Self-hosted OTA server in EU | Global | M | Pre-launch |
| 12 | Multi-sig for critical keys | Global | M | Pre-launch |

### Post-launch (gated on demand)

| # | Action | Trigger | Region |
|---|---|---|---|
| 13 | Razorpay integration + IN read replica | ≥1K IN MAU | IN |
| 14 | Mollie integration | ≥1K EU MAU (or day 1 if EU is primary market) | EU |
| 15 | Tap integration + GCC compliance | ≥1K GCC MAU | ME |
| 16 | Flutterwave integration + AFRICA cluster | ≥1K Africa MAU | Africa |
| 17 | US read replica + US data residency | ≥1K US MAU | US |
| 18 | UK read replica + ICO registration | ≥1K UK MAU | UK |
| 19 | SG read replica + PDPA compliance | ≥1K APAC MAU | SG |
| 20 | Arabic RTL support in mobile app | ≥1K ME MAU | ME |
| 21 | ZATCA e-invoicing (Saudi Arabia) | ≥1K SA MAU with commercial activity | SA |
| 22 | Chinese market entry (separate infrastructure) | Strategic decision to pursue China | CN |
| 23 | Stripe Tax activation | When tax nexus established in multiple US states or EU countries | Global |
| 24 | Easyship shipping label integration | When seller volume justifies automated labels | Global |
| 25 | Secondary DNS provider | When Cloudflare dependency is a measured risk | Global |

---

## 37. Validation Report — September 2026

> This section documents the online research and validation performed against primary sources to verify all claims in this document. Every claim was checked against official documentation, regulatory publications, or authoritative secondary sources.

### 37.1 Claims verified as accurate

| Claim | Source | Date verified | Status |
|---|---|---|---|
| Telegram Group Inc. (BVI) + Telegram FZ-LLC (Dubai) structure | LegalClarity, NZZ, RevenueMemo | Aug 2026 | ✅ Accurate |
| Proton AG Geneva, Foundation-controlled since June 2024 | EU Vetted | Aug 2026 | ✅ Accurate |
| Proton relocating some infrastructure from Switzerland (VÜPF) | heise online | Aug 2026 | ✅ Accurate |
| Signal Foundation 501(c)(3) nonprofit structure | LegalClarity, Signal Foundation | Aug 2026 | ✅ Accurate |
| BVI holding company benefits (zero tax, one director, English common law) | Conyers, Appleby, Air Corporate | Aug 2026 | ✅ Accurate |
| Cloudflare R2 `jurisdiction: "eu"` support | Cloudflare docs, GitHub #5513 | Aug 2026 | ✅ Accurate (updated — `us` jurisdiction also now available) |
| Expo `expo-updates` self-hosted update server support | Expo docs, multiple open-source implementations | Aug 2026 | ✅ Accurate |
| Google Play blocked in China since 2012 | AppInChina | Aug 2026 | ✅ Accurate |
| EU has no key disclosure mandate equivalent to UK RIPA | Proton VPN transparency report | Aug 2026 | ✅ Accurate |
| Stripe webhook events: `charge.dispute.funds_withdrawn`, `refund.failed`, `setup_intent.succeeded`, `setup_intent.setup_failed` are valid | Stripe API docs | Aug 2026 | ✅ Accurate |
| Stripe webhook events: `refund.canceled` and `payout.reversed` are NOT valid event types | Stripe API docs | Aug 2026 | ✅ Accurate (`payout.canceled` and `transfer.reversed` are the correct names) |
| Upstash Redis supports Mumbai (ap-south-1), Singapore, and 12+ regions | Upstash docs | Aug 2026 | ✅ Accurate |
| Razorpay X payouts support webhook events | Razorpay docs | Aug 2026 | ✅ Accurate |
| Mollie supports SEPA payouts and webhook events | Mollie docs | Aug 2026 | ✅ Accurate |
| Tap supports AED, SAR, KWD, QAR, OMR, BHD, EGP, JOD | Tap documentation | Aug 2026 | ✅ Accurate |

### 37.2 Claims corrected after validation

| Original claim | Correction | Source | Date |
|---|---|---|---|
| **Neon has a Mumbai region** | **Neon does NOT have a Mumbai region.** Available regions: US East (Virginia, Ohio), US West (Oregon), Frankfurt, London, Singapore, Sydney, São Paulo. Closest to India is Singapore (~50ms from Mumbai). | [Neon regions docs](https://neon.com/docs/introduction/regions) | Aug 2026 |
| **Neon read replicas can be cross-region** | **Neon read replicas are same-region only.** Cross-region replication requires separate Neon projects + logical replication (publications/subscriptions). This is a critical architectural constraint. | [Neon read replicas docs](https://neon.com/docs/introduction/read-replicas), [Neon-to-Neon logical replication](https://neon.com/docs/guides/logical-replication-neon-to-neon) | Aug 2026 |
| **Cloudflare R2 has only `eu` and `fedramp` jurisdictions** | **R2 now has `us` jurisdiction** (shipped August 17, 2026). Three jurisdictions: `eu`, `us`, `fedramp`. No `apac` jurisdiction yet. Jurisdiction cannot be changed after bucket creation. | [Cloudflare R2 data location](https://developers.cloudflare.com/r2/reference/data-location/), [DEV Community Aug 2026](https://dev.to/mr_manushukla/cloudflare-r2-us-jurisdiction-shipped-17-august-2026-4-things-it-breaks-42nn) | Aug 2026 |
| **DPDP Rules "pending"** | **DPDP Rules 2025 were notified on November 13, 2025.** Phased implementation: immediate (Data Protection Board), Nov 13, 2026 (consent manager), May 13, 2027 (substantial provisions). | [EY India](https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025), [KPMG India](https://assets.kpmg.com/content/dam/kpmgsites/in/pdf/2025/11/dpdp-rules-2025-guidance-to-dpdp-act-implementation.pdf) | Aug 2026 |
| **ZATCA Phase 2 is a "future integration"** | **ZATCA Phase 2 is now mandatory for ALL VAT-registered SA businesses.** Wave 24 (deadline June 30, 2026) captured all businesses above SAR 375K. Wave 25 (deadline Feb 1, 2027) extends to SAR 187,500. | [EY Tax News](https://taxnews.ey.com/news/2026-1705-saudi-arabia-announces-25th-wave-of-phase-2-e-invoicing-integration), [SRR Consultants](https://srrconsultants.com/articles/zatca-phase-2-integration-requirements) | Aug 2026 |
| **Railway has 4 metal regions** (implied as stable) | **Railway docs confirm 4 regions** (US West, US East, EU West, Asia Southeast). A blog post claims 7 but this is forward-looking (Gen2 hardware rollout, Q3 2026+). Docs are authoritative. | [Railway regions docs](https://docs.railway.com/deployments/regions), [Railway multi-region guide](https://docs.railway.com/guides/multi-region-api-failover), [Railway Summer 2026 blog](https://blog.railway.com/p/railway-summer-update-2026) | Aug 2026 |
| **Mollie uses per-payment webhooks only** | **Mollie now has next-gen Webhook Subscriptions API** with persistent event subscriptions (payment.authorized, payment.paid, payment.failed, etc. + payout events). SHA256 HMAC signing. | [Mollie webhooks docs](https://docs.mollie.com/reference/webhooks-new), [Mollie payout webhooks](https://docs.mollie.com/gu/reference/payouts-api-webhooks) | Aug 2026 |
| **China PIPL has 3 transfer routes (generic)** | **PIP Certification Measures effective January 1, 2026** — the third route is now formally operational. CAC published official Q&A on July 24, 2026. Three routes: CAC Security Assessment, Standard Contract filing, PIP Certification. | [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/advisories/2025/11/china-requirements-personal-information-protection-certification), [Chambers](https://chambers.com/articles/the-final-piece-of-chinas-cross-border-personal-information-transfer-regulations), [China Gateway 360](https://china-gateway360.com/cross-border-data-transfer-2026-3-tier-compliance-foreign-firms/) | Aug 2026 |
| **Stripe API version unspecified** | **Latest Stripe API version is `2026-08-26.dahlia`** (4th flora-named release). stripe-node v22.6.0 pins this version. | [Stripe changelog](https://docs.stripe.com/changelog/dahlia), [stripe-node v22.6.0](https://github.com/stripe/stripe-node/releases/tag/v22.6.0) | Aug 2026 |
| **Razorpay payout webhook events (incomplete list)** | **Expanded to 10 events:** payout.pending, payout.queued, payout.initiated, payout.processed, payout.updated, payout.reversed, payout.failed, payout.rejected, payout.downtime.started, payout.downtime.resolved. | [Razorpay payout webhooks](https://razorpay.com/docs/webhooks/payouts/) | Aug 2026 |

### 37.3 Claims that could not be independently verified

| Claim | Notes |
|---|---|
| Flutterwave supports NGN, GHS, KES, UGX, TZS, ZAR, RWF, EGP, USD | Based on Flutterwave's general documentation; specific currency support varies by account type and country. Verify at https://flutterwave.com before integration. |
| Tap supports AED, SAR, KWD, QAR, OMR, BHD, EGP, JOD | Based on Tap's general documentation; specific currency support depends on merchant account configuration. Verify at https://www.tap.company before integration. |
| Persona supports Emirates ID and Iqama verification | Persona supports 190+ countries but specific ID type support varies. Verify at https://withpersona.com before integration. |

### 37.4 Validation methodology

All claims in §§19–36 were validated against primary sources using the following methodology:

1. **Official documentation** — vendor docs (Stripe, Cloudflare, Neon, Upstash, Railway, Mollie, Razorpay, Expo) were checked directly
2. **Regulatory publications** — government sources (MeitY for DPDP, ZATCA for Saudi e-invoicing, CAC for PIPL) were checked directly
3. **Authoritative secondary sources** — EY, KPMG, Chambers, Arnold & Porter for legal/regulatory claims
4. **Date of access** — all sources were accessed in August-September 2026
5. **Cross-referencing** — claims were checked against at least 2 independent sources where possible

**This validation was performed on September 1, 2026. Re-validate before any production deployment.**

---

*Document maintained by the Thryftverse engineering team. Update this file when infrastructure, legal structure, or jurisdictional strategy changes. The operational sections (§§1–18) cover how to deploy. The resilience sections (§§19–25) cover how to deploy so the platform survives. §26 contains the sources. §§27–36 cover multi-country deployment across US, UK, EU, Middle East/GCC, India, South Asia, Asia, China, Africa, LATAM, and Oceania. §37 contains the validation report. All five parts are required for a flagship product.*
