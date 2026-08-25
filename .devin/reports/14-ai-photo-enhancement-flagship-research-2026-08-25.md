# 14 — AI Photo Enhancement

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Media Platform / Applied ML / Sell Experience / Trust & Safety
**Status:** **P0 release-truth defect; P1 capability absent**

---

## 1. Executive verdict

The current development build is an honest, disabled concept demo. The release build is not.

`AI_PHOTO_DEMO_MODE = __DEV__` (`aiPhotoEnhancementApi.ts:91`) means production sets the flag to `false`. In that branch the service returns empty option catalogs (`aiPhotoEnhancementApi.ts:253–255`, `265–267`, `277–279`), but its apply functions return the original URI with `isDemo:false` (`aiPhotoEnhancementApi.ts:295–304`, `332–341`, `370–379`); the screen's non-demo copy says "Enhancement applied" (`AIPhotoEnhancementScreen.tsx:531`), and Save merely navigates back without returning or persisting any asset (`AIPhotoEnhancementScreen.tsx:201–206`). If a caller ever supplies an option ID through state or future catalog wiring, the production-shaped path can label a no-op as success. More immediately, release builds show an empty editing surface without the demo disclosure. This is a P0 fail-open capability/claim defect, not only unfinished AI.

No backend enhancement route, job table, worker/provider adapter, output finalization, derived-asset lineage or listing-media apply contract was found. The correct product is not "make the photo prettier." It is a constrained media-derivation system that improves presentation without altering the identity, colour, branding or condition evidence of a resale item.

### 1.1 Maturity scorecard

| Dimension | Score / 5 | Evidence-backed judgement |
|---|---:|---|
| Development truthfulness | 4.0 | Demo label and disabled Apply are explicit (`aiPhotoEnhancementApi.ts:8–10`, `AIPhotoEnhancementScreen.tsx:587–589`) |
| Release truthfulness | 0.5 | `__DEV__` inversion creates empty/non-demo branches and false no-op result semantics (`aiPhotoEnhancementApi.ts:91, 295–304, 332–341, 370–379`) |
| Native comparison UX | 2.5 | One large preview and compare controls exist; scan theatre and state model are weak |
| Backend/job lifecycle | 0.0 | No route, storage, worker or provider capability |
| Asset lineage/revert | 0.5 | Types imply original/result; no durable graph or mutation exists |
| Model safety/evaluation | 0.5 | No policy or evaluation harness |
| Moderation/security/privacy | 0.5 | Connectivity check only (`AIPhotoEnhancementScreen.tsx:155–158`); no provider, storage or prompt boundaries |
| Accessibility | 2.0 | labels/reduced motion exist; visual comparison has no nonvisual change description |
| **Overall** | **1.3/5** | **First fail closed in every build. Then ship deterministic, low-risk operations before generative scenes.** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Frontend — AI photo enhancement API service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `aiPhotoEnhancementApi.ts` / header comment | 8–10 | "every function returns the ORIGINAL image URI with `isDemo: true`" — honest in dev | Foundation |
| `aiPhotoEnhancementApi.ts` / `AI_PHOTO_DEMO_MODE` | 91 | `export const AI_PHOTO_DEMO_MODE = __DEV__;` — release sets to `false` | **P0** |
| `aiPhotoEnhancementApi.ts` / `fetchEnhancementOptions` | 252–256 | Non-demo returns `[]` (line 255) — empty release UI | P1 |
| `aiPhotoEnhancementApi.ts` / `fetchBackgroundScenes` | 264–268 | Non-demo returns `[]` (line 267) | P1 |
| `aiPhotoEnhancementApi.ts` / `fetchEnhancementPresets` | 276–280 | Non-demo returns `[]` (line 279) | P1 |
| `aiPhotoEnhancementApi.ts` / `applyEnhancement` | 291–321 | Non-demo returns `enhancedUri: imageUri` (line 300) with `isDemo: false` (line 303) — same URI, false success | **P0** |
| `aiPhotoEnhancementApi.ts` / `applyPreset` | 328–359 | Non-demo returns `enhancedUri: imageUri` (line 337) with `isDemo: false` (line 340) — same pattern | **P0** |
| `aiPhotoEnhancementApi.ts` / `replaceBackground` | 366–397 | Non-demo returns `enhancedUri: imageUri` (line 375) with `isDemo: false` (line 378) — same pattern | **P0** |
| `aiPhotoEnhancementApi.ts` / `revertEnhancement` | 405–415 | Non-demo returns `originalUri: ''` (line 408) — empty string, cannot restore anything | P1 |

