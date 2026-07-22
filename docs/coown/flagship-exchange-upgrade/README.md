# Co-Own Flagship Exchange — UI/UX Upgrade Plan

**Status:** Visual foundation complete; transaction specification pending.
**Prepared:** 17 July 2026
**Scope:** ThryftVerse Co-Own department — frontend surfaces, components, design tokens, states, motion, accessibility
**Source inputs:**
- `COOWN_MARKET_ECONOMIC_MODEL_AND_GALLERIA_UI_RESEARCH_2026-07.md` (canonical economic + interface spec)
- Reference-app UX study: Robinhood, Kalshi, Polymarket, Kite by Zerodha, Upstox
- Current codebase inventory (branch `creator/canonical-output-9x16-repair`, HEAD `e2d7f90`)

---

## 1. What this folder is

This folder is the **implementation-facing UI/UX upgrade plan** for reconstructing Co-Own as a flagship alternative-asset exchange. It translates the economic-model research into concrete screen compositions, components to build, token extensions, state coverage, motion rules, accessibility gates and a phased roadmap — all mapped to the **real files** in the current codebase.

It is not:
- a re-statement of the economic model (see the source research MD);
- a colour/gradient pass;
- a parallel implementation plan (`ScreenV2.tsx` etc. are prohibited by `AGENTS.md` §7);
- a documentation deliverable that does not lead to implementation.

It is the bridge from **model-first truth** to **rendered flagship surfaces**.

---

## 2. The product sentence this UI must serve

> **Discover exceptional assets, buy and sell verified ownership units in 1ZE, and receive the rights, distributions and exit proceeds defined for that instrument.**

Every screen, component, label, number and state in this folder must reinforce one of three qualities from the source research §1:

1. **Galleria-quality discovery** — editorial, art-directed, restrained.
2. **Exchange-quality execution** — explicit market rules, real order book, reservation, auditable settlement.
3. **Registrar-quality ownership service** — authoritative holdings, distributions, votes, exits.

If a proposed UI element does not serve one of these, it does not belong in the reconstruction.

---

## 3. Audit verdict — conditional go

This pack has been audited twice. The current verdict: **visual foundation complete; transaction specification pending.**

**Scores (second audit):** Product/visual direction 8/10 · Screen architecture 8/10 · Exchange/business-model completeness 6/10 · Money-moving implementation readiness 4/10.

**GO (visual foundation — no money moves):**
- Token + typography extensions (dark luxury shades, tabular numerals)
- `CoOwnNumericText`, exchange geometry, market-state badges
- Read-only Galleria discovery + asset dossier + value strip + order book display
- Empty/stale/halted/restricted/thin/reconciliation states
- Accessibility + responsive screen shells + skeletons
- Order-ticket UI using mocked or clearly simulated data (all simulated values labelled)

**NO-GO (transaction engine — money moves) until the contracts in `10-transaction-contracts-and-release-gates.md` are specified, implemented, and tested:**
- Wallet + redemption (Blocker 1: nonnegative buckets, `withdrawable ≤ available ≤ settled_claim`)
- Live order submission (Blocker 2: reservation = full max obligation; Blocker 4: market-data sequencing)
- Reservations + partial fills (Blocker 2 + Blocker 3: supply invariant)
- Portfolio accounting (Blocker 1 + Blocker 3)
- Club settlement (Blocker 6: coordinated individual allocation, not pooled)
- Buyouts + corporate actions (CA engine + record-date snapshot)
- Issuance activation (Blocker 5: versioned accepted rights, no "Rights TBC" on live instruments)

**NO-GO (regulatory):** public wording that 1ZE or "in-game currency" bypasses financial regulation. Product classification depends on economic substance and jurisdiction, not the UI label. Specialist financial-regulatory counsel required before launch.

See `09-implementation-roadmap.md` §0 (Safe implementation boundary) for the full blocker status table, and `10-transaction-contracts-and-release-gates.md` §15 (Final release classification) for the authoritative go/no-go.

## 4. Root-cause framing (why this is not a styling task)

The source research §2.4 is unambiguous: the visible quality problem is **not** "React looks cheap". The interface lacks enough economic truth to create the quiet confidence of a serious exchange. Flagship financial UI is produced by:

- coherent instrument identity;
- stable units and terminology;
- trustworthy numbers;
- visible market state;
- disciplined hierarchy;
- predictable interactions;
- proof close to the decision.

Therefore this upgrade is **model-first and component-system-first**. The plan below sequences work so that data truth (reservation, bid/ask, NAV vs market price, market state) lands **before** the visual polish that depends on it. Polishing a fabricated `currentPricePerShare` would make unproven claims look more convincing — explicitly prohibited by `AGENTS.md` §11 (Truthful UI).

---

## 5. Document index

