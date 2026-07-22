# 03 — Screens Specification

**Goal:** per-screen target composition for every Co-Own screen, canonical files only (no `ScreenV2.tsx` — `AGENTS.md` §7). Each spec gives first-viewport hierarchy, sticky actions, state coverage, and the exact file to modify.

**Navigation source:** `frontend/src/navigation/AppNavigator.tsx` — all Co-Own screens currently use `pushScreenOptions` (horizontal iOS push, 240ms, gesture-enabled). Presentation-style changes are noted per screen.

---

## 1. SyndicateHubScreen → Co-Own Markets hub

**File:** `frontend/src/screens/SyndicateHubScreen.tsx`
**Route:** `CoOwnHub` (push)
**Purpose (corrected):** the **markets discovery** entry — users who arrive to browse and trade, not a crowdfunding page.

### First-viewport hierarchy
1. **`CoOwnMarketHeader`** — title "Co-Own", subtitle "Asset-unit exchange · 1ZE", actions: Search, Watchlist, Portfolio.
2. **Market-status banner** (new, thin) — exchange session state across all listed instruments ("Continuous · 4 instruments live · 1 call auction 14:00"). Only when relevant; hide if all closed.
3. **Segment rail** — `Active · Auctions · New issues · Watchlist` (replaces the current sort-only search). Source §11.4.
4. **Featured hero** (`CoOwnFeaturedHero`) — one curated asset, art-directed image, ticker, last price + age, bid/ask one-line, status pill. No "market cap" without a labelled mark.
5. **Discovery grid** (`CoOwnAssetTile`) — compact thumbnails retaining Galleria identity; each tile shows ticker, last price + age, 24h change (with timestamp), spread, status pill.
6. **Your positions** (only if viewer holds) — collapsed strip with total mark value + today's change; tap expands to `PortfolioScreen`.

### Sortable columns (Active tab)
Last price · 24h change · Spread · Depth ±2% · Last-trade age. A sort option without its underlying data is **hidden**, not shown disabled-with-fake-data (source §11.4, `AGENTS.md` §11).

### Sticky actions
None at hub level — discovery is the action. The header actions are the routes to trade.

### State coverage
- **Loading:** `CoOwnHubSkeleton` (exists) — must match final geometry (hero + grid).
- **Empty (no assets):** editorial empty state — "No live instruments. New issues open weekly." + Watchlist CTA. No fake assets.
- **Filtered-empty (Watchlist tab, no items):** "Your watchlist is empty" + Browse CTA.
- **Error / offline:** `RetryState` with retry; cached last-known list with staleness badge.
- **All closed markets:** status banner "Markets closed · Next session 09:00 BST" + countdown; tiles show last price + age, no live dot.

---

## 2. AssetDetailScreen — the instrument surface

**File:** `frontend/src/screens/AssetDetailScreen.tsx`
**Route:** `AssetDetail` (push, param `assetId`)
**Purpose:** the single most important screen — must combine Galleria discovery + exchange execution + registrar ownership in one authored composition.

### First-viewport hierarchy (above the fold)
1. **Media hero** (full-bleed, art-directed, `CachedImage` with focal point) — tap expands to fullscreen viewer (existing).
2. **Identity strip** — ticker (`MYA-01`), instrument name, asset class chip, rights-version badge, watch button.
3. **Value strip** (new, replaces single price) — three labelled columns:
   - **Market:** Last `12.40` (3h ago) · Bid `12.38` × 80 · Ask `12.42` × 60 · Spread `0.04`
   - **Fundamental:** NAV `10.00` (02 Jul · independent) · Premium `+24.0%`
   - **Cash:** Next distribution `—` · Next reporting `Q3 2026`
   Each value has a type label and timestamp. No value without a type (source §6.6, §7.1).
4. **Market-status strip** (new, thin, sticky-on-scroll) — `[Continuous]` dot + "Open · closes 17:00" countdown, or `[Call auction]` + "Uncrossing 14:00", or `[Halted]` + reason, or `[Closed]` + next session.
5. **Chart hero** (`CoOwnPriceChart` upgraded — see `06`) — line default, candle toggle, 1D/1W/1M/3M/1Y/ALL, volume toggle. Min height `ExchangeLayout.chartHeroMinHeight`.

