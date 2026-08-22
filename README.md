# Thryftverse

Last updated: 2026-08-22

Thryftverse is a mobile-first marketplace and social commerce platform built with React Native (Expo) plus a Docker-first backend stack. It combines:
- Core second-hand marketplace flows (listing, browsing, search, offers, checkout, orders, shipping)
- Real-time and bot-enabled messaging with secure/encrypted channels
- Trade Hub modules (auctions and co-own assets)
- 1ze wallet and controlled monetary-layer foundations (Stripe, Razorpay, Mollie)
- Creator economy surfaces (looks, collections, posters, creator documents)
- Compliance, payouts, reconciliation, fraud detection, and launch-ops tooling
- OTA update train with staged rollout and rollback

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

- Mobile app: React Native + Expo + React Navigation + Zustand + TanStack Query
- API service: Fastify 5 + TypeScript (Kysely over PostgreSQL, BullMQ over Redis)
- Data stores: PostgreSQL 16 + PgBouncer + Redis 7 + MinIO (S3-compatible)
- Search: Meilisearch (synced from the API)
- Payments: Stripe (Connect), Razorpay, Mollie
- Crypto boundary: dedicated key-service for app-layer encryption operations
- Intelligence layer: Python FastAPI ML microservice (recommendations, pricing, visual search)
- Realtime: LiveKit (server SDK + client) and Fastify WebSockets
- Observability: Sentry, OpenTelemetry, Prometheus, PostHog

Runtime service graph (local Docker):
- app → api
- api → pgbouncer → postgres
- api → redis
- api → minio
- api → key-service
- api → ml-service
- api → meilisearch (external sync target)

## Repository Structure

```text
thryftverse/
├── frontend/                    # Expo / React Native mobile app
│   ├── App.tsx, index.ts        # Expo entry points
│   ├── src/
│   │   ├── screens/             # app screens and journeys
│   │   ├── scenes/              # composed multi-screen product scenes
│   │   ├── components/          # reusable UI + interaction components
│   │   ├── presentation/        # presentational primitives
│   │   ├── navigation/          # stack/tab routing + route contracts
│   │   ├── store/               # Zustand state slices
│   │   ├── storage/             # MMKV / persistence layer
│   │   ├── services/            # frontend service clients
│   │   ├── lib/                 # api client, offline queue, telemetry
│   │   ├── context/             # React contexts (toast, currency, prefs)
│   │   ├── contracts/           # shared API contracts (zod)
│   │   ├── schemas/             # zod schemas
│   │   ├── domain/              # domain models and mappers
│   │   ├── data/                # data sources and fixtures
│   │   ├── hooks/               # react hooks
│   │   ├── creator/             # creator-economy feature module
│   │   ├── preferences/         # user preferences module
│   │   ├── platform/            # platform capability/runtime detection
│   │   ├── analytics/           # analytics + product instrumentation
│   │   ├── theme/, i18n/, utils/, constants/, dev/
│   │   └── __tests__/           # Vitest suites
│   ├── assets/                  # icons, splash, fonts
│   ├── scripts/                 # frontend-only tooling (see Frontend QA scripts)
│   ├── package.json             # Expo, RN, Reanimated, Zustand, TanStack, vitest
│   ├── app.json, eas.json       # Expo + EAS configuration
│   ├── babel.config.js, metro.config.js
│   ├── tsconfig.json, vitest.config.ts
│   └── .env*                    # frontend env (gitignored)
├── backend/
│   ├── api/                     # Fastify API + SQL migrations + ops scripts
│   ├── key-service/             # encryption/decryption + key rotation boundary
│   ├── ml-service/              # FastAPI ML endpoints (app, evaluation, tests)
│   ├── scripts/                 # smoke checks, backups, launch rehearsal, DR runbook
│   ├── Caddyfile                # reverse proxy config
│   ├── docker-compose.yml       # backend-local service definitions
│   ├── docker-compose.production.yml
│   └── README.md
├── docs/                        # flagship research + known upstream issues
├── scripts/                     # cross-cutting (root) scripts
│   └── validate-production-env.mjs
├── .github/workflows/           # CI/CD, OTA, backups, screenshots (see CI)
├── AGENTS.md                    # agent execution charter
├── DEPLOYMENT.md                # deployment and runbook reference
├── Design.md                    # product design reference
├── docker-compose.yml           # local stack definition
├── docker-compose.prod.yml      # production-safe overrides
├── package.json                 # thin orchestrator (no deps)
└── README.md                    # this file
```

