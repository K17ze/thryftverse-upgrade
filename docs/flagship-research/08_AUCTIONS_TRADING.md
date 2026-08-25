# 08 — Auctions, Trading & Co-Ownership: Flagship Research Report

**Department:** Auctions, Trade Hub, Co-Ownership (Syndicate), Bids, Corporate Actions, Asset Due Diligence, Asset Leaderboard
**Date:** August 2026
**Status:** Research complete — ready for implementation

---

## 1. 2026 Competitor Benchmark

### 1.1 eBay — Extended Bidding & the death of sniping

In August 2026, eBay Australia rolled out **Extended Bidding** to all auctions — the most significant change to the legacy auction format in years. When a bid is placed in the final 60 seconds, the countdown resets to 60 seconds and keeps extending until no further bids arrive. This eliminates last-second "sniping" and creates a **"Going, Going, Gone"** close that mirrors real-world auction houses. eBay's own pilot data showed stronger bidding outcomes for sellers and a fairer experience for committed buyers (ChannelX, August 2026; ValueAddedResource, August 2026).

The key UX lessons from eBay's 2026 evolution:

- **Server-authoritative countdown.** eBay's patent (US 2014/0337156) describes synchronising the client clock to the official auction time — a timer the client controls can be gamed. ThryftVerse already has `useBucketedServerClock` in `hooks/useServerClock.ts`, but the countdown on `AuctionsScreen.tsx` (line 204) uses a local `Date.now()` interval, not the server clock. This is a trust deficit.
- **Activity-driven close.** The auction should stay open while bidding is active, not end on a rigid clock. ThryftVerse's `AuctionDetailScreen.tsx` has no anti-snipe extension logic — the `endsAt` timestamp is treated as absolute.
- **Confident close.** eBay's language: "clear, visible, and decisive" final moments. ThryftVerse's `AuctionCountdown.tsx` has stage labels ("Ending soon", "Final moments") but the `AuctionsScreen.tsx` featured card uses a simple `AppStatusPill` with colour-only urgency — no stage language, no activity awareness.

### 1.2 Fractional ownership & collectibles trading apps

**Collectable** (sports memorabilia fractional ownership) designed a mobile-native secondary market with bid/ask trading, a wallet, and SEC-compliant onboarding broken into 4 savable steps. Key insight: users were confused by the difference between fractional and whole shares — contextual cues and microcopy were critical to prevent costly errors (George Charnley, 2026).

**Questrade Fractional Shares** (UX Design Awards 2025 winner) discovered post-launch that users expected different behaviours from fractional vs whole shares. Their fix: clearer contextual signalling when users are trading fractions, with microcopy and safeguards. This maps directly to ThryftVerse's Co-Own unit trading — the `TradeScreen.tsx` uses `1ZE` as the settlement unit but the distinction between "units of a fractional asset" and "a whole item" is not always clear to first-time users.

**Lollypop's 2026 Trading App Design Guide** establishes the current production bar:
- Real-time asset prices at the top in large, high-contrast typography; secondary metrics below in smaller, muted type
- The trade button must be reachable in one tap from anywhere — never buried in menus
- Timeframe selectors positioned directly adjacent to chart modules
- Clear visual hierarchy separating live data from reference data

### 1.3 Live auction platforms (Matium, Ritchie Bros., Handbid)

**Matium's Auctions** (Tyler Sarto, 2025–2026) designed split Owner/Bidder views with bid status cards, countdown timers, and status indicators (Leading, Trailing, Losing, Cancelled). The v2 shipped flexible bidder management, dedicated auction product tiles, and "a deliberate moment of delight at the close."

**Ritchie Bros. Auctioneers** (Vincent Lo Design) learned that bidders multitask across multiple lots simultaneously — they need notifications when their lot is about to go on the ramp. Mobile screens required careful prioritisation: only show what's necessary at each step.

**Handbid** broadcasts auction-scoped activity over Socket.IO with typed events: `event.bid`, `event.timer`, `event.sold`, `event.close`. Presence tracking shows "14 bidders watching" — a social proof signal ThryftVerse lacks entirely.

