# PKG-04 — Infrastructure: worker image, backup pipeline, restore helper, release gates

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix D.

## Findings to close

### I1 — Production worker image can't run its command
`backend/api/Dockerfile:17-23` omits dev deps and src; `package.json` `worker:start` = `tsx src/workers/index.ts` (tsx is a devDependency). Root override `docker-compose.prod.yml:271` and `backend/docker-compose.production.yml:472` run it. Fix: compile workers in the image build stage (add a build step producing dist/, or bundle via existing toolchain) and point worker:start at the compiled output — same artifact as API. Keep a `worker:start:dev` path for tsx if devs use it.

### I2 — Backup sidecars can't start/upload
Root readonly mount (:324) + `set -e` (:329) + chmod (:332); backend readonly (:550) + chmod (:558). `backend/scripts/automated-backup.sh:1` has bash shebang but the image lacks bash. Only internal db network (root:372-395; backend:604-630) despite apk/S3/webhook egress. Empty encryption/destination permitted; shell helper deletes output even without upload (:44-47,140-147). Fix all: correct interpreter (sh or install bash deliberately), remove chmod-into-readonly, mount a writable scratch dir, explicit egress rules, required encryption key + destination validation at startup, never delete local artifact when upload fails.

### I3 — Scheduled S3 expiry removes wrong key
`.github/workflows/scheduled-db-backup.yml:133-141`: lists prefix then removes bucket/basename WITHOUT prefix; upload (:77) includes prefix. Fix key construction; add a comment noting exact-key assertion is required in drill.

### I4 — Backup erasure manifest lies
`backend/api/src/workers/handlers/backupExpiryHandler.ts:79-88` sets purged after 120 days without store inventory. Fix: verify object existence/absence per configured store; mark `purged` only on confirmed deletion, `purge_failed` otherwise, and keep failure surfaced.

### I5 — Standalone compose missing required token
`backend/docker-compose.production.yml` lacks API_INTERNAL_SERVICE_TOKEN/env_file; config requires it (`backend/api/src/config.ts:339`, requiredSecret :69-79). Add env wiring consistent with root compose.

### I6 — Release train skipped by dependency graph
`.github/workflows/release-train.yml:84-100,127-130`: nonproduction build unreachable (skipped approval dependency, no status predicate). Fix job graph so staging/dev builds can run; preserve prod approval gate.

### I7 — OTA signing gate tests presence only
release gate :30-46, `frontend/app.config.ts:211-231,343-350`, release-train :180-209: env Boolean/cert presence check, no private-key input, other OTA publishers bypass gate. Fix: consolidate publish paths through the gated workflow, add real signing input plumbing (secrets names + `expo` signing flags per docs.expo.dev/eas-update/code-signing — private key file passed to the publish step, public cert in app.config), and make all publisher paths flow through the same gate.

### I8 — Restore helper defects
`backend/api/scripts/postgres-restore-verify.mjs`: (a) default probe uses `coOwn_assets/holdings/orders/trades` but schema stores lowercase — `to_regclass('public.coOwn_assets')` resolves yet count uses `"coOwn_assets"` quoted → default probe fails on a good restore. Use lowercase/schema-qualified names or resolved regclass. (b) `assertScratchTarget` compares raw strings / substring-matches the URL for scratch|restore|drill|staging|test — a prod URL containing 'test' in credentials/host passes; RESTORE_DROP_EXISTING sends destructive --clean --if-exists. Fix: parse the connection URL, compare normalized host+port+db against the SOURCE url and refuse any match; require explicit RESTORE_TARGET_URL with a required marker check on the DATABASE NAME itself; refuse when unset. Keep manual-only nature; make the guard real.

### I9 — Chaos helper green ≠ drilled
`backend/api/scripts/chaos-smoke.mjs`: PASS when checks skipped. Tighten: report `ok:false`/exit non-zero when mandatory authenticated checks were skipped, unless `--allow-skips` explicitly passed.

## File ownership
- EXCLUSIVE: `backend/api/Dockerfile`, `backend/api/package.json` (scripts only — do not touch deps), `docker-compose.prod.yml`, `docker-compose.yml` (only if needed), `backend/docker-compose.production.yml`, `.github/workflows/scheduled-db-backup.yml`, `.github/workflows/release-train.yml`, `backend/scripts/automated-backup.sh`, `backend/api/src/workers/handlers/backupExpiryHandler.ts`, `backend/api/scripts/postgres-restore-verify.mjs`, `backend/api/scripts/chaos-smoke.mjs`, `frontend/app.config.ts` (signing block only), `frontend/eas.json` (only if needed for channel/preview alignment), plus ML admin hardening: `backend/ml-service/app/main.py` (require ADMIN_SERVICE_TOKEN in prod — no `local-admin-token` default when ENV=production) and remove/neutralize the published `8000` port for ml-service in both compose files.
- Read-only: everything else.

## Constraints
- Windows host: verify via `node --check` for scripts, `npx tsc --noEmit` for TS files, `yamllint`-free YAML sanity (python -c yaml.safe_load or careful review). Docker cannot run — document what must be verified in CI/staging in your report under "runtime validation pending".
- Keep changes minimal and production-plausible; follow existing file conventions.
- Do NOT commit.

## Report
`.flagship/reports/pkg-04-report.md` — include a per-finding closure table (I1..I9 → what changed, what still needs runtime proof). Return: status, files changed, one-line summary.
