# ThryftVerse — Non-US Deployment Guide (EU Control Plane + Asia Satellites)

> **Status:** Authoritative deployment doctrine. Supersedes the vendor choices in `DEPLOYMENT.md` §§2–14 for the global platform. `DEPLOYMENT.md` remains valid for the **US satellite cluster** only.
>
> **Doctrine:** The platform's control plane — API, databases, caches, media, keys, email, observability — lives exclusively under **EU/Asia vendor jurisdiction**. US-domiciled services are permitted **only** inside the US cluster serving US users, and for unavoidable distribution endpoints (Apple/Google stores, APNs/FCM push tokens).
>
> **Verified:** All vendor capabilities, regions, and jurisdictions confirmed via live research on **2026-09-24** (see `.flagship/research-ledger-2026-09-24-deployment-infra.md`).

---

## Table of Contents

1. [Vendor Map — the non-US stack](#1-vendor-map--the-non-us-stack)
2. [Global Architecture](#2-global-architecture)
3. [Every-Country Coverage Matrix](#3-every-country-coverage-matrix)
4. [Accounts & Credentials Checklist](#4-accounts--credentials-checklist)
5. [Generate Production Secrets](#5-generate-production-secrets)
6. [OVHcloud Provisioning — EU Control Plane](#6-ovhcloud-provisioning--eu-control-plane)
7. [Deploy the Services](#7-deploy-the-services)
8. [Edge Layer — GeoDNS, CDN, TLS](#8-edge-layer--geodns-cdn-tls)
9. [Email — Brevo (required code change)](#9-email--brevo-required-code-change)
10. [Error Tracking — self-hosted GlitchTip](#10-error-tracking--self-hosted-glitchtip)
11. [Mobile Pipeline — Codemagic + Store Submission](#11-mobile-pipeline--codemagic--store-submission)
12. [Environment Variables — revised](#12-environment-variables--revised)
13. [Webhooks](#13-webhooks)
14. [Migrations & Health Checks](#14-migrations--health-checks)
15. [Asia Satellites — SG and IN Runbooks](#15-asia-satellites--sg-and-in-runbooks)
16. [US Satellite Policy](#16-us-satellite-policy)
17. [Failover, Backup & DR](#17-failover-backup--dr)
18. [Residual US Touchpoints — honest list](#18-residual-us-touchpoints--honest-list)
19. [Countries We Do Not Serve Directly](#19-countries-we-do-not-serve-directly)
20. [Cost Summary](#20-cost-summary)
21. [Graduation Triggers](#21-graduation-triggers)

---

## 1. Vendor Map — the non-US stack

Every vendor below is verified non-US-domiciled. Jurisdiction follows the **vendor's legal entity**, not the datacenter geography.

| Layer | Vendor (HQ) | Replaces (US) | Regions used |
|---|---|---|---|
| Compute / orchestration | **OVHcloud** Managed K8s (France) | Railway | EU-WEST-PAR (3-AZ), GRA, DE, WAW · SGP · AP-SOUTH-MUM |
| Compute (alt / simple) | **UpCloud** VPS + self-hosted Coolify (Finland) | Railway | AMS, FRA, HEL, STO · SG-SIN1 · SYD |
| PostgreSQL | **OVHcloud Managed PG** (France) | Neon | GRA/DE/WAW/PAR · SGP · MUM — up to 3-AZ, 99.99% SLA |
| Redis | **OVHcloud Managed Valkey** (France) | Upstash | Same regions |
| Object storage | **OVHcloud S3** (France, no egress fees) | Cloudflare R2 | EU multi/single-zone · SGP |
| GeoDNS + CDN + DDoS | **Gcore** (Luxembourg) — has Mumbai/Tokyo/HK/Dubai PoPs, free egress | Cloudflare | Global anycast, GeoDNS |
| CDN (alt, cheaper) | **bunny.net** (Slovenia) | Cloudflare | 82 countries |
| Transactional email | **Brevo** (France — data hosted FR+DE, ISO 27001) | Resend | EU |
| Error tracking | **GlitchTip** self-hosted (Sentry-compatible) | Sentry SaaS | On our EU infra |
| Uptime / logs | **Better Stack** (Czechia) or self-hosted Grafana stack | — | EU |
| Analytics | **Plausible** (Estonia) or self-hosted Matomo | PostHog | EU |
| KYC | **iDenfy** (Lithuania) / **IDnow** (Germany) / **Fourthline** (NL) | Persona (US) | EU processing |
| Secrets | **SOPS + age** or self-hosted Infisical | Doppler | On our infra |
| Mobile CI/CD | **Codemagic** (Estonia — Nevercode OÜ) | EAS cloud builds | EU company |
| Registrar + DNS zone | OVH Domains / Gandi (FR) / INWX (DE) | US registrars | — |
| Source repo (optional swap) | Codeberg (DE) / self-hosted GitLab CE | GitHub | Code ≠ user data; optional |

### 1.1 Marketplace payment rails — flagship-proven

This layer decided whether the doctrine was viable. Verified 2026-09-24:

| Rail | HQ | Flagship proof | Fit |
|---|---|---|---|
| **Mangopay** | Luxembourg/FR | **Vinted** (our closest competitor — confirmed on vinted.co.uk help page), Rakuten France (100K-user migration), ManoMano, Debenhams | Wallets, escrow/holding wallets, **circular money** (seller earnings reusable for purchases — maps directly to our wallet + 1ze loop), split pay-in/payout, multi-currency |
| **Adyen for Platforms** | NL | **eBay's** payment backbone | Balance accounts, split payments, managed payouts, onboarding/KYC in 33+ countries/23 languages, Issuing + Capital. Stripe Connect's true peer |
| **Mollie Connect for Marketplaces** | NL | Mirakl partnership | Delayed routing (hold funds until delivery confirmed), multi-seller checkout, KYB onboarding — solid mid-tier, easier onboarding than Adyen |
| **Nium** | SG | Bank-grade clients | Payouts to 190+ countries, 100 currencies, 100+ real-time corridors — Asia cross-border payout layer |
| Razorpay + RazorpayX | IN | — | IN pay-in + payouts |
| Tap | AE | — | GCC pay-in |
| Wise | UK | — | UK/EU cross-border payouts (UK ≠ US under doctrine) |

**Chosen money path (user decision 2026-09-24):** **Stripe-primary** — Connect `separate charges and transfers` = the escrow-hold pattern; Connect accounts in ~90+ countries for seller payouts; pay-ins from ~195 countries. **Doctrine exception recorded:** Stripe is US-incorporated — accepted for the *money rail* (payment data is PCI-scoped, not control-plane data); Mangopay remains the EU-jurisdiction e-wallet option if real per-user IBAN wallets are needed. **Critical structural fact:** the Stripe platform must be domiciled on the **Cyprus (EEA) OpCo** — a UAE-domiciled platform is restricted to UAE-only connected accounts and cannot use `on_behalf_of` (verified Stripe Connect docs). Corridors Stripe can't reach → Nium payouts. Razorpay IN / Tap GCC retained for local rails.

### 1.2 Supporting layers — verified non-US

| Layer | Vendor (HQ) | Flagship evidence |
|---|---|---|
| SMS / omnichannel | **Sinch** (SE) | Serves 8 of 10 largest tech companies; SMS/RCS/WhatsApp/push one API |
| Push engagement | **Batch** (FR) | EU push/CRM platform (APNs/FCM are transport — unavoidable, see §18) |
| Live streaming / VOD | **api.video** (FR, Roubaix — on OVH infra) | 140+ PoP CDN, RTMPS/SRT ingest, LL-HLS, custom domains, 99.9% SLA — replaces Mux for live commerce |
| KYC | **iDenfy** (LT) / **IDnow** (DE) | iDenfy: ~$1.35/verify, 24/7 human review, NFC, 70+ eID methods. IDnow: BaFin-grade VideoIdent, eIDAS/QES for regulated EU markets |
| Tax automation | **Fonoa** (IE) | Determination across 190+ jurisdictions <200ms, e-invoicing 50+ mandates (incl. SG InvoiceNow, ZATCA-type flows), VAT ID validation — replaces Stripe Tax |
| Feature flags | **Unleash** self-hosted (NO) | Open-source, enterprise-proven |
| Support inbox | **Crisp** (FR) / **Trengo** (NL) / self-hosted Zammad (DE) | EU support tooling |
| Maps (if needed) | **HERE** (NL) / **MapTiler** (CH) | Automotive-grade |
| FX rates | **ECB via frankfurter.dev** (free, EU) or OVH-hosted self-pull | Public ECB reference rates |
| Container registry | **OVH Managed Private Registry** (Harbor) | EU-hosted, no Docker Hub limits |
| Search | **Meilisearch** (FR company, self-hosted) | Already in compose stack |
| Secrets | **SOPS+age** / self-host Infisical or OpenBao | Zero third-party exposure |
| CI (backend) | Self-hosted Woodpecker/GitLab-CE or Codemagic | EU-hosted runners |

**Media/search/search-infra inside the stack:** Meilisearch, MinIO→(OVH S3), Postgres, Valkey, PgBouncer, Caddy — all self-hosted open source on our EU/Asia infra. Zero vendor jurisdiction exposure.

### 1.3 Flagship-parity assessment — honest strengths and weaknesses

Where this stack matches flagship production quality **with direct evidence**:

- **Payments:** Mangopay runs Vinted's actual C2C wallet/escrow/payout stack; Adyen runs eBay. This is not a downgrade from Stripe Connect — it is the same tier, EU-jurisdiction. The wallet+circular-money primitive is arguably *better* for our 1ze closed loop than Stripe's model.
- **Edge/DDoS:** Gcore's 200+ Tbps scrubbing + WAAP tiers is the same class Cloudflare sells to enterprises; free egress beats Cloudflare pricing.
- **Live commerce:** api.video (FR) covers RTMPS/SRT ingest → LL-HLS → global CDN with custom domains — the Mux equivalent without the US entity.
- **Tax:** Fonoa (IE) is the same category leader Stripe Tax occupies — 190+ jurisdictions, sub-200ms, mandate-driven e-invoicing.

Where the stack is **weaker than the US-native equivalent — stated honestly**:

- **Transactional email latency.** Brevo's shared marketing/transactional infrastructure delivers in ~5–15s vs Postmark-class 1–3s (Mailflow Authority 2026). Mitigation: dedicated IP on the Business plan + warm-up; or split — Mailjet (FR, Sinch-owned) for marketing, self-hosted Postal on EU VPS for critical transactional. Password-reset speed is a UX surface; treat it seriously.
- **OVH operational noise.** StatusGator records ~147 incidents since Jan 2025 — mostly regional VPS/bare-metal blips, not control-plane loss; managed services ran 100%/90d (OutageDeck). This is noisier than AWS/GCP. Mitigation is architectural, not hopeful: Paris 3-AZ + Gcore health-check failover + rehearsed UpCloud cold-standby (§17). The 2021 Strasbourg fire is why we use 3-AZ regions, not single-AZ.
- **Managed-service maturity.** OVH managed PG/Valkey is younger than RDS/Neon. Mitigate with the same discipline flagships use: PgBouncer, tested restores (quarterly DR drill), read replica, and the logical-replication path to SG.
- **PaaS DX.** No OVH equivalent of Railway's one-click. Coolify recovers ~90% of it.

**Net assessment:** the doctrine holds at flagship quality on every layer *with* the mitigations above. No layer has a blocking gap; email latency and OVH noise are the two to engineer around.

### 1.4 Zero-compromise substitution matrix — AWS → sovereign equivalent

The doctrine's core claim: **no American tech giant in the critical path, no
compromise in technology or scale.** This is the complete mapping. ★ marks
services our architecture actually uses; everything else is listed so the
gap is visible, not hidden.

| AWS service | Sovereign equivalent | Parity verdict |
|---|---|---|
| ★ EC2 (compute) | OVHcloud bare metal + VPS, UpCloud, Hetzner | **Equal or better** — OVH builds its own servers; Hetzner gives 14× compute value/€ |
| ★ RDS Postgres | OVH Managed PG (99.99% 3-AZ) or self-hosted + PgBouncer (already in compose) | **RDS-tier equal.** Aurora-tier (global DB, 15 replicas) unmatched — but we don't need it at launch scale |
| ★ ElastiCache | OVH Managed Valkey / self-hosted Redis (in compose) | Equal |
| ★ S3 | OVH S3 / MinIO (in compose) | Equal — same API, free egress vs $83/TB |
| ★ CloudFront | Gcore / bunny.net CDN | Equal at our scale; CF's edge network is larger but 200+ Tbps scrubbing beats CF's standard tier |
| ★ Route53 | Gcore GeoDNS / bunny DNS | Equal + health-check failover included |
| ★ ALB/NLB | Caddy (in compose) / OVH LB / Traefik | Equal |
| ★ EKS | OVH Managed K8s (free control plane) / self-hosted k3s | Equal |
| ★ ECR | OVH Managed Private Registry / self-hosted Harbor | Equal |
| ★ SQS/SNS | BullMQ on Redis (already used) / self-hosted NATS or RabbitMQ | Equal for our workload; SQS durability edge irrelevant inside one cluster |
| ★ Lambda | self-hosted on K8s (Knative/OpenFaaS) or Scaleway Functions | **Weaker** — cold-start UX is DIY. We use workers, not functions — non-issue |
| ★ CloudWatch | GlitchTip + self-hosted Grafana/Prometheus/Loki on EU VM | Equal for app observability; more ops work |
| ★ Secrets Manager | SOPS+age / self-hosted Vault (in plan) | Equal |
| ★ WAF/Shield | Gcore WAAP + OVH VAC anti-DDoS (free) | Equal |
| ★ SES | Brevo (FR) — §1.3 latency caveat | Slightly weaker; mitigated |
| DynamoDB | self-hosted ScyllaDB on bare metal (Discord's actual solution) | Equal at effort; ScyllaDB is what a flagship uses |
| Aurora | Postgres + Citus / self-hosted sharding | **Weaker** — honest gap; revisit only at planetary scale |
| SageMaker/Bedrock | self-hosted vLLM/Ray on OVH GPU (H100/A100 available) | Equal capability, more ops — and cheaper per GPU-hour |
| EventBridge | BullMQ delayed jobs / Temporal self-hosted | Equal |
| Cognito | our own auth (already built — `authEmail.ts`) | Equal — we never outsourced identity |
| Kinesis | self-hosted Redpanda (Kafka-compatible) | Equal |
| Glue/EMR | ClickHouse + Airbyte self-hosted | Equal for analytics scale |
| AppSync/Managed Blockchain/etc. | n/a — not in our architecture | — |

**The structural reason this works for us:** our stack was already
self-hosted-first (postgres, redis, minio, meilisearch, caddy, workers — all
in `docker-compose.production.yml`). We were never consuming AWS's
differentiated services, so leaving AWS costs us *operational work*, not
*capability*. That's the difference between sovereignty-as-slogan and
sovereignty-as-architecture: Vinted runs flagship scale on owned European
metal; Telegram runs it on colo'd servers under its own ASNs. Both prove
the technology isn't the compromise — the ops discipline is the price.

**What remains unavoidably American** (cannot be substituted for a mobile
product): Apple App Store + Google Play (distribution gatekeepers), APNs/FCM
(push fabric — device tokens only), and Stripe (accepted money-rail
exception, §1.1). GitHub is replaceable (self-hosted Gitea/GitLab CE or
Codeberg) if zero-US-code-hosting ever becomes a hard requirement.

## 2. Global Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │  Gcore GeoDNS + CDN + DDoS (LU jurisdiction)│
                        │  api.thryftverse.app resolves to nearest    │
                        │  healthy cluster; media on CDN edge         │
                        └───────┬──────────────┬──────────────┬───────┘
                                │              │              │
              ┌─────────────────▼──┐   ┌───────▼──────┐   ┌───▼──────────────┐
              │  EU PRIMARY        │   │  SG SATELLITE│   │  IN SATELLITE    │
              │  OVH PAR 3-AZ      │   │  OVH SGP     │   │  OVH MUM / E2E   │
              │  (control plane)   │   │              │   │  (when DPDP      │
              │                    │   │ api (ro)     │   │   demands)       │
              │ api · worker       │   │ PG read rep  │   │ api (ro)         │
              │ key-service        │   │ Valkey       │   │ PG read rep      │
              │ ml-service         │   │ S3-SGP media │   │ Valkey           │
              │ PG primary (3-AZ)  │   │              │   │ S3-MUM media     │
              │ Valkey · S3-EU     │   │              │   │                  │
              │ Meilisearch        │   │              │   │                  │
              └────────────────────┘   └──────────────┘   └──────────────────┘

              ┌───────────────────────────────────────────────────────────┐
              │  US SATELLITE (later, per policy — US users' data only)   │
              │  Any US stack permitted there: Railway/Neon/AWS us-east   │
              └───────────────────────────────────────────────────────────┘
```

**Write path:** single write primary in EU (Paris). SG/IN/US are read replicas + regional API workers forwarding writes to EU over private links. Active-active is explicitly deferred (see §21).

---

## 3. Every-Country Coverage Matrix

Driven by `backend/api/src/lib/countryCapabilities.ts`. Every country resolves to a cluster → serving region → payment gateway → data residency.

| Cluster (code) | Countries | Served from | Primary gateway | Data residency |
|---|---|---|---|---|
| `EUROPE` | 47 — EU/EEA + CH, NO, IS | EU primary (Paris) | **Stripe Connect (Cyprus platform)** → Mollie → Mangopay e-wallet option | EU |
| `UK` | GB | EU primary (London-adjacent latency) | Stripe Connect (EEA↔UK cross-border, fee-free) → Wise payouts | EU (UK adequacy) |
| `IN` | IN | SG satellite → IN when live | Razorpay pay-in + RazorpayX payout | SG now; IN when E2E/OVH-MUM live |
| `MIDDLE_EAST` | AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE | EU primary / SG | Stripe Connect (AE supported) + Tap | EU |
| `CHINA_NEARBY` | CN HK ID JP KR MN MO MY PH SG TH TW VN | SG satellite | Stripe pay-in + Nium payouts | SG |
| `US` | US | US satellite (when live) | Stripe (US platform entity) | US |
| `GLOBAL` | all remaining (Africa, LATAM, Oceania…) | nearest of EU/SG | Stripe Connect + Nium payouts | EU/SG |

**Seamless mechanism:** Gcore GeoDNS routes `api.thryftverse.app` to the nearest healthy region by resolver geography — no app-side change, no per-country builds. Media served from regional S3 behind CDN edge cache. Latency floor: EU ~10–30ms, SEA ~20–40ms, India ~40–60ms via SG (drops to ~10ms when MUM live), Americas ~80–140ms until US satellite exists.

**Honest note on the US gap before its satellite ships:** US users are served from EU at ~80–140ms API latency — acceptable for launch, not for scale. The US satellite is a *latency and policy* deployment, not a control-plane dependency.

---

## 4. Accounts & Credentials Checklist

Create these accounts first. All are non-US entities.

| # | Service | URL | What to extract | Cost |
|---|---|---|---|---|
| 1 | **OVHcloud** | ovhcloud.com | Project ID, API creds (app key/secret/consumer key), OpenStack RC | Pay-as-you-go |
| 2 | **Gcore** | gcore.com | API token (DNS + CDN) | Free DNS tier |
| 3 | **Brevo** | brevo.com | API key (`xkeysib-…`) | Free 300/day → paid |
| 4 | **OVH Domains / Gandi** | — | Domain `thryftverse.app` + DNS zone control | ~€15/yr |
| 5 | **Codemagic** | codemagic.io | Team account, store integrations | Pay-per-minute |
| 6 | **Stripe** — platform on **Cyprus entity** | stripe.com | `sk_live`, `pk_live`, Connect platform ID, webhook secret. US vendor — accepted as money rail (see §1.1 exception) | Per-transaction |
| 6a | **Mangopay** (optional e-wallet rail) | mangopay.com | Client ID + API key (sandbox→prod); only if per-user IBAN e-wallets needed | Per-transaction |
| 6b | **Adyen for Platforms** (scale path) | adyen.com | API creds + balance platform access (enterprise onboarding) | Per-transaction |
| 7 | **Mollie** | mollie.com | `live_…` API key + webhook secret | Per-transaction |
| 8 | **Razorpay** | razorpay.com | `rzp_live_…` + secret + webhook secret (needs IN entity KYC) | Per-transaction |
| 9 | **Tap** | tap.company | `sk_live_…` + webhook secret (GCC entity) | Per-transaction |
| 9b | **Nium** (Asia payouts) | nium.com | API creds — 190+ country payout rails | Per-transaction |
| 10 | **iDenfy / IDnow** | idenfy.com / idnow.io | KYC API creds | Per-verification |
| 10b | **Sinch** (SMS) | sinch.com | Service plan ID + API token | Per-message |
| 10c | **api.video** (live/VOD) | api.video | API key | Usage-based |
| 10d | **Fonoa** (tax/e-invoicing) | fonoa.com | API key | Usage-based |
| 11 | **Apple Developer** | developer.apple.com | Distribution account (store endpoint only — see §18) | $99/yr |
| 12 | **Google Play Console** | play.google.com/console | Service-account JSON for publishing | $25 once |
| 13 | **UpCloud** (optional alt) | upcloud.com | API token | Pay-as-you-go |
| 14 | **E2E Networks** (IN, when live) | e2enetworks.com | API key — Delhi NCR / Chennai | INR billing |

**Generated locally (no account):** the 7 secrets in §5 — I generate these myself.

---

## 5. Generate Production Secrets

Windows PowerShell:

```powershell
# 64-char hex (most secrets)
[System.BitConverter]::ToString((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) })).Replace("-","").ToLower()
# 32-byte base64 (master key)
[Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
```

| Variable | Purpose |
|---|---|
| `AUTH_ACCESS_TOKEN_SECRET` | JWT access tokens |
| `AUTH_REFRESH_TOKEN_SECRET` | JWT refresh tokens |
| `KEY_SERVICE_MASTER_KEY_B64` | 32-byte base64 — encryption at rest |
| `KEY_SERVICE_CLIENT_TOKEN` | api → key-service runtime |
| `KEY_SERVICE_ADMIN_TOKEN` | api → key-service admin |
| `API_SECURITY_ADMIN_TOKEN` | Maintenance routes |
| `API_INTERNAL_SERVICE_TOKEN` | Worker/scheduler identity |
| `ONEZE_ATTESTATION_SIGNING_SECRET` | 1ze attestation signing |

Store in a password manager + SOPS/age-encrypted file in repo (`secrets/production.enc.yaml`).

---

## 6. OVHcloud Provisioning — EU Control Plane

### 6.1 Project & network

1. OVHcloud Control Panel → **Public Cloud** → create project `thryftverse-prod`.
2. Enable region **EU-WEST-PAR** (Paris, 3-AZ — the control plane home).
3. Create private network `tv-eu` (vRack) — all services attach to it; nothing data-plane is public except the edge LB.

### 6.2 Managed PostgreSQL

1. **Databases → PostgreSQL → Create**: plan **Business** (2 nodes, multi-AZ, 14-day backups) or **Enterprise** (3 nodes + read replica, 99.99% SLA).
2. Region: `EU-WEST-PAR`. Attach to `tv-eu` private network. Restrict IP pools to the K8s node range only.
3. Create database `thryftverse`, user `tv_api`. Copy the connection string:
   `DATABASE_URL=postgresql://tv_api:****@postgresql-xxx.database.cloud.ovh.net:20184/thryftverse?sslmode=require`
4. Read replica (Enterprise): create in same region; `DATABASE_REPLICA_URL`.

### 6.3 Managed Valkey (Redis protocol)

1. **Databases → Valkey → Create**: region `EU-WEST-PAR`, attached to `tv-eu`.
2. Two logical uses (cache + queue): one cluster with logical DB split is acceptable at launch; separate clusters when queue depth grows.
3. `REDIS_URL=rediss://default:****@valkey-xxx.database.cloud.ovh.net:20185`

### 6.4 Object storage (S3)

1. **Object Storage → Create container** `thryftverse-media` — region EU (multi-zone for media durability).
2. Create S3 credentials: **Object Storage → S3 users → Generate keys**.
3. `S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net` (region-specific), `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`. The backend's S3 client is vendor-agnostic — no code change.
4. Create second container `thryftverse-media-sg` (SGP) when SG satellite ships.

### 6.5 Compute — pick ONE path

**Path A — Managed Kubernetes (recommended at scale)**

1. **Managed Kubernetes → Create cluster**: `EU-WEST-PAR` (Standard plan = 3-AZ control plane).
2. Node pool: 3× `b3-8` (2 vCPU/8GB) minimum across AZs.
3. `kubectl` context → deploy per §7. Container registry: OVH Managed Private Registry (Harbor) or `registry.gitlab.com` self-host — **avoid Docker Hub rate limits**, mirror images to OVH registry.

**Path B — Self-hosted PaaS on VPS (Railway-grade DX, simplest)**

1. Create 2× VPS (`vps-le-2` or better) in `EU-WEST-PAR` + 1× in SGP.
2. Install **Coolify** (self-hosted, EU-runnable): one command install, gives git-push deploys, env vars, TLS, rollbacks — the Railway experience on our own boxes.
3. Attach VPS to `tv-eu`; deploy `docker-compose.prod.yml` services directly (the repo's compose stack already includes postgres/redis/minio/meilisearch for full self-host — point compose at managed PG/Valkey/S3 instead of in-stack containers for durability).

**Recommendation:** Path B for launch week (fastest to green), Path A when SG satellite ships — migrate compose services into K8s manifests.

---

## 7. Deploy the Services

Repo services (`docker-compose.prod.yml`): `api` :4000 · `worker` · `key-service` :4100 · `ml-service` :8000 · `caddy` (edge TLS).

**Image build (per service):**

```bash
docker build -t registry.xxx.ovh.net/tv/api:$(git rev-parse --short HEAD) backend/api
docker build -t registry.xxx.ovh.net/tv/worker:$(git rev-parse --short HEAD) backend/api --target worker   # or worker Dockerfile
docker build -t registry.xxx.ovh.net/tv/key-service:$(git rev-parse --short HEAD) backend/key-service
docker build -t registry.xxx.ovh.net/tv/ml-service:$(git rev-parse --short HEAD) backend/ml-service
docker push --all-tags registry.xxx.ovh.net/tv/…
```

**K8s:** namespaces `tv-eu` — Deployments + Services for each; `key-service` ClusterIP-only (never ingress-exposed); `api` behind Ingress; `worker` no Service at all. Secrets via SOPS-decrypted `Secret` or OVH-managed secrets.

**Coolify:** one app per service, env vars pasted into Coolify UI, Caddy (or Coolify's built-in Traefik) terminates TLS.

**Internal networking:** `KEY_SERVICE_URL=http://key-service:4100` (K8s DNS) — replaces the old `*.railway.internal` hostnames.

---

## 8. Edge Layer — GeoDNS, CDN, TLS

**Gcore (LU):**

1. Add zone `thryftverse.app` → Gcore DNS. Delegate from registrar (OVH/Gandi/INWX).
2. GeoDNS records:
   - `api.thryftverse.app` → EU Paris LB (default)
   - Geo-rule: SG/HK/JP/KR resolvers → SG LB · IN resolvers → SG until MUM live
   - Health checks on `/health` per region; automatic failover to EU on regional down.
3. CDN resource for `cdn.thryftverse.app` → origin = OVH S3 public endpoint. Cache media at edge; Gcore free egress removes the media-bandwidth cost line entirely.
4. TLS: Gcore managed certs (Let's Encrypt) at edge; end-to-end TLS to origin.

**Alternative:** bunny.net (SI) — cheaper CDN, good DNS; weaker GeoDNS granularity than Gcore. Pick Gcore for the routing layer, optionally bunny for pure media CDN.

**Regional API subdomains** (explicit, for debugging + forced routing): `api-eu.`, `api-sg.`, `api-in.`, `api-us.` — always exist; GeoDNS just picks the default.

---

## 9. Email — Brevo (required code change)

`backend/api/src/lib/authEmail.ts` currently implements **only** `resend`. Add a `brevo` branch (~30 lines, same shape):

```ts
if (provider === 'brevo') {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: config.authEmailFrom },
      to: [{ email: input.to }],
      subject: input.subject,
      htmlContent: input.html,
    }),
  });
  // mirror resend branch: parse messageId, throw on !ok, return { provider:'brevo', … }
}
```

Config additions: `brevoApiKey: env BREVO_API_KEY`, allow `AUTH_EMAIL_PROVIDER=brevo`. **This is the only blocking code change in the vendor swap.**

Setup: Brevo → SMTP & API → API Keys → `BREVO_API_KEY`. Verify domain `thryftverse.app` (SPF/DKIM/DMARC records via Gcore DNS). Data hosted FR+DE (verified).

## 10. Error Tracking — self-hosted GlitchTip

GlitchTip (open source, Sentry-protocol-compatible) on a small EU VPS or the K8s cluster:

- `SENTRY_DSN=https://<key>@glitchtip.thryftverse.internal/1` — **zero code change**; the Sentry SDK speaks to it natively.
- Keep `SENTRY_TRACES_SAMPLE_RATE=0.15`.
- Alerting: GlitchTip → webhook → `ALERTING_WEBHOOK_URLS` (self-hosted Mattermost/Slack-compatible receiver or Gcore alerting).

## 11. Mobile Pipeline — Codemagic + Store Submission

Codemagic (EE) replaces EAS cloud builds:

1. Connect repo → `codemagic.yaml` in `frontend/`: `npx expo prebuild` → Gradle/Xcode build → sign → publish.
2. Integrations: App Store Connect API key + Play service-account JSON (the two unavoidable US endpoints — see §18).
3. **OTA updates:** `eas update` posts to exp.host (US). Alternatives by strictness:
   - Acceptable: exp.host carries only JS bundles, no user data — same class as store binaries.
   - Strict: self-hosted update server (Expo `updates` protocol supports custom `updateUrl`) on EU infra — repo already targets self-hosted OTA per §30.4 doctrine.
4. **Direct APK:** publish signed APK at `dl.thryftverse.app` (Gcore CDN) for Play-blocked regions.

## 12. Environment Variables — revised

Same schema as `DEPLOYMENT.md` §10; only these change:

```bash
# ── Database (OVH managed PG, Paris) ─────────────────────
DATABASE_URL=postgresql://tv_api:****@postgresql-xxx.database.cloud.ovh.net:20184/thryftverse?sslmode=require
DATABASE_REPLICA_URL=                               # Enterprise replica, optional

# ── Redis (OVH managed Valkey) ───────────────────────────
REDIS_URL=rediss://default:****@valkey-xxx.database.cloud.ovh.net:20185

# ── Key Service (K8s internal DNS or Coolify private net) ─
KEY_SERVICE_URL=http://key-service:4100

# ── Object Storage (OVH S3) ──────────────────────────────
S3_ENDPOINT=https://s3.gra.io.cloud.ovh.net
S3_PUBLIC_ENDPOINT=https://cdn.thryftverse.app      # via Gcore CDN
S3_REGION=gra
S3_ACCESS_KEY=<ovh_s3_key>
S3_SECRET_KEY=<ovh_s3_secret>
S3_BUCKET=thryftverse-media

# ── Email (Brevo) ────────────────────────────────────────
AUTH_EMAIL_PROVIDER=brevo
AUTH_EMAIL_FROM=noreply@thryftverse.app
BREVO_API_KEY=xkeysib-****
# RESEND_API_KEY — removed

# ── Error tracking (self-hosted GlitchTip) ───────────────
SENTRY_DSN=https://<key>@glitchtip.thryftverse.internal/1

# ── Everything else identical: AUTH_*, KEY_SERVICE_*,
#    STRIPE_* (US cluster), RAZORPAY_*, MOLLIE_*, TAP_*,
#    WISE_*, ONEZE_*, API_* — see DEPLOYMENT.md §10.
```

## 13. Webhooks

Backend route `POST /webhooks/:provider` — register per provider:

| Provider | URL | Secret env |
|---|---|---|
| Mollie | `https://api.thryftverse.app/webhooks/mollie` | `MOLLIE_WEBHOOK_SECRET` |
| Razorpay | `…/webhooks/razorpay` | `RAZORPAY_WEBHOOK_SECRET` |
| Tap | `…/webhooks/tap` | `TAP_WEBHOOK_SECRET` |
| Stripe (US cluster) | `…/webhooks/stripe` | `STRIPE_WEBHOOK_SECRET` |
| Wise | `…/webhooks/wise` | `WISE_WEBHOOK_SECRET` |

All terminate at GeoDNS → whichever region is live. Webhook processing is idempotent at the api layer regardless of which region receives it.

## 14. Migrations & Health Checks

- Migrations run on `api` container start (unchanged). For K8s: run as a pre-deploy `Job` instead of per-replica to avoid races on multi-replica rollouts.
- Health: `GET /health` per region → Gcore health checks + Better Stack uptime.
- Smoke: `curl https://api.thryftverse.app/health` → `{"status":"ok", "region":"eu-par"}` — add `region` to health payload if not present (verify; if missing, add `X-Region` response header via Caddy/Ingress instead — no code change).

## 15. Asia Satellites — SG and IN Runbooks

### SG (ship when CHINA_NEARBY/SEA users materialize — architecture ready day one)

1. OVH: second K8s cluster `SGP1` (or UpCloud `sg-sin1` VPS+Coolify).
2. PG: logical-replication subscriber project in `SGP` (OVH managed PG supports regional provisioning; cross-region replication via publication/subscription — same constraint as Neon: no managed cross-region replica, use logical replication).
3. Valkey SGP; S3 bucket `thryftverse-media-sg`; Gcore geo-rule sends SEA traffic here.
4. `api` deploys read-optimized: `DATABASE_URL` → SG replica, `DATABASE_WRITE_URL` → EU primary (verify backend supports split write DSN; if not, api forwards writes — check `config.ts` for replica handling before enabling).

### IN (ship when DPDP residency hardens or 1K+ IN MAU)

- Option A: **OVH `AP-SOUTH-MUM`** — managed PG + K8s both available in Mumbai (verified). Same vendor, same tooling.
- Option B: **E2E Networks** (IN, NSE-listed, MeitY-empanelled) — managed K8s + managed PG, Delhi NCR + Chennai. Strongest DPDP posture (govt-empanelled sovereign cloud).
- Razorpay webhooks + payouts go live with IN cluster.

## 16. US Satellite Policy

US is a **satellite, not a dependency**:

- Ships when US MAU or latency complaints justify it.
- US vendors permitted *inside the satellite only*: Railway/Neon/AWS-us-east acceptable there per doctrine — that cluster holds US users' data only.
- No US-cluster credentials ever join the EU control plane's secret store; separate accounts, separate blast radius.
- US writes forward to EU primary or run region-partitioned (decide at ship time — the Shopify "pod" pattern maps cleanly).

## 17. Failover, Backup & DR

- **PG:** OVH automated backups (14–30d) + nightly `pg_dump` → S3-EU + S3-SGP cross-region copy. RPO ≤15min (WAL), RTO ≤1h.
- **S3:** EU multi-zone bucket; replication to SG bucket.
- **Regional failover:** Gcore health-check GeoDNS — SG down → traffic falls to EU automatically (~60s convergence).
- **Control-plane loss:** full stack reproducible from repo + SOPS secrets + compose/manifests — cold-standby rebuild on UpCloud (FI) is the second-vendor escape hatch, documented and rehearsed quarterly.
- Rollback: same as `DEPLOYMENT.md` §17 (image-tag rollback, OTA rollback, migration rollback).

## 18. Residual US Touchpoints — honest list

Cannot be eliminated without abandoning iOS/Android distribution; all carry **zero user-data payload**:

| Touchpoint | What crosses it | Why accepted |
|---|---|---|
| Apple App Store / APNs | Signed binary, device push tokens | Same exposure Telegram accepts; no user content |
| Google Play / FCM | Signed binary, device push tokens | Direct APK removes Play dependency (Android) |
| Expo exp.host (OTA) | JS bundles only | Optional — self-host update server to remove |
| GitHub (if kept) | Source code | Code ≠ user data; Codeberg/GitLab-CE swap available |
| Stripe (US card rails) | Card tokens — PCI-scoped | Only for US cluster; Mollie/Razorpay/Tap cover non-US |

**Nothing carrying user PII, messages, media, or wallet data touches a US entity outside the US cluster.**

## 19. Countries We Do Not Serve Directly

- **CN:** excluded per doctrine (ICP + PIPL + real-name = separate market entry; `CHINA_NEARBY` serves surrounding markets only).
- **IR, SY, sanctioned states:** payment rails unavailable — commerce features degrade gracefully (capability matrix already encodes gateway availability; verify UI shows explicit unsupported states rather than silent failure).
- **RU/BY:** in `EUROPE` cluster code-wise but payment provider availability decides effective support — confirm Mollie/Tap coverage before claiming support.

## 20. Cost Summary (launch, monthly, EUR)

| Item | Estimate |
|---|---|
| OVH K8s (or 2× VPS+Coolify) | €60–180 |
| Managed PG (Business) | ~€150 |
| Managed Valkey | ~€40 |
| S3 + CDN egress (Gcore free egress) | ~€20 |
| Brevo (starter) | €0–25 |
| GlitchTip VPS / shared node | ~€10 |
| Codemagic | pay-per-minute, ~€30 |
| **Total** | **~€310–415/mo** — comparable to the US-vendor plan, jurisdiction-clean |

## 21. Graduation Triggers

Written down so Phase 2 isn't vibes:

| Trigger | Action |
|---|---|
| OVH spend > €2k/mo | Evaluate dedicated/bare-metal OVH or Leaseweb nodes |
| >100K MAU with write-latency complaints | Regional write primaries (CockroachDB or app-level sharding) |
| DPDP SDF classification | IN residency on E2E/OVH-MUM becomes mandatory, not optional |
| Need VPC-level isolation for compliance | Private-cloud tier on OVH/UpCloud or own colo (the Vinted path) |
| Store removal event | Direct APK + self-hosted OTA already wired (§11) |

---

*Cross-references: `DEPLOYMENT.md` (US satellite + incident runbooks §§15–18 remain authoritative), `docs/deployment/08-money-liquidity-architecture.md` (**money layer: FX boundaries, escrow rails, co-own liquidity pool**), `.flagship/research-ledger-2026-09-24-deployment-infra.md` (evidence base), `docs/deployment/` (threat model + blueprint).*