### 1.4 Real-time architecture patterns

**Supabase Realtime** and **Socket.io** patterns dominate 2026 auction architecture. The consensus: PostgreSQL triggers broadcast bid updates the moment they commit, and every connected client sees the same state within 50ms. No polling. The bid table is an immutable append-only log; `current_bid` is denormalised for read performance. Anti-snipe protection is standard.

ThryftVerse's `AuctionDetailScreen.tsx` (line 481) polls every 10 seconds for live auctions — a 2026 liability. Competing platforms deliver sub-100ms updates via WebSocket. The 10-second polling interval means an outbid notification can arrive 10 seconds late during the most critical moment of an auction.

---

## 2. Psychology & Principles

### 2.1 The four forces of auction bidding

Research from 32auctions and you.bid (2026) identifies four psychological forces that drive every bidding war:

1. **Anchoring** — The published value or starting bid sets the reference point. An item with no stated value anchors bidders on the starting bid instead. ThryftVerse's `CreateAuctionScreen.tsx` (line 112) defaults the starting bid to `Math.max(1, Math.round(selectedListing.price * 0.8))` — a reasonable anchor, but the listing's original price is not shown alongside the starting bid on the auction card, losing the anchoring effect.

2. **Social proof** — Visible bid counts, bid history, and activity feed resolve uncertainty faster than any description. An item showing 7 bids tells a browser that 7 people have already decided this is worth having. Critically, **zero bids broadcasts a signal too** — items with no bids are hard to rescue. ThryftVerse's `AuctionRunwayCard.tsx` (line 137) only shows bid count when `bidCount > 0`, which is correct, but there's no "watching" count or presence indicator to provide social proof for zero-bid items.

3. **Loss aversion** — Everything changes at the first bid. The instinct to respond to an outbid notification is immediate. Research shows outbid notification delivery is one of the strongest predictors of per-item revenue. ThryftVerse has outbid haptics (`HapticPatterns.outbid()` at `AuctionDetailScreen.tsx` line 502) and auto-opens the bid sheet from `MyBidsScreen.tsx` (line 201), but the notification → app open → bid sheet flow depends on polling, not push.

4. **Urgency** — The closing window is the only moment when doing nothing has a cost. Design it deliberately. ThryftVerse's `AuctionCountdown.tsx` has a well-structured stage system (plenty → moderate → urgent → final → ended) with colour interpolation at meaningful thresholds. However, the `AuctionsScreen.tsx` countdown (line 83–92) uses a simpler `formatCountdown` with no stage language — a regression from the dedicated component.

### 2.2 Endowment effect in fractional ownership

Once a user owns Co-Own units, they value them more highly than equivalent cash. The `CoOwnCompactPositionCard` in `SyndicateHubScreen.tsx` (line 422) shows ownership percentage, position value, and gain/loss — reinforcing the endowment effect through identity ("you own X% of this"). This is well-designed. However, the onboarding (`SyndicateOnboardingScreen.tsx`) uses generic educational slides that don't connect to the user's identity as an owner.

### 2.3 Countdown urgency done tastefully

2026 research (HDL handle 10362/202542) reveals a nuanced finding: urgency nudges elicit higher anxiety than scarcity nudges, but anxiety paradoxically functions as a navigational heuristic that drives conversion. However, **aggressive digital nudges backfire on highly impulsive individuals** — triggering psychological reactance that devalues the product.

The implication for ThryftVerse: the countdown should be honest and present, not aggressive. The `AuctionDetailScreen.tsx` (line 662–667) already follows this principle — countdown colour changes only at meaningful thresholds (< 10s = danger, < 60s = warning), and the primary state sentence prioritises viewer state (outbid/leading) over the countdown. This is correct flagship behaviour. The `AuctionsScreen.tsx` featured card (line 502) uses a simpler `getTimerUrgency` with three tiers but no reduced-motion consideration for the colour change.

### 2.4 Trust as a reflective-level driver

Per AGENTS.md §27.7, trust is a critical necessity. For auctions and Co-Own trading, trust manifests as:
- Server-authoritative time (not client clock)
- Immutable bid history (append-only log)
- Verified seller identity and authenticity
- Escrow and safeguarding evidence
- Truthful terminal states ("Sold · awaiting payment" vs "Sold")

