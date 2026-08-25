# 15 — AI Listing Intelligence and Smart Sell

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Sell Experience / Listing Intelligence / Commerce Offers / Trust & Safety
**Status:** **P0 unsafe suggestion application and release fail-open; P1 durable intelligence/policy missing**

---

## 1. Executive verdict

"AI listing intelligence" and "Smart Sell" are two different systems and must not be implemented as one agent:

1. **Listing intelligence** is advisory evidence extraction, taxonomy mapping, catalog/entity resolution, copy assistance and comparable-sales guidance. It must abstain and requires seller review.
2. **Smart Sell** is a deterministic, money-impacting automation policy applied to authoritative offers. It must be transactional, versioned, auditable, instantly pausable and never probabilistic at decision time.

Today the first system parses local image **filenames** with fixed keyword tables (`aiListingApi.ts:187–223`). When a suggestion arrives, `AIPoweredListingScreen` automatically overwrites title, description, category, brand, condition and tags (`AIPoweredListingScreen.tsx:136–143`). The service admits condition cannot be inferred (`aiListingApi.ts:366–367`), then supplies `Very good` (line 368); the screen applies it (line 140). This is a P0 truth defect because condition is material to buyer decisions and disputes.

Smart Sell is in-memory UI state using a draft ID derived only from the current user, and publishing does not persist the configuration. It has the same release fail-open pattern as photo enhancement: `SMART_SELL_DEMO_MODE = __DEV__` (`smartSellApi.ts:33`), but the map-backed implementation runs in every build. In release, `isDemo` becomes false, the demo banner/disclosure disappears, and the success route may receive `smartSellEnabled:true` even though no policy was saved. However, the repository already has a strong authoritative offers domain: row locks, expiry, idempotent create/counter, offer chains, transactional accept, checkout reservation, listing pause and outbox events. Smart Sell should extend `listingOffers.ts`; building a parallel negotiation service would create two authorities.

### 1.1 Maturity scorecard

| Dimension | Listing intelligence | Smart Sell | Judgement |
|---|---:|---:|---|
| Honest development labeling | 3/5 | 4/5 | Demo banners exist in development, but "AI" naming overstates filename parsing |
| Release truthfulness | 2/5 | 0.5/5 | Smart Sell hides its demo state in release while continuing to use memory maps |
| Input/model capability | 0.5/5 | N/A | No pixels, OCR, catalog, comps or model endpoint — filename keyword tables only |
| Seller control | 1.5/5 | 2/5 | Suggestions auto-apply (`AIPoweredListingScreen.tsx:136–143`); Smart Sell is editable but not consequential |
| Data/contracts | 1/5 | 1/5 | Aggregate suggestion blob; config lacks currency/version/net proceeds |
| Authoritative backend | 0/5 | 3.5/5 foundation | Listing intelligence absent; offer lifecycle is real and mature |
| Safety/evaluation | 0.5/5 | 1.5/5 | No calibration/eval; offer engine has transaction controls but no automation policy |
| UX/accessibility | 2/5 | 2.5/5 | Full form and labels; badge/card density and pseudo-precision remain |
| **Overall** | **1.8/5** | | **Immediate priority: stop auto-applying ungrounded fields and remove fabricated confidence/condition. Then build field-level evidence and extend the existing offer transaction.** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Listing intelligence — AI listing API service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `aiListingApi.ts` / header comment | 10–13 | "derives plausible suggestions from image filenames/metadata — it does NOT perform real image recognition" — honest in dev | Foundation |
| `aiListingApi.ts` / `confidenceScore` | 31 | `0–1. Mock/heuristic confidence — intentionally low (0.3–0.5)` | Foundation |
| `aiListingApi.ts` / `BRAND_ALIASES` | 49–93 | Hardcoded brand-to-category map: `zara: 'Women'`, `hm: 'Women'`, `uniqlo: 'Women'` (lines 64–68) | P1 |
| `aiListingApi.ts` / `CATEGORY_KEYWORDS` | 95–101 | `dress: 'Women'`, `skirt: 'Women'`, `blouse: 'Women'`, `heel: 'Women'`, `handbag: 'Women'`, `purse: 'Women'` | P1 |
| `aiListingApi.ts` / `CONDITION_OPTIONS` | 177 | `['New with tags', 'Very good', 'Good', 'Satisfactory']` — hardcoded list | P1 |
| `aiListingApi.ts` / `extractBrandFromFilename` | 187–197 | `lower.includes(alias)` — filename substring matching | P1 |
| `aiListingApi.ts` / `extractCategoryFromFilename` | 199–205 | Same filename substring matching | P1 |
| `aiListingApi.ts` / `extractColorsFromFilename` | 207–214 | Same pattern | P1 |
| `aiListingApi.ts` / category fallback | 355–359 | `request.categoryHint \|\| categoryFromFilename \|\| categoryFromBrand \|\| 'Women'` — defaults to `Women` | **P0** |
| `aiListingApi.ts` / condition fabrication | 366–368 | Comment says "Condition cannot be inferred from a photo filename"; next line: `const condition = 'Very good';` | **P0** |
| `aiListingApi.ts` / confidence formula | 385–388 | `Math.min(0.5, 0.3 + signals * 0.035)` — signal count as pseudo-probability | P1 |
| `aiListingApi.ts` / price bands | 280–304 | Fixed GBP bands by category; e.g. luxury £120–350, Women/Men/default £8–45 | P1 |

