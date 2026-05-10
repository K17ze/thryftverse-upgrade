# Thryftverse

Last updated: 2026-05-10

Thryftverse is a mobile-first marketplace and social commerce platform built with React Native (Expo) plus a Docker-first backend stack. It combines:
- Core second-hand marketplace flows (listing, browsing, checkout, orders)
- Real-time and bot-enabled messaging
- Trade Hub modules (auctions and co-own assets)
- 1ze wallet and controlled monetary-layer foundations
- Compliance, payouts, reconciliation, and launch-ops tooling

## What Is In This Repository

The repo is organised as a clean monorepo with two top-level workspaces:

1. `frontend/` — Mobile application (Expo + TypeScript)
2. `backend/`  — Platform services (API, key service, ML service, data dependencies)

The repo root holds only orchestration: Docker Compose files, cross-cutting scripts, and a thin `package.json` that delegates into either side via `npm --prefix`.

You can:
- Run the app only for UI/product work (`cd frontend && npm start`)
- Run the full stack locally with Docker for end-to-end behaviour (`npm run docker:up` from root)
- Validate production configuration and launch readiness before shipping (`npm run deploy:prod:validate`)

## High-Level Architecture

- Mobile app: React Native + Expo + React Navigation + Zustand
- API service: Fastify + TypeScript
- Data stores: PostgreSQL + Redis + MinIO
- Crypto boundary: dedicated key-service for app-layer encryption operations
- Intelligence layer: Python FastAPI ML microservice

Runtime service graph (local Docker):
- app → api
- api → postgres
- api → redis
- api → minio
- api → key-service
- api → ml-service

## Repository Structure

```text
thryftverse/
├── frontend/                    # Expo / React Native mobile app
│   ├── App.tsx, index.ts        # Expo entry points
│   ├── src/
│   │   ├── screens/             # app screens and journeys
│   │   ├── components/          # reusable UI + interaction components
│   │   ├── navigation/          # stack/tab routing + route contracts
│   │   ├── store/               # Zustand state slices
│   │   ├── services/            # frontend service clients
│   │   ├── lib/                 # api client, offline queue, telemetry
│   │   ├── context/             # React contexts (toast, currency, prefs)
│   │   ├── hooks/, utils/, theme/, i18n/, data/
│   │   └── __tests__/           # Vitest suites
│   ├── assets/                  # icons, splash, fonts
│   ├── scripts/                 # frontend-only tooling
│   │   ├── check-design-tokens.mjs
│   │   └── extract-i18n-strings.mjs
│   ├── package.json             # Expo, RN, Reanimated, Zustand, vitest
│   ├── app.json, eas.json       # Expo + EAS configuration
│   ├── babel.config.js, metro.config.js
│   ├── tsconfig.json, vitest.config.ts
│   └── .env*                    # frontend env (gitignored)
├── backend/
│   ├── api/                     # Fastify API + SQL migrations + ops scripts
│   ├── key-service/             # encryption/decryption + key rotation boundary
│   ├── ml-service/              # ML endpoints for recommendations/pricing
│   ├── scripts/                 # smoke checks and launch rehearsal scripts
│   └── README.md
├── scripts/                     # cross-cutting (root) scripts
│   └── validate-production-env.mjs
├── docker-compose.yml           # local stack definition
├── docker-compose.prod.yml      # production-safe overrides
├── package.json                 # thin orchestrator (no deps)
└── README.md                    # this file
```

## Product Surface Snapshot

Major app surfaces currently included:
- Marketplace: home feed, search, category browse, item detail, make offer, checkout
- Seller workflows: sell/upload, postage, listing success, manage listing
- Messaging: inbox, chat, group chat, bot directory, support entry points
- Profiles and preferences: account settings, edit profile, notifications, personalisation
- Trade Hub: auctions, co-own hub, portfolio, asset detail, trade, buyout, syndicate history
- Wallet and money flows: balance, payments, withdraw, payout-linked journeys
- Compliance and support oriented screens integrated into key financial paths