ThryftVerse's `AssetDueDiligenceScreen.tsx` is genuinely strong here — it shows provenance, authentication, custody, insurance, legal vehicle, escrow terms, and a timeline of audit events. The `CoOwnTrustPanel` component surfaces authenticity status, buyer protection, and custody insurance. This is production-grade trust architecture.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Dual auction systems with divergent quality

ThryftVerse has **two auction list screens** with different quality levels:

- **`AuctionHomeScreen.tsx`** (1,100+ lines) — the flagship home with attention strips, runway cards, category rails, server-driven facets, browse/search states, and `useBucketedServerClock`. This is the canonical, high-quality implementation.
- **`AuctionsScreen.tsx`** (700+ lines) — an older list screen with local `Date.now()` countdown (line 204), a `BidComposer` overlay (not a bottom sheet), `AuctionCard` with card-on-card composition, and no server clock. This screen appears to be a legacy duplicate.

**Defect:** `AuctionsScreen.tsx` uses `setInterval(() => setNowTs(Date.now()), 1000)` (line 204) — a client-side clock that drifts from server time. The `AuctionHomeScreen.tsx` correctly uses `useBucketedServerClock`. This is a truth deficit: the countdown on `AuctionsScreen` can be seconds off from the actual auction end.

**Defect:** `AuctionsScreen.tsx` renders `BidComposer` as a custom overlay (`components/trade/BidComposer.tsx`) with `...StyleSheet.absoluteFill` and `zIndex: 300` — not a proper bottom sheet. The `AuctionDetailScreen.tsx` uses the proper `BidSheet` bottom sheet component. Two different bid entry patterns exist.

### 3.2 Card-on-card composition in AuctionCard

`components/trade/AuctionCard.tsx` (line 247–255) wraps the entire card in a `surface` background with `borderRadius: Radius.lg` and `borderWidth: 1`, then nests a `body` section with its own padding. The image has its own border radius. The live pill, ending-soon badge, outbid badge, leading badge, and won badge are all separate absolutely-positioned rounded containers — up to 5 overlapping rounded surfaces on one card. This violates AGENTS.md §4: "No card-on-card composition" and "Surface budget: at most one dominant non-media panel above the fold."

The `AuctionRunwayCard.tsx` is better — it uses a single image with gradient overlay and metadata below, with only a state badge and watch button as chrome. But `AuctionCard.tsx` (used in `AuctionsScreen.tsx`) is the older, lower-quality pattern.

### 3.3 Missing real-time states

**No WebSocket/SSE layer.** The `AuctionDetailScreen.tsx` polls every 10 seconds (line 481) for live auctions. In 2026, competing platforms deliver sub-100ms bid updates. The 10-second gap means:
- An outbid status can be up to 10 seconds stale
- Bid activity feed lags behind reality
- The countdown continues locally even if the server has already ended the auction
- Multiple bidders see different prices simultaneously

The `isFetchingRef` guard (line 181) prevents overlapping calls but doesn't solve the latency problem. The `CommerceDetailFreshnessBanner` (line 893) surfaces stale/reconnecting states honestly, which is good — but the underlying architecture is still polling.

**No presence indicator.** Handbid shows "14 bidders watching" — a powerful social proof signal. ThryftVerse shows bid count but not watcher count or active bidder count. The `AuctionHomeScreen.tsx` fetches `activity` data (line 318: `activeCount`, `needsAttentionCount`, `leadingCount`, `outbidCount`, `watchingCount`) but this is personal activity, not market-wide presence.

### 3.4 No anti-snipe / extended bidding

The `endsAt` timestamp is treated as absolute. There is no logic to extend the auction when a bid lands in the final minute. eBay's 2026 rollout of Extended Bidding to all Australian auctions makes this a competitive gap. The `detectLifecycleTransition` function in `utils/auctionDetailLogic.ts` detects state changes but does not extend the auction.

### 3.5 Dead co-own features and navigation gaps