### Below the fold (scroll)
6. **`CoOwnOwnershipPanel`** (upgraded per `01` §3) — authorised/issued/float/locked/treasury + viewer position.
7. **Order book** (new `CoOwnOrderBook`) — 5 levels mobile / 10 tablet, depth bars, tap level → pre-fill ticket.
8. **Vehicle card** (`CoOwnIssuerCard` → `CoOwnVehicleCard`) — legal form, jurisdiction, operator, custodian, documents.
9. **Trust panel** (`CoOwnTrustPanel`) — verification, completed trades, message issuer.
10. **Dossier** (new `CoOwnAssetDossier`) — provenance, condition, custody, insurance, appraisal (date/method/valuer/range).
11. **Rights sheet entry** — "View rights & risks" → modal with the 13-row rights table (`01` §4). **Live-instrument rule:** if any rights row is "To be confirmed", the dock is disabled with "Rights incomplete — not yet tradable". "Rights TBC" is acceptable only in prelaunch preview, never on a live market instrument.
12. **Recommendation rails** (existing) — keep, restrained.
13. **`CoOwnFirstTradeGuide`** (existing) — first-visit overlay.

### Sticky actions
**`CoOwnStickyActionDock`** with two buttons: **Buy** (primary, `brand` fill) / **Sell** (secondary, outlined; disabled if no sellable settled units — truthful disabled state, not hidden). Buttons show best ask / best bid under the label in `Numeric.mono`. When market is `Closed`/`Halted`, both disabled with reason in the dock. When `RFQ`/`Auction`, label changes to "Request quote" / "Join auction" (source §11.5).

### Presentation
Keep push. The fullscreen media viewer is a separate fullscreen modal (already handled).

### State coverage
- **Loading:** `CoOwnAssetDetailSkeleton` (exists) — must match the new value strip + chart + book geometry.
- **No market data yet (Phase 1):** value strip shows "Last —", "Bid —", "Ask —", "No current order"; chart shows "No trades yet"; order book shows empty-state "No open orders". **Never zero, never fabricated.**
- **Stale last trade:** "Last trade 3d ago" badge on the Last value; chart annotates the gap.
- **Halted:** status strip `[Halted]` + reason; dock disabled with reason; chart frozen at last.
- **Restricted jurisdiction:** dock disabled with "Not eligible in your region" + link to eligibility.
- **Error / offline:** `RetryState` for the failing section only; other sections render from cache with staleness badges.

---

## 3. TradeScreen — the order ticket

**File:** `frontend/src/screens/TradeScreen.tsx`
**Route:** `Trade` (push, params `assetId`, `side`)
**Purpose:** exchange-grade order ticket — **not** checkout. Full spec in `05-order-ticket-and-market-data.md`.

### First-viewport hierarchy (collapsed default — luxury breathing room)

The ticket uses **progressive disclosure** to match the existing `CoOwnTradeComposer` density (Farfetch/SSENSE register). The collapsed default shows ~6 blocks; detail expands on tap. Full spec in `05` §1.

1. **`CoOwnMarketHeader`** — ticker + last price + status pill; back; watch.
2. **Compact value strip** — last/bid/ask/spread one line.
3. **Buy/Sell segment** (`AppSegmentControl`) — sticky under header.
4. **Available headline** — "Available 1ZE: 12,400" (buy) or "Sellable units: 500" (sell, settled − reserved).
5. **Quantity input** — lot-step enforced, +/− buttons, toggle Units / 1ZE-amount (1ZE-amount default for buy).
6. **Order-type selector** — Protected instant (marketable limit with protection price) / Limit.
7. **Limit/protection price input** — tick-step enforced.
8. **One-line estimate** — "≈ 500 units · 6,282.20 1ZE incl. fee · 6,282.20 1ZE will be reserved" (single line, `Numeric.mono`).
9. **"Details" expandable** (tap to reveal) — avg fill, worst price, depth impact, duration, post-trade preview.
10. **Risk disclosure** (`CoOwnRiskDisclosure` compact) + disclosure version.
11. **`CoOwnStickyActionDock`** — "Review order" (primary). Disabled with reason if: insufficient 1ZE, insufficient sellable units, market closed, jurisdiction restricted, below lot minimum, beyond price band, rights incomplete, slippage beyond visible depth.

### Presentation
**Change:** move from push to **bottom sheet** on mobile (`ticketSnapExpanded`) for the ticket itself, pushed from AssetDetail. On tablet, side panel. Source §11.5. The current full-screen push is acceptable as a fallback but the sheet is the flagship target. Keep `TradeConfirmScreen` as a pushed review screen (see §4).

