# 22 — Creator Analytics and Monetisation: Principal-Engineer Research and Execution Plan

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Method:** event-producer → contract → storage → aggregate → UI audit plus August 2026 primary-source review
**Decision owners:** Data Product + Analytics Engineering + Creator Partnerships + Finance + Privacy
**Status:** **P0 measurement integrity incident; freeze analytic and earnings claims until corrected**  

## 1. Executive decision

This department is not merely missing advanced charts. Its existing metrics are not semantically or contractually trustworthy:

1. `creatorAnalyticsApi.ts` sends camelCase event fields; the server requires snake_case.
2. The client expects timeline `{ points }`; the server returns `{ items }`.
3. The client expects every timeline point to contain `engagementRate`; the server never returns it.
4. The summary endpoint ignores date and content filters, so the 7/30/90-day selector changes only the timeline while headline totals remain lifetime totals.
5. The dashboard compares lifetime totals to a “previous” value derived from the first half of the selected current period. The periods are neither equal nor adjacent.
6. Server `engagementRate` is a ratio (for example `0.25`); the UI formats it as a percent string (`0.3%`) while its locally derived comparison uses 0–100 units (`25`).
7. The event endpoint assigns both `creator_id` and `viewer_id` to the authenticated caller and never resolves content ownership.
8. The only discovered native call site forwards `creator_publish_success` as `profile_visit`, using the broken camelCase contract, then swallows failure.
9. The raw-event table can accept client-forged likes, saves, comments and shares. Those should originate from their owning domains.
10. A daily aggregate table exists but has no discovered writer or reader.

The correct response is to mark the present analytics surface non-authoritative, quarantine polluted data, define versioned metrics and rebuild from canonical domain events. Monetisation must be a separate attribution and financial-ledger system, not additional arithmetic over this table.

## 2. Maturity scorecard

| Capability | Score | Assessment |
|---|---:|---|
| Event taxonomy | 1/5 | Names exist; semantic ownership and definitions do not. |
| Producer coverage | 0.5/5 | Only a misclassified publish emitter was found. |
| Identity/ownership | 0/5 | Caller is recorded as both creator and viewer. |
| Client/server contract | 0.5/5 | Multiple casing, shape and unit mismatches. |
| Aggregation | 1/5 | Raw COUNT queries exist; daily table unused; no completeness/versioning. |
| Period comparison | 0/5 | Lifetime current vs half-window previous is invalid. |
| Privacy | 0.5/5 | Auth gates own dashboard, but no cohort thresholds/deletion design. |
| Dashboard UX | 2/5 | Loading/error/empty exist; 2×2 card grid and false labels undermine it. |
| Attribution | 0/5 | No impression → click → order/refund chain. |
| Earnings | 0/5 | No commission agreement, earning ledger, holds or payout reconciliation. |
| Exports | 0/5 | No reproducible snapshot/export contract. |
| Data operations | 0.5/5 | No quality monitor, replay, backfill or metric registry. |

**Overall: 0.6/5 authoritative readiness.** The surface should not guide creator decisions in production.

## 3. Exact code evidence register

| Layer | Canonical implementation | Evidence | Consequence |
|---|---|---|---|
| Event client | `frontend/src/services/creatorAnalyticsApi.ts` | `contentType`, `contentId`, `eventType`; optional client `viewerId`. | Server validation fails before insert; viewer identity should never be client-selected. |
| Timeline client | same file | Expects `{ points }` with `engagementRate`. | Server returns incompatible shape and omits rate. |
| Dashboard | `frontend/src/screens/CreatorAnalyticsDashboardScreen.tsx` | Summary fetched with no period; timeline with days; “previous” from first half. | Period selector and deltas are false. |
| UI units | same file | `formatRate(n) => n.toFixed(1) + '%'`; local previous rate multiplies by 100. | Backend ratio and local percent use different units. |
| UI composition | same file | Dominant 2×2 metric-card grid followed by sections. | Generic dashboard silhouette; no decision narrative. |
| Creator emitter | `frontend/src/creator/creatorAnalytics.ts` | Publish success logs `profile_visit` and swallows errors. | Pollutes semantics if contract is fixed; currently silently lost. |
| Event route | `backend/api/src/index.ts` → `POST /creator/analytics/events` | Snake_case fields; creator/viewer both authenticated actor; no subject resolver. | Any creator can attribute events to themselves for arbitrary IDs. |
| Summary route | same file | Counts all rows for creator, no time/content query. | Headline metrics lifetime regardless of selected period. |
| Timeline route | same file | Returns `items`; no `engagementRate`; gaps omitted. | Client sees empty points; missing dates make charts/comparisons inconsistent. |
| Storage | `098_creator_analytics.sql` | Raw table plus `creator_analytics_daily`. | No event ID/dedupe/session/surface/schema version; aggregate table unused. |
| Duplicate implementation | `backend/api/src/routes/creator.ts` | Similar routes exist but are not registered. | Architectural drift/dead code risks future double registration. |

