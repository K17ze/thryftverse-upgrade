# 16 — Catalogue Importer Extraction Intelligence

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Seller Platform / Importer Domain / Applied ML / Trust & Safety
**Status:** **P0 media-authorization/outcome semantics; P1 model and native integration absent**

---

## 1. Executive verdict

This department has two very different maturity levels.

The catalogue importer itself is one of the strongest unfinished systems in the repository: encrypted connector credentials, consent versions, resumable batch state, source checksums, optimistic field revisions, blocking issues, media quarantine/finalization, per-field provenance, append-only events, seller approval, idempotent draft publication, unknown-outcome reconciliation and receipts. The UI is already structured around exceptions rather than generic dashboard cards.

Assisted extraction is not integrated into that product. The worker downloads one image and deliberately returns `{}` fields (`importerExtractionHandler.ts:145–149`), yet records `completed` (`importerExtractionService.ts:321`). A missing media URL is also recorded as a successful empty completion (`importerExtractionHandler.ts:218–249`). The route allows the client to choose arbitrary `modelId` (default `'placeholder-extractor'`), `modelVersion` (default `'v0'`) and `mediaAssetId` (`importerExtraction.ts:42–44`); ownership is checked for the import item (`importerExtraction.ts:97`) but not for the supplied media asset or its relationship/finalization. The worker resolves that asset globally (`importerExtractionHandler.ts:107–112`). This is a P0 authorization/truth boundary even though results do not expose the URL directly.

No frontend service, hook or screen consumes `/catalog-imports/items/:itemId/extraction`; the native catalogue review uses normalized importer fields only. Therefore replacing the placeholder model alone would still ship no user capability. The correct program is: secure/normalize the extraction domain, integrate field candidates into the existing item review/provenance model, then deploy evaluated source-aware extraction.

### 1.1 Maturity scorecard

| Dimension | Importer foundation | Extraction intelligence | Judgement |
|---|---:|---:|---|
| Lifecycle/state machine | 4.5/5 | 1.5/5 | Import saga is rich; extraction has four coarse statuses (`importerExtractionService.ts:56`) |
| Source/provenance | 4/5 | 1.5/5 | Import provenance tables are strong; extraction duplicates coarse JSON arrays |
| Media security | 4/5 importer ingest | 1/5 extraction | Import media verifies/quarantines; extraction accepts unbound asset ID (`importerExtraction.ts:42`) |
| Idempotency/recovery | 4.5/5 | 2.5/5 | Publication handles unknown outcome; extraction supersedes/skips but no capability outcome/reconcile |
| Human review | 4/5 | 3/5 backend only | Confirmation/edit/reject gate is thoughtful but not integrated into native UI or normalized-field revision |
| Model/data quality | N/A | 0/5 | Empty placeholder (`importerExtractionHandler.ts:137–149`); no schema validation, evidence or evaluation |
| Source adapters | 1.5/5 | 0.5/5 | Only seller package is actually enabled; external connector branches return unavailable |
| Flagship UX | 3.5/5 importer | 0/5 extraction | Strong exception UI; assisted extraction invisible |
| **Overall** | **2.7/5** | **1.0/5** | **Preserve the importer domain. Do not bolt a VLM directly into the worker and call it complete.** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Canonical importer path

```text
CatalogImportStart/Consent/Progress/Item screens
  → catalogImportApi typed fetchJson + If-Match
  → routes/catalogImports.ts
  → CatalogImportService/state machine/workers
  → connection/batch/item/media/provenance/event/publication tables
  → draft listing + receipt/reconciliation
```

| Layer | File / symbol | Lines | Finding | Value/gap |
|---|---|---|---|---|
| Foundation schema | `137_catalog_import_foundation.sql` | 30–255 | Connections, batches, items and events; encrypted token fields, consent, checkpoints, source checksum, field revision, issues, publication states including `outcome_unknown` | Strong base; preserve |
| Media/provenance | `138_catalog_import_provenance.sql` | 27–118 | Media fetch/verify/quarantine/finalization and field provenance by source kind | Existing canonical provenance should absorb extraction evidence |
| Publication | `139_catalog_import_publication.sql`, `catalogImportPublication.ts` | — | Idempotency/request hash, draft creation, receipts and outcome-unknown reconciliation | Correct money-like mutation semantics |
| Client contract | `catalogImportApi.ts` | 19–181 | Typed source, batch, readiness, publication and media states | Extraction DTO/methods are entirely absent |
| Source capability | `catalogImports.ts` | 297–356 | Seller package branch exists; eBay/Depop/Vinted return not available | Report must not imply live marketplace APIs |

