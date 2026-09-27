# Flagship Cross-Reference Research — Web App vs Reference Implementations

Date: 2026-09-26 · Scope: `web/src` audited against Vinted, eBay, Depop, Instagram, Pinterest, TikTok Shop, Whatnot, Polymarket, Kalshi, Robinhood, StockX/GOAT, Etsy, Airbnb, Linear, Coinbase + native mobile app (`frontend/src`) as product contract.

Method: 9 department agents × (live competitor research + deep code audit with file:line evidence). Per-dept reports in this directory. Post-R2-fix codebase (all prior honesty/a11y fixes landed).

---

## Executive verdict

The web app's **grammar and honesty layer is now genuinely flagship** — facet-count honesty, capability-gated purchase CTAs, payment-intent truth, disclosed simulation, APG primitives, return-case state machine, and chart keyboard access exceed several references. The residual gap is not polish; it is **unwired capability**:

> The single largest systemic finding: endpoints and contract fields the mobile app already consumes are untouched on web — recommendations serve, feed feedback, chat typing/pagination/reactions/edit, proxy bidding (`maxBidGbp`), in-show lot auctions, reserve price, PDP delivery/returns fields, vacation mode, promoted-listings management. These are wiring tasks, not design work.

Second theme: a handful of **residual truthfulness nits** where the UI claims more than the data ("Made for you" on an unranked feed, hardcoded reserved balance, pre-seeded alerts, member-search overpromise, zoom cursor without zoom).

---

## Severity-ranked gap table (cross-dept)

### P0 — capability unwired / truth violations

| # | Dept | Gap | Evidence |
|---|------|-----|----------|
| 1 | discovery | "For you" feed is local re-sort of fixture; `/recommendations` endpoint (requestId/serveMode/reasonCodes) exists, mobile consumes it | `rankFeed.ts:66-108` vs `frontend .../useForYouFeed.ts:130-301` |
| 2 | discovery | "Made for you" labels unranked shared feed — dishonest | `app/explore/page.tsx:97` |
| 3 | trading | Realized P&L books gross proceeds as profit (cost basis ignored) | `useCoOwnTrading.ts:219-221` |
| 4 | trading | `GBP_RESERVED = 18.5` hardcoded "Reserved for open orders" | `convertViewModel.ts:25` |
| 5 | trading | `PRICE_ALERT_SEED` ships pre-set alerts a user never created | alert seeds |
| 6 | auctions | Proxy/max-bid (`maxBidGbp`) shipped on mobile + accepted by backend; web drops it | `services/auctions.ts:102` vs mobile `BidSheet.tsx:577` |
| 7 | messaging | Load-older cursors (`oldestCursor`/`hasMore`) + typing events exist; web polls 15s and drops the envelope | `services/chat.ts:44-56` vs mobile `chatApi.ts:483-500` |
| 8 | commerce | PDP lacks delivery estimate + returns line — mobile contract carries `shippingPrice`/`estimatedDelivery*`/`returnPolicy`; web shows "calculated at checkout" | `listingDetailContract.ts:140-162` vs `BuyPanel.tsx:449-463` |
| 9 | profile | No highlights rail — mobile mounts `PosterHighlightsRail` on both profiles; web pipeline exists but only under /poster/archive | `MyProfileScreen.tsx:317` |

### P1 — missing flagship grammar