**Critical quote — condition fabrication (`aiListingApi.ts:366–368`):**
```ts
  // Condition cannot be inferred from a photo filename — default to a
  // conservative, commonly-safe resale condition. Marked as a suggestion.
  const condition = 'Very good';
```
The comment admits condition cannot be inferred. The next line fabricates `Very good` anyway. This is then auto-applied to the seller's form (`AIPoweredListingScreen.tsx:140`). Condition is material to buyer decisions, returns, and disputes. Fabricating it is a P0 truth defect.

**Critical quote — category default to `Women` (`aiListingApi.ts:355–359`):**
```ts
    request.categoryHint ||
    categoryFromFilename ||
    categoryFromBrand ||
    'Women';
```
If no hint, no filename match, and no brand match, the category defaults to `Women`. This is a discriminatory taxonomy default — it assumes the seller is listing women's clothing when it has no information. This propagates to the form (`AIPoweredListingScreen.tsx:138`).

**Critical quote — confidence formula (`aiListingApi.ts:385–388`):**
```ts
  const signals = [brand, categoryFromFilename, colors.length > 0, material, style, season].filter(
    Boolean,
  ).length;
  const confidence = Math.min(0.5, 0.3 + signals * 0.035);
```
Signal count is presented as probability-like confidence without calibration. Six signals → 0.5 (capped). Zero signals → 0.3. This is not a calibrated probability — it's a count of keyword matches dressed as confidence.

### 2.2 Listing intelligence — AI powered listing screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `AIPoweredListingScreen.tsx` / form state | 101–107 | `title, description, category, brand, condition, price, tags` — all independent `useState` | Foundation |
| `AIPoweredListingScreen.tsx` / auto-application effect | 128–145 | Effect sets all fields wholesale on suggestion change | **P0** |
| `AIPoweredListingScreen.tsx` / auto-analysis trigger | 147–159 | Any photo-set change triggers analysis | P1 |
| `AIPoweredListingScreen.tsx` / publish minimum | 269–278 | Requires photos/title/positive price/user, not category/condition | P1 |
| `AIPoweredListingScreen.tsx` / publish | 327–357 | Uses finalized uploads then creates listing and images | Foundation |
| `AIPoweredListingScreen.tsx` / persistence gap | 360–377 | Publish sends no Smart Sell config | **P0** |
| `AIPoweredListingScreen.tsx` / confidence display | 406–408 | Converts heuristic score into percentage | P1 |
| `AIPoweredListingScreen.tsx` / field badges | 560–648 | Suggested state inferred by string equality | P1 |

**Critical quote — the auto-application effect (`AIPoweredListingScreen.tsx:128–145`):**
```tsx
  useEffect(() => {
    if (!suggestion) return;
    const sig = JSON.stringify(suggestion);
    if (sig === appliedSignatureRef.current) return;
    appliedSignatureRef.current = sig;

    setTitle(suggestion.suggestedTitle);
    setDescription(suggestion.suggestedDescription);
    setCategory(suggestion.suggestedCategory);
    setBrand(suggestion.suggestedBrand ?? '');
    setCondition(suggestion.suggestedCondition);
    // Price is NOT auto-filled — the suggested range is shown as guidance so
    // the seller picks their own price (communicates uncertainty honestly).
    setTags(suggestion.suggestedTags);
    haptics.tap();
  }, [suggestion]);
```
The effect sets title, description, category, brand, condition, and tags wholesale. If the seller has already typed anything in any of these fields, their edits are silently overwritten. The comment notes price is "NOT auto-filled" — but condition, which is equally material, IS auto-filled. There is no dirty-field check, no per-field accept/reject, no "review 3 new suggestions" prompt.