### 2.2 Extraction top-down path

```text
[no native caller]
  → POST /catalog-imports/items/:itemId/extraction
  → queueExtraction + BullMQ
  → processImporterExtraction
  → generatePlaceholderExtraction({},{})
  → catalog_import_extractions
  → GET/confirm/publish routes
  → [no merge call from native client]
```

| Layer | File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|---|
| Route input | `importerExtraction.ts` | 41–44 | `mediaAssetId: z.string().optional()`, `modelId: z.string().default('placeholder-extractor')`, `modelVersion: z.string().default('v0')` | **P0:** model identity is not server authority |
| Queue route | `importerExtraction.ts` | 96–106 | Verifies item ownership via `catalogImportService.getItem(userId, itemId)` (line 97); does not verify asset ownership, finalization, moderation or association with item | **P0 cross-tenant/media-boundary defect** |
| Confirmation route | `importerExtraction.ts` | 204–208 | Iterates confirm/reject/edit in separate transactions | Partial batch outcome possible; no request-level idempotency/revision |
| Publish route | `importerExtraction.ts` | 290–294 | Returns confirmed fields; does not mutate `normalised_fields` | "Publish" name overstates effect; no end-to-end bridge |
| Required fields | `importerExtractionService.ts` | 20–24 | Hardcoded `brand, category, condition, size, estimated_price_range` for every item | Taxonomically wrong: size/brand may be inapplicable |
| Status type | `importerExtractionService.ts` | 56 | `ExtractionStatus = 'pending' \| 'completed' \| 'failed' \| 'superseded'` | Four coarse statuses; no `unavailable`/`partial`/`outcome_unknown` |
| Supersession | `importerExtractionService.ts` | 233–237 | `SET extraction_status = 'superseded' WHERE item_id = $1 AND extraction_status IN ('pending', 'completed')` | Good start; no uniqueness prevents concurrent latest rows |
| Result semantics | `importerExtractionService.ts` | 321 | `const status: ExtractionStatus = errorMessage ? 'failed' : 'completed';` — any no-error result is `completed`, including empty placeholder | **P0 telemetry/UI false completion** |
| Idempotency | `importerExtractionService.ts` | 302–305 | `JSON.stringify(row.extracted_fields) === JSON.stringify(extractedFields)` — compares stringified fields only when completed | Key order/confidence/model/error ignored; not a robust request/result hash |
| Field review | `importerExtractionService.ts` | 447–455 | Row lock, ownership, `extraction_status !== 'completed'` check, append JSON revision | Good human gate, but untyped arbitrary fields/values |
| Publication gate | `importerExtractionService.ts` | 618–641 | `readyForPublication` requires `completed` + all required fields resolved | Human review preserved; validity/taxonomy constraints not proven |
| Media resolution | `importerExtractionHandler.ts` | 107–112 | `SELECT canonical_url, original_object_url FROM media_assets WHERE id = $1 LIMIT 1` — global lookup, no owner/finalization/moderation predicate | **P0 privacy/authorization** |
| Download | `importerExtractionHandler.ts` | 84–88 | `fetch(url, { redirect: 'follow' })` — follows redirects, buffers entire response | SSRF/redirect and memory-exhaustion risk |
| Size check | `importerExtractionHandler.ts` | 47–48 | `MAX_IMAGE_BYTES = 50 * 1024 * 1024` — checked after full buffer | Memory exhausted before check fires |
| No-media result | `importerExtractionHandler.ts` | 218–249 | Missing URL stored as empty `completed` extraction | **P0 false outcome** |
| Placeholder model | `importerExtractionHandler.ts` | 137–149 | `generatePlaceholderExtraction` returns `{ fields: {}, confidenceScores: {}, placeholder: true }` | No extraction |
| Model binding | `importerExtractionHandler.ts` | 131–135 | Comment says "model must be registered in `model_artifacts` table"; handler logs payload model ID/version but does no lookup | Spoofed/unapproved model provenance |
| Native integration | `frontend/src` (rg audit) | — | No extraction endpoint/types/hook/UI found | **P1:** backend scaffold is not a user feature |