**Critical quote — the `__DEV__` flag (`aiPhotoEnhancementApi.ts:83–91`):**
```ts
/**
 * The enhancement API is a mock until a real Photoroom / AI image service is
 * connected. In dev (`__DEV__`), demo mode is ON so the UI can be built and
 * validated with a truthful "Demo mode" banner. In production, demo mode is
 * OFF and the functions throw so the UI shows an honest error instead of
 * presenting non-functional enhancements as real (AGENTS.md §11 — fail-closed
 * trust signals). Setting this to false without a real backend would cause
 * the throw guards to fire, which is the correct behaviour.
 */
export const AI_PHOTO_DEMO_MODE = __DEV__;
```
The comment says "the functions throw" in production, but they don't — they return no-op results with `isDemo: false`. The comment's intent is correct (fail-closed) but the implementation contradicts it.

**Critical quote — the false-success no-op (`aiPhotoEnhancementApi.ts:295–304`):**
```ts
  if (!AI_PHOTO_DEMO_MODE) {
    // Backend not yet available — return original image unchanged (AGENTS.md §truthful-UI)
    return {
      id: generateId('result'),
      // ...
      enhancedUri: imageUri,
      option: { id: '', label: '', description: '', icon: '', type: 'background_removal' },
      appliedAt: new Date().toISOString(),
      isDemo: false,
    };
  }
```
`enhancedUri: imageUri` — the "enhanced" URI is the original URI. `isDemo: false` — claims this is not a demo result. The comment says "AGENTS.md §truthful-UI" but returning the same image with `isDemo: false` is the opposite of truthful — it claims an enhancement was applied when nothing changed. This is the same pattern in `applyPreset` (line 337) and `replaceBackground` (line 375).

### 2.2 Frontend — AI photo enhancement screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `AIPhotoEnhancementScreen.tsx` / state | 82–85 | `phase, result, showAfter, isApplying` — no queued, processing, candidate, moderation, cancellation, expiration or unknown outcome | P1 |
| `AIPhotoEnhancementScreen.tsx` / `handleApply` | 152–189 | Calls `applyEnhancement`/`applyPreset`/`replaceBackground`; sets `result` and `phase='applied'` immediately | P0 |
| `AIPhotoEnhancementScreen.tsx` / `handleRevert` | 191–198 | Pure local reset; imported `revertEnhancement` (line 43) is unused | P1 |
| `AIPhotoEnhancementScreen.tsx` / `handleSave` | 200–206 | `navigation.goBack()` only (line 205); `itemId` is read but unused — no return value, listing-media update or persistence | P0 |
| `AIPhotoEnhancementScreen.tsx` / claim copy | 528–532 | Non-demo says "Enhancement applied. Compare, revert, or save." (line 531) — false if production no-op branch executes | **P0** |
| `AIPhotoEnhancementScreen.tsx` / trust component | 545–549 | Non-demo context: "Enhancement applied to the selected photo" (line 548) | **P0** |
| `AIPhotoEnhancementScreen.tsx` / Apply button | 586–603 | Dev: "Coming Soon" disabled; production: "Apply" enabled (line 587) — build mode, not server health, controls truth | **P0** |
| `AIPhotoEnhancementScreen.tsx` / Save button | 605–613 | "Save" always enabled, calls `handleSave` which just navigates back | P0 |
| `AIPhotoEnhancementScreen.tsx` / `ProcessingOverlay` | 724–753 | Animated scanline (`scanY`) over image while processing — decorative AI theatre | P1 anti-AI |
| `AIPhotoEnhancementScreen.tsx` / `scanLineOverlay` style | 939–943 | Scanline style definition | P1 |