## Product Surface Snapshot

Major app surfaces currently included:
- Marketplace: home feed, search (incl. extended search + visual search), category browse, item detail, make offer, checkout, price alerts
- Seller workflows: sell/upload, postage, listing success, manage listing, seller hub
- Messaging: inbox, chat, group chat, bot directory, secure messages, support entry points
- Profiles and preferences: account settings, edit profile, notifications, personalisation, secure profiles
- Creator economy: looks, collections, posters, creator documents, creator hub
- Trade Hub: auctions, co-own hub, portfolio, asset detail, trade, buyout, syndicate history
- Wallet and money flows: balance, payments, withdraw, payouts, reconciliation
- Compliance and support: KYC, AML alerts, SAR records, consent evidence, moderation, fraud detection, support reviews
- Media: listing images, media assets, uploads, AI truth labelling

## Tech Stack

### Frontend (`frontend/`)
- Expo SDK 57
- React 19.2 + React Native 0.85
- TypeScript 6.0
- React Navigation 7
- @shopify/flash-list 2
- Reanimated 4 + Gesture Handler + Keyboard Controller + Worklets
- Zustand 5 + TanStack Query 5 (with async-storage persistence)
- react-hook-form + zod 4 (forms and contracts)
- @stripe/stripe-react-native
- LiveKit (realtime audio/video)
- VisionCamera + MLKit + Skia (camera and on-device vision)
- expo-image, expo-video, expo-audio, expo-haptics, expo-secure-store, expo-notifications, expo-updates
- MMKV (fast storage), AsyncStorage, NetInfo
- Sentry, PostHog, Intercom
- Lottie, Victory Native (charts), react-native-svg
- i18next + react-i18next + expo-localization
- Vitest 4 + @testing-library/react-native