**Critical quote — client-supplied model identity (`importerExtraction.ts:41–44`):**
```ts
const triggerExtractionBodySchema = z.object({
  mediaAssetId: z.string().min(1).max(120).optional(),
  modelId: z.string().trim().min(2).max(120).default('placeholder-extractor'),
  modelVersion: z.string().trim().min(1).max(120).default('v0'),
});
```
The client chooses `modelId` and `modelVersion`. The server should own model selection from a capability registry. A client could supply any model ID string, and the worker logs it but never validates against `model_artifacts`.

**Critical quote — global media asset resolution (`importerExtractionHandler.ts:107–112`):**
```ts
  const result = await db.query<MediaAssetUrlRow>(
    `SELECT canonical_url, original_object_url
     FROM media_assets
     WHERE id = $1
     LIMIT 1`,
    [mediaAssetId],
```
No `WHERE owner_id = $actorId` or `WHERE moderation_status = 'approved'` or join to `catalog_import_media`. Any user who knows a `mediaAssetId` can trigger extraction on another user's media. The item ownership check (`importerExtraction.ts:97`) doesn't protect against this because the asset ID is independent of the item.

**Critical quote — false completion on empty placeholder (`importerExtractionService.ts:321`):**
```ts
      const status: ExtractionStatus = errorMessage ? 'failed' : 'completed';
```
If there's no error message, the status is `completed` — even if `extractedFields` is `{}` and `placeholder` is `true`. An empty placeholder extraction is recorded as `completed`. This inflates success metrics and misleads any UI that checks `extraction_status === 'completed'`.

**Critical quote — no-media false completion (`importerExtractionHandler.ts:218–249`):**
```ts
  if (!imageUrl) {
    // No media asset or no URL — store an empty completed extraction.
    // This is honest: we cannot extract from a photo we cannot locate.
    logger.warn(
      { extractionId, itemId, mediaAssetId },
```
The comment says "this is honest" but recording a missing-media case as `completed` is not honest — it's a false outcome. The extraction didn't complete; it was unable to run. This should be `unavailable` or `source_missing`, not `completed`.

**Critical quote — hardcoded required fields (`importerExtractionService.ts:20–24`):**
```ts
 * The required fields for publication are the material listing fields that
 * cannot be empty: brand, category, condition, size, and
 * estimated_price_range. A field is considered "resolved" when it is either
 * seller-confirmed or seller-edited. Rejected fields do not count. Only when
 * every required field is resolved may the item be published to a draft.
```
`brand, category, condition, size, estimated_price_range` — hardcoded for every item. Size may be inapplicable for accessories. Brand may be inapplicable for unbranded items. `estimated_price_range` is advice, not a listing fact. Required fields should be taxonomy-driven, not one fixed array.

### 2.3 Bottom-up authority conflict

The importer already has canonical `catalog_import_field_provenance` and `catalog_import_items.normalised_fields` with `field_revision`. Extraction instead stores a second mutable field blob (`extracted_fields` JSONB) and JSON arrays (`confirmed_fields`, `rejected_fields`, `edited_fields`). The route returns confirmed fields but does not perform a revision-checked merge. Two competing review/provenance systems will drift.

**Decision:** extraction produces candidate evidence; the importer item domain owns accepted normalized fields. Seller acceptance must call one revision-checked importer command that writes normalized field + canonical provenance + decision event atomically.

---

## 3. End-to-end flow traces

### 3.1 Current extraction flow

