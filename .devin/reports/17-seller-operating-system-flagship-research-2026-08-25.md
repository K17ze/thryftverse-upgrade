# 17 — Seller Operating System: Principal Engineering Decision Record

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Commerce Platform + Seller Experience
**Status:** **P1 department with two P0 correctness gaps**
**Recommended status:** **PARTIAL — AUTHORITATIVE CONVERGENCE REQUIRED**

---

## 1. Executive verdict

ThryftVerse has credible seller verticals — listing management, fulfilment, earnings, auctions, import, analytics and wallet/payout primitives — but it does not yet have a coherent seller operating system.

The central defect is a source-of-truth split:

1. The registered backend aggregate is `backend/api/src/routes/sellerHub.ts:14`, mounted from `backend/api/src/index.ts:18564`.
2. `frontend/src/services/sellerHubApi.ts:37` correctly wraps that aggregate.
3. Production `SellerHubScreen.tsx` never imports or calls that service. At `SellerHubScreen.tsx:145` it fetches at most 100 listings (`{ limit: 100 }`); at `:175–193` it derives counts, views and listed value on-device; at `:199–265` it derives "Needs you" from listing/trust data only.
4. A second `/seller-hub/overview` implementation exists in `backend/api/src/routes/listings.ts:4179`, but `registerListingRoutes` is not imported or registered by baseline `index.ts`. It is dormant duplicate code, not presently a live duplicate-route collision.

This produces two P0 outcomes:

- **Sellers with more than 100 listings receive incomplete "Active," "Sold," "Views" and "Listed value" figures presented as totals** (`SellerHubScreen.tsx:145` — `{ limit: 100 }` with no cursor loop).
- **Bulk inventory operations use parallel per-item requests** (`InventoryManagementScreen.tsx:295–297`, `339`) and can partially commit on the server while the client rolls the entire batch back visually, turning an ambiguous outcome into a simple error.

The flagship direction is a task-first mobile command centre backed by canonical projections and ledger/order truth. It must answer, in order: **what needs action, by when, what money is affected, and what changed**. It must not become a larger grid of generic KPI cards.

### 1.1 Maturity scorecard

| Capability | Score | Evidence-based verdict |
|---|---:|---|
| Seller navigation | 3.0/5 | Real Sell, Orders, Inbox, Inventory, Analytics, Auctions, Wallet and Verification destinations; no canonical task handoff |
| Authoritative overview | 1.5/5 | Backend aggregate and typed client exist, but production screen bypasses both and truncates at 100 listings (`SellerHubScreen.tsx:145`) |
| Inventory operations | 3.0/5 | Search/filter/sort and bulk actions exist; pagination, batch receipts and ambiguous-outcome recovery do not (`InventoryManagementScreen.tsx:98, 295–297`) |
| Fulfilment | 3.5/5 | Canonical capability resolver and integrated/manual distinction are strong; Hub does not surface real dispatch work |
| Earnings/payout truth | 3.5/5 | Dedicated wallet source, reserve/pending breakdown and capture protection exist; cross-surface reconciliation is incomplete |
| Analytics correctness | 2.0/5 | Owner-scoped API exists; "revenue" is sold listing asking price, `1y` is unsupported, fallback loses period semantics |
| Catalogue operations | 3.0/5 | Import batches appear; partial import failure is hidden and extraction remains placeholder (Report 16) |
| Realtime/cache convergence | 1.5/5 | Screens load independently; no seller-domain event/invalidation matrix |
| Offline/unknown outcome | 1.5/5 | Offline banners exist; durable mutation outbox/reconciliation does not |
| Observability/SLOs | 1.5/5 | Some telemetry exists; no projection freshness or task-resolution SLO |
| Native composition | 2.5/5 | Individual rows show restraint, but first viewport leads with verification + 2×2 metrics + quick actions before work |
| **Overall** | **2.6/5** | **Substantial components, fragmented operating model** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Ownership and registration

