# Thryftverse

Last updated: 2026-08-25

Thryftverse is a mobile-first marketplace and social commerce platform built with React Native (Expo) plus a Docker-first backend stack. It combines:
- Core second-hand marketplace flows (listing, browsing, search, visual search, offers, checkout, orders, shipping)
- Real-time and bot-enabled messaging with secure/encrypted channels and offline outbox
- Trade Hub modules (auctions and co-own asset syndication)
- 1ze wallet and controlled monetary-layer foundations (Stripe, Razorpay, Mollie, Wise)
- Creator economy surfaces (looks, collections, posters, moodboards, creator studio with full editing engine)
- Live shopping (LiveKit-powered streaming commerce)
- Catalog importer (eBay / Depop / Vinted concierge import)
- Compliance, payouts, reconciliation, fraud detection, moderation triage, and launch-ops tooling
- OTA update train with staged rollout, rollback, and code signing
- SSL public-key pinning, app integrity, and production hardening

## What Is In This Repository

The repo is organised as a clean monorepo with two top-level workspaces:

1. `frontend/` — Mobile application (Expo + TypeScript)
2. `backend/`  — Platform services (API, key service, ML service, data dependencies)

The repo root holds only orchestration: Docker Compose files, cross-cutting scripts, and a thin `package.json` that delegates into either side via `npm --prefix`.

You can:
- Run the app only for UI/product work (`cd frontend && npm start`)
- Run the full stack locally with Docker for end-to-end behaviour (`npm run docker:up` from root)
- Validate production configuration and launch readiness before shipping (`npm run deploy:prod:validate`)
- Run strict launch-ops rehearsals and DB cleanup (`npm run launch:phase8:full`)

## High-Level Architecture

- Mobile app: React Native 0.86 + Expo SDK 57 + React Navigation 7 + Zustand 5 + TanStack Query 5
- API service: Fastify 5.8 + TypeScript (Kysely over PostgreSQL, BullMQ over Redis)
- Data stores: PostgreSQL 16 + PgBouncer + Redis 7 + MinIO (S3-compatible)
- Search: Meilisearch (synced from the API)
- Payments: Stripe (Connect), Razorpay, Mollie, Wise
- Crypto boundary: dedicated key-service for app-layer encryption operations
- Intelligence layer: Python FastAPI ML microservice (heuristic ranking champion + LightGBM shadow challengers for recommendations and fraud)
- Realtime: LiveKit (server SDK + client) and Fastify WebSockets
- Observability: Sentry, OpenTelemetry, Prometheus, PostHog
- Reverse proxy / TLS: Caddy 2.8 (HTTP/3) in production
- CI/CD: 12 GitHub workflows including staged canary OTA rollout, EAS builds, Maestro screenshots, scheduled DB backups

Runtime service graph (local Docker):
```
app → api
api → pgbouncer → postgres
api → redis
api → minio
api → key-service
api → ml-service
api → meilisearch (external sync target)
```

Production service graph (Docker Compose prod override):
```
client → caddy → api (no direct host exposure)
caddy → api (CDN domain)
api → pgbouncer → postgres
api → redis-cache (allkeys-lru)
worker → redis-queue (noeviction + AOF)
worker → pgbouncer → postgres
backup sidecar → postgres → S3 (daily cron)
```

## Repository Structure