```text
[no native caller]
  → POST /catalog-imports/items/:itemId/extraction
  → triggerExtractionBodySchema.parse → { mediaAssetId?, modelId, modelVersion }
  → catalogImportService.getItem(userId, itemId) — item ownership check
  → extractionService.queueExtraction(itemId, mediaAssetId, modelId, modelVersion, userId)
  → enqueueImporterExtractionJob({ extractionId, itemId, mediaAssetId, modelId, modelVersion })
  → BullMQ worker: processImporterExtraction
  → resolveMediaAssetUrl(mediaAssetId) — global SELECT, no owner check
  → downloadImage(url) — redirect:'follow', full buffer, then 50MB check
  → generatePlaceholderExtraction(imageBuffer) → { fields:{}, confidence:{}, placeholder:true }
  → extractionService.processExtractionResult → status='completed'
  → GET /extraction → confirm/reject/edit routes
  → publish route returns confirmed fields but does NOT mutate normalised_fields
  → [no merge call from native client]
```

### 3.2 Intended flow

```text
immutable source snapshot / seller package
  → source adapter + schema/security validation
  → canonical intermediate product + source provenance
  → media ingest/finalization/moderation
  → extraction eligibility + server-selected model bundle
  → structured/OCR/barcode/vision/catalog candidates
  → field validation/evidence/calibration/abstention
  → seller exception review
  → revision-checked apply to normalised_fields + canonical provenance
  → batch approval snapshot
  → idempotent publication + reconciliation/receipt
```

---

## 4. August 2026 benchmark research

### 4.1 eBay — listing intelligence and bulk import APIs