**Critical quote — the false "Enhancement applied" claim (`AIPhotoEnhancementScreen.tsx:528–532`):**
```tsx
            <Text style={[styles.appliedMessageText, { color: colors.textPrimary }]}>
              {AI_PHOTO_DEMO_MODE
                ? 'Demo: No changes were made to your image. Connect the AI service to enable real enhancement.'
                : 'Enhancement applied. Compare, revert, or save.'}
            </Text>
```
When `AI_PHOTO_DEMO_MODE` is false (production), the screen says "Enhancement applied" — but the backend returned the same URI with `isDemo: false`. Nothing was enhanced. The user is told a no-op was a success. This is a P0 truth violation under AGENTS.md §11.

**Critical quote — Save does nothing (`AIPhotoEnhancementScreen.tsx:200–206`):**
```ts
  const handleSave = useCallback(() => {
    haptic.light();
    // In demo mode, no real enhancement was applied — we return the original
    // URI truthfully. The listing flow continues with the original image.
    navigation.goBack();
  }, [navigation]);
```
`navigation.goBack()` — no return value, no listing-media update, no persistence. The comment says "we return the original URI truthfully" but there is no return mechanism. The listing flow doesn't receive any signal. The enhanced image (which is the same as the original) is never persisted.

**Critical quote — the scanline animation (`AIPhotoEnhancementScreen.tsx:724–753`):**
```tsx
function ProcessingOverlay({ colors, styles, reducedMotion }: ProcessingOverlayProps) {
  const scanY = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    scanY.value = withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) });
  }, [reducedMotion, scanY]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scanY.value, [0, 1], [0, PREVIEW_HEIGHT - 4]),
      },
    ],
  }));
```
Animated scanline sweeping over the image during "processing." This is decorative AI theatre — the same anti-AI pattern as the visual search scanline (report #11). The backend is a no-op; the scanline implies real AI analysis is happening. Per AGENTS.md §4: "Excessive motion. Every mount animates... Flagship apps animate rarely and meaningfully."

### 2.3 Backend — absent

No photo-enhancement route, domain, migration or worker was found in `backend/api/src`. The capability is absent end-to-end.

---

## 3. End-to-end flow traces

### 3.1 Current top-down (production build)

```text
AIPhotoEnhancementScreen mount
  → fetchEnhancementOptions() → [] (aiPhotoEnhancementApi.ts:255)
  → fetchBackgroundScenes() → [] (line 267)
  → fetchEnhancementPresets() → [] (line 279)
  → phase='populated' with empty options (AIPhotoEnhancementScreen.tsx:112)
  → user selects nothing (no options available)
  → OR: if option ID is supplied via state/future wiring:
    → applyEnhancement(imageUri, optionId) (line 169)
    → returns { enhancedUri: imageUri, isDemo: false } (line 297-304)
    → setResult(res) → phase='applied' (line 174-175)
    → screen says "Enhancement applied" (line 531)
    → user taps Save → navigation.goBack() (line 205)
    → no persistence, no listing update, no asset created
```

### 3.2 Bottom-up path is missing

```text
[no derived media row] → [no finalization/moderation] → [no job result]
  → local same-URI object → screen says applied
```

### 3.3 Intended flow

```text
finalized source media_asset
  → eligibility/risk policy + source moderation
  → idempotent enhancement_job
  → queue + provider adapter
  → quarantined candidate media_assets
  → automated fidelity/policy/moderation evaluation
  → user review
  → finalize selected derived asset + provenance manifest
  → transactional listing_media revision
  → audit/outbox/invalidation
```

---

## 4. August 2026 benchmark research

### 4.1 AI photo enhancement for ecommerce — production tools

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Adobe Firefly — Remove Object from Photo, 2026](https://www.adobe.com/ie/products/firefly/features/remove-object-from-photo.html) | AI-powered object removal, background fill, dust/scratch removal for product photos. Brush-based workflow with Generative Remove | ThryftVerse should evaluate Adobe Firefly Services API for background removal and object cleanup. But must constrain to non-condition-evidence regions |
| [Retouching Labs — AI Product Image Retouching, 2026](https://retouchinglabs.com/ai-to-automate-product-image-retouching/) | Key tools: Adobe Firefly, Pixelz, Photoroom, Fotor, Claid.ai, Remove.bg. AI techniques: semantic segmentation, GANs. Challenges: "Over-editing, brand mismatches, lack of human oversight." Future: "Personalized styling, adaptive retouching, real-time previews" | ThryftVerse's `aiPhotoEnhancementApi.ts:13` mentions "Photoroom / AI image API" — Photoroom is a validated choice. The "over-editing" challenge is exactly the condition-evidence risk |
| [FAPIhub — Background Removal API for Ecommerce, 2026](https://fapihub.com/use-cases/ecommerce/) | "Amazon explicitly requires pure white backgrounds (#FFFFFF) for main product images." Cost: $0.02–$0.20/image typical; FAPIhub $0.002/image. "At 10,000 images/month: $20 on FAPIhub vs $200 on PhotoRoom or $2,000 on remove.bg" | Cost matters at marketplace scale. ThryftVerse should evaluate per-image cost vs self-hosted models. Background removal is the highest-ROI first operation |

### 4.2 Regulatory — AI transparency and provenance

| Source | Finding | ThryftVerse application |
|---|---|---|
| [EU AI Act, consolidated text 27 July 2026, Article 50](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727) | Requires machine-readable marking of synthetic/manipulated outputs, with exception where "standard editing does not substantially alter input/semantics" | Counsel must classify each operation. Implement machine-readable marking capability now; do not assume every "enhancement" is exempt |
| [C2PA Specification 2.4, April 2026](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Defines signed provenance manifests and ingredient workflows. "Provenance is not a value judgement" | Use provenance to show edit history; do not present C2PA as certification that listing condition is truthful |
| [Google Merchant Center — AI-generated content requirements](https://support.google.com/merchants/answer/14743464) | Require preservation of IPTC digital source metadata for AI-generated product imagery and structured attribution for generated title/description | Preserve/embed provider disclosure metadata and do not strip it during transcoding. This is a downstream platform rule |
| [OWASP AISVS 1.0, 24 June 2026](https://owasp.org/www-project-artificial-intelligence-security-verification-standard-aisvs-docs/) | Testable AI-system security requirements | Provider/model/data pipelines need CI-verifiable security gates, not only prompt filters |

### 4.3 Adobe Firefly Services API patterns

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Adobe Remove Background v2](https://developer.adobe.com/firefly-services/docs/photoshop/guides/remove-background/) | Returns `jobId`/`statusUrl`, supports cutout/mask and parameters. Asynchronous | Real enhancement is asynchronous and artifact-producing; the app needs jobs and polling, not a synchronous same-URI method |
| [Adobe Object Composite guide](https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/object-composite/) | Distinguishes generate, precise and adaptive composite; precise composite is for pixel fidelity | For resale, choose a subject-preserving path by default; "adaptive realism" is higher risk |
| [Adobe Async API guide](https://developer.adobe.com/firefly-services/docs/firefly-api/guides/how-tos/using-async-apis) | Submit, status and cancellation flow | Target contract requires queued/processing/cancel/terminal states and provider reconciliation |

---

## 5. Capability, operation-risk and ownership matrices

### 5.1 Capability matrix

| Capability | Current | Target source of truth | Product rule |
|---|---|---|---|
| Option availability | Static dev arrays/empty release arrays (`aiPhotoEnhancementApi.ts:253–279`) | Server capability registry | Reflect provider, category, quota, region and policy |
| Submit job | Missing | Enhancement domain | Idempotent 202 response |
| Observe/cancel | Missing | Job store + queue | Poll/subscription with cancel semantics |
| Compare candidate | Same image (`aiPhotoEnhancementApi.ts:300`) | Finalized candidate assets | Original and candidate immutable |
| Apply to listing | Missing (`AIPhotoEnhancementScreen.tsx:205`) | Listing-media transaction | Explicit user approval; never overwrite original |
| Revert | Local reset (`AIPhotoEnhancementScreen.tsx:191–198`) | Listing-media revision | New pointer mutation back to source |
| Provenance | Missing | Derived-asset lineage | Source/model/operations/hashes/disclosure |
| Moderation | Missing | Media/moderation domain | Candidate quarantined until checks pass |

### 5.2 Operation risk tiers

| Tier | Examples | Policy |
|---|---|---|
| A — deterministic presentation | EXIF orientation, bounded crop, compression, exposure/white-balance within measured limits | Ship first; server or vetted local pipeline; record parameters |
| B — subject-preserving ML | Background cutout, dust outside subject, constrained neutral background, shadow under isolated object | Candidate review + fidelity checks; never auto-apply |
| C — generative composition | Lifestyle background, relighting, synthetic shadow/occlusion | Explicit disclosure, category restrictions, stronger evaluation |
| D — prohibited for condition evidence | Remove scratches/stains, reconstruct missing regions, recolour item, alter labels/logos/text, reshape silhouette | Reject at API and provider adapter. No hidden override |

### 5.3 Ownership boundaries

| Concern | Owner |
|---|---|
| Source and derived bytes | Media Platform / `media_assets` lifecycle |
| Job and operation policy | Enhancement domain |
| Model/provider execution | Applied ML adapter |
| Listing media order/apply/revert | Listings domain transaction |
| Moderation/counterfeit/condition truth | Trust & Safety |
| Disclosure/retention/legal basis | Privacy + Legal |
| Native presentation and local draft | Sell Experience |

---

## 6. User psychology, JTBD and product trust

- **JTBD:** "Make my item legible and desirable without making it untrue." Quality and authenticity are co-primary.
- Sellers want speed, but buyers judge condition from pixels. A beautiful synthetic candidate can increase conversion while increasing returns and trust harm.
- Label concrete operations ("Neutral background", "Correct exposure"), not "AI magic", "Enhance" or confidence theatre.
- Separate reversible preview from consequential apply. A candidate is never silently inserted into the listing.
- State the material alteration close to the image: "Background replaced; item unchanged by this operation." Link to lineage details.
- Do not show generic confidence. Show actionable verification: "Check lace edges and logo text," derived from category/risk checks.
- If fidelity checks fail, explain which region needs review; never downgrade it to a decorative warning badge.

---

## 7. Strict anti-AI flagship design specification

### 7.1 Composition

- One edge-to-edge 4:5 media stage is dominant. Use press-and-hold or draggable divider comparison; two small "Before/After" cards waste evidence.
- A single horizontal tool strip; presets are not a second competing chip rail unless user testing proves value. Current option rail + preset rail + scene grid is over-scaffolded.
- **Remove the animated scanline** (`AIPhotoEnhancementScreen.tsx:724–753`). Real progress is stage text (`Preparing`, `Removing background`, `Checking result`) without fake percentages.
- One selected operation, one primary `Generate preview`, then `Use photo`. `Revert` belongs after apply/history, not as a permanently equal button.

### 7.2 Complete states

```text
capability_checking → unavailable | eligible
eligible → uploading_source → queued → processing
processing → candidate_ready | partial | policy_rejected | failed | cancelled | expired
processing → outcome_unknown → reconciling
candidate_ready → reviewing → applying → applied
applying → outcome_unknown → reconciling → applied | retryable
applied → reverting → reverted
```

Each state owns specific copy/action. Provider timeout never becomes failed or success until reconciled.

### 7.3 Accessibility

- Provide textual change summary and flagged regions; visual slider alone is inaccessible.
- Slider exposes adjustable role/value and buttons for 0/50/100 comparison.
- Screen reader focus does not move on every polling update; announce only meaningful phase transitions.
- 44pt transparent targets, 200% text, landscape/zoom, colour-independent policy states and reduced motion are gates.

---

## 8. Target architecture and source-of-truth contracts

### 8.1 End-to-end system

```text
finalized source media_asset
  → eligibility/risk policy + source moderation
  → idempotent enhancement_job
  → queue + provider adapter
  → quarantined candidate media_assets
  → automated fidelity/policy/moderation evaluation
  → user review
  → finalize selected derived asset + provenance manifest
  → transactional listing_media revision
  → audit/outbox/invalidation
```

Provider APIs are adapters. Domain types never expose Adobe/provider status URLs or vendor operation names.

### 8.2 Proposed schema

```sql
media_enhancement_jobs(
  id, owner_id, source_media_asset_id, operation_policy_version,
  request_hash, idempotency_key, state, provider, provider_job_id,
  model_id, model_version, region, attempts, error_code,
  unknown_since, created_at, started_at, completed_at, expires_at,
  UNIQUE(owner_id, idempotency_key)
)

media_enhancement_operations(
  id, job_id, ordinal, operation_type, parameters_json,
  risk_tier, prompt_template_version
)

media_derivations(
  id, source_asset_id, derived_asset_id, job_id, candidate_rank,
  source_sha256, derived_sha256, fidelity_metrics_json,
  moderation_status, disclosure_type, c2pa_manifest_ref,
  approved_by, approved_at
)

listing_media_revisions(
  id, listing_id, actor_id, base_revision, old_asset_id,
  new_asset_id, reason, idempotency_key, created_at
)
```

### 8.3 API contract

```http
GET  /media-enhancement/capabilities?assetId=...
POST /media-enhancement/jobs                 Idempotency-Key: ...
GET  /media-enhancement/jobs/:id
POST /media-enhancement/jobs/:id/cancel
POST /listings/:id/media/apply-enhancement   If-Match: listing-media-revision
POST /listings/:id/media/revert              Idempotency-Key: ...
```

Submit returns 202 with domain job ID, poll interval and state. Apply accepts a finalized candidate belonging to actor/source/listing, locks listing media revision and records an immutable mutation. Unknown outcome reconciles by idempotency key.

### 8.4 Caching, retention, privacy and security

- Capability response cache ≤60s and includes policy version; provider kill switch bypasses cache.
- Signed source/candidate URLs are short-lived and audience-bound. Provider never receives public permanent URLs.
- Strip EXIF GPS before provider dispatch unless explicitly required; preserve safe orientation/colour profile separately.
- Contractually prohibit provider training on customer media unless user separately opts in; define region, deletion SLA and subprocessors.
- Quarantine candidates; malware/MIME/decompression-bomb checks before and after provider.
- Generated prompt is template-constrained; no arbitrary user prompt in v1. Reject SSRF URLs and cross-user asset IDs.
- Retain original according to listing evidence policy; purge rejected candidates/jobs on schedule while preserving minimal audit.

### 8.5 Events

Transactional outbox: `media.enhancement.queued.v1`, `candidate.finalized.v1`, `candidate.rejected.v1`, `listing.media.revised.v1`. Events carry IDs and policy/model versions, not signed URLs or raw prompts.

---

## 9. Model/data evaluation plan

### 9.1 Evaluation corpus

Build consented, rights-cleared, stratified data by category, device quality, skin/hand presence, background complexity and condition. Include jewellery, lace, fur, transparent fabric, reflective metal, white-on-white, black-on-black, footwear soles, labels/logos, damage and multi-object images.

### 9.2 Metrics and hard gates

| Concern | Metric/gate |
|---|---|
| Subject geometry | Boundary IoU/trimap error by category; critical-edge review failure below agreed threshold |
| Colour truth | ΔE2000 on calibrated subject regions; operation-specific maximum, tighter for colour correction |
| Text/logo | OCR character accuracy and logo-region structural similarity; any material alteration rejects candidate |
| Condition | Damage-region preservation recall; zero accepted candidates that remove labelled damage in release set |
| Background | Halo/bleed/artifact human severity; transparent/fine-edge slices reported separately |
| Fairness | Error rates by skin-tone grouping where hands/models appear; do not infer sensitive traits |
| Utility | Seller acceptance/edit/revert; buyer returns/not-as-described compared with control |
| Calibration | Quality gate score reliability diagram; abstain when unsupported |

Use blind pairwise human review plus automated metrics. Beauty/aesthetic score is secondary and cannot override fidelity failure. Record model/version, policy version and dataset slice for each evaluation. Follow NIST [AI RMF Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) for lifecycle risk documentation.

---

## 10. Threat and failure-mode analysis

| Threat/failure | Current exposure | Mitigation |
|---|---|---|
| False success no-op | `enhancedUri: imageUri, isDemo: false` (`aiPhotoEnhancementApi.ts:300–303`) | Fail closed; throw `capability_unavailable`; never return same URI as success |
| False "Enhancement applied" claim | `AIPhotoEnhancementScreen.tsx:531` | Server-delivered capability state; default `unavailable` |
| Model removes damage or alters logo | Not built | Protected-region checks, prohibited operation policy, human review, fail closed |
| Cross-user asset access | Not built | Ownership authorization at capability, submit, status and apply |
| Provider callback spoof/replay | Not built | Signed callbacks/mTLS where supported, provider job binding, timestamp/replay window |
| Timeout after provider accepted job | Not built | `outcome_unknown`; reconcile provider ID/request hash before retry |
| Duplicate jobs/cost amplification | Not built | Unique user/idempotency key and request hash; quotas/rate limits |
| Poisoned/malformed image | Not built | Decode sandbox, MIME sniff, pixel/byte limits, metadata sanitization |
| Prompt injection in filename/metadata | Not built | Never concatenate untrusted metadata into provider instruction; typed operations |
| Candidate URL leak | Not built | Short-lived signed URL, no analytics logging, referrer/cache controls |
| Model/provider drift | Not built | Version pin, canary eval, slice dashboards, automatic rollback |
| Disclosure stripped during transcode | Not built | Post-finalization metadata/manifest validation and export tests |
| Abuse to create deceptive images | Not built | Listing-only operation allowlist, rate/risk scoring, audit/report path |
| Scanline AI theatre | `AIPhotoEnhancementScreen.tsx:724–753` | Remove; use honest stage text |

---

## 11. SLOs and observability

### SLOs

- Capability p95 <200ms, 99.95% available and fail closed.
- Tier A preview p95 <3s; background removal p95 <12s; p99 <30s, measured end-to-end.
- Job terminalization 99.9% within provider-specific deadline; stuck-job reconciliation <5 minutes.
- Apply/revert API 99.99% correct; duplicate listing mutations 0.
- Candidate byte durability 99.999999999% under media storage policy.
- Moderation/fidelity gate bypass 0; provenance completeness 100%.

### Observability

Metrics by operation/category/device/provider/model: queue wait, inference latency, candidate/failure/abstain/reject rates, fidelity slice failures, cost/job, cancellation, unknown outcome, apply/revert, not-as-described returns. Trace `jobId → providerJobId → derivedAssetId → listingMediaRevision`. Logs exclude pixels, prompts containing user data and signed URLs. Alert on same-hash "success," empty option catalog while capability says available, and release build invoking fixture code.

---

## 12. Migration, flags, compatibility and rollback

### Flags

```text
photo_enhancement_capability_v1
photo_enhancement_tier_a_v1
photo_enhancement_background_removal_v1
photo_enhancement_candidate_review_v1
photo_enhancement_remove_scanline_v1
```

### Sequence

1. **P0 patch:** Replace `AI_PHOTO_DEMO_MODE = __DEV__` (`aiPhotoEnhancementApi.ts:91`) with server-delivered capability state; default `unavailable` in all builds. Delete non-demo no-op success branches (lines 295–304, 332–341, 370–379); throw typed `capability_unavailable` error.
2. **Remove scanline** (`AIPhotoEnhancementScreen.tsx:724–753`); replace with honest stage text.
3. **Fix "Enhancement applied" claim** (`AIPhotoEnhancementScreen.tsx:531`); never show success without server confirmation.
4. **Fix Save** (`AIPhotoEnhancementScreen.tsx:201–206`); return enhanced asset ID to listing flow or show unavailable.
5. Add server capability endpoint and job schema with provider disabled.
6. Ship Tier A internal pipeline behind `photo_enhancement_tier_a`; observe only.
7. Add background removal for employee/dogfood cohort, shadow-evaluate fidelity.
8. Enable candidate review/apply for category allowlist; generative scenes remain off.
9. Expand by model-evaluation slice, not percentage alone.

Kill switches exist per operation, provider, model version, region and category. Rollback stops new submissions and apply, lets existing jobs reconcile/cancel, preserves originals and already-applied revisions, and routes revert through the listing domain. Never delete lineage during rollback.

---

## 13. Phased implementation backlog mapped to files

| Phase | Work/files | Owner | Dependency | Exit |
|---|---|---|---|---|
| 0 — truth lock | `aiPhotoEnhancementApi.ts` (lines 91, 295–304, 332–341, 370–379, 405–415), `AIPhotoEnhancementScreen.tsx` (lines 531, 548, 587, 605–613, 724–753), navigation entry | Mobile | None | Release cannot claim/apply no-op |
| 1 — domain | migrations; `domain/mediaEnhancement/*`; routes/index registration; capability policy | Media Platform | Storage/queues | Contract/integration tests |
| 2 — provider | worker handler, provider adapter, callback/reconcile, quarantine/finalization | Applied ML | Vendor/legal review | Async and unknown-outcome drills |
| 3 — native | typed job service/hook; canonical screen state machine and comparison | Sell Experience | Phase 2 | Native state/a11y QA |
| 4 — apply | listing-media revision transaction, event/cache invalidation, revert/history | Listings | Finalized candidate | Cross-device correctness |
| 5 — expansion | evaluation harness, category gates, C2PA/IPTC export validation | ML + Trust | Dataset/governance | Release gates below |

---

## 14. Test, evaluation and release gates

- Unit/contract tests for every job transition and prohibited operation.
- Duplicate submit/apply/revert, callback replay, lost response and worker crash injection.
- Same-hash result cannot be `succeeded` for mutating operations.
- Cross-tenant asset/status/apply authorization suite.
- Provider deletion/retention and regional routing contract tests.
- Golden-image regression by category/risk slice; blind human review.
- C2PA/IPTC survives download, resize, CDN and marketplace export where format supports it.
- Native tests for background/foreground, cancellation, app kill, polling resume, unknown outcome, expired candidate.
- Buyer trust gate: no statistically significant increase in return/not-as-described rate; severe condition-alteration incident = automatic rollback.
- Screen-reader/large-text/reduced-motion/colour-independent states and thumbnail/squint tests.
- No scanline animation or AI-themed visual theatre on any processing state.

---

## 15. Explicit non-goals

- Unrestricted prompt-based editing, face/body retouching, damage repair, virtual try-on, video enhancement or automatic replacement of listing media.
- "AI quality score" or fake percent-complete progress.
- One-vendor types embedded in the product contract.

---

## 16. Decisions requiring product, legal/trust and operations input

1. Which operations are "standard editing" versus substantial manipulation by jurisdiction?
2. Must original evidence remain after seller/account deletion where a transaction/dispute exists?
3. Which C2PA/IPTC disclosures are shown to seller, buyer and downstream feeds?
4. Are lifestyle composites allowed as primary listing images or additional images only?
5. Provider training/retention/region/subprocessor terms and cost ceilings?
6. Category exclusions: authentication-sensitive luxury, collectibles, cosmetics, damaged goods?

---

## 17. Final decision

**P0 RELEASE TRUTH FIX REQUIRED; P1 PIPELINE ABSENT.** The development demo is honest, but `__DEV__` makes production the unsafe branch. The non-demo apply functions return the same URI with `isDemo: false` (`aiPhotoEnhancementApi.ts:300–303, 337–340, 375–378`) — a false-success no-op. The screen says "Enhancement applied" (`AIPhotoEnhancementScreen.tsx:531`) and Save just navigates back (`AIPhotoEnhancementScreen.tsx:205`). Fail closed first: replace `AI_PHOTO_DEMO_MODE = __DEV__` with server-delivered capability state, delete the no-op success branches, remove the scanline animation, and fix the false claims. Then build a finalized-asset, asynchronous, provenance-preserving, fidelity-gated pipeline (per Adobe Firefly Services async API patterns) and ship low-risk deterministic operations (Tier A) before generative composition (Tier C). Background removal is the highest-ROI first operation per 2026 ecommerce research.