### State coverage
- **Loading quote:** skeleton for the estimated-fill block; inputs usable.
- **Market closed:** ticket shows "Market closed · Next session 09:00" — inputs disabled, "Review" disabled.
- **Halted:** same, with halt reason.
- **Thin market (no opposite side):** "Protected instant" replaced by "Request quote" / "Join auction" per market mode (source §11.5).
- **Insufficient 1ZE / units:** inline error with recovery ("Need 240 more 1ZE · Add 1ZE"); "Review" disabled.
- **Price-band violation:** inline error "Limit outside ±10% band"; "Review" disabled.
- **Submitting:** "Review" → "Submitting…" with spinner; haptic medium on acceptance, heavy on rejection.

---

## 4. TradeConfirmScreen — review & confirm

**File:** `frontend/src/screens/TradeConfirmScreen.tsx`
**Route:** `TradeConfirm` (push)
**Purpose:** the deliberate gate before money moves. Source §11.6.

### Hierarchy
1. **`CoOwnTradeReceipt`** (upgraded) — product identity, side, order type, units, limit/protection price, avg fill estimate, worst price, 1ZE gross, each fee, total, **max 1ZE reserved**, post-trade units + ownership %.
2. **Plain-language ownership sentence** — "You will own 500 units (0.50% of outstanding) of MYA-01, settled in 1ZE. This is a beneficial interest in [vehicle], not title to the yacht."
3. **Local-fiat indication** — "≈ £5,890 · source [partner] · 14:02 BST".
4. **Market & liquidity warning** — instrument-specific ("Last trade 3h ago · spread 0.04 1ZE · thin market").
5. **Disclosure version accepted** — "Rights v2 · Jul 2026 · accepted".
6. **`CoOwnRiskDisclosure`** (full variant).
7. **`CoOwnStickyActionDock`** — "Cancel" (secondary) / "Submit order" (primary). **Hold-to-submit** for orders above a threshold (e.g. > 5,000 1ZE or > 5% of float); tap-to-submit below.

### Confirmation states (restrained, no celebration)
- **Submitted** → "Order accepted · 1,200 1ZE reserved" → route to `CoOwnOrderHistory` with the new order highlighted.
- **Partially filled** → receipt updates with filled qty + remaining; "Review" replaced by "Done" + "Modify".
- **Filled** → receipt with execution price(s) + contract-note link.
- **Pending auction** → "Order queued for 14:00 call auction" + countdown.
- **Rejected** → reason + recovery; haptic heavy; no confetti (source §17.5).

---

## 5. PortfolioScreen — positions & P&L

**File:** `frontend/src/screens/PortfolioScreen.tsx`
**Route:** `Portfolio` (push)
**Purpose:** registrar-quality ownership service. Source §11.7, `06-portfolio-wallet-upgrade.md`.

### First-viewport hierarchy
1. **Hero** — total portfolio mark value in 1ZE (`Numeric.display`) + today's change (with timestamp) + local-fiat indication (secondary, with source/time).
2. **Data-quality note** — "Marks from last trade · 3 positions stale > 24h" (only when true).
3. **Summary tiles** — Total return · Unrealised P&L · Realised P&L · Distributions received.
4. **Allocation bars** — by asset class (yacht/watch/art/collectible) and by issuer concentration (privacy-safe bands, not named holders).
5. **Position list** (`FlashList` + `CoOwnPositionCard` upgraded) — each row: image, ticker, units (settled), ownership % (labelled denominator), mark source + age, mark value, cost basis, unrealised P&L, **premium of last/NAV** line.
6. **Upcoming corporate actions** strip — distributions, votes, capital calls (only when present).

### State coverage
- **Loading:** `CoOwnPortfolioSkeleton`.
- **Empty:** "You don't own any units yet" + "Browse assets" CTA. No fake positions.
- **Stale marks:** per-row "Last 3d ago" + portfolio-level data-quality note.
- **Error / offline:** cached positions with staleness; `RetryState` for the failing fetch.

---

## 6. Wallet — 1ZE settlement balance

**File:** none canonical today — the wallet surface lives inside `MyProfileScreen`/settings. **Create a dedicated `WalletScreen`** (canonical, not a parallel impl — this is a missing screen, not a duplicate). Route `Wallet` (push). Source §11.8, `06` §2.