```text
thryftverse/
├── frontend/                    # Expo / React Native mobile app
│   ├── App.tsx, index.ts        # Expo entry points
│   ├── app.json, app.config.js  # Expo config (dynamic env gating)
│   ├── eas.json                 # EAS build profiles + submit config
│   ├── plugins/                 # Expo config plugins (privacy manifest, SSL pinning, Hermes profiling, Android security XML)
│   ├── src/
│   │   ├── screens/             # 173 app screens across all product domains
│   │   ├── scenes/              # composed multi-screen discovery scenes
│   │   ├── components/          # 40 subdirectories of reusable UI + interaction components
│   │   ├── presentation/        # view-model layer (home discovery)
│   │   ├── navigation/          # stack/tab routing + route contracts + deep linking
│   │   ├── store/               # Zustand state (single store, all domains)
│   │   ├── storage/             # op-sqlite DB + MMKV + sync engine
│   │   ├── services/            # 52 frontend API client modules
│   │   ├── lib/                 # api client, offline queue, telemetry, sentry
│   │   ├── context/             # React contexts (toast, currency, prefs, a11y, tab scroll, backend data)
│   │   ├── contracts/           # shared API contracts (discovery feed unit, listing category policy, screen role matrix)
│   │   ├── schemas/             # zod validation schemas (auth, listing, profile)
│   │   ├── domain/              # domain models and mappers (user, listing, commerce, conversation, chat, notification)
│   │   ├── data/                # mock/seed data and fixtures
│   │   ├── hooks/               # 43 react hooks across all domains
│   │   ├── creator/             # creator-economy feature module (150+ files: studio, camera, color, timeline, effects, drawing, stickers, captions, audio, upload pipeline)
│   │   ├── preferences/         # user preferences module (accessibility, auth snapshot, create mode, profile media, settings)
│   │   ├── platform/            # 24 platform capability modules (agents, commerce, compliance, deep linking, forms, haptics, integrity, keyboard, media, mlkit, monitoring, native, payments, performance, product, realtime, screen capture, server, share, storage, streaming, support, updates)
│   │   ├── analytics/           # PostHog provider, 47 typed events, 8 feature flags, screen tracking
│   │   ├── theme/               # design tokens, gradients, iOS 26 scroll-edge tokens, M3 expressive tokens, motion tokens, surface radius rules, typography v2
│   │   ├── i18n/                # i18next + react-i18next + expo-localization (en, es, fr, de)
│   │   ├── video/               # video playback manager + QoE schema
│   │   ├── performance/         # visually complete metric
│   │   ├── utils/, constants/, dev/, types/
│   │   └── __tests__/           # 62 Vitest test suites
│   ├── assets/                  # icons, splash, fonts
│   ├── scripts/                 # 25+ frontend QA tooling scripts
│   ├── package.json             # Expo, RN, Reanimated, Zustand, TanStack, vitest
│   ├── babel.config.js, metro.config.js
│   ├── tsconfig.json, vitest.config.ts
│   └── .env*                    # frontend env (gitignored)
├── backend/
│   ├── api/                     # Fastify API + 150 SQL migrations + ops scripts
│   │   ├── src/
│   │   │   ├── index.ts         # monolith entry point (Fastify server + plugin registration + route registration)
│   │   │   ├── config.ts        # centralized env parsing
│   │   │   ├── telemetry.ts     # OpenTelemetry SDK setup
│   │   │   ├── routes/          # 60 route module files
│   │   │   ├── lib/             # 80+ shared library modules (auth, payments, pricing, compliance, fraud, shipping, search, realtime, queues, moderation, media, SMS, streaming, bot runtime, governance, metrics, circuit breaker, alerting, SLO tracking)
│   │   │   ├── db/              # migrate.ts, pool.ts, migrations/ (150 SQL files)
│   │   │   ├── workers/         # index.ts + handlers/ (18 worker handler files)
│   │   │   ├── domain/          # catalog import saga service
│   │   │   ├── integrations/    # catalog source connectors
│   │   │   ├── mapping/         # canonical listing schema, category/condition/size mapping
│   │   │   ├── botRuntime/      # OpenAI agent runtime for AI chat bots
│   │   │   ├── scripts/         # searchSync.ts
│   │   │   ├── docs/            # AUTHORITATIVE_BOUNDARIES.md
│   │   │   ├── __tests__/       # 27 unit test files
│   │   │   └── integration/     # 3 integration test files
│   │   ├── scripts/             # check-env, seed-dev-data, smoke-commerce/coown/profile, recommendation-health, postgres-backup
│   │   └── package.json
│   ├── key-service/             # encryption/decryption + key rotation boundary (Fastify 5 + zod)
│   ├── ml-service/              # FastAPI ML endpoints (recommendations, price forecast, fraud scoring, shadow model management)
│   │   ├── app/                 # main.py, ranking.py, model_loader.py, fraud_model_loader.py, schemas.py, evaluation.py
│   │   ├── scripts/             # build_dataset, train_ranking_model, train_fraud_model, evaluate_recommendations, generate_synthetic_training_data
│   │   ├── tests/               # decision baseline + evaluation metric tests
│   │   ├── evaluation/          # recommendation baseline v2 regression JSON
│   │   └── requirements.txt, requirements-ml.txt
│   ├── scripts/                 # smoke checks, backups, launch rehearsal, DR runbook, secrets rotation, shipping ops rehearsal
│   ├── Caddyfile                # reverse proxy config (HTTP/3, security headers, COOP/COEP/CORP)
│   ├── docker-compose.yml       # backend-local service definitions (legacy standalone)
│   ├── docker-compose.production.yml  # standalone production compose
│   └── README.md
├── docs/                        # known upstream issues
├── scripts/                     # cross-cutting (root) scripts
│   └── validate-production-env.mjs
├── .github/workflows/           # 12 CI/CD workflows (see CI/CD)
├── .devin/workflows/            # 8 agent workflow definitions
├── AGENTS.md                    # agent execution charter
├── DEPLOYMENT.md                # deployment + jurisdictional resilience guide
├── Design.md                    # neutral flagship native design system contract (v1.5)
├── docker-compose.yml           # local stack definition (8 services)
├── docker-compose.prod.yml      # production-safe overrides (Caddy, worker, redis-queue, backup sidecar, full hardening)
├── package.json                 # thin orchestrator (no deps)
└── README.md                    # this file
```

