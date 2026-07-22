# 08 — Reference App Synthesis

**Goal:** what to borrow from Robinhood, Kalshi, Polymarket, Kite by Zerodha, Upstox — and what Co-Own must **not** imply. Mapped to ThryftVerse's warm-near-black, Inter, restrained aesthetic. Source research §12 (borrow matrix).

**The product thesis (source §12):**
> A curated alternative-asset exchange with an editorial Galleria front end, asset-specific ownership instruments and 1ZE settlement.

It is **not** "Polymarket for yachts". That phrase is mechanically incomplete and introduces the wrong consumer expectation.

---

## 1. Borrow matrix

| Reference | What it is good at | What Co-Own borrows | What Co-Own must NOT imply |
|---|---|---|---|
| **Stock exchange** (Kite/Upstox lineage) | stable instrument identity, order priority, auctions, post-trade records, corporate actions, surveillance | instrument series, CLOB where liquidity permits, deterministic matching, DvP, official market states, audit history | that every alternative asset is continuously liquid or equivalent to a listed equity |
| **Kalshi** | bounded contracts, explicit market rules, visible bids/offers, deterministic settlement, order review, reservations | precise market specifications, order review, reservations, position history, clear resolution states | that an asset unit is a bet, probability or cash-settled event contract |
| **Polymarket** | immediate positions, wallet-connected settlement, legible market activity, compact position feedback | compact position feedback, transparent open orders, fast settlement status, content-first discovery | that wallet UX, decentralisation language or token naming removes financial regulation |
| **Robinhood** | warm dark canvas, tabular mono numerals, dollar-first input, swipe-to-confirm, portfolio-first hero, restrained chart draw | warm-dark aesthetic (already have), tabular numerals (via `Numeric` tokens), 1ZE-amount-first buy input, hold-to-submit, portfolio hero | gamified green, one-tap checkout, oversimplified order book, "buy with £1" pushiness |
| **Luxury marketplace / auction house** | desire, provenance, editorial storytelling, specialist curation, private-client service | Galleria discovery, cinematic media, condition/provenance dossiers, concierge/RFQ paths | that a beautiful listing page is sufficient evidence of ownership, fair value or liquidity |

---

## 2. Per-app: borrow / adapt / reject

### 2.1 Robinhood

