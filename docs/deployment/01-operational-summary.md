# 01 — Operational Deployment Summary

> Condensed view of the day-1 production target. For step-by-step provisioning
> (accounts, secrets, env vars, build & submit), follow
> [`DEPLOYMENT.md`](../../DEPLOYMENT.md) §§1–18. For per-region expansion, follow
> §§27–37. This file exists so a reader can hold the whole topology in one page.

## Day-1 topology (EU-jurisdiction, multi-provider)

```
                    ┌──────────────────────────┐
                    │   Mobile app (Expo RN)   │
                    │ App Store · Play · APK · │
                    │ self-hosted OTA          │
                    └────────────┬─────────────┘
                                 │ HTTPS + anycast DNS
                                 ▼
                    ┌──────────────────────────┐
                    │  Cloudflare (global edge)│
                    │  DNS · WAF · CDN · R2    │
                    │  (EU jurisdiction bucket)│
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Railway — Amsterdam    │
                    │  api (4000) · key-svc    │
                    │  (4100, private) ·       │
                    │  ml-svc (8000, private)  │
                    └──────┬──────────┬────────┘
                           │          │  private network only
              ┌────────────▼──┐  ┌────▼─────────┐  ┌──────────────┐
              │ Neon EU West  │  │ Upstash EU   │  │ R2 EU bucket │
              │ Postgres 16   │  │ Redis 7      │  │ jurisdiction │
              │ (primary +    │  │ (rediss TLS) │  │ = "eu"       │
              │ opt. replica) │  │              │  │              │
              └───────────────┘  └──────────────┘  └──────────────┘

   Payments (no single jurisdiction): Stripe (US) · Mollie (EU) ·
   Razorpay (IN) · Tap (GCC) · Wise (UK) · Flutterwave (Africa, optional)
   Legal: BVI holding → Swiss/Dubai operating → Foundation stake (10–20%)
```

## Stack at a glance

| Layer | Provider | Region / jurisdiction | Public? |
|-------|----------|-----------------------|---------|
| API | Node 20 / Fastify on Railway | `europe-west4-drams3a` (Amsterdam) | Yes, HTTPS |
| Key service | Node 20 on Railway | Amsterdam, **private only** | No — internal |
| ML service | Python 3.11 / FastAPI on Railway | Amsterdam, **private only** | No — internal |
| Postgres | Neon | `aws-eu-west-2` (EU) | No — conn string |
| Redis | Upstash | EU West 1, TLS | No — conn string |
| Object storage | Cloudflare R2 | `jurisdiction: "eu"` | Public read (media) |
| Email | Resend | EU sending region | Outbound only |
| Errors | Sentry | EU data residency | Ingest only |
| Build/OTA | EAS Build (US, artifacts only) + **self-hosted updates** (EU) | Mixed | — |
| Distribution | App Store / Play / `download.thryftverse.app` | Global | — |

## Non-negotiables (fail any of these = not deployed)

- `GET /api/v1/health/deep` → every check `ok` (db, redis, keyService, mlService, s3).
- `key-service` and `ml-service` have **no public domain** on Railway — private networking only.
- `S3_FORCE_PATH_STYLE=false` on R2 (was `true` only for local MinIO).
- All 8 secrets freshly generated per environment (`AUTH_*`, `KEY_SERVICE_*`,
  `API_*`, `ONEZE_ATTESTATION_SIGNING_SECRET`) — never reuse dev values.
- R2 lifecycle rule *abort incomplete multipart uploads after 7 days* on every
  environment bucket (DEPLOYMENT.md §6.5).
- `API_ENABLE_MOCK_WEBHOOKS=false`.
- Stripe webhook endpoint registered: `https://api.thryftverse.app/webhooks/stripe`.

## Where the detail lives

| Topic | DEPLOYMENT.md section |
|-------|------------------------|
| Accounts & secrets | §§2–3 |
| Neon / Upstash / R2 / Resend / Sentry | §§4–8 |
| Railway services + env vars | §§9–10 |
| Migrations, health checks | §§11–12 |
| EAS build, stores, DNS | §§13–14 |
| Post-deploy checklist, cost | §§15–16 |
| Rollback & incident runbooks | §§17–18 |
| Jurisdictional resilience strategy | §§19–26 |
| Multi-country matrix (clusters, PSPs, KYC, tax, shipping) | §§27–37 |