## Product Surface Snapshot

Major app surfaces currently included (173 screens across 15 domains):

- **Marketplace & Discovery**: home feed (For You / Following), unified discovery, global search, visual search, conversational search, category browse/tree, item detail (PDP), closet, saved searches, collections, galleria, filter, style quiz, algorithm transparency
- **Seller workflows**: sell/upload (sell_now / auction / co_own modes), AI-powered listing, AI photo enhancement, bulk listing, catalog importer (6-screen concierge flow), manage/edit/preview listing, listing success, seller hub, seller analytics, seller earnings, seller fulfilment, seller auction centre, seller verification, inventory management
- **Messaging**: inbox, 1:1 chat, group chat, group info/members/bot management, message requests, archived/muted conversations, new message, shared media, chat media preview, quick replies, bot directory, bot detail, custom bots, bot builder, chat outbox (offline send)
- **Profiles and preferences**: my profile, user profile, edit profile, followers/following, personalisation, write review, invite friends, outfit builder
- **Creator economy**: creator studio (full editing engine with canvas, camera, color picker, timeline, keyframes, speed curves, transitions, audio mixer, captions, cutout, drawing, stickers, effects/LUTs, text), look composer, poster composer, poster viewer, poster story activity, poster archive, poster highlights, moodboard home/editor, creator analytics dashboard
- **Trade Hub**: auction home/list/detail, create auction, my bids, trade hub, trade composer/confirm, co-own hub, create syndicate, co-own onboarding, asset detail, asset due diligence, asset leaderboard, portfolio, market ledger, buyout, corporate actions, distribution history, co-own price alerts, co-own tax documents, co-own recurring orders, co-own issues
- **Wallet and money flows**: wallet home, wallet convert (1ze ↔ fiat), wallet activity, balance history, withdraw, add bank account, payments, seller earnings
- **Live shopping**: live shopping home, live stream viewer (watch + bid + chat), live stream seller (broadcast + manage lots)
- **Compliance and support**: KYC verification, verification status/response, help & support, support ticket detail, resolution centre, order support, buyer protection, report
- **Notifications**: notifications list, push notification preferences, email notification preferences, consolidated notification preferences, in-app notification center
- **Settings**: account settings, account control, active sessions, change password, 2FA setup, delete account, accessibility settings, privacy settings, connected accounts, data privacy, data export, blocked users, AI preferences, AI agent integration (BYOK), agent activity ledger, sustainability preferences, about
- **Auth & onboarding**: age verification, onboarding, auth landing, login, sign up, biometric login (Face ID / Touch ID), forgot password

## Tech Stack

### Frontend (`frontend/`)
- Expo SDK 57 (`~57.0.15`)
- React 19.2.3 + React Native 0.86.2
- TypeScript 6.0.3
- React Navigation 7 (native-stack + bottom-tabs)
- @shopify/flash-list 2.0.2
- Reanimated 4.5.1 + Gesture Handler 2.32 + Keyboard Controller 1.21 + Worklets 0.10
- Zustand 5.0.12 + TanStack Query 5.101 (with async-storage persistence)
- react-hook-form 7.80 + @hookform/resolvers 5.4 + zod 4.4.3
- @stripe/stripe-react-native 0.64.0
- LiveKit (`@livekit/react-native` 2.12 + `livekit-client` 2.22)
- VisionCamera 5.2.3 + MLKit 2.0.1 + Skia 2.6.2 + Worklets 5.2.3
- expo-image 57, expo-video 57, expo-audio 57, expo-haptics 57, expo-secure-store 57, expo-notifications 57, expo-updates 57
- MMKV 4.3.2 (fast storage), AsyncStorage 2.2, NetInfo 12.0, op-sqlite 18.1
- Sentry 7.11, PostHog 4.63, Intercom 10.6
- Lottie 7.3, Victory Native 41.26 (charts), react-native-svg 15.15
- i18next 26.4 + react-i18next 17.0 + expo-localization 57 (en, es, fr, de)
- Vitest 4.1 + @testing-library/react-native 14.0
- @callstack/liquid-glass 0.8 (iOS 26 Liquid Glass tab bar)
- React Compiler (babel-plugin-react-compiler 1.0)
- Shared element transitions enabled (Reanimated static feature flags)