### 2.3 Smart Sell — API service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `smartSellApi.ts` / header comment | 10–23 | "does NOT actually negotiate with buyers, persist thresholds, or process offers" — honest in dev | Foundation |
| `smartSellApi.ts` / `SMART_SELL_DEMO_MODE` | 33 | `export const SMART_SELL_DEMO_MODE = __DEV__;` — release sets to `false` | **P0** |
| `smartSellApi.ts` / `isDemo` on config | 128, 206, 231 | `isDemo: SMART_SELL_DEMO_MODE` — false in release | **P0** |
| `smartSellApi.ts` / `conversionUplift` | 108, 261 | `conversionUplift: 0.6` — fabricated 60% uplift metric | **P0** |
| `smartSellApi.ts` / `Demo buyer` | 284 | `buyerName: 'Demo buyer'` — fabricated buyer | P1 |
| `smartSellApi.ts` / `isDemo` on offer | 288 | `isDemo: SMART_SELL_DEMO_MODE` — false in release | **P0** |
| `smartSellApi.ts` / config store | 114–138 | In-memory `Map` — state dies on app restart | P1 |
| `smartSellApi.ts` / config fields | 48–62 | GBP float thresholds, no version, fees/net, expiry, counter strategy or actor | P1 |
| `smartSellApi.ts` / decision function | 157–173 | Three-way deterministic threshold function — good seed semantics | Foundation |

**Critical quote — the `__DEV__` flag (`smartSellApi.ts:32–33`):**
```ts
/** When true, all data returned by this service is mock/illustrative. */
export const SMART_SELL_DEMO_MODE = __DEV__;
```
Same pattern as `AI_PHOTO_DEMO_MODE = __DEV__` (`aiPhotoEnhancementApi.ts:91`). In release, `SMART_SELL_DEMO_MODE` is `false`, so `isDemo` becomes `false` on all returned entities (lines 128, 206, 231, 262, 288). The demo banner disappears. But the implementation is still in-memory Maps — nothing is persisted. The user sees what appears to be a real Smart Sell configuration with real stats, but it's all fixture data labeled as real.

**Critical quote — fabricated conversion uplift (`smartSellApi.ts:258–263`):**
```ts
    autoDeclined,
    pending,
    avgResponseTime,
    conversionUplift: 0.6,
    isDemo: SMART_SELL_DEMO_MODE,
  };
```
`conversionUplift: 0.6` — a hardcoded 60% conversion uplift. In release, `isDemo` is `false`, so this fabricated metric appears to be real. This must never reach product analytics or seller-facing UI. An unverified comment in the file attributes "60% more likely to sell within 7 days" to a March 2026 Poshmark feature — no supporting official Poshmark source was located; treat the uplift as unsupported and remove it.

### 2.4 Smart Sell — screen integration

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `AIPoweredListingScreen.tsx` / draft ID | 112–114 | `draft_${currentUser.id}` — shared by all drafts for a user | P1 |
| `AIPoweredListingScreen.tsx` / draft ID usage | 677–681 | Same draft ID used for Smart Sell config | P1 |
| `AIPoweredListingScreen.tsx` / persistence gap | 360–377 | Publish sends no Smart Sell config to backend | **P0** |
| `SmartSellCard.tsx` / default thresholds | 116–135 | On first enable: accept 90%, floor 60% of entered list price | P1 |

**Critical quote — publish does not persist Smart Sell (`AIPoweredListingScreen.tsx:360–377`):**
The publish flow creates the listing and images but does not send the Smart Sell configuration. The success route receives a display-only `smartSellEnabled` boolean. No policy is saved. If the user configured Smart Sell and published, the configuration exists only in process memory and dies on app restart.

### 2.5 Authoritative offer foundation to reuse