| Source | Finding | ThryftVerse application |
|---|---|---|
| [eBay Inventory Mapping API](https://www.developer.ebay.com/develop/api/sell/inventory_mapping) | Accepts photos, titles, aspects and identifiers, produces async listing previews with normalized aspects/category/description, and uses `mappingReferenceID` for diagnosis | A mature extractor is multimodal, task-based and traceable. eBay's service availability/market scope does not authorize use for other marketplaces |
| [eBay Inventory API overview](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html) | Separates inventory item from offer; SKU is unique and publishing is a distinct action | Canonical intermediate product identity must be separate from ThryftVerse listing publication |
| [eBay Sell Feed workflow](https://developer.ebay.com/cms/files/connect-2020/selling_capabilities_scothamitlon.pdf) | Documents create task, upload file, poll task and retrieve results | Bulk jobs need durable task/result artifacts, not synchronous "import done" |

### 4.2 Google Merchant Center — product data rules

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Google Product data specification](https://support.google.com/merchants/answer/7052112) | Requires stable IDs and says not to guess GTIN; invalid identifiers can cause disapproval | Identifier extraction must validate checksum/catalog consistency and abstain |
| [Google Free listing attributes](https://support.google.com/merchants/answer/13889434) | Makes condition required for used/refurbished products and defines other conditional requirements | Required fields are category/market/channel rules, not one hardcoded array |
| [Google Product files](https://support.google.com/merchants/answer/12631822) | Describes standardized attributes and file validation | Seller packages need a documented versioned schema and row-level error report |

### 4.3 Standards and governance

| Source | Finding | ThryftVerse application |
|---|---|---|
| [GS1 General Specifications 24.0](https://ref.gs1.org/standards/genspecs/24.0.0/) | Defines GTIN as a trade-item identifier and distinguishes finer identifiers such as lot/serial | Catalog identity and unique second-hand physical item identity must remain distinct |
| [OWASP AISVS 1.0, June 2026](https://owasp.org/www-project-artificial-intelligence-security-verification-standard-aisvs-docs/) | Testable AI lifecycle/security requirements | Model/data/provider ingestion needs verifiable CI/security controls |
| [EU AI Act, Article 50, 27 July 2026](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727) | Requires machine-readable marking of synthetic outputs | Generated copy from extraction must carry provenance metadata |

---

## 5. Capability, state and ownership matrices

### 5.1 Source capability reality

| Source | Current capability | Target adapter | Release rule |
|---|---|---|---|
| Seller package | Only genuinely available path | Versioned manifest/CSV/JSON/archive adapter | Validate schema/files, snapshot immutably, import resumably |
| eBay | Route returns "not yet available" | Official OAuth/API/feed adapter subject to access | Do not scrape or enable UI before contractual/production access |
| Depop | Unavailable | Partner/API or user-provided export only | No credential automation without authorized interface |
| Vinted | Unavailable | Partner/API or user-provided export only | Same |

### 5.2 Field origin authority

| Origin | Appropriate authority |
|---|---|
| Source structured field | Evidence; may be stale or source-taxonomy-specific |
| Verified identifier/catalog | Authoritative for stable manufacturer facts, never used-item condition |
| OCR/vision/model | Suggestion only |
| Deterministic taxonomy map | Authoritative only for mapping rule/version, not source fact correctness |
| Seller edit/confirmation | Authoritative listing assertion, subject to validation/moderation |
| Operator | Exception handling with explicit actor/reason; not silent override |

### 5.3 Extraction states

Replace `pending/completed/failed/superseded` (`importerExtractionService.ts:56`) with two dimensions:

```text
job_state: queued | running | retry_wait | terminal | superseded
outcome: succeeded | partial | unavailable_no_model | ineligible |
         source_missing | failed | cancelled | outcome_unknown
```

`completed` is workflow terminality, not intelligence success. A partial run can contain valid candidates; an unavailable run contains none and must not count as model success.

---

## 6. User psychology, JTBD and trust

- **JTBD:** "Move my existing catalogue without rebuilding it, while staying in control of inaccuracies."
- Bulk import is an exception-management product. Automation is valuable when it shrinks the review queue; it is harmful when it creates plausible wrong fields at scale.
- Progress must be durable counts by item state, not timers. "742 ready, 18 need review, 3 unavailable" is more trustworthy than "98% AI complete."
- Preserve source versus proposed versus seller-final value. Silent normalization creates learned helplessness and later dispute confusion.
- Show uncertainty only where action is needed. Do not paint every field with confidence colours.
- A seller correction should feel final for that revision; re-runs must not overwrite it. Surface new source/model changes as a diff.
- Bulk confirm is allowed only for exact authoritative source/catalog facts under explicit selection. Never bulk-confirm condition, authenticity, damage or unique-item attributes from model confidence.

---

## 7. Strict anti-AI flagship UI/UX direction

### 7.1 Composition/density

- Preserve the current exception-led list: compact rows/tiles expose 4–6 useful items above fold.
- One progress header with durable counts; no four equal KPI cards, gradient hero, magic wand or duplicated "AI Importer" labels.
- Item review uses real photo as anchor and a flat field diff. Group by `Ready`, `Needs review`, `Source changed`, `Failed`, not by model type.
- Evidence opens on demand in a sheet: crop/OCR text/catalog/source. Do not place a badge, subtitle and confidence pill on every row.
- Bulk toolbar appears only after selection; it states exact scope and excluded high-risk fields.

### 7.2 Complete native states

| State | UX |
|---|---|
| Discovering/hydrating/media | Durable counts and background continuation; safe to leave |
| Extraction unavailable | Manual review remains fully usable; no retry loop if no model |
| Partial | Show valid candidates and actionable missing fields |
| Source changed after edit | Three-way diff: source previous/current/seller final |
| Probable duplicate | Side-by-side identity evidence; never auto-collapse unique used items |
| Rate limit/reauth | Pause reason and explicit resume/reauthorize |
| Outcome unknown publication | Warning, "Check result," no republish until reconciled |
| Offline | Cached review allowed only if edits enter durable outbox with revision |

### 7.3 Accessibility/motion

- Data table semantics/list headings, screen-reader labels for source/final/difference, and bulk-selection count.
- Non-colour icons/text for confidence/issues; 44pt controls and 200% text without horizontal trap.
- Reduced motion; no row-by-row mount animation. Animate only status relocation/selection 160–220ms.
- Keyboard/external-keyboard workflows: next issue, accept, edit, skip, multi-select with confirmation.

---

## 8. Target architecture and source-of-truth boundaries

### 8.1 End-to-end path

```text
immutable source snapshot / seller package
  → source adapter + schema/security validation
  → canonical intermediate product + source provenance
  → media ingest/finalization/moderation
  → extraction eligibility + server-selected model bundle
  → structured/OCR/barcode/vision/catalog candidates
  → field validation/evidence/calibration/abstention
  → seller exception review
  → revision-checked apply to normalised_fields + canonical provenance
  → batch approval snapshot
  → idempotent publication + reconciliation/receipt
```

Structured source data wins over computer vision for equivalent evidence, but does not override seller correction or unique-item condition.

### 8.2 Canonical intermediate contract

```ts
type ImportedProduct = {
  source: CatalogSource;
  sourceItemId: string;
  sourceRevision: string;
  sourceSnapshotId: string;
  identity: { gtin?:string; mpn?:string; brand?:string; catalogEntityId?:string };
  facts: Record<string, { value:unknown; origin:string; evidenceRefs:string[] }>;
  offer: { priceMinor?:number; currency?:string; quantity?:number; availability?:string };
  variants: Array<{ sourceVariantId:string; attributes:Record<string,string> }>;
  media: Array<{ mediaAssetId:string; order:number; sourceHash:string }>;
};
```

Second-hand item identity is `seller + source + sourceItemId/sourceRevision`; catalog match is a reference, not dedup authority.

### 8.3 Extraction schema convergence

```sql
catalog_import_extraction_runs(
  id, item_id, input_revision, model_bundle_id, request_hash,
  job_state, outcome, attempt_count, error_code,
  idempotency_key, started_at, completed_at,
  UNIQUE(item_id, input_revision, model_bundle_id)
)

catalog_import_field_candidates(
  id, run_id, field_name, candidate_json, rank,
  evidence_json, calibrated_confidence, abstained,
  validation_state, policy_flags
)

catalog_import_field_decisions(
  id, item_id, candidate_id, field_name, actor_id,
  decision, final_value_json, base_field_revision,
  applied_field_revision, idempotency_key, created_at,
  UNIQUE(item_id, idempotency_key)
)
```

Write accepted/edit decisions into existing `catalog_import_field_provenance` and `normalised_fields` transactionally. Retire mutable `extracted_fields` and JSON field-state arrays after migration; they can remain a compatibility read model temporarily.

### 8.4 APIs/events/cache

```http
POST /catalog-imports/items/:id/extraction-runs    Idempotency-Key
GET  /catalog-imports/items/:id/extraction-runs/latest
POST /catalog-imports/items/:id/field-decisions   If-Match: fieldRevision
POST /catalog-imports/batches/:id/field-decisions/bulk
```

Server selects model bundle from capability policy; client never supplies arbitrary model identity. Events: `import.extraction.queued/completed.v1`, `import.field.decision_applied.v1`, `import.item.source_changed.v1`. Cache immutable source/catalog lookups by version; never cache seller review as model truth. Invalidate item/batch summaries on decision event.

---

## 9. Full state machines

### Extraction run

```text
eligible → queued → running → succeeded | partial | unavailable | failed
running → retry_wait → queued
queued/running → superseded
running → outcome_unknown → reconciling → succeeded | partial | failed
```

### Field candidate

```text
unreviewed → accepted | rejected | editing → edited
accepted/edited → apply_pending → applied
apply_pending → revision_conflict → compare → unreviewed/edited
any → superseded_by_source_change (seller final retained)
```

### Batch

Keep the existing foundation states. Extraction is an optional sub-pipeline; model outage must not force batch `failed_recoverable`. Manual normalization stays available.

---

## 10. Model/data evaluation

### 10.1 Model bundle, not one VLM

- Deterministic source adapters and schema mapping.
- OCR with region evidence.
- Barcode/GTIN parsing/checksum and catalog lookup.
- Vision/category/aspect candidates.
- Entity resolution with abstention.
- Copy generation only if separately requested/reviewed.
- Comparable-sales pricing remains a different read model; never "extract" price from photo.

### 10.2 Evaluation corpus and metrics

Stratify by source, category, language, seller size, image quality, vintage/no-identifier, variants and long-tail brands. Preserve temporal holdout to catch source/taxonomy drift.

| Field/module | Gate |
|---|---|
| GTIN/barcode | Valid checksum and catalog consistency; wrong-identifier precision target effectively 100%, otherwise abstain |
| Brand/entity | Precision-first by brand/category; counterfeit-sensitive false match tracked separately |
| Category | Hierarchical accuracy + required-aspect downstream coverage |
| OCR size/model | Exact match and normalized match; region attached |
| Condition | No authoritative prediction; evaluate damage-evidence prompt recall only |
| Attributes | Precision/recall and calibration by source/category |
| Price guidance | Interval coverage/error on completed-sale cohorts; never part of extraction success |
| End product | Seller correction rate, time/item, ready-without-edit, publish/return/report outcomes |

Use seller decisions as noisy feedback, not ground truth. Training needs consent, provenance, deduplication, leakage controls and deletion policy. Register dataset/model/prompt/taxonomy versions; canary and shadow runs precede release.

---

## 11. Security, privacy and failure-mode analysis

| Threat/failure | Current exposure | Required mitigation |
|---|---|---|
| Cross-tenant media extraction | `importerExtractionHandler.ts:107–112` — global SELECT | Bind asset through `catalog_import_media` for owned item; require finalized/publishable state |
| Spoofed model provenance | `importerExtraction.ts:43–44` — client-supplied model ID | Server capability registry and model artifact lookup; persist actual serving version |
| SSRF/redirect abuse | `importerExtractionHandler.ts:87` — `redirect: 'follow'` | Fetch storage object by internal key/SDK; if HTTP, strict host allowlist, DNS/IP checks, redirect revalidation |
| Memory/decompression bomb | `importerExtractionHandler.ts:47–48` — full buffer before 50MB check | Stream byte cap, MIME sniff, sandbox decode, dimension/pixel limits |
| Malicious package/archive | Seller package pipeline risk | Zip-slip/bomb/symlink limits, file allowlist, malware scan, isolated parser |
| Formula injection on CSV export | Not evidenced | Escape spreadsheet formulas and provide safe export |
| Prompt injection in source text | Future model risk | Treat text as data; typed schema/tool allowlist; no autonomous network/tool access |
| Duplicate/source drift | Existing checksums/revisions help | Lock item/run uniqueness and explicit three-way source conflict |
| Wrong bulk confirmation | Potential future risk | Field/category/source allowlist; preview count/sample; no high-risk facts |
| Raw credential/payload retention | Existing encryption/expiry fields help | Enforced purge metrics, key rotation and DSAR/delete tests |
| External platform terms | Connectors unavailable | Legal/API approval per source/version; no scraping workaround |
| False completion on empty placeholder | `importerExtractionService.ts:321` | Distinguish `unavailable`/`source_missing`/`partial` from `completed` |
| False completion on missing media | `importerExtractionHandler.ts:218–249` | Record as `source_missing`, not `completed` |

---

## 12. SLOs and observability

### SLOs

- Seller-package validation p95 <30s for documented max package; first actionable errors <5s.
- Extraction queue start p95 <10s; per-item partial result p95 <15s, batch progress continuously durable.
- Importer API 99.9%; manual review available during model outage.
- Field decision application 99.99%; duplicate application 0.
- Publication duplicate drafts 0; unknown outcomes reconciled p99 <5 minutes.
- Source/item/media/model provenance completeness 100% for published drafts.
- Unauthorized media/model execution 0.

### Observability

Metrics by source/category/model: discovered/hydrated/media/normalized counts, queue age, outcome (including unavailable), field coverage/precision proxy/correction, abstention, source drift, duplicate score, bulk action, publication outcome, retention purge and cost. Trace `batch → item → source snapshot → media → extraction run → candidate → decision → field revision → draft listing`. Logs never contain tokens, raw payloads, image URLs or extracted PII. Alert on empty "success," unregistered model, unbound asset, growing raw-retention backlog and source-specific correction spikes.

---

## 13. Migration, flags, compatibility and rollback

### Flags

```text
import_extraction_boundary_fix_v1
import_assisted_extraction_v1
import_extraction_field_convergence_v1
import_extraction_source_adapters_v1
import_extraction_marketplace_adapters_v1
```

### Sequence

1. **P0:** Reject unbound media assets and client model identity (`importerExtraction.ts:42–44`); distinguish unavailable/source-missing/partial outcomes (`importerExtractionService.ts:321`).
2. Add new run/candidate/decision tables alongside migration 146; backfill old rows as `legacy_placeholder` or `legacy_result` without inventing success.
3. Expose read-only new DTO; old summary remains compatibility adapter.
4. Implement atomic field-decision command writing existing canonical provenance/normalised fields.
5. Add native extraction UI behind `import_assisted_extraction_v1`, default manual.
6. Shadow model on consented internal batches; no seller-visible fields.
7. Enable by source/category/model bundle after evaluation.

Rollback disables new runs/model bundle and leaves manual importer/review/publication intact. Preserve candidate/decision audit, supersede defective runs, restore previous normalized field revision through the importer command. Never roll back by deleting source snapshots or publication records.

---

## 14. Phased implementation backlog mapped to files/owners

| Phase | Concrete work/files | Owner | Dependency | Exit |
|---|---|---|---|---|
| 0 — boundary fixes | `routes/importerExtraction.ts` (lines 42–44, 96–106), `importerExtractionHandler.ts` (lines 87, 107–112, 218–249), `importerExtractionService.ts` (line 321) | API/Security | Existing media tables | P0 tests pass |
| 1 — convergence | New candidate/decision schema; importer domain command; deprecate pseudo-publish route | Seller Platform | Phase 0 | One provenance authority |
| 2 — native integration | `catalogImportApi.ts`, item hook/store, canonical `CatalogImportItemScreen` and components | Mobile/UI | Phase 1 | Complete state/a11y matrix |
| 3 — source intelligence | seller-package adapters, schema registry, OCR/barcode/catalog | Data/Applied ML | Rights-cleared dataset | Shadow eval gates |
| 4 — marketplace adapters | eBay official adapter first; others only with approved interfaces | Partnerships/API | Legal/provider access | Capability route truthful |
| 5 — scale | bulk decision policy, model/source drift dashboards, cost controls, rollback automation | SRE/ML | Production volume | SLOs sustained |

---

## 15. Test, evaluation and release gates

- Cross-user/unbound/unfinalized/quarantined media IDs are rejected.
- SSRF redirect, private IP, oversized body, decompression bomb, MIME polyglot and malformed image suites.
- Client cannot choose unregistered model; actual model version matches artifact/serving record.
- Empty placeholder/no media cannot count as successful extraction.
- Concurrent extraction requests produce one active run per input/model bundle.
- Field decision requires current item revision; conflict preserves seller edit.
- Confirm/reject/edit/bulk requests are idempotent and atomic at requested scope.
- Extraction outage leaves manual review/publication functional.
- Source update after seller edit produces explicit conflict, never overwrite.
- Duplicate retries/publication callbacks cannot create duplicate drafts.
- Per-field evaluation thresholds by source/category; model rollback rehearsal.
- VoiceOver/TalkBack, 200% text, external keyboard, offline/background/resume and large-batch virtualization.
- Native render passes density, thumbnail and squint gates; real media/action exceptions dominate.

---

## 16. Explicit non-goals

- Scraping marketplaces without authorized interfaces; autonomous publication; model-set condition/authenticity; guessing identifiers; merging unique second-hand items solely by catalog match; general agent with tools/network access.

---

## 17. Decisions requiring product, legal/trust and operations input

1. Versioned seller-package schema and maximum files/bytes/items?
2. External-source API/terms approval and allowed retention per marketplace?
3. Which fields may bulk-confirm from authoritative structured source?
4. Required facts by ThryftVerse category and sales channel?
5. Model/provider data use, region, retention and training opt-out?
6. How long raw source snapshots, candidates, corrections and audit remain?
7. Can seller corrections be used for training, and how are deletions propagated?
8. Should price guidance be in importer review at all, or a later seller-pricing step? Recommendation: later, separate.

---

## 18. Final decision

**PRESERVE THE IMPORTER; REBUILD THE EXTRACTION BOUNDARY.** The foundation is production-minded, but extraction is a disconnected placeholder with a real authorization defect (`importerExtractionHandler.ts:107–112` — global media asset resolution with no owner check) and misleading completion semantics (`importerExtractionService.ts:321` — empty placeholder recorded as `completed`; `importerExtractionHandler.ts:218–249` — missing media recorded as `completed`). The client can supply arbitrary model identity (`importerExtraction.ts:43–44`). Secure asset/model authority, converge decisions into existing field provenance, wire the canonical native review, and only then deploy source-aware evaluated models. The importer domain is the strongest unfinished system in the repository — the extraction layer must rise to its standard, not drag it down.