### 3.1 Verified code quotes

**Critical quote — misclassified publish event (`creatorAnalytics.ts:55–69`):**
```ts
  if (event === 'creator_publish_success' && payload.publishedId && payload.documentType) {
    const publishedId = payload.publishedId;
    const documentType = payload.documentType;
    import('../services/creatorAnalyticsApi')
      .then(({ logCreatorEvent }) =>
        logCreatorEvent({
          contentType: documentType === 'look' ? 'look' : 'poster',
          contentId: publishedId,
          eventType: 'profile_visit', // reuse as a "publish" signal
          metadata: { event },
        }),
      )
      .catch(() => {
        // analytics must not crash the editor
      });
  }
```
A `creator_publish_success` event is forwarded as `profile_visit` (line 63). The comment says "reuse as a 'publish' signal" — but `profile_visit` is a different metric. This pollutes the profile-visit count with publish events. The `.catch()` at line 67 swallows all errors, so if the server rejects the camelCase payload (which it does), the failure is invisible.

**Critical quote — client-selected viewer identity (`creatorAnalyticsApi.ts:19–22`):**
```ts
export interface CreatorAnalyticsEventBody {
  contentType: CreatorContentType;
  contentId: string;
  eventType: CreatorAnalyticsEventType;
  viewerId?: string;
  metadata?: Record<string, unknown>;
}
```
`viewerId` is an optional client-supplied field. The server sets `creator_id = viewer_id = authenticated actor`. A creator can POST events for arbitrary `contentId` values and attribute them to themselves. There is no server-side ownership resolution.

**Critical quote — timeline shape mismatch (`creatorAnalyticsApi.ts:50`):**
```ts
export interface CreatorAnalyticsTimelineResponse {
  points: CreatorAnalyticsTimelinePoint[];
}
```
Client expects `{ points }`. Server returns `{ items }`. The timeline will be empty on every fetch because `points` is undefined.

## 4. End-to-end flow diagnosis

### 4.1 Intended top-down flow

```text
Creator opens Analytics
  → selects 7/30/90 days
  → summary + matched prior period + timeline + content ranking
  → understands reach, engagement, commerce contribution and data freshness
  → opens content-level diagnosis
  → changes creative/merchandising decision
```

### 4.2 Actual top-down flow

```text
screen
  → GET summary (lifetime)
  → GET timeline(days)
  → reads timelineRes.points (server returned items)
  → likely empty timeline
  → lifetime KPI cards with period caption nearby
  → invalid or missing deltas/top periods
```

### 4.3 Bottom-up flow today

```text
creator publish success
  → logCreatorEvent(camelCase, profile_visit)
  → server expects snake_case
  → request fails and error is swallowed

manual/other client POST if correctly shaped
  → server sets creator=viewer=actor
  → raw row
  → lifetime COUNT or daily GROUP BY
  → incompatible client response
```

There is no discovered domain-event path from actual view exposure, like, save, comment, share, listing click, order, return or payout.

## 5. Metric correctness dossier

### P0.1 — contract mismatch

Adopt one shared schema package and generate both sides. Do not maintain handwritten parallel interfaces.

```ts
const AnalyticsTimelineResponse = z.object({
  metricVersion: z.string(),
  timezone: z.string(),
  generatedAt: z.string().datetime(),
  completeness: z.enum(['complete', 'provisional', 'delayed']),
  points: z.array(AnalyticsPoint),
});
```

### P0.2 — ownership is not resolved

The server must resolve `(subject_type, subject_id)` to the authoritative owner:

```text
look → looks.creator_id
poster → poster_stories.creator_id
profile → users.id
listing/product click → listings.seller_id plus creator attribution context
```

Actor/viewer comes from authentication or a privacy-safe anonymous/session identity. The client cannot provide `creator_id`.

### P0.3 — domain actions are forgeable analytics POSTs

Likes, saves, comments, shares, purchases, refunds and payouts must be emitted from successful owner-domain transactions through an outbox. Analytics subscribes; it does not accept arbitrary client truth.