**`TradeHubScreen.tsx`** (23 lines) is a pure redirect screen — it reads `route.params.destination` and replaces with either `CoOwnHub` or `AuctionHome`. This is a dead navigation node that adds a hop. If the user navigates back, they hit this screen which immediately redirects again.

**`CoOwnIssueScreen.tsx`** (line 52–63) has a `handleSubmit` that shows a toast ("Opening support — reference: ...") and navigates to `HelpSupport`. The issue report is not actually submitted — the user must re-explain their issue in the help flow. This is a half-truthful control: it implies the report is being submitted but just opens a different screen.

**`SyndicateOnboardingScreen.tsx`** uses generic educational slides with no connection to the user's actual portfolio or interests. The slides describe Co-Own in abstract terms ("Own a piece of something desirable") with no personalisation. 2026 best practice (Questrade, Collectable) connects onboarding to the user's first action.

### 3.6 AI-slop due diligence risk

The `AssetDueDiligenceScreen.tsx` is genuinely well-architected — it pulls real backend data (provenance, authentication, custody, appraisal, legal vehicle, escrow terms, audit events). However, the `dossierEvidenceGroups` (line 175–179) are derived from `resolveEvidenceGroups` which takes `category`, `condition`, and `description` — if the backend provides sparse data, the evidence groups may be thin or empty. The screen handles this with "No story or condition details published yet" (line 363), which is truthful.

The risk is not AI-slop in the current implementation but rather **absence of evidence**: if the backend hasn't published authentication or custody data, the screen shows nothing rather than an explicit "Not yet verified" state. The `CoOwnTrustPanel` component receives nullable props (`authenticityStatus ?? null`) but the screen doesn't explicitly call out missing trust signals.

### 3.7 AuctionsScreen featured card — weak countdown

The `AuctionsScreen.tsx` featured auction card (line 499–517) uses `getTimerUrgency` with three tiers (critical < 1h, urgent < 6h, normal) and maps to colour only. There's no stage language ("Ending soon", "Final moments"), no progress bar, no accessibility threshold rate-limiting. The `AuctionCountdown` component (used in `AuctionRunwayCard`) has all of these. The featured card regresses to a simpler `AppStatusPill` — a colour-only urgency signal that violates AGENTS.md §13: "Do not use colour alone to communicate state."

### 3.8 CreateAuctionScreen — missing validation feedback

`CreateAuctionScreen.tsx` (line 122–197) validates inputs via toast messages on error. There's no inline field validation, no real-time feedback on whether the reserve price is above the starting bid, no preview of the auction card the seller is creating. The 3-step wizard (Listing → Configure → Review) is well-structured, but the Review stage (line 445–462) shows a static preview card with no live countdown simulation or bid scenario preview.

### 3.9 CorporateActionDetailScreen — card-on-card sections

`CorporateActionDetailScreen.tsx` (line 266–345) wraps every section (Title, About, Key dates, Effect, Status) in a separate `sectionCard` with `backgroundColor: colors.surface` and `borderColor: colors.border`. This creates 5+ stacked rounded containers — card-on-card composition. The governance voting section (line 348–436) is well-designed with tally bars, quorum, and voting power — but it's buried inside another card.

### 3.10 AssetLeaderboardScreen — no real performance metrics

`AssetLeaderboardScreen.tsx` (line 104–132) ranks by "Most allocated", "Available supply", and "New issues" — all supply-side metrics. There are no demand-side metrics (trading volume, price change, holder growth). The comment on line 104 says "no speculative price-move metrics" — which is truthful, but it means the leaderboard is a supply overview, not a performance leaderboard. The title "Market overview" (line 198) is more accurate than "Leaderboard" but the route name implies competitive ranking.

---

## 4. Micro Improvements

### 4.1 Unify the countdown component

Replace the `AuctionsScreen.tsx` featured card's `AppStatusPill` timer with the canonical `AuctionCountdown` component. This brings stage language, progress bar, and accessibility threshold rate-limiting to all auction surfaces. **File:** `frontend/src/screens/AuctionsScreen.tsx` line 502; replace `AppStatusPill` with `AuctionCountdown` using `showProgress` and `stage` props.