| File / symbol | Lines | Existing strength | Extension point |
|---|---|---|---|
| `listingOffers.ts` / validated payloads | 21–35 | Validated offer/counter payloads with idempotency keys | Add policy decision metadata and internal policy executor |
| `listingOffers.ts` / create offer | 129–251 | Transaction, request hash/replay, listing row lock, active/seller guards, one active buyer offer | Evaluate locked policy snapshot after offer insert |
| `listingOffers.ts` / counter | 264–433 | Alternating counter participants, max depth, listing lock, append-only domain event | Automated counter must become an identified actor/action |
| `listingOffers.ts` / accept | 522–730 | Seller-only accept, idempotent replay, order/reservation, quote hash, listing pause, decline competing offers, outbox | Factor accept command into domain service callable by human and policy |
| `listingOffers.ts` / decline/cancel | 783–864 | Transactional decline/cancel ownership and state checks | Factor decline command similarly |

---

## 3. End-to-end flow traces

### 3.1 Current listing intelligence flow

```text
AIPoweredListingScreen photos change
  → useAIListingSuggestion hook (useAIListingSuggestion.ts:29-90)
  → analyzeListingImages(local URIs) (aiListingApi.ts:329-410)
  → 900ms timer + filename keyword tables (aiListingApi.ts:187-223)
  → aggregate suggestion object with confidenceScore
  → useEffect fires (AIPoweredListingScreen.tsx:128-145)
  → setTitle, setDescription, setCategory, setBrand, setCondition, setTags
  → seller's existing edits silently overwritten
  → createListingOnApi persists selected/current values
  → no suggestion lineage/review persisted
```

### 3.2 Current Smart Sell flow

```text
SmartSellCard
  → parent React state
  → smartSellApi Map keyed by draft_<userId> (smartSellApi.ts:114-138)
  → [not included in listing create request] (AIPoweredListingScreen.tsx:360-377)
  → success route receives display-only smartSellEnabled
  → config dies on app restart
```

### 3.3 Intended listing intelligence flow

```text
finalized source assets + seller hints
  → async suggestion run (idempotent)
  → OCR/barcode/vision + taxonomy/catalog/entity resolution
  → field candidates with evidence + calibrated confidence/abstention
  → comparable-sales read model + policy/moderation
  → client field-level review
  → accepted/edit/rejected decisions
  → listing draft revision
  → publication validation
```

### 3.4 Intended Smart Sell flow

```text
offer.created event / command transaction
  → lock offer + listing + active policy version
  → compute authoritative fee/net quote
  → eligibility/risk/counter-budget checks
  → immutable decision
  → invoke factored accept/counter/decline command
  → order/reservation/listing/outbox commit
  → seller/buyer notification + audit
```

---

## 4. August 2026 benchmark research

### 4.1 eBay — listing intelligence and negotiation APIs