| # | Document | Purpose |
|---|---|---|
| 01 | `01-economic-model-ui-mapping.md` | Maps the 6 canonical concepts (Asset, Vehicle, Instrument, Market, Position, 1ZE balance) to the UI surfaces that must express them. Replaces the single `CoOwnedAsset` display model in the interface. |
| 02 | `02-design-tokens-extension.md` | Extends the existing `colors.ts` / `designTokens.ts` with exchange semantics: market states, tabular numerals, up/down, depth, halt — without breaking the current warm-near-black aesthetic. Dark luxury shades only. |
| 03 | `03-screens-specification.md` | Per-screen target composition for every Co-Own screen, with first-viewport hierarchy, sticky actions, and state coverage. Canonical files only. |
| 04 | `04-components-to-build.md` | The new purpose-built components the exchange requires (order book, depth strip, candle chart, order ticket, market-status strip, NAV/market value strip, 1ZE balance breakdown, etc.) with props and placement. |
| 05 | `05-order-ticket-and-market-data.md` | The single highest-impact upgrade: `CoOwnTradeComposer` → exchange-grade order ticket with spread, estimated fill, worst price, impact, reservation state, review & confirm. Plus price-truth rules for last/bid/ask/mid/NAV. Collapsed default + expandable details. |
| 06 | `06-portfolio-wallet-upgrade.md` | `PortfolioScreen` and the 1ZE wallet: position rows with mark source/age, realised/unrealised split, concentration bands; 1ZE sub-balances (nonnegative buckets, strict invariant). |
| 07 | `07-states-motion-accessibility.md` | Loading/empty/filtered-empty/stale/halted/restricted/error/offline states; restrained motion language; full accessibility gates per `AGENTS.md` §17–18. |
| 08 | `08-reference-app-synthesis.md` | What to borrow from Robinhood, Kalshi, Polymarket, Kite, Upstox — and what Co-Own must **not** imply. Mapped to ThryftVerse aesthetics. |
| 09 | `09-implementation-roadmap.md` | Phased rollout aligned with the source research §15–16, with exit gates, the controlled pilot, safe implementation boundary, and 1ZE first-class product states. |
| 10 | `10-transaction-contracts-and-release-gates.md` | The transaction-engine contracts: canonical entities, order/trade/settlement state machines, double-entry ledger invariants, matching-engine rules, settlement & finality, corporate actions, valuation provenance, eligibility gates, market-data recovery, club edge cases, operational controls, and the phase-by-phase go/no-go checklist. **Authoritative for live-money release.** |

---

## 6. How to use this folder

1. Read `01-economic-model-ui-mapping.md` first — it defines the vocabulary every other doc uses.
2. Before touching any screen, read `03-screens-specification.md` for that screen and `05-order-ticket-and-market-data.md` if it touches trading.
3. Every new component must be checked against `04-components-to-build.md` (props, placement, state coverage) and `07-states-motion-accessibility.md`.
4. Token additions go through `02-design-tokens-extension.md` so the aesthetic stays coherent.
5. Phase work follows `09-implementation-roadmap.md`; do not jump to Phase 6 polish before Phase 2 truth lands.
6. **Before any money-moving work (Phases 3–5), read `10-transaction-contracts-and-release-gates.md` in full.** It is the authoritative transaction specification and release gate. No live order submission, wallet reservation, settlement, redemption, club allocation, or corporate action may ship until the contracts in doc 10 are implemented and tested.
7. `AGENTS.md` is the always-on charter — this folder operationalises it for Co-Own specifically.

---

## 7. Aesthetic anchor (do not drift)

The current palette is already correct for this work and must be preserved, not replaced. Exchange semantics use **darker luxury shades** — no light, bright, or saturated hues:

- **Canvas (dark):** `#0A0A0A` warm near-black — *not* pure black, *not* champagne gold.
- **Brand:** `#F4F0E8` warm off-white luxury accent.
- **Surfaces:** `#141414` / `#1F1F1F` graphite tiers with one-pixel tonal borders (`#262626` / `#333333`).
- **Direction up:** `#1A6B3A` dark forest green (same hue family as `success: #0c5728`, lifted ~1 stop).
- **Direction down:** `#8B2020` dark cherry red (same hue family as `danger: #7e0202`, lifted ~1 stop).
- **Market states:** navy `#1B2845` (continuous), taupe `#6B5D4F` (auction), cherry red `#6B1A1A` (halted), muted grey `#666666` (closed), deep plum `#3D2B3D` (RFQ) — all dark, desaturated, luxury-register. Shape (circle/diamond) + label distinguishes states alongside colour.
- **Type:** Inter (300/400/500/600/700/800). Tabular numerals for all 1ZE values.
- **Spacing:** 4/8/16/24/32/48 rhythm (`Space.xs..xxl`).
- **Radius:** three families only — controls (4), cards (8/12), media (0/full-bleed).
- **Motion:** 160–240ms, spring where physical, reduced-motion fallback mandatory.

Luxury comes from **proportion, media art direction, typography, precision and silence**. The exchange earns authority through **alignment, density control and exact states**. No gold gradients, no glass, no confetti, no casino flashes, no neon/bright/light colours. (Source research §11.10; `AGENTS.md` §4.)

---

## 8. Workspace verification (per `AGENTS.md` §1)

```text
Workspace root: C:/Users/User/Desktop/thryftverse-upgrade
Git root:        C:/Users/User/Desktop/thryftverse-upgrade
Remote:          https://github.com/K17ze/thryftverse-upgrade.git
Branch:          creator/canonical-output-9x16-repair
HEAD:            e2d7f904148a62c187b12cb9239912e0a7a98bd3
AGENTS.md path:  c:/Users/User/Desktop/thryftverse-upgrade/AGENTS.md
Execution mode:  Normal (implementation permitted; this folder is the plan)
```