| # | Dept | Gap |
|---|------|-----|
| 10 | discovery | No feed controls (Not interested / Show less / Undo) — mobile + every 2026 reference ships them |
| 11 | discovery | No "Why am I seeing this" explainability (mobile `FeedExplanationSheet`); no refresh grammar ("N new drops" pill / pull analogue); failed refresh nukes populated feed instead of stale-keep + banner |
| 12 | discovery | `nextCursor` fetched and discarded — no infinite scroll; static HOME_SIGNALS vs mobile dynamic chips |
| 13 | search | Facet state not in URL (read path exists, no write-back); no colour facet (vocab exists); single-select brand/size/category vs mobile multi-select; "Best match" is input order not scoring |
| 14 | search | Header placeholder "items, brands, members" — no member search exists (honesty nit) |
| 15 | messaging | Edit/delete + reactions endpoints exist; render-only on web; no in-thread safety prompts (mobile `chatSafetyWarnings`); no order strip in DM; no Unread filter; notification pagination cursor unwired |
| 16 | auctions | No in-show lot auctions (mobile `LiveLotDock`/`placeStreamBid`/`settleLot` — the Whatnot mechanic); ended grammar thin (no reserve-not-met/second-chance/payment deadline; create form never surfaces `reservePriceGbp` the API accepts); "Six-hour windows" header copy wrong (3/6/12/24); chip countdowns flatten <10m; no auction notifications (mobile outbid/won/ending_soon rows) |
| 17 | seller | No vacation/holiday mode seller control (buyer-side gate already exists!); promoted-listings manage flow absent (contract field consumed by feed); no smart-sell negotiation policy, AI listing assist, bulk actions, per-listing analytics |
| 18 | commerce | No one-active-offer guard, −40% offer cap, seller auto-respond, bundle offers; gallery zoom cursor over-promises (no magnification); Q&A writes session-local in live; no pre-checkout delivery certainty; card+bank only (no wallet/BNPL rails) |
| 19 | trading | Syndicate contributions debit nothing; live receipts project `unitsHeld:0`/whole-pot income; MarketRow sparkline reads fixture candles in live; dead CandleChart; no TIF/post-only/review step/dollars-mode ticket; no escrow disclosure |
| 20 | profile | Moodboards divergent (web linear vs mobile freeform canvas/collaborators/comments); SaveToBoardSheet lacks recent-boards/search/inline-create; no board sort/reorder/sections/cover-picker; looks read-only (mobile comments/carousel/hotspots/composer); share grammar inconsistent; followers lists are deterministic fixtures |
| 21 | chrome | No settings search (mobile ships it); no personal-info rows; sessions/2FA fixture-only; badge colour semantics (cart count = danger red); onboarding fires OS prompt with no pre-disclosure; SignupWall dead after dismissal; password policy 6 vs 8 inconsistent; sheet grab-handle non-functional |

### P2 — polish / secondary parity
Pulse drops mobile trending/LiveNow rails; video autoplay + long-press peek absent; first viewport lead-in ~700–1000px before first shoppable row; DESCRIPTION_MIN=10 thin; fixture "watchers" = likes×0.4 synthetic; no sold-for comps; no away-mode banner; PaymentRails narrow; followers fixture pools.

---

## Where we already exceed references (keep)

- Facet-count honesty computed per-dimension-relaxed (eBay contract)
- Return-case bilateral state machine (deeper than eBay)
- Offer negotiation: expiry, counter ladder, canonical role matrix, real order on accept
- Chart keyboard nav + table alternative (exceeds Robinhood/Polymarket)
- Catalog import trust grammar (consent → review workbench → receipt)
- Masonry balance on server-truth aspect ratios; authored interleave grammar
- A11y plumbing: pre-paint prefs restore, focus-trapped dialogs, combobox APG
- Onboarding permission recovery states; disclosed simulation everywhere

## Suggested wave-3 ordering

1. **Truth quick-wins** (hours): "Made for you" relabel/gate, GBP_RESERVED derive, PRICE_ALERT_SEED gate to empty, members-search placeholder fix, "Six-hour windows" copy, P&L cost basis, zoom cursor honesty.
2. **High-value wiring** (contracts exist): recommendations serve + feed feedback + explanation sheet; chat cursors/typing/reactions/edit; `maxBidGbp` proxy + reservePrice field; PDP shipping/delivery/returns fields.
3. **Parity surfaces**: highlights rail, vacation mode, member search, colour facet + multi-select + URL facets, order strip in DM, Unread filter, offer guards (one-active, −40% cap).
4. **Depth**: in-show lot auctions, ended-auction grammar, moodboard canvas parity, infinite scroll, settings search, syndicate settlement.