### Backend (`backend/`)
- API: Node.js 20 (Docker) / TypeScript 5.9.2, Fastify 5.8.4, Kysely 0.29.5 (PostgreSQL), BullMQ 5.73 + ioredis 5.7 (Redis)
- PostgreSQL 16 (primary relational store) + PgBouncer 1.23 (transaction pooling)
- Redis 7 (cache: allkeys-lru / queue: noeviction + AOF — split in production)
- MinIO (S3-compatible object storage)
- Meilisearch v1.12 (search index)
- Payments: Stripe 22 (Connect), Razorpay 2.9, @mollie/api-client 4.5, Wise
- Auth: jose 5.9 + jsonwebtoken 9.0, bcryptjs 3.0, opaque token refresh tracking, social auth (Google, Apple), magic link, OTP
- Realtime: LiveKit server SDK 2.18, @fastify/websocket 11.2
- ML: Python 3.11 + FastAPI 0.116 (uvicorn 0.35, numpy 2.3, pydantic 2.11, httpx 0.28, lightgbm 4.6)
- Key service: Fastify 5.10 + zod 3.25 (crypto boundary)
- Observability: Sentry 10.67, OpenTelemetry (auto-instrumentations, OTLP exporter, semantic conventions), Prometheus (prom-client 15.1)
- AWS SDK v3 (S3 + Rekognition for media moderation and storage)
- Fastify plugins: cors, helmet, rate-limit, swagger, swagger-ui, raw-body
- Meilisearch client 0.60, undici 8.10 (keep-alive HTTP agent)

## Local Development

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for full-stack mode)
- Expo Go app (for physical device testing)

### Option A: App-only (frontend focus)

```bash
cd frontend
npm ci
npm run start          # or: npm run android | npm run ios | npm run web
```

Equivalent from repo root:

```bash
npm run frontend:install
npm run frontend:start
```

Mock modes for design/integration work:

```bash
npm run start:fixtures       # fixture-design mock mode
npm run start:integration    # integration-truth mock mode
```

### Option B: Full stack (frontend + backend dependencies)

From the repo root:

```bash
# 1. Install frontend deps
npm run frontend:install

# 2. Start platform dependencies and backend services
npm run docker:up

# 3. Inspect service logs
npm run docker:logs

# 4. Smoke-check dependencies
npm run docker:check

# 5. Start the Expo app
npm run frontend:start
```

Local Docker services (8): postgres, redis, pgbouncer, minio, minio-init, key-service, api, ml-service. An optional `nginx-tls` profile is available for SSL pinning tests (`docker compose --profile tls up`).

### Option C: Backend-only development (no Docker)

```bash
# Postgres + Redis + MinIO must be reachable separately
npm run backend:api:install
npm run backend:api:dev      # tsx watch on backend/api/src/index.ts

# Or for the key service
npm run backend:key:install
npm run backend:key:dev
```

Backend API extras:

```bash
npm --prefix backend/api run migrate           # apply SQL migrations
npm --prefix backend/api run migrate:rollback  # roll back last migration
npm --prefix backend/api run seed              # seed dev data
npm --prefix backend/api run worker:start      # start background workers
npm --prefix backend/api run db:types          # regenerate Kysely DB types
npm --prefix backend/api run search:sync       # sync listings to Meilisearch
npm --prefix backend/api run smoke:commerce    # commerce flow smoke
npm --prefix backend/api run smoke:coown       # co-own flow smoke
npm --prefix backend/api run smoke:profile     # profile flow smoke
npm --prefix backend/api run check:env         # validate env at startup
npm --prefix backend/api run check:recommendations  # recommendation health
```

## Environment Configuration

Frontend env (Expo) lives in `frontend/`:
- `frontend/.env.example` — local development template
- `frontend/.env.production.example` — production template
- `frontend/.env` — your local copy (gitignored, never committed)

Backend env templates live in `backend/`:
- `backend/.env.example` — root Docker Compose vars (39 variables covering Postgres, MinIO, S3, key-service, API tokens, KYC, Sentry, OpenTelemetry, auction sweep, 1ze money layer, Stripe, Wise)

Useful notes:
- Frontend API endpoint is controlled via `EXPO_PUBLIC_API_BASE_URL`
- Production preflight checks are enforced via `scripts/validate-production-env.mjs` (34 required variables, dev-default rejection, HTTPS enforcement, no-localhost, KYC vendor validation, payment provider presence, OpenAI pricing config)
- Runtime mocks must be disabled in production (`EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS=false`)
- SSL public-key pinning is enforced and validated in CI (`check:ssl-pins`); SPKI hashes generated by `generate-spki-hashes.sh`
- OTA code signing enabled when `EXPO_PUBLIC_OTA_CODE_SIGNING_KEY` is present (rsa-v1_5-sha256)
- EAS build profiles: `development`, `development-simulator`, `preview`, `production` (each with its own API endpoint and channel)

Production env validation (run from repo root):

```bash
npm run deploy:prod:validate
```

## Core Scripts

All commands below run from the **repo root** unless noted. They delegate to either `frontend/` or `backend/api`/`backend/key-service` via `npm --prefix`.