### Hierarchy
1. **Hero** — "Spendable now" `12,400.00 1ZE` (`Numeric.display`) + local-fiat indication (source/time).
2. **Sub-balance breakdown** — Available / Reserved for orders / Pending deposit / Unsettled sale proceeds / Redemption in progress / Total claim / Safeguarded at [partner].
3. **Actions** — "Add 1ZE" (primary) / "Redeem 1ZE" (secondary, separate flow, never combined).
4. **Bank/payment source status** — linked account(s) + verification state.
5. **Activity** (`FlashList` of `CoOwnActivityRow` upgraded) — immutable entries with references (order id, execution id, corporate-action id); filterable by type.
6. **Statements** — "Download statement (PDF)" + "Export CSV".
7. **Safeguarding & redemption info** — plain-language panel: where funds are held, redemption timing, fees.

### State coverage
- **Loading:** skeleton matching the breakdown geometry.
- **Empty (no 1ZE, no activity):** "Add 1ZE to start trading" + Add CTA.
- **Pending reservation:** each sub-balance explains itself ("Reserved for 2 open buy orders").
- **Redemption in progress:** row with ETA + destination + rate/source.
- **Reconciliation break:** "Temporarily unavailable — we're reconciling" + contact; never show a possibly-wrong balance as if correct.

---

## 7. MarketLedgerScreen — activity ledger

**File:** `frontend/src/screens/MarketLedgerScreen.tsx`
**Route:** `MarketLedger` (push)
**Purpose:** auditable activity across auction + Co-Own. Source §11.7.

### Hierarchy
1. **Segment** — `All · Auction · Co-Own` (existing) — keep.
2. **`CoOwnLedgerSummary`** (upgraded) — volume (with mark used), net cashflow, realised P&L — each with a timestamp window label.
3. **`FlashList`** of `CoOwnActivityRow` upgraded — type, asset ticker, units, execution price, execution reference, timestamp, status. **No user identity, no cost data** on public rows (source §2.2 privacy).

### State coverage
- Loading skeleton; empty "No activity yet"; error retry; offline cached with staleness.

---

## 8. AssetLeaderboardScreen — keep, reframe

**File:** `frontend/src/screens/AssetLeaderboardScreen.tsx`
**Route:** `AssetLeaderboard` (push)
**Reframe:** leaderboards must **not** gamify. Reframe as **market activity rankings**: most traded by volume (with window), tightest spread, deepest ±2%. Remove "most co-owners" if it implies social proof over market quality. Each ranking row shows the metric + window + last-trade age.

---

## 9. BuyoutScreen — exit path

**File:** `frontend/src/screens/BuyoutScreen.tsx`
**Route:** `Buyout` (push, param `assetId`)
**Current state:** shows "not available yet". **Truthful disabled state** — keep the screen, make the disabled state explicit and honest: "Asset-level exit is initiated by the vehicle operator per the rights document. Contact concierge to register interest." Do not fabricate a buyout flow that does not exist (`AGENTS.md` §11).

---

## 10. CoOwnIssueScreen — report an issue

**File:** `frontend/src/screens/CoOwnIssueScreen.tsx`
**Route:** `CoOwnIssue` (push)
Keep. Ensure the category grid routes to a real support flow (not a toast that says "submitted" when nothing happened). Truthful submit state only.

---

## 11. Screens that touch Co-Own but are not Co-Own-owned

- **HomeScreen** — Co-Own featured section; keep as a discovery entry, do not duplicate the hub.
- **MyProfileScreen** — Co-Own compliance + watchlist; keep, link to `WalletScreen` (new).
- **VerificationScreen** — Co-Own eligibility; keep, ensure it gates trading truthfully.
- **SellScreen** — option to list as Co-Own; keep, ensure it routes to the issue studio, not a fake listing.

---

## 12. Navigation presentation summary

| Route | Presentation | Reason |
|---|---|---|
| `CoOwnHub` | push | hierarchy |
| `AssetDetail` | push | hierarchy |
| `Trade` | **bottom sheet** (mobile) / side panel (tablet) | creation/selection task — source §11.5, `AGENTS.md` §12 |
| `TradeConfirm` | push (review gate) | deliberate gate before money moves |
| `Portfolio` | push | hierarchy |
| `Wallet` | push (new screen) | hierarchy |
| `MarketLedger` | push | hierarchy |
| `AssetLeaderboard` | push | hierarchy |
| `Buyout` | push | hierarchy |
| `CoOwnIssue` | push | hierarchy |
| Rights sheet | **modal** | temporary task |
| Fullscreen media viewer | **fullscreen modal** | immersive media (`AGENTS.md` §12) |
