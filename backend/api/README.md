# Thryftverse API — Local Development

## Prerequisites

- Docker Desktop (Windows / macOS) or Docker Engine (Linux)
- Node.js 20+ and npm

## 1. Create Environment File

```bash
cp .env.example .env
```

Fill in local values. The defaults below work with the Docker Compose services:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://thryftverse:thryftverse@localhost:5432/thryftverse
REDIS_URL=redis://localhost:6379
AUTH_ACCESS_TOKEN_SECRET=dev-access-token-secret
AUTH_REFRESH_TOKEN_SECRET=dev-refresh-token-secret
S3_ENDPOINT=http://localhost:9000
S3_PUBLIC_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=thryftverse-media
S3_FORCE_PATH_STYLE=true
KEY_SERVICE_URL=http://localhost:4100
KEY_SERVICE_CLIENT_TOKEN=local-key-client-token
KEY_SERVICE_ADMIN_TOKEN=local-key-admin-token
API_SECURITY_ADMIN_TOKEN=local-security-admin-token
```

> **Never commit `.env` to version control.** It is already ignored in `.gitignore`.

## 2. Start Infrastructure

```bash
cd ../..
docker compose up -d --build
```

This starts Postgres, Redis, MinIO, Key Service, and the API.

Verify health:

```bash
curl http://localhost:4000/health
```

Expected response:

```json
{ "ok": true, "service": "thryftverse-api", "redis": "PONG" }
```

## 3. Run Migrations

```bash
npm run migrate
```

## 4. Run Smoke Tests

```bash
# Verify env
npm run check:env

# Profile flow
API_BASE_URL=http://localhost:4000 npm run smoke:profile

# Commerce flow
API_BASE_URL=http://localhost:4000 npm run smoke:commerce

# Co-own flow
API_BASE_URL=http://localhost:4000 npm run smoke:coown
```

## 5. Start API in Dev Mode (without Docker)

If you prefer running the API outside Docker (e.g., for debugging):

```bash
# 1. Start only infrastructure containers
docker compose up -d postgres redis minio minio-init key-service

# 2. Ensure .env uses localhost endpoints (see example above)

# 3. Run the API directly
npm run dev
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Missing required environment variable: DATABASE_URL` | `.env` missing | `cp .env.example .env` |
| `Docker Desktop not running` | Docker daemon down | Start Docker Desktop |
| `Profile smoke fails at GET /users/me` | Auth scope bug or env not loaded | Rebuild API container: `docker compose up -d --build api` |
| `Migration not applied` | New columns missing | Run `npm run migrate` |