| Category | Script | Purpose |
|---|---|---|
| Frontend dev | `npm run frontend:start` | Start Expo dev server |
| Frontend dev | `npm run frontend:android` / `frontend:ios` / `frontend:web` | Platform-specific Expo run |
| Frontend QA | `npm run frontend:typecheck` | TypeScript `--noEmit` checks |
| Frontend QA | `npm run frontend:test` | Vitest suites |
| Frontend QA | `npm run frontend:lint:design-tokens` | Validate design-token usage |
| Frontend QA | `npm run frontend:i18n:extract` | Extract translatable strings |
| Backend API | `npm run backend:api:dev` | Start API in watch mode |
| Backend API | `npm run backend:api:build` | Compile API to `dist/` |
| Backend API | `npm run backend:api:test` | Run API test suite |
| Backend API | `npm run backend:api:migrate` | Apply SQL migrations |
| Backend keys | `npm run backend:key:dev` | Start key-service in watch mode |
| Backend keys | `npm run backend:key:build` | Compile key-service to `dist/` |
| Docker local | `npm run docker:up` | Build & run backend stack |
| Docker local | `npm run docker:down` | Stop backend stack |
| Docker local | `npm run docker:logs` | Tail service logs |
| Docker health | `npm run docker:check` | Smoke-check API/dependency health |
| Docker prod | `npm run docker:up:prod` | Start production compose profile |
| Docker prod | `npm run docker:down:prod` | Stop production compose profile |
| Docker prod | `npm run docker:logs:prod` | Tail production service logs |
| Production preflight | `npm run deploy:prod:validate` | Validate `.env.production` requirements |
| Launch ops | `npm run launch:phase8` | Run strict launch checks |
| Launch ops | `npm run launch:phase8:full` | Strict launch checks + rehearsal |
| Launch ops | `npm run launch:phase8:cleanup:dry` | Dry-run DB cleanup |
| Launch ops | `npm run launch:phase8:cleanup:apply` | Apply DB cleanup (confirm required) |
| Launch ops | `npm run staging:shipping-ops` | Shipping-ops staging rehearsal |

### Frontend-only QA scripts (run inside `frontend/`)

| Script | Purpose |
|---|---|
| `npm run lint` / `lint:fix` | ESLint on `src/` |
| `npm run format` / `format:check` | Prettier on `src/` |
| `npm run doctor` | `expo-doctor` health check |
| `npm run check:animated-scroll` | Detect off-thread animated scroll misuse |
| `npm run check:visual-gates` | Visual release gates (hardcoded colors, a11y labels/roles, hitSlop, reduced-motion, card-on-card) |
| `npm run check:visual-gates:report` | Visual release gates with report |
| `npm run check:residue` | Detect production-residue in dev code |
| `npm run check:domain-imports` | Block mock-data imports in domain code |
| `npm run check:mockdata-boundary` | Enforce mock-data boundary |
| `npm run check:golden-parity` | Golden parity check |
| `npm run check:ssl-pins` | Validate SSL pin SPKI hashes |
| `npm run check:bundle-size` | Bundle size budget check (1.5 MB threshold) |
| `npm run check:maestro-flows` | Validate Maestro flow definitions |
| `npm run bundle:analyze` | Android bundle atlas |
| `npm run bundle:analyze:ios` | iOS bundle atlas |
| `npm run test:smoke` | Run smoke flow tests |
| `npm run verify:phase` | Combined typecheck + animated-scroll + design-tokens + visual-gates + ssl-pins + targeted tests |
| `npm run i18n:extract` | Extract i18n strings and report missing/unused keys |

## Backend Architecture

### API Structure

The API entry point (`backend/api/src/index.ts`) is a Fastify monolith that:
1. Creates a Fastify instance and registers plugins inline (websocket, raw-body, helmet, cors, rate-limit, swagger, swagger-ui)
2. Imports and registers 60 route modules from `src/routes/`
3. Defines additional routes inline for major domains (wallet, auctions, orders, payments, webhooks, admin, ops, listings, shipping)

Route modules (60): admin, adminAudit, aiTruth, attestation, auctions, auth, bots, catalogImports, chatComposerState, collections, compliance, conversationalSearch, creator, creatorDocuments, dlqAdmin, feed, fraudDetection, fraudShadow, galleria, health, importerExtraction, listingImages, listingOffers, listings, looks, mediaAssets, mediaEmbeddings, modelArtifacts, moderation, moderationTriage, moodboards, notifications, ops, oracle, orders, payments, payouts, policies, posters, price, priceAlerts, realtime, recommendations, search, searchExtended, secureMessages, secureProfiles, security, sellerHub, sellers, shipping, sms, streaming, supportReviews, uploads, v2, visualSearch, wallet, webhooks

### Database Migrations