### Backend (`backend/`)
- API: Node.js TypeScript, Fastify 5.8, Kysely 0.29 (PostgreSQL), BullMQ + ioredis (Redis)
- PostgreSQL 16 (primary relational store) + PgBouncer
- Redis 7 (cache / BullMQ queues)
- MinIO (S3-compatible object storage)
- Meilisearch (search index)
- Payments: Stripe 22 (Connect), Razorpay, Mollie
- Auth: jose + jsonwebtoken, bcryptjs, opaque token refresh tracking
- Realtime: LiveKit server SDK, @fastify/websocket
- ML: Python 3 + FastAPI 0.116 (uvicorn, numpy, pydantic, httpx)
- Key service: Fastify 5 + zod (crypto boundary)
- Observability: Sentry, OpenTelemetry, Prometheus (prom-client)
- AWS Rekognition + S3 SDK (media moderation and storage)

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
```

## Environment Configuration

Frontend env (Expo) lives in `frontend/`:
- `frontend/.env.example` — local development template
- `frontend/.env.production.example` — production template
- `frontend/.env` — your local copy (gitignored, never committed)

Backend env templates live in `backend/`:
- `backend/.env.example` — root Docker Compose vars
- `backend/api/.env.example` — API server vars
- `backend/api/.env.production.example` — API production template

Useful notes:
- Frontend API endpoint is controlled via `EXPO_PUBLIC_API_BASE_URL`
- Production preflight checks are enforced via `scripts/validate-production-env.mjs`
- Runtime mocks must be disabled in production (`EXPO_PUBLIC_ENABLE_RUNTIME_MOCKS=false`)
- SSL public-key pinning is validated via `frontend/scripts/validate-ssl-pins.mjs` (SPKI hashes generated by `generate-spki-hashes.sh`)

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
| `npm run check:visual-gates` | Visual release gates |
| `npm run check:visual-gates:report` | Visual release gates with report |
| `npm run check:residue` | Detect production-residue in dev code |
| `npm run check:domain-imports` | Block mock-data imports in domain code |
| `npm run check:mockdata-boundary` | Enforce mock-data boundary |
| `npm run check:golden-parity` | Golden parity check |
| `npm run check:ssl-pins` | Validate SSL pin SPKI hashes |
| `npm run check:bundle-size` | Bundle size budget check |
| `npm run check:maestro-flows` | Validate Maestro flow definitions |
| `npm run bundle:analyze` | Android bundle atlas |
| `npm run bundle:analyze:ios` | iOS bundle atlas |
| `npm run test:smoke` | Run smoke flow tests |
| `npm run verify:phase` | Combined typecheck + gates + targeted tests |

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

Workflows live in `.github/workflows/`:

| Workflow | Purpose |
|---|---|
| `frontend-ci.yml` | Frontend install, typecheck, tests, design-token lint |
| `backend-ci.yml` | Backend API install, build, tests |
| `ci-gates.yml` | Cross-cutting quality gates |
| `eas-build.yml` | EAS app builds (`working-directory: frontend`) |
| `build-and-deploy.yml` | Build and deploy pipeline |
| `staging-deploy.yml` | Staging deployment |
| `release-train.yml` | Release train orchestration |
| `ota-staged-rollout.yml` | OTA staged rollout |
| `ota-rollback.yml` | OTA rollback |
| `screenshots.yml` | Screenshot generation |
| `health-check.yml` | Post-deploy health checks |
| `scheduled-db-backup.yml` | Scheduled DB backups |

## Security and Compliance Notes

- Key management and crypto operations are isolated in `backend/key-service`
- API and key-service use token-guarded service/admin boundaries
- Compliance domain includes KYC, AML alerts, SAR records, consent evidence, moderation, fraud detection, and immutable audit-log design
- Production secrets are mandatory for auth, security admin controls, compliance, and attestation flows
- `frontend/.env` is gitignored — never commit live keys; rotate any that may have been exposed
- SSL public-key pinning is enforced and validated in CI (`check:ssl-pins`)
- Secrets rotation runbook: `backend/scripts/secrets-rotation.sh`
- DR runbook: `backend/scripts/dr-runbook.md`

## Deployment Summary

Primary deployment path is Docker Compose with production override:

```bash
# Validate first
npm run deploy:prod:validate

# Then ship
npm run docker:up:prod
npm run docker:logs:prod
```

The compose stack builds from:
- `./backend/api` — Fastify API
- `./backend/key-service` — encryption boundary
- `./backend/ml-service` — Python FastAPI ML

Post-deploy smoke: `node backend/scripts/post-deploy-smoke.mjs`. See `DEPLOYMENT.md` for the full deployment and runbook reference.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Expo package compatibility warnings | Align versions to Expo SDK expectations (`cd frontend && npx expo-doctor`) |
| API not reachable from device | Set `EXPO_PUBLIC_API_BASE_URL` in `frontend/.env` to host LAN IP |
| Docker dependency issues | `npm run docker:check`, then `npm run docker:logs` |
| Production env failures | `npm run deploy:prod:validate` and fill missing required keys |
| SSL pin failures | Regenerate SPKI hashes (`frontend/scripts/generate-spki-hashes.sh`) then re-run `npm run check:ssl-pins` |
| `npm install` at root does nothing | Expected — root `package.json` has no deps. Run `npm run frontend:install` or install per workspace |

## Ownership

Thryftverse
- Repository owner: K17ze
- Default branch: `main`

New engineers should start with this README, then `AGENTS.md` (execution charter), then `backend/README.md`, then dive into `frontend/src/` (start at `App.tsx` → `src/navigation/AppNavigator.tsx`) or `backend/api/src/index.ts` depending on focus. For deployment and ops, see `DEPLOYMENT.md`; for product design, see `Design.md`.