| Evidence | Lines | What it proves | Severity |
|---|---|---|---|
| `index.ts` | 262, 18564 | `registerSellerHubRoutes` is imported and registered | Foundation |
| `sellerHub.ts` | 14–137 | Registered aggregate reads inventory, paid orders, pending offers, 30-day order subtotal and listing issues | Foundation |
| `sellerHubApi.ts` | 10–42 | Typed `SellerHubOverview` client exists | Foundation |
| `SellerHubScreen.tsx` | 24 | Imports `fetchUserListingsFromApi` from `listingsApi`, NOT `sellerHubApi` | **P0** |
| `listings.ts` | 113, 4179 | Extracted listing route contains a duplicate aggregate | P1 debt |
| `index.ts` | — | No `registerListingRoutes` import/call in baseline | Correction |

**Critical quote — the bypass (`SellerHubScreen.tsx:24`):**
```ts
import { fetchUserListingsFromApi, ListingApiItem } from '../services/listingsApi';
```
The screen imports `fetchUserListingsFromApi` from `listingsApi`, not `fetchSellerHubOverview` from `sellerHubApi`. The canonical aggregate at `sellerHub.ts:14–137` is registered, wrapped, and never called by the production screen.

### 2.2 Hub correctness

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `SellerHubScreen.tsx` | 145 | `fetchUserListingsFromApi(currentUser.id, { limit: 100 })` — capped at 100, no cursor | **P0** |
| `SellerHubScreen.tsx` | 175–193 | Totals and listed value are reductions over that bounded page | **P0** |
| `SellerHubScreen.tsx` | 196–198 | Comment: "We do not fabricate ship/offer tasks because no order/offer data source exists here" — honest but means tasks are incomplete | P1 |
| `SellerHubScreen.tsx` | 199–265 | Tasks know listing/trust state only; no shipments, offers, disputes, auction payment or payout holds | P1 |
| `SellerHubScreen.tsx` | 273–319 | "Recent activity" sorts on listing `createdAt`, not status transition time | P1 |
| `SellerHubScreen.tsx` | 489 | "You're all caught up" shown when tasks array is empty — false when order/offer sources aren't checked | **P0** |
| `sellerHub.ts` | 44–52 | Ship task calls order creation timestamp `oldestDueAt`; this is not a contractual ship-by deadline | P1 |
| `sellerHub.ts` | 73–86 | `grossSalesGbp` is order subtotal for paid/shipped/delivered, not net earnings | P1 |

**Critical quote — the 100-listing cap (`SellerHubScreen.tsx:142–146`):**
```ts
  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const res = await fetchUserListingsFromApi(currentUser.id, { limit: 100 });
      setListings(res.items);
```
`{ limit: 100 }` — no cursor, no pagination loop. A seller with 500 listings sees counts derived from the first 100 only. "Active: 47" is presented as a total but is actually "Active in first 100." This is a P0 truth defect for any seller with more than 100 listings.

**Critical quote — false "all caught up" (`SellerHubScreen.tsx:487–491`):**
```tsx
            <View style={styles.allCaughtUp}>
              <Text style={[styles.allCaughtUpText, { color: colors.textMuted }]} maxFontSizeMultiplier={1.3}>
                You're all caught up
              </Text>
            </View>
```
Shown when `tasks.length === 0`. But tasks are derived from listing/trust data only (`SellerHubScreen.tsx:199–265`). No orders, offers, shipments, disputes, or payout holds are checked. A seller with 5 unshipped orders sees "You're all caught up" because the screen can't see orders. This is a P0 false reassurance.

### 2.3 Analytics correctness

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `sellers.ts` | 259–352 | API is owner-only and supports `7d`, `30d`, `90d` | Foundation |
| `SellerAnalyticsScreen.tsx` | 261, 420 | UI includes `1y`; backend rejects it | P1 |
| `sellers.ts` | 282–303 | "Revenue" sums `listings.price_gbp_minor` for sold listings, not settled order consideration/ledger lines | **P0** |
| `SellerAnalyticsScreen.tsx` | 271–286 | Endpoint failures degrade to listing data | P1 |
| `SellerAnalyticsScreen.tsx` | 311–336 | Fallback revenue uses all loaded sold listings with no period filter; conversion mixes period sold count with cumulative views | **P0** |
| `SellerAnalyticsScreen.tsx` | 398–400 | Activity chart measures listing creation, not business performance | P1 |