150 SQL migration files in `backend/api/src/db/migrations/` covering:
- Core marketplace (users, listings, interactions, recommendations)
- Auth & identity (social, magic link, OTP, opaque tokens)
- Payments & settlement (gateways, customers, instruments, intents, Stripe Connect)
- 1ze wallet architecture (wallets, ledger, P2P transfers, closed-loop monetary system, gold oracle, mint operations)
- Compliance & regulatory (KYC, AML, sanctions, PEP, audit logs, GDPR, DAC7, CCPA)
- Co-own assets (schema, orders, unit caps, reservations, settlement, rights, audit, risk, recourse, distributions, corporate actions)
- Auctions (reserve price, watchlist, transaction idempotency)
- Creator tools (looks, posters, moodboards, galleria, creator analytics)
- Chat & messaging (groups, bots, composer state, outbox, message lifecycle)
- Catalog import (foundation, provenance, publication, extractions)
- Media lifecycle (multipart uploads, bindings, embeddings)
- Moderation & fraud (triage, fraud scoring ledger)
- Live shopping (sessions, chat, bids)
- Infrastructure (row-level security, Postgres tuning, API keys, UUID v7, updated_at triggers, table partitioning, materialized views, listen/notify, presence registry)

### Workers & Queues

7 BullMQ queues with dedicated dead-letter queues (7-day retention), 18 worker handlers:

| Queue | Processes |
|---|---|
| `push_notifications` | Expo push notification delivery |
| `infra_ops` | Auction sweeps, 1ze mint reserve, 1ze withdrawal execute, reconciliation, outbox drain |
| `media_ingest` | Media asset derivative generation (thumbnails, transcode) |
| `catalog_import` | Catalog import saga: discovery, hydration, media, normalisation, publication, retention, reconcile |
| `media_embedding` | Offline embedding generation for visual search |
| `moderation_triage` | ML-assisted moderation triage |
| `importer_extraction` | ML-assisted structured extraction from catalog photos |

In production, workers run in a standalone `worker` container (`RUN_BACKGROUND_WORKERS=true`, `RUN_API_SERVER=false`) separate from the API container.

### ML Service

Python FastAPI microservice with:
- **Heuristic ranking champion** (`recommendation-heuristic-v2.0`) — deterministic, no trained model affects user-facing responses
- **LightGBM shadow challengers** — ranking (LambdaRank + XE-NDCG-MART) and fraud detection, loaded/unloaded via admin endpoints for shadow scoring without affecting production
- **Price forecasting** — moving-trend baseline
- **Pricing action** — deterministic inventory pricing policy
- Endpoints: `/health`, `/recommendations`, `/shadow/load`, `/shadow/unload`, `/shadow/status`, `/classify-image` (501), `/forecast-price`, `/pricing-action`, `/fraud/score`, `/fraud/status`, `/fraud/shadow/load`, `/fraud/shadow/unload`
- Training scripts: `build_dataset.py`, `train_ranking_model.py`, `train_fraud_model.py`, `evaluate_recommendations.py`, `generate_synthetic_training_data.py`
- CI regression baseline: `evaluation/recommendation_baseline_v2.json`

### Key Service

Isolated Fastify 5.10 microservice for application-layer encryption operations:
- Encrypt/decrypt/rewrap for PII fields (profile, direct messages, wallet snapshots)
- Key lifecycle management (rotate, rewrap)
- Token-guarded admin and client boundaries
- Port 4100

## Production Architecture

### Docker Compose Production Override

The production stack (`docker-compose.prod.yml`) applies on top of the local compose with:

- **Caddy 2.8** — TLS termination with HTTP/3, security headers (HSTS preload, COOP same-origin, COEP require-corp, CORP, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy), reverse proxy to `api:4000` on API and CDN domains
- **Split Redis** — `redis-cache` (allkeys-lru, no AOF, port 6380) for cache + `redis-queue` (noeviction, AOF everysec, port 6381) for BullMQ queues
- **Standalone worker container** — separate from API, runs all 7 BullMQ queues
- **API not host-exposed** — Caddy proxies all traffic; no direct port access
- **Encrypted backup sidecar** — alpine 3.20, daily 02:00 UTC cron, compressed encrypted pg_dump to S3 with 30-day retention and webhook notification
- **2026 container hardening baseline** — all services: `no-new-privileges`, `cap_drop ALL`, `read_only`, `tmpfs /tmp`, non-root user (10001:10001 or service-specific), `pids_limit 256`, json-file logging (10m, 3 files)
- **Network segmentation** — `frontend` (bridge, public), `backend` (bridge, internal), `db` (bridge, internal)
- **All secrets required** — no dev defaults; `${VAR:?error}` syntax enforces presence

### Deployment Targets