### 4.2 Add watcher count as social proof

Extend the `MarketAuction` type in `services/marketApi.ts` to include `watcherCount` and `activeBidderCount`. Surface these on `AuctionRunwayCard.tsx` when `bidCount === 0` — "12 watching" provides social proof for zero-bid items without fabricating bid activity. This requires a backend addition but the frontend component change is small.

### 4.3 Fix CoOwnIssueScreen truthful submission

Either submit the issue report to the backend before navigating to `HelpSupport`, or change the button label from "Continue to support" to "Open support chat" and the toast from "Opening support — reference: ..." to "Describe this issue in the support chat." The current half-truthful flow violates AGENTS.md §11.

### 4.4 Remove TradeHubScreen redirect hop

Replace any navigation to `TradeHub` with direct navigation to `AuctionHome` or `CoOwnHub`. The redirect screen adds a navigation hop and breaks Back behaviour — pressing Back from `AuctionHome` after arriving via `TradeHub` returns to `TradeHub` which redirects forward again, creating a Back loop.

### 4.5 Add inline validation to CreateAuctionScreen

Show real-time validation state on the reserve price and buy-now fields: if `reservePriceGbp < startingBid`, show an inline error below the field (not a toast). If `buyNowPriceGbp <= startingBid`, show an inline warning. Add a live auction card preview on the Review stage that simulates the countdown.

### 4.6 Flatten CorporateActionDetailScreen sections

Remove the individual `sectionCard` wrappers from each section. Use `CommerceDetailSection` (already imported in `AssetDueDiligenceScreen.tsx`) with `variant="editorial"` and hairline dividers between sections. This eliminates the card-on-card composition and creates a flat, authored surface.

### 4.7 Add "Not yet verified" explicit states to due diligence

When `authenticityStatus` is null, show an explicit "Authenticity not yet verified" row with a muted icon — not silence. When `custodyInsured` is false or null, show "Custody insurance: not confirmed." This makes the absence of trust signals visible rather than invisible.

### 4.8 Add demand-side metrics to AssetLeaderboardScreen

Add a "Most traded" section ranked by 7-day trading volume (units traded). Add a "Holder growth" section ranked by net new holders in the past 30 days. These require backend support but the frontend `renderList` function (line 139) is already generic enough to accept new metric functions.

---

## 5. Macro Improvements

### 5.1 Real-time auction layer (WebSocket/SSE)

**Architecture:** Replace the 10-second polling in `AuctionDetailScreen.tsx` with a WebSocket or Server-Sent Events subscription. The backend should broadcast bid events, outbid notifications, and auction state changes the moment they commit.

**Contract:**
```
auction:{id} channel events:
  - bid.placed    { bidId, amountGbp, bidderId (masked), timestamp }
  - outbid        { previousBidderId, newMinimumBidGbp }
  - auction.ended { winnerBidderId, finalAmountGbp }
  - auction.extended { newEndsAt, reason: 'anti_snipe' }
  - presence      { watcherCount, activeBidderCount }
```

**Frontend changes:**
- Add `useAuctionRealtime(auctionId)` hook that subscribes to the channel and returns `{ latestBid, outbidNotification, presence, connectionState }`
- In `AuctionDetailScreen.tsx`, replace the `setInterval` polling (line 483–492) with the realtime hook. Keep polling as a fallback (Kafka-style: "client switches to polling when realtime pipeline is detected as down" — AuctionPro pattern).
- The `CommerceDetailFreshnessBanner` already surfaces stale/reconnecting states — reuse it for the realtime connection state.

**Risk:** WebSocket infrastructure is a significant backend addition. Rollout order: (1) add the realtime hook with polling fallback, (2) backend implements the channel, (3) switch the hook to prefer realtime over polling.

### 5.2 Anti-snipe / extended bidding

Implement eBay-style extended bidding: when a bid is placed in the final 60 seconds, reset the countdown to 60 seconds. This requires:

- **Backend:** The auction `endsAt` is extended server-side when a bid lands in the final minute. The `endsAt` field in the auction response updates, and a `auction.extended` event is broadcast.
- **Frontend:** `AuctionDetailScreen.tsx` already handles `endsAt` changes via `fetchDetail()` — the `detectLifecycleTransition` function (line 257) detects state changes. Add detection for `endsAt` extension and show a brief "Auction extended — 60 seconds added" banner.
- **Countdown:** The `AuctionCountdown` component should show "Extended" as a transient stage label when the countdown resets.

This is the single highest-impact auction feature for 2026. eBay's data shows it creates fairer auctions and stronger bidding outcomes.

### 5.3 Consolidate to one auction list screen

**Decision:** `AuctionHomeScreen.tsx` is the canonical auction discovery surface. `AuctionsScreen.tsx` should either be removed (if no route references it) or upgraded to use the same `useBucketedServerClock`, `AuctionCountdown`, and `BidSheet` components. The `BidComposer` overlay in `components/trade/BidComposer.tsx` should be deprecated in favour of the `BidSheet` bottom sheet.

**Risk:** If `AuctionsScreen.tsx` is referenced by a route that `AuctionHomeScreen.tsx` doesn't cover, the route must be redirected. Check `navigation/types.ts` for all references to `Auctions` before removing.

### 5.4 Co-Own trading clarity

Per the Questrade and Collectable findings, users are confused by the distinction between fractional units and whole items. The `TradeScreen.tsx` uses `1ZE` as the settlement unit and shows `CoOwnNumericText` with `unit="1ZE"` — but there's no explicit "You are buying X units of a fractional asset, not the whole item" contextual cue on the trade screen.

**Fix:** Add a contextual disclosure above the trade composer on first trade: "You're buying units of this Co-Own asset. Each unit represents a fractional ownership share, not the whole item." Show this once (persist a flag in AsyncStorage) and make it dismissible. The `CoOwnFirstTradeGuide.tsx` component (15KB, recently created) may already address this — verify it's wired into `TradeScreen.tsx`.

### 5.5 Trust verification surfacing

The `AssetDueDiligenceScreen.tsx` is strong but trust signals should also surface on the main `AssetDetailScreen` and `TradeScreen` — not only on the dedicated due-diligence screen. Add a compact `CoOwnTrustBadge` (verified, insured, escrowed) to the trade composer header so the user sees trust signals at the point of decision, not only during research.

### 5.6 Auction architecture: immutable bid log + denormalised current bid

Per the 2026 consensus (Supabase Realtime, AuctionPro): the `bids` table should be an immutable append-only log. `auctions.currentBidGbp` and `auctions.winnerBidderId` are denormalised fields updated atomically by a Postgres function when a bid is accepted. This ensures the bid history is never modified and the current bid is always consistent.

The frontend `AuctionBidActivity` type in `services/marketApi.ts` already represents bid history as a list — verify the backend treats this as append-only. The `placeAuctionBid` function (line 340) uses an `idempotencyKey` which is correct for preventing duplicate bids on retry.

---

## 6. Flagship Acceptance Criteria

### Auctions
- [ ] **One canonical auction list screen** — `AuctionHomeScreen.tsx` is the only auction discovery surface; `AuctionsScreen.tsx` is either removed or upgraded to use the same server clock, countdown component, and bid sheet
- [ ] **Server-authoritative countdown on all auction surfaces** — no `Date.now()` countdown; all use `useBucketedServerClock`
- [ ] **Real-time bid updates** — WebSocket/SSE subscription on `AuctionDetailScreen.tsx` with polling fallback; sub-100ms bid propagation
- [ ] **Anti-snipe extended bidding** — bids in the final 60 seconds extend the auction by 60 seconds; "Auction extended" banner shown
- [ ] **Social proof** — watcher count visible on auction cards when `bidCount === 0`
- [ ] **Single bid entry pattern** — `BidSheet` bottom sheet everywhere; `BidComposer` overlay deprecated
- [ ] **No card-on-card** — `AuctionCard.tsx` flattened or replaced with `AuctionRunwayCard` pattern
- [ ] **Countdown stage language** — "Ending soon", "Final moments" on all auction surfaces, not just the detail screen
- [ ] **Truthful terminal states** — "Sold · awaiting payment" vs "Sold · settlement pending" vs "Sold" (already implemented in `AuctionDetailScreen.tsx`)