### 2.4 Inventory mutation integrity

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `InventoryManagementScreen.tsx` | 98 | `fetchUserListingsFromApi(currentUser.id, { limit: 200 })` — capped at 200, no cursor | P1 |
| `InventoryManagementScreen.tsx` | 186–211 | Single pause/resume is optimistic with no entity version/reconciliation token | P1 |
| `InventoryManagementScreen.tsx` | 280–315 | Bulk pause/resume uses `Promise.all(ids.map((id) => patchListingOnApi(id, ...)))` (line 295–296) — independent PATCH calls | **P0** |
| `InventoryManagementScreen.tsx` | 336–353 | Bulk delete uses `Promise.all(ids.map((id) => deleteListingOnApi(id)))` (line 339) — same partial-commit problem | **P0** |

**Critical quote — bulk pause partial commit (`InventoryManagementScreen.tsx:294–298`):**
```ts
      await Promise.all(
        ids.map((id) => patchListingOnApi(id, { status: nextStatus as 'active' | 'paused' }))
      );
      show(`${ids.length} listing${ids.length === 1 ? '' : 's'} ${resume ? 'resumed' : 'paused'}`, 'success');
```
`Promise.all` — if 3 of 5 PATCH calls succeed and the 4th throws, `Promise.all` rejects. The catch block (line 301) reverts ALL rows locally. But 3 listings are already paused on the server. The client shows them as not paused; the server has them paused. This is a split-brain state with no reconciliation.

### 2.5 Strengths to preserve

| Evidence | Lines | Finding |
|---|---|---|
| `SellerFulfilmentScreen.tsx` | 140–152 | Dispatch eligibility comes from `resolveCapabilities`, not an ad hoc status check |
| `SellerFulfilmentScreen.tsx` | 154–169 | Integrated/manual/local modes derive from immutable fulfilment snapshot |
| `SellerFulfilmentScreen.tsx` | 289–307 | Carrier handoff assertion does not pretend to be a carrier scan |
| `SellerEarningsScreen.tsx` | 63–96 | `getSellerWalletBalances` is the screen source for available/pending/reserve |
| `SellerEarningsScreen.tsx` | 53 | Sensitive financial screen uses capture protection |

---

## 3. End-to-end flow traces

### 3.1 Current top-down path

```text
SellerHub route → SellerHubScreen
  → fetchUserListingsFromApi(userId, limit=100)     [SellerHubScreen.tsx:145]
  → fetchImportBatches (after listings)              [SellerHubScreen.tsx:153-159]
  → useSellerTrust
  → on-device totals/tasks/activity                  [SellerHubScreen.tsx:175-265]
  → metric grid → quick actions → Needs you → specialist links
  → "You're all caught up" if no listing/trust tasks [SellerHubScreen.tsx:489]
```

### 3.2 Available but unused bottom-up path

```text
listings + orders + listing_offers
  → SQL in routes/sellerHub.ts:14-137
  → GET /seller-hub/overview
  → sellerHubApi.fetchSellerHubOverview
  → no production screen consumer
```

### 3.3 Target path

```text
domain writes
  → transactional outbox
  → seller projection consumers
  → seller_tasks + seller_overview + seller_money_projection
  → versioned Seller OS API
  → normalized mobile cache
  → Seller Home/specialist screens
  → idempotent command receipt or unknown-outcome reconciliation
  → domain event → sequence invalidation
```

---

## 4. August 2026 benchmark research

### 4.1 eBay Seller Hub — August 2026 updates