The primary deployment path (documented in `DEPLOYMENT.md`) uses managed services:
- **Railway** — api, key-service, ml-service (3 services, internal networking, auto-deploy)
- **Neon** — PostgreSQL (read replica, PITR backups)
- **Upstash** — Redis (TLS `rediss://`)
- **Cloudflare R2** — object storage (S3-compatible)
- **Resend** — email delivery
- **Sentry** — error tracking (API + mobile)
- **Expo EAS** — build, submit, OTA updates

Alternative: self-hosted Docker Compose with the production override.

```bash
# Validate first
npm run deploy:prod:validate

# Then ship
npm run docker:up:prod
npm run docker:logs:prod
```

Post-deploy smoke: `node backend/scripts/post-deploy-smoke.mjs`. See `DEPLOYMENT.md` for the full deployment, jurisdictional resilience, and runbook reference (26 sections including multi-region scaling, legal structure layering, data residency, and alternative app distribution).

## Quality and Release Workflow

Recommended baseline before merge/release:

```bash
npm run frontend:typecheck
npm run frontend:test
npm run frontend:lint:design-tokens
npm run backend:api:test
npm run deploy:prod:validate
```

Inside `frontend/`, the stricter pre-release gate:

```bash
npm run verify:phase
```

## CI/CD

12 workflows in `.github/workflows/`:

| Workflow | Purpose |
|---|---|
| `frontend-ci.yml` | Frontend install, typecheck, tests, design-token lint, phase verification, expo-doctor, Maestro flow validation, production-residue check, mockdata boundary |
| `backend-ci.yml` | Backend API (Node 22, postgres:16 service, build, audit, unit + integration tests, migration idempotency), key-service, mobile-contract typecheck, ML decision baseline (Python 3.11, recommendation quality/determinism gate) |
| `ci-gates.yml` | 13 cross-cutting jobs: frontend/backend typecheck, eslint, bundle-size, visual-gates, production-residue, ssl-pin-validation, design-token-lint, animated-scroll, mockdata-boundary, unit-tests, maestro-e2e, sbom-generation |
| `eas-build.yml` | EAS app builds (development / development-simulator / preview / production profiles, iOS + Android) |
| `build-and-deploy.yml` | 6-stage sequential canary rollout: build → staging (100%) → canary-1 (1%) → canary-10 (10%) → production-50 (50%) → production-100 (100%), each with manual approval gates and post-deploy smoke tests |
| `staging-deploy.yml` | Staging deployment: pre-build gates, EAS build (preview profile), OTA publish to `preview` channel, post-deploy smoke (commerce/coown/profile) |
| `release-train.yml` | Release train: resolve channel/profile, EAS build (iOS + Android, no-wait), publish OTA, tag GitHub Release, production approval gate |
| `ota-staged-rollout.yml` | OTA staged rollout (1/10/50/100% to staging/canary/production channel) |
| `ota-rollback.yml` | OTA rollback or republish by channel |
| `screenshots.yml` | Screenshot generation via Maestro flows (iOS simulator on macOS, Android emulator on Linux with KVM) |
| `health-check.yml` | API health check (every 5 min cron, probes HEALTH_CHECK_URL, alerts on failure) |
| `scheduled-db-backup.yml` | Scheduled DB backup (daily 02:00 UTC, encrypted pg_dump to S3 with KMS, 30-day retention, checksum verification) |

## Security and Compliance Notes

- Key management and crypto operations are isolated in `backend/key-service`
- API and key-service use token-guarded service/admin boundaries (`x-security-admin-token`, `x-platform-operator-token`, `x-service-token`)
- Compliance domain includes KYC (Stripe Identity), AML alerts, SAR records, sanctions/PEP screening, consent evidence, GDPR export/erasure, DAC7 tax, CCPA, moderation, fraud detection (rule engine + shadow ML model), and immutable audit-log design
- Production secrets are mandatory for auth, security admin controls, compliance, and attestation flows
- `frontend/.env` is gitignored — never commit live keys; rotate any that may have been exposed
- SSL public-key pinning is enforced (TrustKit) and validated in CI (`check:ssl-pins`); `enforcePinning` only in production
- App integrity / tamper detection via `platform/integrity`
- Screen capture protection and screenshot tracking analytics
- OTA code signing (rsa-v1_5-sha256) when `EXPO_PUBLIC_OTA_CODE_SIGNING_KEY` present
- iOS ATS: `NSAllowsArbitraryLoads: false`, TLSv1.2 + certificate transparency for `thryftverse.com`
- Android: network_security_config, backup_rules, data_extraction_rules
- Privacy manifest plugin (`plugins/withPrivacyManifest`)
- Secrets rotation runbook: `backend/scripts/secrets-rotation.sh` (90-day max age, monthly cron)
- DR runbook: `backend/scripts/dr-runbook.md` (quarterly review, 7-step escalation, P0/P1/P2 severity)