Only exposure telemetry may be client-assisted, and even then it needs server-issued impression IDs, qualification rules and dedupe.

### P0.4 — selected period is a visual fiction

Every response must carry explicit inclusive/exclusive boundaries:

```text
current: [2026-07-27T00:00Z, 2026-08-26T00:00Z)
comparison: [2026-06-27T00:00Z, 2026-07-27T00:00Z)
timezone: Europe/London
```

No client splitting. Server uses equal duration, aligned timezone and documented late-event policy.

### P0.5 — rate units are inconsistent

Store/transport rates as decimal ratios with field suffix or documented range:

```text
engagementRate = 0.2534  // [0,1]
```

Only the presentation layer converts to `25.3%`. Contract tests assert range.

### P0.6 — “view” has no qualification

A view needs a metric version and rule. Example, subject to product decision:

- impression: at least 50% visible for ≥500ms;
- qualified image view: at least 50% visible for ≥2s;
- qualified video view: playback started and ≥2s watched;
- unique viewer: deduped privacy-safe subject/viewer/day;
- engaged view: subject-specific threshold.

YouTube changed cross-format view counting on 24 August 2026 while preserving different engaged-view concepts for monetisation. This is direct evidence that ThryftVerse must version definitions instead of silently rewriting history.

### P0.7 — historical data is contaminated or absent

Before backfill:

1. classify source and schema of every raw row;
2. quarantine rows created by the self-attribution endpoint;
3. mark dates with missing emitters as `unavailable`, not zero;
4. rebuild only from authoritative domain history;
5. expose a `data_quality` note to creators during transition.

## 6. Versioned metric dictionary

Every metric needs owner, numerator, denominator, eligibility, dedupe, latency and privacy.

| Metric | Proposed definition | Source owner | Latency |
|---|---|---|---|
| Impressions | Qualified render opportunities | Feed/search/profile exposure pipeline | Minutes |
| Qualified views | Versioned visibility/play threshold | Exposure processor | Minutes |
| Unique viewers | Privacy-safe distinct viewer estimate | Identity/analytics | Daily |
| Likes | Successful current like state transition | Interaction domain | Near realtime |
| Saves | Successful collection/save transition | Collection domain | Near realtime |
| Comments | Published, non-removed comment | Comment domain | Near realtime + correction |
| Shares | Native share action initiated; distinguish completed attribution | Share/deep-link domain | Near realtime |
| Product clicks | Click from creator subject to listing | Navigation attribution | Near realtime |
| Orders attributed | Eligible paid order under attribution rule | Orders | Delayed/finalized |
| Gross attributed sales | Eligible order item gross | Orders | Provisional |
| Net attributed sales | Gross less cancel/return/refund | Orders/refunds | Finalized after window |
| Estimated earnings | Current commission projection | Earnings projection | Provisional |
| Finalized earnings | Ledger amount past hold/adjustment | Creator earnings ledger | Financial truth |

Avoid a single generic engagement rate. At minimum expose the exact formula/version; different surfaces have different opportunity denominators.

## 7. Target event architecture

```text
Canonical domain transactions
  ├─ content.published / archived / deleted
  ├─ interaction.liked / unliked / saved / unsaved
  ├─ comment.published / removed
  ├─ order.paid / cancelled / returned / refunded
  └─ payout/commission events
      → transactional domain outbox

Qualified client exposures
  → server-issued impression token
  → validation + dedupe + consent/region policy

Both streams
  → immutable analytics event log
  → identity/content ownership enrichment
  → late-event/watermark processor
  → versioned hourly/daily/content aggregates
  → privacy projection
  → dashboard/export API

Financial stream
  → attribution contract
  → commission agreement version
  → creator earnings ledger
  → estimated/finalized/held/paid projections
```

## 8. Proposed event contract

```json
{
  "eventId": "evt_01…",
  "eventType": "content.qualified_view.v2",
  "subject": { "type": "look", "id": "look_…" },
  "ownerId": "user_…",
  "viewer": { "kind": "authenticated_pseudonym", "id": "rotating_…" },
  "sessionId": "sess_…",
  "impressionId": "imp_…",
  "surface": "home_for_you",
  "position": 4,
  "occurredAt": "…",
  "receivedAt": "…",
  "schemaVersion": 2,
  "metricVersion": "views-2026-08-24",
  "consentRegion": "GB",
  "correlationId": "req_…",
  "payload": {}
}
```

Rules:

- `ownerId` is server-enriched, never client authority.
- Domain events use their original transaction/event ID as dedupe key.
- Anonymous/pseudonymous identity rotates according to privacy policy.
- Raw metadata has an allow-list and size limit; no free-form PII bucket.
- Deleted/private content remains governed by retention and aggregate policy.

## 9. Aggregate/query contract

```json
{
  "metricVersion": "creator-analytics-3",
  "timezone": "Europe/London",
  "range": { "start": "…", "endExclusive": "…" },
  "comparisonRange": { "start": "…", "endExclusive": "…" },
  "generatedAt": "…",
  "watermark": "…",
  "completeness": "provisional",
  "summary": {
    "qualifiedViews": { "value": 1240, "comparison": 1100, "changeRatio": 0.1273 },
    "productClicks": { "value": 81, "comparison": 72, "changeRatio": 0.125 }
  },
  "series": [],
  "topContent": [],
  "suppressedDimensions": [{ "dimension": "country", "reason": "insufficient_data" }]
}
```

Content filters, formats and surfaces are server-validated. Unsupported combinations return a typed reason, not silent omission.

## 10. Monetisation architecture

Analytics attribution and payable money are separate.

### 10.1 Attribution entities

```text
attribution_touchpoints(id, viewer_key, session_id, creator_id,
                        content_id, listing_id, surface, occurred_at)
attribution_decisions(order_item_id, model_version, creator_id,
                      touchpoint_id, credit_ratio, decided_at)
commission_agreements(id, creator_id, rate, basis, version, effective_range)
```

### 10.2 Earnings ledger

```text
creator_earning_entries(
  id, creator_id, order_item_id, attribution_decision_id,
  agreement_version, entry_type,
  amount_minor, currency, status,
  available_at, reversed_entry_id, created_at
)
```

Entry types: `estimated`, `earned`, `held`, `adjustment`, `refund_reversal`, `chargeback_reversal`, `payout`. Final balance is a projection of immutable entries, never a mutable analytics total.

### 10.3 Required money states

```text
estimated → eligible → held → finalized → payable → paid
                    └→ reversed/adjusted
```

Every UI number identifies its state and “as of” time. Refunds/chargebacks produce entries, not destructive edits.

## 11. Privacy, security and abuse

### 11.1 Privacy controls

- Return only creator-owned subjects.
- Suppress small geography/demographic/referrer cohorts.
- Defend against filter differencing by consistent thresholds/budgeting.
- Prefer `insufficient_data` over misleading zero.
- Apply consent/region rules before raw event persistence where required.
- Support viewer deletion while preserving only lawful, non-identifying aggregates.
- Separate internal anti-fraud retention from creator-visible analytics.

### 11.2 Abuse controls

| Abuse | Control |
|---|---|
| Creator self-refreshes views | Impression token, visibility qualification and per-viewer dedupe. |
| Bot engagement | device/account/network quality signals; exclude invalid activity with adjustment markers. |
| Client forges order/like | Canonical domain outbox only. |
| Metadata injects PII | Allow-list schema, truncation and security review. |
| Export enumerates audience | Aggregate-only export with same suppression rules. |
| Employee queries creator data | Scoped RBAC, purpose logging and audit. |

## 12. Product psychology and anti-AI design

### 12.1 User job

“Tell me what changed, why it might have changed, and what content or commerce action I can reasonably take.” Analytics should improve agency, not manufacture anxiety.

### 12.2 Replace the generic dashboard silhouette

The current 2×2 equal-weight KPI cards fail the thumbnail test. Use:

1. one compact performance sentence with the dominant metric and honest comparison;
2. one primary trend plot with publication markers;
3. a ranked content list with media, reach and commerce contribution;
4. secondary breakdowns below;
5. earnings as a separate ledger-led destination.

Real content thumbnails provide colour. Avoid gradients, decorative score rings, “AI insights” cards, badge clouds and a card per metric.

### 12.3 Insight policy

An insight must include:

- observation;
- comparison basis;
- sample sufficiency;
- plausible—not causal—language;
- linked evidence;
- no prescriptive pressure.

Example: “Saves were 18% higher than your previous 30 days. Most came from two outfit guides.” Not: “Post more outfit guides to boost growth.”

### 12.4 Full UI states

