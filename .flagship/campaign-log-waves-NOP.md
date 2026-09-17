# Campaign Log — Waves N, O, P (commerce truth → user-surface upgrades → live broadcast)

**Date:** continued from Waves A–M
**Scope:** report→safety bridge, authenticity exposure, saved-search alerts, holiday mode,
live-lot timing, CoOwn hub restructure, profile/verification IA, auction CTA, group-chat
decomposition, live broadcast wiring.

---

## Wave N — contract truth (5 slices, all landed)

| Slice | Shipped |
|-------|---------|
| Report→safety | All 3 report endpoints write `safety_notice` atomically; `GET /users/me/reports` reporter-outcome surface; reason-vocab CHECK bug fixed (migration 291) |
| Authenticity | `GET /orders/:id/authentication` party-gated honest 3-state; `GET /authentication/certificates/:id` public verify; listing contract reads real Redis state |
| Saved-search alerts | `saved_searches` table (289) + CRUD + server matcher on activation + real push + Browse deep-link; login hydrate / logout clear |
| Holiday mode | `holiday_mode_until` (290) + `holiday_mode_since` (293); hard-pause 409 `SELLER_AWAY` on orders/offers/counters; deadline shift `GREATEST(paid_at, until)` |
| Live-lot timing | Server `closesAt`, 5s auto-close sweep, anti-snipe +30s cap 5, `lot.extension` events, real frontend countdown |

**Bonus find:** `migrate.ts` applied `*_down.sql` forward — fixed (filtered out).

### Wave N adversarial review → 5 P1s → all fixed + verified closed
1. Live-lot `/settle` priced from `high_bid_minor` frozen at close (was list price).
2. Auto-close re-verifies `due_now` on DB clock inside the row lock (`LOT_NOT_DUE`).
3. Offer author cannot accept own current offer (`OFFER_AUTHOR_CANNOT_ACCEPT`).
4. Buy-now + auction-bid routes enforce `SELLER_AWAY`.
5. Live-lot self-bid → `SELLER_RESTRICTED`; floor `max(start, high_bid + max(increment,1))`; legacy fallback via `listings.seller_id`.
6. Offer-accept `SELLER_AWAY` gate; sweep `failedLots` logged with `sessionId`.

## Wave O — user-flagged surface upgrades

| Surface | Shipped |
|---------|---------|
| CoOwnHub | Tabs pinned under header (were mid-page sticky); `+` Issue in header; bottom summary removed → real infinite scroll; **backend `cursor`+`search` added** (zod was silently stripping both) |
| Profile | Avatar camera overlay + cover edit target removed; rating row removed from bio (own + public); reviews stay via tab |
| Verification IA | Two settings entries → one row inside Edit Profile; search synonyms route verify/kyc/dac7 |
| Auction CTA | Root cause: `displayMode:'both'` giant dual string in `flexShrink:0` cluster pushed CTA off-screen → primary unit + muted subordinate, bounded clusters, stacks at fontScale>1.2, a11y announces both |
| EditGroup | 881→281 LOC orchestrator (5 hooks + 5 components), matching GroupChatInfo pattern |

### Wave O review → P1 + fixes (all inline)
- `loadData` dep-thrash (append→refetch→truncate loop) → refs + debounced search.
- Error/empty render tabs; watchlist fallthrough; stable instrumentRow keys.
- Expired offer → 410 (was unreachable → 409).
- Server-side `search` on `/co-own/assets`.

## Wave P — live broadcast (in progress)

Archaeology found the live path was structurally dead: no `registerGlobals()`,
no publish API, no viewer video renderer, and **`live.session:*` realtime topics
were rejected by authorization** (fixed: live/ending → any authed user,
draft/backstage → host-only, with tests).

- Backend hardening landed: streamProvider→config alignment, truthful viewer-count
  emission (set size, not stale column), ended-session discovery + `recordingEnabled`
  serialized, orphan-room re-create on `/start`, `POST /webhooks/livekit` signature-verified.