| Source | Finding | ThryftVerse application |
|---|---|---|
| [eBay Inventory Mapping API](https://www.developer.ebay.com/develop/api/sell/inventory_mapping) | Accepts photos, titles, aspects/identifiers and returns listing previews with category, normalized aspects and description; uses async task status and a `mappingReferenceID` | Suggestions should be task-based, field-structured and traceable. eBay availability/quality does not prove suitability for UK resale |
| [eBay Inventory API overview](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html) | Separates inventory item from offer/published listing and requires a unique seller SKU | Separate product facts, commercial offer and publication lifecycle |
| [eBay Taxonomy aspect usage](https://developer.ebay.com/api-docs/sell/taxonomy/types/txn%3AAspectUsageEnum) | Distinguishes required/recommended/optional aspects | Completeness UI should be taxonomy-driven, not a generic score |
| [eBay Negotiation API](https://developer.ebay.com/develop/api/sell/negotiation_api) | Supports seller offers to interested buyers; returns offer IDs/status and masks buyer usernames | Negotiation is an authoritative commerce object with privacy and notifications, not an AI widget |

### 4.2 Google Merchant Center — AI content and product data

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Google Merchant AI-generated content](https://support.google.com/merchants/answer/14743464) | Requires structured title/description attribution for generative text | Persist generated-copy provenance for downstream export |
| [Google Product data optimization](https://support.google.com/merchants/answer/7380908) | Emphasizes accurate current data, GTINs and matching landing-page facts/variants | Prefer identifiers and canonical facts over model invention; consistency is a trust constraint |

### 4.3 Regulatory and governance

| Source | Finding | ThryftVerse application |
|---|---|---|
| [EU AI Act, consolidated 27 July 2026, Article 50](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727) | Requires machine-readable marking of synthetic/manipulated outputs | Generated copy must be labeled as AI-generated in provenance metadata |
| [NIST AI RMF Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) | Frames lifecycle evaluation/risk management | Maintain documented data/model/evaluation/change controls rather than confidence-only UX |
| [C2PA Specification 2.4, April 2026](https://spec.c2pa.org/specifications/specifications/2.4/specs/C2PA_Specification.html) | Signed provenance manifests | Use for generated copy provenance; not a value judgement |

---

## 5. Capability, state and authority matrices

### 5.1 Field authority matrix

| Field | Machine may suggest | Machine may authoritatively set | Required evidence/review |
|---|:---:|:---:|---|
| Category/taxonomy | ✓ | Only exact authoritative catalog mapping | Image/identifier evidence; seller can correct |
| Brand | ✓ | Only verified catalog/identifier match under policy | OCR/logo/barcode regions; counterfeit review |
| Colour/material/style | ✓ | No | Field-level evidence and seller accept/edit |
| Size | ✓ | Only machine-readable label/catalog with exact variant | Label OCR and seller confirmation for ambiguity |
| Condition/damage | Evidence request only | **Never** | Seller attestation and required damage/label views |
| Title/description | Draft text | No | Generated-content provenance; policy/moderation and seller edit/approve |
| Price | Range/advice | No | Sold-comparable cohort, age, fees and uncertainty |
| Smart Sell floor | Suggested only | Policy becomes authority after explicit seller confirmation | Gross/net illustration, currency/fee version |

### 5.2 State ownership

| State | Source of truth |
|---|---|
| Raw model suggestions/evidence | Immutable `listing_suggestion_runs/fields` |
| Draft accepted values | Listing draft revision, with origin metadata |
| Seller accept/edit/reject feedback | Append-only decision rows |
| Published listing facts | Listings domain, never model output table |
| Offer | Existing `listing_offers` domain |
| Automation policy | Versioned `smart_sell_policies` row |
| Decision/action | Immutable `smart_sell_decisions` + offer/order events |
| Price comparable | Analytics/read model snapshot with cohort/freshness |

### 5.3 Smart Sell decision matrix

| Situation | Action |
|---|---|
| Policy disabled/expired/version invalid | Refer to seller |
| Listing inactive/reserved/sold | No action; terminal reason |
| Risk/blocked buyer/velocity control fails | Refer/decline per explicit policy; never reveal risk details |
| Offer gross ≥ accept and net ≥ floor net | Execute existing accept transaction |
| Offer < decline threshold | Decline if seller explicitly enabled auto-decline |
| Between thresholds and counter budget remains | Counter from deterministic strategy, or refer |
| Currency/fee quote unavailable | Refer; fail closed |
| Network/commit response lost | Unknown outcome; reconcile by decision/idempotency key |

---

## 6. User psychology, JTBD and trust implications

### 6.1 Listing intelligence

- **JTBD:** "Remove blank-page work while keeping me accountable for what I sell."
- Automation bias is highest when fields are prefilled and look ordinary. Therefore suggestions remain visibly pending until accepted; string equality is not provenance.
- Ask for evidence at the moment of uncertainty: label, sole, damage, measurement. A well-timed question is more useful than confident prose.
- Preserve seller edits; re-analysis must never overwrite dirty fields. Offer "review 3 new suggestions."
- Explain source in compact language: `From label photo`, `Catalog match`, `Based on 23 sold items`, with age/cohort details on demand.

### 6.2 Smart Sell

- **JTBD:** "Respond fast without accepting less than I actually receive." Show expected net, not only gross threshold.
- Enablement is a delegated-authority moment. Confirmation must include examples at/above/between/below thresholds and pause behavior.
- A deterministic explanation ("Accepted because £72 offer produced £65.10 expected net, above your £65 floor") builds trust; generic "AI optimized" does not.
- Never manufacture urgency, sale probability, buyers, offers, conversion uplift or savings.

---

## 7. Strict anti-AI flagship design direction

### 7.1 Listing composer

- Keep the canonical listing form. Suggestions appear inline at the affected field as one restrained suggestion row; no separate AI dashboard.
- Replace `AI Quick List` and repeated badges with product language such as `Quick list` and `Suggested from photo`.
- Do not auto-populate condition or generic category. First viewport is real media plus the next required action.
- One completeness indicator based on required fields; no circular score/gauge or confidence percentage.
- Loading skeleton follows field geometry; no scanning animation or fake "analyzing" delay.

### 7.2 Smart Sell

- Do not place a large nested card inside an already long form. Use a compact row after price; configuration opens a focused modal/sheet.
- One primary mental model: minimum expected payout. Advanced gross thresholds/counter strategy live behind disclosure.
- Complete states: unavailable, disabled, draft-unsaved, saving, active, paused, conflict, stale fee quote, action history, unknown outcome.
- Motion 160–220ms, reduced-motion instant/fade; no trend arrows, glowing ranges or celebratory acceptance animation.
- Screen readers receive currency, gross/net distinction, enabled/selected state and consequences. Do not mark a static range graphic `adjustable` unless it actually implements accessibility actions.

---

## 8. Target architecture — listing intelligence

### 8.1 End-to-end system

```text
finalized source assets + seller hints
  → async suggestion run (idempotent)
  → OCR/barcode/vision + taxonomy/catalog/entity resolution
  → field candidates with evidence + calibrated confidence/abstention
  → comparable-sales read model + policy/moderation
  → client field-level review
  → accepted/edit/rejected decisions
  → listing draft revision
  → publication validation
```

### 8.2 Proposed schema

```sql
listing_suggestion_runs(
  id, seller_id, draft_id, input_revision, idempotency_key,
  model_bundle_id, taxonomy_version, state, request_hash,
  created_at, completed_at, expires_at,
  UNIQUE(seller_id, idempotency_key)
)
listing_suggestion_fields(
  id, run_id, field_name, candidate_json, confidence,
  abstained, evidence_json, policy_flags, rank
)
listing_suggestion_decisions(
  id, field_id, seller_id, decision, final_value_json,
  draft_revision, created_at
)
price_guidance_snapshots(
  id, draft_id, currency, low_minor, median_minor, high_minor,
  cohort_definition, sample_size, sales_window, computed_at,
  model_version
)
```

### 8.3 Contract

```ts
type FieldSuggestion = {
  field: ListingField;
  candidate: unknown;
  evidence: Array<{ kind:'ocr_region'|'barcode'|'catalog'|'visual'|'seller_hint'; ref:string }>;
  calibratedConfidence?: number;
  abstained: boolean;
  policyFlags: string[];
  model: { id:string; version:string };
};
```

Condition has no candidate; it returns required evidence prompts. Draft patch uses `If-Match`/draft revision and explicit `{fieldSuggestionId, decision}`. Generated text is stored separately from seller-edited final copy and exported with required provenance.

### 8.4 Model/data evaluation

| Module | Evaluation |
|---|---|
| Taxonomy | Hierarchical accuracy, required-aspect coverage, abstention by category |
| Brand/entity | Precision-first, counterfeit-sensitive slices, false authoritative match near zero |
| OCR/size | Character/field exact match by blur, orientation, label type/language |
| Colour/material | Per-label precision/recall and calibration by lighting/skin/background |
| Copy | Unsupported-claim rate, policy violations, duplication, seller edit distance |
| Price | Coverage and interval calibration against completed sales; error by category/condition/region |

Use seller decisions only as feedback labels after consent and quality filtering; a seller acceptance is not necessarily truth. Maintain golden sets, time-based holdout, category/brand long-tail slices, shadow deployment and rollback by model bundle. Track coverage at a fixed precision, not only aggregate accuracy.

---

## 9. Target architecture — Smart Sell

Smart Sell is a policy layer over existing offer commands:

```text
offer.created event / command transaction
  → lock offer + listing + active policy version
  → compute authoritative fee/net quote
  → eligibility/risk/counter-budget checks
  → immutable decision
  → invoke factored accept/counter/decline command
  → order/reservation/listing/outbox commit
  → seller/buyer notification + audit
```

### 9.1 Schema

```sql
smart_sell_policies(
  id, listing_id, seller_id, version, state, currency,
  accept_gross_minor, minimum_net_minor, decline_below_minor,
  counter_strategy_json, max_auto_counters, expires_at,
  fee_policy_version, created_at, activated_at, paused_at,
  UNIQUE(listing_id, version)
)
smart_sell_decisions(
  id, offer_id, policy_id, policy_version, input_snapshot_json,
  decision, reason_code, action_idempotency_key, outcome,
  order_id, created_at, reconciled_at,
  UNIQUE(offer_id, policy_version)
)
```

Money is integer minor units plus ISO currency. Policy changes create a version; they never rewrite history. Factor `acceptOffer`, `counterOffer`, `declineOffer` from `routes/listingOffers.ts` into domain commands and reuse exactly the same locks/invariants.

### 9.2 Client state machines

```text
Suggestion run:
idle → queued → processing → partial | ready | failed | cancelled | expired
ready → reviewing → accepted/edited/rejected per field → draft_applied
processing → outcome_unknown → reconciling

Smart Sell policy:
unavailable | disabled
disabled → editing → saving → active
active → editing_new_version | pausing → paused
saving/pausing → outcome_unknown → reconciling
active → stale_fee_policy → review_required
active → expired | listing_unavailable
```

---

## 10. Security, privacy and failure analysis

| Threat/failure | Current exposure | Required control |
|---|---|---|
| Filename/metadata prompt injection | `aiListingApi.ts:187–223` reads filenames | Typed input; never concatenate untrusted metadata into prompts/tools |
| Cross-seller assets/drafts | Not built | Ownership at submit/status/decision/apply; signed short-lived media access |
| Counterfeit brand hallucination | `aiListingApi.ts:49–93` brand map | Precision-first abstention, evidence, Trust review; no verified badge |
| PII in photos/OCR | Not built | Minimize/crop, redact logs, retention controls, provider no-training terms |
| Seller correction poisoning | Not built | Consent, anomaly detection, curated labels; do not train blindly |
| Model drift/taxonomy mismatch | Not built | Version pin, schema validation, shadow eval, per-category kill switch |
| Policy accepts below intended payout | Not built | Authoritative fee quote and minimum-net invariant inside transaction |
| Offer/policy race | Not built | Lock offer/listing/policy snapshot; unique decision |
| Duplicate event/action | Not built | Decision/action idempotency and existing offer idempotency |
| Lost response after acceptance | Not built | Unknown outcome; reconcile decision/offer/order IDs |
| Buyer discrimination/proxy rules | Not built | No buyer-sensitive targeting; legal/fairness review of exclusions/risk signals |
| Threshold disclosure | Not built | Never reveal seller floor to buyer or analytics clients |
| Fabricated conversion uplift | `smartSellApi.ts:261` — `conversionUplift: 0.6` | Remove; never fabricate performance metrics |
| Fabricated condition | `aiListingApi.ts:368` — `const condition = 'Very good'` | Never auto-set condition; require seller attestation |
| Auto-overwrite seller edits | `AIPoweredListingScreen.tsx:136–143` | Dirty-field protection; never overwrite edited fields |

---

## 11. SLOs and observability

### SLOs

- Suggestion submit p95 <300ms; initial field results p95 <5s; full run p95 <12s.
- Suggestion service 99.9%; failure never blocks manual listing.
- Field provenance completeness 100%; material auto-application 0%.
- Smart Sell decision p99 <750ms after offer commit/event delivery.
- Policy pause p99 effective <2s; no decision uses an older policy after pause commit.
- Duplicate automated actions/acceptances: 0.
- Accepted-offer order/reservation correctness 99.99% using existing commerce transaction.

### Observability

Suggestion metrics by field/model/category: precision, coverage, abstention, calibration, seller accept/edit/reject, time saved, policy flags and return/report outcomes. Smart Sell: policy active count, decisions/reasons, gross/net deltas, counters, pause latency, stale fee policy, unknown outcomes, duplicates and manual overrides. Never log image bytes, OCR PII, seller floors or buyer risk reason. Trace suggestion run to draft revision and Smart Sell decision to offer/order/outbox.

---

## 12. Migration, flags, compatibility and rollback

### Flags

```text
listing_suggestions_v1
listing_suggestions_field_review_v1
listing_suggestions_dirty_field_protection_v1
smart_sell_capability_v1
smart_sell_policy_v1
smart_sell_auto_accept_v1
smart_sell_auto_counter_v1
smart_sell_auto_decline_v1
```

### Sequence

1. **P0:** Stop auto-applying suggestion effect (`AIPoweredListingScreen.tsx:128–145`); condition/category default `unknown`; remove confidence percentage and unsupported 60% claim (`smartSellApi.ts:261`). Make Smart Sell capability server-driven and default unavailable in every build; never derive truth from `__DEV__`.
2. Add field-level DTO compatible alongside old aggregate response; old client receives only low-risk text suggestions.
3. Introduce async suggestion backend in shadow mode; no form changes.
4. Add explicit accept/edit/reject and draft provenance behind `listing_suggestions_v1`.
5. Add Smart Sell schema/domain disabled; refactor offer commands without behavior change.
6. Enable observe-only policy decisions, compare to seller actions, then internal live cohort.
7. Enable auto-decline/counter/accept separately by category/risk.

Rollback disables new model run/policy actions, preserves manual listing/offers, pauses all active policies, reconciles in-flight decisions and retains immutable audit. Model rollback selects prior bundle; never mutate stored provenance.

---

## 13. Phased backlog mapped to files/owners

| Phase | Work/files | Owner | Dependency | Exit |
|---|---|---|---|---|
| 0 — truth | `aiListingApi.ts` (lines 355–359, 366–368, 385–388), `useAIListingSuggestion.ts`, `AIPoweredListingScreen.tsx` (lines 128–145, 406–408), `smartSellApi.ts` (lines 33, 261) | Mobile/Sell | None | No unsafe defaults/auto-application/pseudo-confidence |
| 1 — suggestion domain | migrations, `domain/listingIntelligence/*`, routes/workers/provider adapter | Applied ML/API | Media assets/taxonomy | Field evidence and async contract pass |
| 2 — composer | typed hook/store, dirty-field protection, inline review, accessibility | UI/UX Engineering | Phase 1 | Native review task gates |
| 3 — offer refactor | extract commands from `routes/listingOffers.ts`, retain endpoints | Commerce | Regression tests | No behavior/ledger regression |
| 4 — policy | migrations, `domain/smartSell/*`, decision worker/outbox, policy routes | Commerce | Fee/risk services | Observe-only parity |
| 5 — live | policy sheet/history, pause/reconcile, dashboards/evals | Sell + SRE | Legal/experiment | Release gates below |

---

## 14. Test, evaluation and release gates

- Dirty seller fields are never overwritten by late/retried model result.
- Condition remains unset until explicit seller selection/attestation.
- Field provenance survives accept/edit/publish/export; equality cannot fake origin.
- Calibration/abstention reported by field/category/brand/device; fixed launch thresholds approved.
- Generated-copy unsupported-claim and prohibited-item suites.
- Smart Sell deterministic replay for every policy/offer fixture.
- Concurrency: policy pause vs offer, two offers, listing sold/paused, fee-version change.
- Duplicate outbox/job/API calls cannot duplicate counter, accept, order or reservation.
- Failure injection around every transaction boundary and unknown-outcome reconciliation.
- Manual listing remains usable during AI outage; manual offer handling remains usable during policy outage.
- No regression in returns/not-as-described/counterfeit reports; severe incident auto-rolls back affected model/category.
- VoiceOver/TalkBack, 200% text, keyboard, reduced motion, currency localization; thumbnail/squint tests pass.
- No fabricated conversion uplift, fake buyers, or pseudo-confidence percentages in any build.

---

## 15. Explicit non-goals

- Autonomous publication, condition inference, authenticity verdicts, dynamic/personalized buyer-specific floors, unrestricted generated claims or AI deciding offer acceptance.
- New parallel offers table/API.
- Fabricated sale probability, conversion uplift or "optimal" price.

---

## 16. Decisions requiring product, legal/trust and operations input

1. Which fields require seller attestation versus catalog authority?
2. Can accepted correction data be retained/trained on; opt-out and deletion consequences?
3. Comparable-sale cohort disclosure and minimum sample/freshness?
4. Is auto-decline allowed, or should low offers remain invisible/manual?
5. Maximum auto-counter rounds and policy expiration?
6. Consumer disclosure for automated negotiation and jurisdictional requirements?
7. Generated text/image downstream attribution obligations?

---

## 17. Final decision

**P0 FORM-TRUTH FIX, THEN TWO BOUNDED SYSTEMS.** Stop treating filename heuristics as field authority. The auto-application effect (`AIPoweredListingScreen.tsx:136–143`) silently overwrites seller edits with filename-derived guesses. The condition fabrication (`aiListingApi.ts:366–368`) sets `Very good` despite admitting it cannot be inferred. The category default to `Women` (`aiListingApi.ts:359`) is discriminatory. The fabricated `conversionUplift: 0.6` (`smartSellApi.ts:261`) and `SMART_SELL_DEMO_MODE = __DEV__` (`smartSellApi.ts:33`) create the same release fail-open pattern as photo enhancement. Fix all of these first: stop auto-applying, require seller attestation for condition, remove fabricated metrics, and make Smart Sell capability server-driven. Then build evidence-bearing advisory suggestions with explicit field-level review, and implement Smart Sell as a versioned deterministic policy over the already strong `listingOffers` transaction — not as AI and not as a new negotiation authority.