| State | Treatment |
|---|---|
| Loading | Geometry-matched plot/list skeleton. |
| Empty/new | Explain data begins after qualified distribution; link to publish. |
| Delayed | Keep last data, label watermark and expected refresh. |
| Partial | Identify missing metric/surface; do not zero it. |
| Suppressed | Explain privacy threshold without revealing it precisely if unsafe. |
| Offline | Last confirmed snapshot with timestamp; no fake refresh. |
| Definition changed | Boundary marker and metric-version explanation. |
| Error | Preserve last snapshot, retry, request ID for support. |
| Earnings adjusted | Ledger row with reason and related order/refund. |

### 12.5 Accessibility

- Charts have concise summaries and a navigable data table.
- Change is not colour-only; announce “up/down” and comparison period.
- Tabular numerals, Dynamic Type and no clipped labels.
- Content thumbnails have creator-provided descriptions where appropriate.
- Motion is limited to period crossfade/indicator, with reduced-motion parity.

## 13. SLOs and data-quality observability

| SLI | Candidate objective |
|---|---:|
| Domain event capture completeness | ≥99.99% against outbox source |
| Exposure event accepted once | ≥99.9% eligible impressions |
| Duplicate canonical events | 0 after dedupe |
| Dashboard freshness | p95 <15 min for provisional engagement |
| Daily finalized watermark | by 06:00 creator-local time |
| Aggregate/raw reconciliation | exact for supported additive metrics |
| Export/UI reconciliation | 100% for same snapshot/filter/version |
| Earnings ledger imbalance | 0 |
| Ownership misattribution | 0 |

Monitor schema rejection by client version, orphan subject IDs, owner mismatch, event lag, dedupe rate, invalid-activity adjustment, late events, aggregate drift, privacy suppression rate, dashboard error rate, export mismatch and earnings adjustments.

## 14. Implementation programme

### Phase 0 — contain bad data

1. Mark analytics as beta/unavailable or hide it from production navigation until contract integrity is restored.
2. Stop the publish-as-profile-visit emitter.
3. Inventory/quarantine raw rows by source and correctness.
4. Remove or archive unregistered duplicate route code.
5. Create a metric dictionary and accountable owners.

### Phase 1 — shared contracts and canonical ownership

1. Introduce shared Zod/OpenAPI schemas.
2. Resolve content owner server-side.
3. Build equal current/comparison ranges and rate unit tests.
4. Return dense zero-filled series only for known complete dates; missing remains missing.
5. Add watermark, metric version, timezone and completeness.

Likely files: `creatorAnalyticsApi.ts`, `CreatorAnalyticsDashboardScreen.tsx`, new shared contracts, extracted backend analytics routes, migration 098 successor and contract tests.

### Phase 2 — real event producers

1. Emit content lifecycle, interaction and order/refund events through domain outboxes.
2. Add server-issued impression/exposure qualification.
3. Enrich subject owner/surface/session.
4. Build replayable aggregates and data-quality reconciliation.

### Phase 3 — flagship creator intelligence

1. Content ranking and fair lifespan comparisons.
2. Traffic/surface/referrer/product-click funnels.
3. Privacy-safe audience dimensions.
4. Reproducible CSV export.
5. Decision narrative UI; no generic KPI grid.

### Phase 4 — monetisation

1. Version attribution models and agreements.
2. Create earnings ledger with holds/refunds/adjustments.
3. Estimated vs finalized earnings, statements and payout reconciliation.
4. Tax/privacy/legal review and controlled cohort.

## 15. Migration and rollout

- Deploy `analytics_v2` tables/stream beside current data; never silently reinterpret v1.
- Backfill canonical domain events from immutable source records; record coverage intervals.
- Do not backfill views for periods without qualified exposure evidence.
- Shadow aggregate v2 and reconcile before creators see it.
- Feature flags by creator cohort and client version.
- Keep metric versions visible at definition boundaries.
- Rollback disables v2 display but preserves raw/outbox capture and financial ledgers.

## 16. Test/evaluation/release gates

### Contract gates

- generated client/server schemas agree on casing, shape, nullability and units;
- period filters affect summary, series and top content identically;
- content filter cannot escape ownership;
- timeline always declares timezone, watermark and version;
- ratio stays [0,1] in transport and formats once.

### Data invariants

- one canonical interaction transition produces one event;
- owner resolves from source row, never request body;
- summary equals point sum for additive metrics and same snapshot;
- current/comparison periods have equal duration;
- deletion/private transitions respect policy in future projections;
- export exactly matches UI snapshot;
- final earnings equal ledger projection and payout statements.

### Adversarial gates