- Migration 296: widened `chk_session_status` to include `'created'` (provider emits
  it; CHECK would have 500'd `POST /streaming/sessions`) + rebuilt partial index.
- In flight: host publish + viewer render (native LiveKit), scheduled shows +
  `live_started` go-live push + discovery enrichment (backend), pg_trgm typo
  tolerance (also revives silently-dead `reviewIntegrity` SIMILARITY), bulk edit
  via batch-command.

## Policy-gated backlog (needs user decision)

- **Promoted listings**: pricing model, budget/charge mechanics, disclosure copy,
  interaction with disabled `VISIBILITY_BOOST` gates.
- **Reach suppression**: `visibility_restriction` enforcement has a mature
  recommendation/case graph but **zero execution** — scammers keep full distribution.
  Needs policy on auto-limit vs review-queue, demote vs delist, appeal semantics.

## Known baseline failures (pre-existing, documented)

- Frontend: `ClipThumb.tsx` animated-scroll checker, 2× `diagImport` — 3 total.
- Backend: `backendWorkflowClosure` × 2 (creator publish idempotency, upload
  finalization `db.query`) — environmental.

## Wave P convergence + adversarial-review fix wave (landed)

All seven Wave P slices landed and integrated: live media stack (registerGlobals,
local withLiveKit plugin, host camera/mic publish, viewer VideoView — needs EAS
dev-client rebuild to run), streaming backend hardening, scheduled shows +
reminders + live_started fan-out (both ends), session-list discovery enrichment,
pg_trgm typo tolerance, bulk edit batch command, flat-fee promoted listings,
reach-suppression executor.

My integration pass wired promoted blend + reach filter into searchExtended
(post-cache, so billing/impressions settle per request) and reach adoption into
all four feed queries; suspended sellers' promotions never serve.

Adversarial review found real P1s — all fixed:

- `/feed/following` dead since Aug 22 (`uf.followee_id` — real column is
  `following_id`): route 500'd on every call.
- Viewer token gate: `/streaming/sessions/:roomId/token` now requires
  `status IN ('live','ending')` — was allowing joins to draft/backstage/ended.
- Promotion billing correctness: no charge for unservable inventory (sold/
  paused/non-normal reach), serialized ledger-account lock vs concurrent
  overdraw, buyer-filter passthrough, exhausted→active resume.
- `listings.sold_at` phantom column removed from production SQL (never existed;
  status='sold' is the marker) — `/feed/trending` would have 42703'd.
- Risk-gate escapes (agent db7ab89f): batch resume now evaluates publish risk,
  PATCH transitions validated (risk_pending has no owner-reachable exits → 409
  LISTING_STATUS_HELD), →active runs evaluateRisk (deny→403, non-allow→
  risk_pending + in-tx live-lot cancellation), moderation on text edits in both
  single PATCH and bulk edit, bid path rejects non-{active,paused} listings,
  visibility restriction cancels biddable lots.
- Reach exclusion extension (agent 38918d92): browse, related, recommendations,
  visual search, storefronts, seller profile, auctions — suspended excluded,
  limited ×0.3. Every order-bind path (orders, payment intents, auction bids,
  buy-now, settlements, offers incl. Smart Sell auto-accept) now checks
  getSellerReach in-transaction → 409 SELLER_RESTRICTED on suspended.
- Click analytics end-to-end: `promotionId` stamped on promoted units
  (feed + search), `POST /promotions/:id/click` endpoint (per-viewer dedupe),
  `recordPromotionClick` wired into both ProductCard press paths
  fire-and-forget. The `clicks` stat was structurally dead before this.
- Fan-out hardening: combined followers∪reminders recipient cap, reminder
  lookup inside try/catch, `startedAt` in live_started idempotency keys
  (restarts re-notify).
- Realtime auth: host can't subscribe to ended/failed session topics.
- Auto-close gated to host/admin.

Verified: backend tsc clean · frontend tsc clean · 197 focused tests pass
(reach 19+16, risk 13, batch 9, bids 12, lots 23, streaming 10+6, auctions 38,
sellerAway 14, promotions 22, search 7, recommendations 2). Migrations 296–302
sequential with paired downs. 2 pre-existing backendWorkflowClosure failures
confirmed at baseline (environmental — no local Redis/Postgres).

## Package-research verdict (user-asked)

Audited charts/order-books/financial-layer against current OSS landscape:
- Charts: existing stack is optimal — hand-rolled Skia components
  (CoOwnCandleChart/DepthChart/OrderBook ladder) + victory-native 41.26
  already installed. rn-tradingview/financial-charts/liveline-native are
  exchange-coupled and would degrade the anti-AI visual language.
- Matching engine: correctly in-house — coOwn.ts is a real CLOB (price-time
  priority, FOR UPDATE locks, self-trade prevention, atomic ledger settlement).
  In-memory engines (nodejs-order-book, hft-limit-order-book, @stoxxi/orderbook)
  can't span the Postgres transaction; would need journaling+reconciliation
  for marginal gain at marketplace volume. Only gap vs libs: no IOC/FOK/
  post-only time-in-force (~30 LOC if ever wanted).
- Money math: already exact — Postgres NUMERIC + frontend BigInt minor units.
- No package gaps found. Financial layer is architecturally sound.