## Backend Scripts

| Script | Purpose |
|---|---|
| `phase8-launch-ops.mjs` | Phase 8 launch operations orchestrator (env validation, DNS/TLS verification, smoke tests, DB cleanup) |
| `staging-shipping-ops-rehearsal.mjs` | Staging shipping rehearsal (Evri, DHL, Delhivery, Aramex, Easyship webhook + provider testing) |
| `docker-smoke-check.mjs` | Docker stack smoke test (API, ML, key-service with retry) |
| `post-deploy-smoke.mjs` | Lightweight post-deploy API probe (health, auth, listings) |
| `postgres-backup.mjs` | PostgreSQL backup (compressed, encrypted, S3 upload, retention) |
| `automated-backup.sh` | Backup sidecar script (cron daily, S3 upload, webhook alert) |
| `secrets-rotation.sh` | Secrets rotation policy checker (90-day max age) |
| `dr-runbook.md` | Disaster recovery runbook (contacts, escalation, RPO/RTO, procedures) |

## Observability

- **Sentry** — error tracking (API: `@sentry/node` 10.67, mobile: `@sentry/react-native` 7.11)
- **OpenTelemetry** — distributed tracing (auto-instrumentations, OTLP HTTP exporter, semantic conventions)
- **Prometheus** — metrics via `prom-client` 15.1, `/metrics` endpoint, Grafana dashboard config
- **PostHog** — product analytics (47 typed events, 8 feature flags, session replay, screen tracking)
- **SLO tracking** — `sloTracker.ts`, request correlation IDs, structured logging with Sentry breadcrumbs
- **Performance monitoring** — frame tracker, RUM dashboard, `usePerformanceMonitor` / `useScreenPerformance` hooks (TTFR, TTI, render count)
- **Alerting** — webhook notifications for health check failures, backup failures, launch ops issues

## Troubleshooting

| Symptom | Fix |
|---|---|
| Expo package compatibility warnings | Align versions to Expo SDK expectations (`cd frontend && npx expo-doctor`) |
| API not reachable from device | Set `EXPO_PUBLIC_API_BASE_URL` in `frontend/.env` to host LAN IP |
| Docker dependency issues | `npm run docker:check`, then `npm run docker:logs` |
| Production env failures | `npm run deploy:prod:validate` and fill missing required keys |
| SSL pin failures | Regenerate SPKI hashes (`frontend/scripts/generate-spki-hashes.sh`) then re-run `npm run check:ssl-pins` |
| `npm install` at root does nothing | Expected — root `package.json` has no deps. Run `npm run frontend:install` or install per workspace |
| Bundle size exceeded | Run `npm run bundle:analyze` / `bundle:analyze:ios` to inspect atlas, reduce imports |
| Visual gate failures | Run `npm run check:visual-gates:report` for detailed violations (hardcoded colors, a11y, hitSlop, reduced-motion) |

## Documentation Map

| Document | Purpose |
|---|---|
| `README.md` | This file — repository overview, architecture, setup, scripts |
| `AGENTS.md` | Agent execution charter — working principles for all AI agents in the repo |
| `DEPLOYMENT.md` | Production deployment & jurisdictional resilience guide (26 sections: managed services, secrets, DNS, rollback, incident response, multi-region scaling, legal structure, data residency) |
| `Design.md` | Neutral Flagship Native Design System contract (v1.5, calibrated against Pinterest, Instagram, Depop, Vinted, Vestiaire, Whatnot) |
| `backend/README.md` | Backend API reference — full endpoint catalog, payments, 1ze money layer, compliance, crypto boundary, data ops runbook |
| `docs/KNOWN_ISSUES_UPSTREAM.md` | Accepted upstream/deployment issues not fixable in app code |
| `backend/api/src/docs/AUTHORITATIVE_BOUNDARIES.md` | Authoritative system boundary definitions |
| `backend/scripts/dr-runbook.md` | Disaster recovery runbook |

## Ownership

Thryftverse
- Repository owner: K17ze
- Default branch: `main`
- EAS project ID: `e94afae8-2794-4230-a184-785eb8d7ad36`
- App bundle ID: `com.thryftverse.app` (iOS + Android)
- OTA update channels: `development`, `preview`, `production` (with canary sub-stages)
- Deep link prefixes: `thryftverse://`, `https://thryftverse.com`, `https://www.thryftverse.com`

New engineers should start with this README, then `AGENTS.md` (execution charter), then `backend/README.md`, then dive into `frontend/src/` (start at `App.tsx` → `src/navigation/AppNavigator.tsx`) or `backend/api/src/index.ts` depending on focus. For deployment and ops, see `DEPLOYMENT.md`; for product design, see `Design.md`.