| Source | Finding | ThryftVerse application |
|---|---|---|
| [EcommerceBytes — eBay 2026 Holiday Selling Playbook, 22 Aug 2026](https://www.ecommercebytes.com/2026/08/22/ebay-publishes-2026-holiday-selling-playbook-reviews-new-selling-features/) | eBay adding Listings and Order summary modules to Overview page. "Overview is going to become a more useful starting point for your day." New combined shipping tag, 4×6 label printer support, consolidated print jobs | ThryftVerse's Seller Hub should follow eBay's direction: Overview as task-first starting point with actionable order/listing summaries, not vanity metrics |
| [Value Added Resource — eBay Holiday 2026 Webinar](https://www.valueaddedresource.net/ebay-holiday-2026-webinar-handbook/) | "Listings and Orders summary modules to Seller Hub Overview over the next few weeks, providing direct access to drafts, offers, bids and orders ready to ship." Active Listings getting recommendations including "prompts to respond to buyer messages and offers. Some actions can be completed without leaving the page" | ThryftVerse should surface actionable tasks (orders to ship, offers to respond to) directly in the Hub with inline actions, not just navigation links |
| [Ecomli — eBay Seller Hub Guide 2026](https://ecomli.com/blog/ebay-seller-hub-guide-2026) | "Overview is your morning glance: today's sales, orders awaiting shipment, listings ending soon, recent feedback, account funds... the orders awaiting shipment count — this is your shipping queue, and the moment it climbs faster than you can clear it, your handling time metric starts slipping" | ThryftVerse's Hub should prioritize orders awaiting shipment as the dominant task, not listing counts |
| [eBay Seller Hub Help](https://www.ebay.com/help/selling/selling-tools/seller-hub?id=4095) | Hub consolidates orders, listings, performance, payments and reports; Overview summarizes tasks, orders, listings and feedback | Home must be cross-domain triage, not a listings dashboard with links |
| [eBay Payments tab](https://www.ebay.com/help/selling/selling-tools/seller-hub/seller-hub-payouts-tab?id=4798) | Distinguishes Available, Processing, On hold, Completed, Open and Released and connects fees/claims/payouts | Money needs state, reason and action — not one "earnings" number |

### 4.2 eBay seller performance

| Source | Finding | ThryftVerse application |
|---|---|---|
| [eBay seller performance](https://www.ebay.com/help/selling/selling/monitor-service-metrics?id=4785) | Some metrics are hidden at insufficient volume and service metrics compare similar profiles | Trust metrics require sample thresholds, windows and cohort semantics; null stays null |

The benchmark informs information architecture, not visual copying.

---

## 5. User psychology, JTBD and trust

### 5.1 Jobs to be done

1. **Triage:** tell me what costs a sale, money or trust if ignored.
2. **Fulfil:** move paid order to carrier evidence safely.
3. **Control inventory:** know what is live, blocked, stale or underspecified.
4. **Understand money:** explain every pound through holds, fees and payout.
5. **Improve:** show changes and plausible actions without pretending correlation is causality.
6. **Recover:** when a network/provider fails, state what is known and reconcile safely.

### 5.2 Cognitive/trust risks

- Loss aversion makes shipment deadlines and holds dominant. Rank only real consequences.
- "Pending" without owner/condition/next event feels broken.
- Red everywhere creates alarm fatigue; reserve danger for genuine breach/money risk.
- "You're all caught up" is harmful when the source cannot see orders/offers (`SellerHubScreen.tsx:489`).
- Bulk actions require item receipts; generic success/error cannot communicate partial commitment (`InventoryManagementScreen.tsx:295–297`).

---

## 6. Strict anti-AI flagship specification

### 6.1 First viewport

```text
Seller Hub

[one critical task, only if real]
Ship "Vintage jacket" by Tue 14:00      Review →
3 more tasks

£428 available   £91 processing   £35 held

Orders requiring action (2–3 rows)
```

When no urgent task exists, money/pulse may rise. Verification is a task only when it gates a real capability.

### 6.2 Composition

- One dominant non-media panel above fold.
- Flat task rows with item identity, due time and consequence.
- No rounded card for every module; specialist areas are navigation, not a dashboard silhouette.
- One title; no "Seller Hub / Your business / Overview / Summary" repetition.
- 4–6 useful rows when no critical panel, 3 when present.
- Asking-price inventory value must not resemble available cash.
- Listing media anchors operational rows.

### 6.3 Motion/accessibility

- 160–220 ms task insertion/reorder only; no mount cascade.
- Confirmation haptic only after authoritative success.
- Reduced motion makes changes immediate and announces them politely.
- Task label includes entity, action, deadline, consequence and state.
- Dynamic Type expands rows; it must not hide action.
- Currency state is communicated in text, not colour alone.
- Bulk selection exposes count and per-item completion.

### 6.4 Full state matrix

| State | Required rendering |
|---|---|
| Loading | Skeleton matching task + money + rows |
| Populated | Freshness, prioritized tasks, money posture, drill-down |
| New seller | One setup/first-listing path; no fabricated insights |
| No tasks | Say so only if all task sources are fresh |
| Partial | Keep available modules; identify failed source and slice retry |
| Offline cached | Read-only with age; disable unsafe mutations |
| Error no cache | Recovery plus correlation ID after repeated failure |
| Submitting | Disable duplicate command |
| Success | Apply authoritative receipt/sequence |
| Rejected | Restore exact snapshot and typed remedy |
| Unknown | "Checking result"; reconcile by idempotency key before retry |
| Compliance blocked | Explain evidence-backed gate and real resolution route |

---

## 7. Target source-of-truth and contracts

### 7.1 Domain boundaries

| Domain | Owns | Must not own |
|---|---|---|
| Listings | listing lifecycle/media completeness | revenue/payout |
| Orders | payment-to-delivery/return/dispute state | marketing analytics |
| Fulfilment | option snapshot, label, carrier evidence | payment truth |
| Ledger/Payments | postings, holds, reserves, payouts | asking value |
| Offers | offer state/expiry | revenue before payment |
| Auctions | bid/lifecycle/result | payout release |
| Trust | evidenced gates/measurements | frontend defaults |
| Seller projection | denormalized reads/tasks | new domain truth |

### 7.2 Contracts

```ts
interface SellerTask {
  id: string;
  sellerId: string;
  type: string;
  source: { domain: string; entityType: string; entityId: string; version: number };
  priority: 'critical' | 'high' | 'normal' | 'low';
  reasonCode: string;
  dueAt: string | null;
  consequence: { kind: 'money' | 'buyer' | 'trust' | 'listing'; amountGbpMinor?: number } | null;
  actions: Array<{ command: string; route: string; enabled: boolean; disabledReason?: string }>;
  state: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'superseded';
  projectionSequence: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface SellerOverviewV2 {
  schemaVersion: 2;
  generatedAt: string;
  projectionSequence: string;
  freshness: Record<string, { asOf: string; state: 'fresh' | 'stale' | 'unavailable' }>;
  topTask: SellerTask | null;
  taskSummary: Record<string, number>;
  money: { currency: 'GBP'; availableMinor: number; processingMinor: number; heldMinor: number; nextPayoutAt: string | null };
  businessPulse: {
    from: string; to: string; timezone: string;
    grossSalesMinor: number | null; refundsMinor: number | null;
    feesMinor: number | null; netSalesMinor: number | null;
    completeness: 'complete' | 'partial';
  };
}
```

Minimum events: `order.paid`, `order.dispatch_due_changed`, `carrier.scan_received`, `resolution.opened`, `listing.activated|paused|deleted|quality_blocked`, `offer.received|expired|resolved`, `auction.payment_due|settled`, `payout.hold_created|released|failed|paid`, `catalog_import.awaiting_seller|failed`, `seller.compliance_gate_changed`.

Each carries event ID, aggregate version, seller ID, correlation/causation ID and schema version. Consumers are idempotent and reject stale aggregate versions.

### 7.3 Cache

- Overview stale-while-revalidate; non-money max stale 5 minutes.
- Money revalidates on focus and is never optimistic.
- Tasks cache by filter + projection sequence; realtime invalidates sequence.
- Offline snapshot encrypted; exclude payout destination and buyer-address detail.

---

## 8. Complete mutation state machines

```text
idle → validating → submitting(key, expectedVersion)
  → accepted(receipt,newVersion)
  → rejected(code,currentVersion)
  → transport_lost(unknown)
unknown → reconcile(GET command by key)
  → accepted | rejected | processing | safe_retry(same key)
```

Bulk operations become one durable server command:

```ts
POST /seller/listings/batch-commands
{ idempotencyKey, command: 'pause', items: [{ listingId, expectedVersion }] }

{ batchId, state: 'complete' | 'partial' | 'processing',
  results: [{ listingId, state: 'applied' | 'rejected' | 'unknown', code?, newVersion? }] }
```

If atomicity is not available, `partial` is a first-class truthful result. The UI never restores a committed row because a sibling failed.

---

## 9. Failure and threat analysis

| Failure/threat | Current exposure | Required control |
|---|---|---|
| Truncated totals | `SellerHubScreen.tsx:145` — 100 cap; `InventoryManagementScreen.tsx:98` — 200 cap | Server aggregates + pagination metadata |
| Partial bulk commit | `InventoryManagementScreen.tsx:295–297, 339` — `Promise.all` independent mutations | Batch receipt + reconciliation |
| False "all caught up" | `SellerHubScreen.tsx:489` — tasks from listing/trust only | Cross-domain task projection |
| Stale projection | No sequence/freshness | Checkpoints + gap recovery |
| Cross-seller access | Analytics check is good | Derive actor from token everywhere |
| Metric manipulation | Raw engagement feeds analytics | Provenance/bot filtering/sample thresholds |
| Money misstatement | `sellers.ts:282–303` — asking price called revenue | Order/ledger facts + glossary |
| Deadline error | `sellerHub.ts:44–52` — creation timestamp as due | Owner-domain ship-by timestamp |
| Provider split-brain | Response may be lost | Provider ref + idempotency + status lookup |
| PII exposure | Operations on device | Least-data projection, encrypted cache, redacted logs |
| Insider mutation | Privileged actions | Immutable actor/reason/before-after audit |

---

## 10. SLOs, SLIs and observability

| Journey | SLI | Target |
|---|---|---:|
| Seller Home | successful fresh reads | 99.95% monthly |
| Overview latency | p95 / p99 | ≤350 ms / ≤900 ms |
| Task freshness | commit → visible p95/p99 | ≤2 s / ≤10 s |
| Money freshness | ledger commit → overview p99 | ≤5 s |
| Command mismatch | unexplained receipt/UI divergence | <1/100k |
| 200-item batch | final receipt p99 | ≤15 s |
| Due-task creation | before contractual threshold | 99.99% |
| Unknown reconciliation | resolved p99 | ≤60 s |

Instrument projection age/completeness, task impression/open/resolution, command accepted/rejected/unknown/reconciled, projection gaps/lag, batch item outcomes and daily ledger/order/listing mismatch. Never log buyer address, message body, bank data, full labels or raw media URLs.

---

## 11. Migration, flags, compatibility and rollback

### Flags

```text
seller_overview_v2_read
seller_overview_shadow_compare
seller_task_projection
seller_batch_commands
seller_analytics_ledger_v2
seller_home_task_first_ui
```

### Phase 0 — truth audit

- Keep `sellerHub.ts` as registered owner; remove dormant duplicate only after listing-route extraction plan.
- Add route-registration contract test.
- Define metric glossary and real deadline owners.
- Suppress "all caught up" (`SellerHubScreen.tsx:489`) unless all sources are fresh.

### Phase 1 — integrate existing aggregate

- Wire screen/service behind `seller_overview_v2_read`.
- Add schema version, freshness and source completeness.
- Shadow-fetch old/new and log delta; render old initially.
- Fallback must be labelled partial, never silently merged.

**Rollback:** disable read flag; additive schema requires no data rollback.

### Phase 2 — task projection

- Add `seller_tasks`, projection checkpoints and event idempotency.
- Produce cross-domain tasks and `/seller-hub/tasks` cursor API.
- Add sequence-aware realtime invalidation.
- Projection is rebuildable; no UI dual-write.

### Phase 3 — mutation/analytics correctness

- Add batch command/receipt endpoint.
- Derive analytics from settled order/ledger facts.
- Align period enum end-to-end or remove `1y`.
- Remove unwindowed fallback revenue/conversion.

### Phase 4 — authored native composition

- Task first, money second, pulse third.
- Consolidate duplicate inventory/navigation sections.
- Device captures, Dynamic Type, screen reader, reduced motion and low-end Android profiling.

---

## 12. File/owner/dependency map

| Work | Canonical files | Owner/dependency |
|---|---|---|
| Ownership cleanup | `routes/sellerHub.ts`, `routes/listings.ts`, `index.ts` | API Platform; registration tests |
| Overview v2 | `routes/sellerHub.ts`, `services/sellerHubApi.ts` | Commerce + Mobile |
| Task schema/projector | migrations, outbox consumers/workers | Commerce/Data |
| Seller Home | `SellerHubScreen.tsx` | Seller Experience |
| Batch command | listings owner + `InventoryManagementScreen.tsx` | Listings Platform |
| Analytics facts | `routes/sellers.ts`, `commerceApi.ts`, `SellerAnalyticsScreen.tsx` | Data + Payments |
| Money narrative | wallet API + `SellerEarningsScreen.tsx` | Payments |
| Fulfilment tasks | order/fulfilment routes + projector | Logistics |
| Cache/sequence | mobile cache + realtime client | Mobile Platform |

---

## 13. Test and release gates

- Exactly one registered `/seller-hub/overview`.
- Sellers with 0, 1, 100, 101 and 10,000 listings get exact totals.
- Revenue reconciles to negotiated sale, refund, fee and hold fixtures.
- Every task creates/updates/resolves/supersedes deterministically.
- Replayed/out-of-order events never regress projection.
- Batch partial failure returns durable item receipts; same-key retry is idempotent.
- Cross-seller auth tests pass.
- First viewport measured on small phone and large text; no dock occlusion.
- Offline age/read-only posture and unknown outcome survive app restart.
- VoiceOver/TalkBack order is task → consequence → action → money.
- Shadow aggregate delta is understood; ledger reconciliation has zero unexplained penny mismatches.
- Projection lag alert, kill switch and support playbook are live before rollout.

---

## 14. Explicit non-goals

- Rebuilding specialist screens inside Seller Home.
- Scores, streaks or arbitrary seller gamification.
- AI advice before authoritative facts and calibrated evaluation.
- Desktop accounting density on mobile; mobile owns triage and bounded action.

---

## 15. Decisions requiring product, legal/trust and operations input

1. Define revenue: GMV, item subtotal, net sales or recognized platform revenue.
2. Assign every contractual deadline to an owner domain.
3. Decide batch atomicity versus explicit partial receipts.
4. Define metric sample/cohort thresholds.
5. Approve local cache retention and data classification.
6. Define web handoff for complex reconciliation without losing task identity.

---

## 16. Priority decision summary

| Priority | Decision |
|---:|---|
| **P0** | Stop treating first 100 listings as total truth (`SellerHubScreen.tsx:145`); integrate registered overview |
| **P0** | Replace `Promise.all` bulk mutations with durable batch receipts (`InventoryManagementScreen.tsx:295–297, 339`) |
| **P0** | Define revenue/earnings from orders/ledger, not asking price (`sellers.ts:282–303`) |
| **P0** | Suppress false "all caught up" when order/offer sources aren't checked (`SellerHubScreen.tsx:489`) |
| **P1** | Build cross-domain tasks with due/consequence/action |
| **P1** | Add projection sequence, freshness and unknown-outcome reconciliation |
| **P1** | Re-author first viewport around work and money, not KPI cards |

---

## 17. Final assessment

**The department is not blocked by missing screens; it is blocked by fragmented ownership and misleading aggregation semantics.** The production screen bypasses the canonical aggregate (`SellerHubScreen.tsx:24` — imports `listingsApi`, not `sellerHubApi`), truncates at 100 listings (`SellerHubScreen.tsx:145`), shows false "all caught up" when it can't see orders (`SellerHubScreen.tsx:489`), and uses `Promise.all` for bulk mutations that can partially commit (`InventoryManagementScreen.tsx:295–297`). Analytics calls asking price "revenue" (`sellers.ts:282–303`). Preserve the strong fulfilment capability model and wallet truth, integrate the existing aggregate, then evolve it into a sequenced task projection. Per eBay's August 2026 Seller Hub updates, Overview is becoming "a more useful starting point for your day" with task-first order/listing summaries — ThryftVerse should follow the same direction. Do not add more cards: make Seller Hub the calm, authoritative place where a seller can act without wondering which screen is true.
