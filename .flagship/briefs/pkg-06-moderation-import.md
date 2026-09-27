# PKG-06 — Moderation provider contract, fail-closed review, remote import transport safety

Repo root: C:/Users/User/Desktop/thryftverse-upgrade (HEAD 76c0733). Audit: ThryftVerse-Post-Upgrade-Audit-2026-09-20.md Appendix C (B1–B4, moderation triage).

## Findings to close

### B1 — malformed Rekognition Image.Url
`backend/api/src/lib/moderation/rekognitionProvider.ts:63-67,250-254` sends `Image.Url` — AWS Rekognition accepts ONLY `Image.Bytes` (≤5MB blob) or `Image.S3Object{Bucket,Name,Version}` (verified against current AWS API reference). Fix the request construction: if the asset is in the app's own S3-compatible store, send S3Object with real bucket/key; otherwise fetch bytes (bounded size) and send Bytes. Reject >5MB or non-JPEG/PNG inputs before the call with a classified result, not a provider error. Text-only moderation requests must not build an Image payload at all (see B2 path).

### B2 — listing text moderation fails open
Listing create `backend/api/src/index.ts:16840-16855` and edit `:18582-18600`: rejected → blocks; review → logs; FAILED → proceeds. Service catches into `failed` at `lib/moderation/moderationService.ts:137-158`; Rekognition text path always fails (:277-283). Fix: introduce a durable moderation HOLD — when provider evaluation fails or returns review, the listing goes to a `pending_review`/held state that is not publicly servable (check how status is projected to feeds/search — the listing must not appear in public surfaces while held), plus a queue/retry path for transient provider failure. Keep legitimate reject → blocked. Do not break the existing accepted path.

### B3 — import DNS validation/connect TOCTOU
`backend/api/src/lib/media/remoteImport.ts:238-255,559-584`: DNS validated at resolve time then connection re-resolves. Fix by pinning the resolved address for the actual connection (connect to the validated IP with correct Host/TLS SNI, or use the shared `safeRemoteMediaFetch` helper if it already pins — consolidate on the shared implementation rather than maintaining two). Re-check SSRF rules: private ranges, link-local, redirects must re-validate.

### B4 — read deadline cleared at headers
`remoteImport.ts:569-592` clears the read timer before the body reader (:624+). Fix: whole-request deadline covering headers AND body; enforce size cap during streaming read; abort on timeout mid-body, and dispose partial data.

## File ownership
- EXCLUSIVE: `backend/api/src/lib/moderation/rekognitionProvider.ts`, `backend/api/src/lib/moderation/moderationService.ts`, `backend/api/src/lib/media/remoteImport.ts` (+ the shared safeRemoteMediaFetch helper if consolidation requires touching it — read it first at `src/lib/media/` or wherever it lives), `backend/api/src/workers/handlers/moderationTriageHandler.ts` (label the heuristic honestly if you touch it), `backend/api/src/workers/handlers/catalogImportMediaHandler.ts` (only if it needs rewiring to the shared fetch), any NEW test/migration files.
- LEASED index.ts regions: ~16830–16870 and ~18570–18610 (listing create/edit moderation call sites) ONLY.
- If a new listing-status value or column is needed, add a new migration file following numbering conventions — check existing moderation/status migrations first and prefer reusing an existing `pending_review`-style state if one exists.

## Constraints
- No new deps. The provider SDK mocking pattern already exists in tests — reuse it.
- The audit noted the installed SDK previously serialized Image:{} — after your fix the serialized request must contain Bytes or S3Object. Write a test asserting the outgoing request shape.
- Fail-closed means the PUBLIC never sees unreviewed content; internal/admin surfaces may still show held items with explicit status.
- Tests under `backend/api/src/__tests__/`: Image request shape; text moderation provider failure → hold not publish; review verdict → hold; reject → block; import: private-IP URL rejected pre-connect; redirect to private range rejected; body-read timeout aborts; oversized body rejected.
- `npx tsc --noEmit` clean for your files. No full suite. No commit.

## Report
`.flagship/reports/pkg-06-report.md`. Return: status, files changed, one-line test summary.