## Tech Stack

### Frontend (`frontend/`)
- Expo SDK 54
- React 19 + React Native 0.81
- TypeScript 5.9
- React Navigation 7
- @shopify/flash-list
- Reanimated + Gesture Handler
- Zustand
- Vitest

### Backend (`backend/`)
- Node.js TypeScript API (Fastify 5)
- PostgreSQL 16 (primary relational store)
- Redis 7 (cache / BullMQ queues)
- MinIO (S3-compatible object storage)
- Python 3.11 + FastAPI ML service
- Sentry, OpenTelemetry, Prometheus integrations

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
npm run backend:api:dev      # tsx --watch on backend/api/src/index.ts

# Or for the key service
npm run backend:key:install
npm run backend:key:dev
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
| Frontend i18n | `npm run frontend:i18n:extract` | Extract translatable strings |
| Backend API | `npm run backend:api:dev` | Start API in watch mode |
| Backend API | `npm run backend:api:build` | Compile API to `dist/` |
| Backend API | `npm run backend:api:test` | Run API test suite |
| Backend API | `npm run backend:api:migrate` | Apply SQL migrations |
| Backend keys | `npm run backend:key:dev` | Start key-service in watch mode |
| Docker local | `npm run docker:up` | Build & run backend stack |
| Docker local | `npm run docker:down` | Stop backend stack |
| Docker local | `npm run docker:logs` | Tail service logs |
| Docker health | `npm run docker:check` | Smoke-check API/dependency health |
| Docker prod | `npm run docker:up:prod` | Start production compose profile |
| Docker prod | `npm run docker:down:prod` | Stop production compose profile |
| Production preflight | `npm run deploy:prod:validate` | Validate `.env.production` requirements |
| Launch ops | `npm run launch:phase8` | Run strict launch checks |
| Launch ops | `npm run staging:shipping-ops` | Shipping-ops staging rehearsal |

## Quality and Release Workflow

Recommended baseline before merge/release:

```bash
npm run frontend:typecheck
npm run frontend:test
npm run frontend:lint:design-tokens
npm run backend:api:test
npm run deploy:prod:validate
```

CI runs the equivalent on every PR / push to `main` (`.github/workflows/ci.yml`):
- Installs `frontend/` deps, runs typecheck + tests + design-token lint
- Installs `backend/api/` deps, builds, runs tests

EAS app builds run via `.github/workflows/eas-build.yml`, with `working-directory: frontend` for all `eas` commands.

## Security and Compliance Notes

- Key management and crypto operations are isolated in `backend/key-service`
- API and key-service use token-guarded service/admin boundaries
- Compliance domain includes KYC, AML alerts, SAR records, consent evidence, and immutable audit-log design
- Production secrets are mandatory for auth, security admin controls, compliance, and attestation flows
- `frontend/.env` is gitignored — never commit live keys; rotate any that may have been exposed

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

## Troubleshooting

| Symptom | Fix |
|---|---|
| Expo package compatibility warnings | Align versions to Expo SDK expectations (`cd frontend && npx expo-doctor`) |
| API not reachable from device | Set `EXPO_PUBLIC_API_BASE_URL` in `frontend/.env` to host LAN IP |
| Docker dependency issues | `npm run docker:check`, then `npm run docker:logs` |
| Production env failures | `npm run deploy:prod:validate` and fill missing required keys |
| `npm install` at root does nothing | Expected — root `package.json` has no deps. Run `npm run frontend:install` or install per workspace |

## Ownership

Thryftverse
- Repository owner: K17ze
- Default branch: `main`

New engineers should start with this README, then `backend/README.md`, then dive into `frontend/src/` (start at `App.tsx` → `src/navigation/AppNavigator.tsx`) or `backend/api/src/index.ts` depending on focus.