- forged content ID, other creator’s ID and deleted/private ID;
- replay and duplicate exposure;
- clock skew, late arrival and out-of-order event;
- tiny-cohort differencing;
- bot/self-refresh storm;
- refund after payout and chargeback adjustment;
- metric-definition change mid-period.

### Product gates

- creators can correctly explain the metric and comparison in research;
- no unsupported causal suggestion;
- thumbnail test shows content/trend, not repeated cards;
- loading, empty, delayed, partial, suppressed, offline and adjusted states verified natively.

## 17. Non-goals and required decisions

Non-goals: vanity metrics without decisions; “AI insight” prose over weak data; revenue inferred from clicks; exposing individual viewers; silently changing historical definitions; real-time numbers at the expense of correctness.

| Decision | Owner |
|---|---|
| Metric definitions/versions | Data Product + Analytics Engineering |
| Exposure qualification | Product + Research + Data Science |
| Privacy thresholds/retention | Privacy Counsel + Security + Data Governance |
| Attribution model | Commerce Product + Finance + Legal |
| Commission/holds/refunds | Finance Controller + Creator Partnerships |
| Invalid-activity policy | Trust/Safety + Data Science |

## 18. August 2026 primary-source benchmark

### 18.1 YouTube view definition change — 24 August 2026

| Source | Finding | ThryftVerse application |
|---|---|---|
| [YouTube Blog — Engaged Views explained](https://blog.youtube/inside-youtube/engaged-views-youtube-explained/) | From 24 August 2026: a "view" counts from the first frame across all formats. The old definition is now "engaged view" — watching past the first frame. Monetisation still uses engaged/qualified views. | Version metric definitions; separate exposure (view) from engagement (qualified view); never silently rewrite history |
| [TechCrunch — YouTube view count change](https://techcrunch.com/2026/08/17/youtube-will-now-count-a-view-as-soon-as-a-video-starts-playing/) | "The shift could lead to significantly increased view counts." Public view counts may no longer be a useful tool for evaluating quality. | Be explicit about what "view" means; don't let a metric definition change inflate numbers without disclosure |
| [YouTube Help — Check your revenue](https://support.google.com/youtube/answer/9314488) | Estimated revenue adjusts twice: after 1 week and mid-following-month. Finalized earnings only in AdSense. "Finalized earnings may be different from estimated earnings." | Estimated vs finalized earnings separation is industry standard; ThryftVerse must implement the same |
| [Search Engine Journal — YouTube view change](https://www.searchenginejournal.com/youtube-changes-how-it-counts-views-on-long-form-live/586166/) | "The YouTube Partner Program continues to determine earnings based on 'engaged Shorts views' and 'engaged watch hours.'" Public view count ≠ monetisation metric. | ThryftVerse must separate public-facing metrics from monetisation-eligible metrics |

### 18.2 Additional benchmarks

- [YouTube Advanced Mode — July 2026 update](https://support.google.com/youtube/answer/9717005?hl=en) — direct benchmark for content/date comparison and reproducible exports.
- [YouTube unique viewers](https://support.google.com/youtube/answer/7577916?hl=en) — primary description of cross-device/shared-device estimation and period limits.
- [YouTube earnings-data caveats](https://support.google.com/youtube/answer/6085583?hl=en-GB) — estimated revenue is delayed and can differ from final financial reports.
- [YouTube analytics privacy limits](https://support.google.com/youtube/answer/9101241) — primary benchmark for limiting low-volume audience data.
- [Shopify marketing reports and attribution models](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/marketing-reports) — primary benchmark for explicit selectable attribution models and reconciliation.

### 18.3 Key YouTube finding for ThryftVerse

YouTube's 24 August 2026 view definition change is direct evidence that **metric definitions must be versioned, not silently rewritten**. When YouTube changed "view" from "watched past threshold" to "first frame," they:
1. Renamed the old metric to "engaged view" (preserving history)
2. Kept monetisation on the stricter "qualified/engaged" measure
3. Made the definition change visible to creators

ThryftVerse must do the same: every metric change gets a version, a boundary marker, and a creator-visible explanation. Never silently change what a "view" or "engagement" means.

## 19. Final assessment

**PARTIAL — P0 ANALYTICS CORRECTNESS FAILURE; MONETISATION NOT IMPLEMENTED.**

The dashboard cannot currently be considered authoritative. Its request/response shapes, identity attribution, period semantics and rate units disagree, and real event producers are absent. Freeze claims, rebuild from canonical domain events, expose version/completeness/privacy honestly, and implement money through a separate immutable earnings ledger. Only then should visual depth or “insights” be expanded.