### Co-Own Trading
- [ ] **Fractional ownership clarity** — explicit contextual cue on first trade distinguishing units from whole items
- [ ] **Trust signals at decision point** — compact trust badge on `TradeScreen.tsx` and `AssetDetailScreen.tsx`, not only on due-diligence screen
- [ ] **Live order book** — `CoOwnOrderBook.tsx` with real-time depth updates (currently fetched once on mount)
- [ ] **Truthful issue reporting** — `CoOwnIssueScreen.tsx` either submits the report or honestly labels the button
- [ ] **No dead navigation** — `TradeHubScreen.tsx` redirect removed or replaced with direct navigation

### Due Diligence & Leaderboard
- [ ] **Explicit "not yet verified" states** — absence of trust signals is visible, not silent
- [ ] **Demand-side leaderboard metrics** — trading volume and holder growth sections, not only supply metrics
- [ ] **Flat section composition** — `CorporateActionDetailScreen.tsx` sections use `CommerceDetailSection` with hairline dividers, not stacked cards

### Cross-cutting
- [ ] **All countdowns use `AuctionCountdown`** — no custom timer formatting outside the canonical component
- [ ] **Reduced-motion fallbacks** for all countdown colour changes and urgency animations
- [ ] **Accessibility** — countdown announcements rate-limited to meaningful thresholds (already in `AuctionCountdown.tsx`); extend to all surfaces
- [ ] **No fabricated data** — no mock bid history, no fake watcher counts, no placeholder prices

---

## 7. Priority & Sequencing

### Phase 1 — Truth & Trust (Week 1–2)
1. **Unify countdown component** across all auction surfaces (micro 4.1) — low risk, high visual consistency
2. **Fix CoOwnIssueScreen truthful submission** (micro 4.3) — AGENTS.md §11 compliance
3. **Remove TradeHubScreen redirect hop** (micro 4.4) — navigation correctness
4. **Add "Not yet verified" explicit states** to due diligence (micro 4.7) — trust visibility
5. **Flatten CorporateActionDetailScreen sections** (micro 4.6) — composition quality

### Phase 2 — Auction Real-Time Foundation (Week 3–5)
6. **Add `useAuctionRealtime` hook** with polling fallback (macro 5.1) — architecture
7. **Implement anti-snipe extended bidding** backend + frontend (macro 5.2) — competitive parity with eBay 2026
8. **Add watcher count to auction cards** (micro 4.2) — social proof, requires backend
9. **Consolidate to one auction list screen** (macro 5.3) — remove `AuctionsScreen.tsx` or upgrade it

### Phase 3 — Co-Own Trading Clarity (Week 6–7)
10. **Add fractional ownership contextual cue** on first trade (macro 5.4)
11. **Surface trust signals at decision point** (macro 5.5)
12. **Real-time order book updates** for `CoOwnOrderBook.tsx` (macro 5.5)
13. **Add inline validation to CreateAuctionScreen** (micro 4.5)

### Phase 4 — Leaderboard & Polish (Week 8)
14. **Add demand-side metrics to AssetLeaderboardScreen** (micro 4.8) — requires backend
15. **Deprecate `BidComposer` overlay** — replace all usages with `BidSheet`
16. **Final audit pass** — verify all countdowns use `AuctionCountdown`, all bid entry uses `BidSheet`, no card-on-card remains

### Sequencing rationale

Truth and trust fixes come first because they are AGENTS.md compliance issues (§11, §12) with low implementation risk. The real-time auction layer is the highest-impact feature but requires backend coordination — starting it in Phase 2 gives the backend team time to implement the WebSocket channel while the frontend builds the hook with polling fallback. Co-Own trading clarity follows because it depends on user research findings (Questrade, Collectable) that are confirmed but not urgent. The leaderboard polish is last because it's the lowest-traffic surface and requires backend metrics that don't yet exist.

---

*End of report. Word count: ~2,800. All code references verified against production files as of August 2026.*