**Borrow:**
- **Warm near-black canvas** (`#0A0A0A` ≈ Robinhood's `#0a0c0d`) — ThryftVerse already has this; keep it.
- **Tabular mono numerals for all financial values** — implement via `Numeric` tokens + `CoOwnNumericText` (§02). This is the single biggest "feels like a serious exchange" lever.
- **Dollar-first input for buy** — default the order ticket to "How much 1ZE to spend?" with units shown alongside; toggle to units. Reduces cognitive load for first-time asset-unit buyers.
- **Portfolio-first hero** — "Spendable now" / "Total portfolio value" as the hero, not the market.
- **Restrained chart first-paint** — line draws in over 240ms (Robinhood's 800ms is too theatrical for an asset exchange; dial it down).
- **Swipe/hold-to-confirm for orders** — deliberate friction before money moves; implement hold-to-submit above threshold (§05).

**Adapt:**
- Buy/Sell split buttons with bid/ask shown under the label — adapt to show best ask under Buy, best bid under Sell, in `Numeric.mono`.

**Reject:**
- **Gamified neon green** (`#00C805`) — too casino for a luxury asset exchange. Use dark forest green `#1A6B3A` (same hue family as existing `success: #0c5728`).
- **One-tap checkout** — Co-Own needs review + confirm + disclosure, not one-tap.
- **Oversimplified order book (best bid/ask only)** — Co-Own must show 5 levels mobile / 10 tablet with depth bars (credibility).
- **"Buy with £1" pushiness** — no fractional-unit marketing popups.
- **Slot-machine number ticks** — rejected; tabular numerals update in place with a 120ms fade (§07).
- **Menu-icon-as-back inconsistency** — use a real back chevron (`CoOwnMarketHeader` already does).

### 2.2 Kalshi

**Borrow:**
- **Explicit market specifications** — every live series shows tick/lot/session/fees/settlement/disclosure-version (§01, §05).
- **Order review with reservations** — review screen shows max reserved, fees, plain-language summary (§05).
- **Position history with clear resolution states** — Submitted / Partially filled / Filled / Pending auction / Rejected (§05).
- **Conservative, non-gamified colour** — Kalshi's restraint is the right register for a regulated asset exchange.
- **Resolution/settlement date prominence** — adapt to instrument rights-version + next distribution + next reporting (§01 value strip).

**Adapt:**
- Vertical order book with bids/asks + spread prominently displayed — adapt with depth bars from `DEPTH_COLORS`.

**Reject:**
- **"Event contract" framing** — Co-Own units are not bets; never use probability/cents framing.
- **Limited order types as a permanent state** — Phase 1 limit + protected-instant is fine, but the roadmap adds GTT/brackets (§09); don't market "no advanced orders" as a feature.

### 2.3 Polymarket

**Borrow:**
- **Content-first discovery** — card-based discovery with strong imagery + key stats (already have via `CoOwnFeaturedHero` + `CoOwnAssetTile`).
- **Compact position feedback** — position badge on asset cards when viewer holds; quick "you own X units" inline.
- **Transparent open orders** — a clean open-orders list with cancel/modify.
- **Fast settlement status** — order → filled → in wallet, with clear status chips.
- **Inline expandable order book** — tap an outcome row to expand the book inline (adapt for AssetDetail).

**Adapt:**
- Bottom-sheet trade panel on mobile — adapt for the order ticket (§03 §3 presentation).

**Reject:**
- **"Invisible Web3" / wallet-connect / USDC framing** — Co-Own is 1ZE settlement via an authorised partner, not crypto-native. Never imply decentralisation removes regulation (source §1.1).
- **Card-based pattern as the only discovery** — Co-Own needs both Galleria editorial discovery AND a sortable Markets table (§03 §1).
- **No technical indicators / depth charts as a permanent choice** — Phase 1 line-only is fine, but candle + depth are on the roadmap (§09).

### 2.4 Kite by Zerodha

**Borrow:**
- **5-level depth with 20-level option** — mobile default 5, tablet 10, power-user 20 (§04 A3).
- **Dynamic depth bars** — visual overview of order concentration (§02 `DEPTH_COLORS`).
- **Tap any price level to place order** — `onSelectLevel` pre-fills the ticket (§04 A3).
- **Comprehensive order types** — GTT, AMO, Iceberg, order slicing on the roadmap (§09 Phase 3).
- **Market Protection feature** — Protected instant = marketable limit with protection price (§05).
- **Accessibility mode (colour-blind)** — greyscale + symbols; respect system setting (§07).
- **Low-data optimisation** — relevant for a mobile-first flagship; keep payloads lean.

**Adapt:**
- Market depth integrated into order window — adapt as `CoOwnDepthPreview` inside the ticket (§04 A4).

**Reject:**
- **Information-density overload** — Kite is for active traders; Co-Own's first-viewport must stay Galleria-clear. Depth is one tap away, not the hero.
- **Jargon (CNC/MIS/NRML)** — use plain language ("Delivery"/"Intraday" equivalents only if intraday even applies; for asset units, likely delivery-only at launch).
- **Chart theme separate from app theme** — keep one coherent theme.

### 2.5 Upstox

**Borrow:**
- **GTT + bracket orders** — on the roadmap (§09 Phase 3).
- **Basket orders** — potentially for club allocations (§09 Phase 4).
- **Smartlists (curated lists)** — adapt as curated Co-Own collections ("New issues", "Yachts", "Watches", "Art").
- **Option-chain-style depth with OI** — adapt as order-book depth with order-count per level.
- **Mobile-first excellence** — Upstox's mobile polish is a good benchmark for touch-target discipline.

**Adapt:**
- Allocation by sector → adapt as allocation by asset class + issuer concentration bands (§06).

**Reject:**
- **Multi-colour palette (purple/teal/orange)** — too busy for ThryftVerse's restrained aesthetic. Keep the single brand off-white + direction colours.
- **5X leverage marketing** — Co-Own launch is no-leverage (source §16 controlled pilot).

---

## 3. The combined interaction model for Co-Own

Distilled from the five references, mapped to ThryftVerse:

```text
DISCOVERY (Galleria + Polymarket content-first + Kalshi categories)
  Hub: segment rail (Active/Auctions/New issues/Watchlist)
       + featured hero (art-directed)
       + sortable market table (Kite-style columns)
       + your positions strip

INSTRUMENT (Robinhood hero chart + Kalshi market spec + Kite depth)
  AssetDetail: media hero
               + value strip (Market/Fundamental/Cash)
               + market-status strip
               + chart (line default, candle toggle)
               + ownership panel (authorised/issued/float/locked/treasury)
               + order book (5/10/20 levels, depth bars, tap-to-fill)
               + vehicle card + trust panel + dossier + rights sheet

EXECUTION (Kalshi review + Robinhood hold-to-submit + Kite protection)
  Trade: bottom-sheet ticket
         + 1ZE-amount-first buy
         + protected instant / limit
         + avg fill + worst price + impact
         + reservation state
         + post-trade preview
  Confirm: receipt + plain language + local-fiat + warning + disclosure
           + hold-to-submit above threshold

OWNERSHIP (Robinhood portfolio hero + Kite position detail + Kalshi history)
  Portfolio: hero (1ZE + today) + tiles (return/unreal/realised/distributions)
             + allocation bands + position rows (mark source/age, premium last/NAV)
  Wallet: spendable-now hero + 6 sub-balances + safeguarding partner
          + immutable activity + statements + add/redeem flows
```

---

## 4. What makes Co-Own feel premium (not cheap)

**Premium levers (in priority order):**

1. **Trustworthy numbers** — last/bid/ask/mid/NAV never conflated; every value has a type + timestamp; no fabricated liquidity. (Biggest lever.)
2. **Tabular mono numerals** — every 1ZE value via `CoOwnNumericText`; no horizontal jitter.
3. **Visible market state** — status strip on every trading surface; halted/closed/restricted designed, not hidden.
4. **Reservation transparency** — "1,267.05 1ZE will be reserved" before acceptance; wallet shows reserved sub-balance.
5. **Premium-of-last/NAV line** — the truth-telling element that separates a market premium from an appraisal gain.
6. **Restraint** — no gold, no glass, no confetti, no neon, no slot-machine ticks. Luxury from proportion + media + silence.
7. **Art-directed media** — editorial photography as the source of richness, not chrome.
8. **Complete states** — stale/halted/thin/auction/reconciliation all designed.
9. **Deliberate confirmation** — hold-to-submit above threshold; review screen with full disclosure.
10. **Accessibility built-in** — state-aware labels, no colour-alone, 200% text zoom verified.

**Cheap levers to avoid:**

- Fabricated books/prices/viewers.
- One-tap checkout.
- Neon/bright/light green or red. Direction colours are dark luxury shades: forest green `#1A6B3A`, cherry red `#8B2020`.
- Generic centred spinners.
- Unlabelled percentages.
- "Verified" badges on expired documents.
- Gold gradients, glass, decorative shimmer.
- Colour-alone state.
- Small touch targets.
- Stretched mobile cards on tablet (use two-column layouts — source §11.9).

---

## 5. The one sentence to keep in mind

> Co-Own is a curated alternative-asset exchange with an editorial Galleria front end, asset-specific ownership instruments and 1ZE settlement — it earns trust by showing when liquidity is absent, by separating market price from NAV, and by making every number, state and reservation visible and truthful.
