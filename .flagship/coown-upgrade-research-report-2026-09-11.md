# Co-Own Department — Flagship Upgrade Research Report

**Date:** 2026-09-11
**Author role:** Senior full-stack / mobile-architecture review (20-yr SWE perspective)
**Scope:** ThryftVerse Co-Own asset-detail, trade, diligence, ownership and governance surfaces
**Method:** 6 parallel research tracks (codebase archaeology, art/auction competitors, broker UX, fractional-ownership competitors, React Native 2026 platform research, financial-UX/regulatory research). All external findings are live `web_search`/`webfetch` results from July–September 2026. Sources are labeled **DIRECT** (official docs/filings/product pages) or **SECONDARY** (reviews/analysis). No screen was captured by a live browser; pixel-level claims are deferred to device validation.
**Governing documents:** `AGENTS.md` (flagship execution charter), `Design.md` v1.8 (neutral flagship design system, benchmark 2026-09-22), `.flagship/research-ledger-asset-detail-2026-09.md`, `.flagship/research-ledger-chart-market-2026-10.md`, `.flagship/decisions.md`.

---

## 1. Executive summary

The Co-Own asset-detail surface is already the most complete fractional-ownership implementation among the platforms audited. After Wave 39 it has: a three-tab broker-style layout (Overview / Market / Ownership), an interactive Skia candle/line/area chart with range controls, a top-of-book quote strip with honest state labels (Offline / Quote error / Synchronizing / Orders paused / Market closed / Stale quotes), a real order book with Ladder | Depth | Tape views, open-orders management, a consolidated dossier sheet (provenance, condition, custody, appraisal, documents, fees, risk), a rights sheet, a due-diligence screen, distributions with DRIP plumbing, and a 7-state action dock.

**The remaining gap to flagship is not visual polish — it is trust architecture, regulatory-fit disclosure, and governance surface.** Every competitor studied (Masterworks, Rally, Arrived, Republic, Public Alts, Splint Invest, Willow Wealth) leads with a legal-vehicle disclosure, an offering document, a fee waterfall, and an explicit illiquidity warning. ThryftVerse has the *data* for most of this (the backend already returns `legalVehicleType/Name/Jurisdiction`, `issuerJurisdiction`, `escrowPartner`, `safeguardingPartner`, `feeSchedule`, `riskDisclosures`, `rights`) but does not yet surface it in the composition regulators and top-tier platforms use.

Three findings dominate:

1. **Legal/trust surface is the flagship differentiator.** Masterworks files a Reg A offering per artwork; Arrived shows a dedicated Risk Factors document per property; Splint Invest pre-defines exit scenarios. ThryftVerse returns the same class of data but presents it as sheet content one level deeper than competitors. The fix is a first-class **"What you own" card + Asset Prospectus sheet** on the Overview tab, not more tab content.

2. **Governance is half-built.** The backend exposes `GET/POST /co-own/corporate-actions/:id/votes` with quorum and pass-threshold fields; the frontend has no voting UI. Rally's buyout vote is the most-cited governance pattern in the fractional market — we have the contract and not the screen.

3. **Market truth is ahead of competitors; keep it that way.** None of the eight competitor detail surfaces studied expose observable loading/empty/error/offline/stale states. ThryftVerse already does. The next edge is *price-health* signaling (last-updated timestamp + connection dot) and socket-render performance, not more chrome.

---

## 2. Current-state assessment (codebase archaeology, 2026-09-11)

### 2.1 Surface inventory

- `AssetDetailScreen.tsx` (1,187 LoC) — orchestrator: media stage → identity → sticky tab rail → section → related rail → dock → 8 sheets.
- Sections: `AssetOverviewSection` (432), `AssetMarketSection` (739), `AssetOwnershipSection` (567).
- Sheets: `AssetDetailModals` (634) hosts fullscreen media, first-trade guide, rights, risk disclosure, supply, overflow, dossier, price alert.
- Market stack: `CoOwnCandleChart` (815, Skia), `CoOwnOrderBook` (671), `CoOwnDepthChart` (342), `CoOwnMarketStatusStrip`, tape.
- Ownership stack: position hero, buyout CTA, corporate-action log, rights row, distributions, DRIP toggle component, calendar.
- Outbound routes: `AssetDueDiligence`, `Trade`, `DistributionHistory`, `CorporateActionDetail`, `Buyout`, `CoOwnOrderHistory`, `CoOwnPriceAlerts`, `CoOwnIssue`, `CoOwnHub`, `AssetDetail` (related).

### 2.2 Data contract richness (already returned by `GET /co-own/assets/:assetId`)

`MarketCoOwnAsset` already carries the fields the trust surface needs — this is why the recommended work is mostly UI composition, not new backend surface:

- Legal/vehicle: `legalVehicleType`, `legalVehicleName`, `legalVehicleJurisdiction`, `issuerJurisdiction`, `listingTier`
- Protection: `escrowPartner`, `escrowTermsUrl`, `safeguarded`, `safeguardingPartner`, `safeguardingEvidenceUrl`, `safeguardingTermsUrl`, `buyerProtection`, `buyerProtectionTermsUrl`
- Custody: `custodianName`, `custodianLocation`, `custodyInsured`, `custodyInsurer`, `custodyPolicyRef`, `custodyCoverageGbp`
- Authenticity/appraisal: `authenticityStatus/Method/VerifiedAt`, `conditionGrade`, `appraisalValueGbp/ValuedAt/Valuer`, `appraisalStaleDays`
- Market truth: `marketSnapshot` (`connectionStatus`, `sourceAsOf`, `lastExecutionPriceGbp`, `volume24hGbp`, `marketMovePct24h`, `bestBid/Ask`), `staleMarkDays`, `marketAuditEvents`, `trustAuditEvents`
- Economics: `feeSchedule`, `tradingFeeRate`, `totalTradedValueGbp`, `activeBuyoutOffer`, `lockupEndDate/Months`
- Lifecycle: `offeringStatus`, `marketStatus`, `capabilities`

### 2.3 Verified defects / dead wiring (from archaeology)

| ID | Finding | Location |
|----|---------|----------|
| CODE-1 | DRIP props exist on `AssetOwnershipSection` but `AssetDetailScreen` never passes them — DRIP is dead on the detail surface | `AssetDetailScreen.tsx` ~1012–1061 |
| CODE-2 | No governance/vote screen though `GET/POST …/votes` endpoints and quorum/pass fields exist | `coOwn.ts:1427,1575` vs `navigation/types.ts` |
| CODE-3 | `tradingFeeRate` is a hardcoded constant (`CO_OWN_TRADE_FEE_RATE`), not per-asset | `coOwn.ts:6142` |
| CODE-4 | `activeBuyoutOffer.premiumPct` always `null` from backend | `coOwn.ts:6139` |
| CODE-5 | Hardcoded non-theme colors: allocation palette hexes, black gradient scrims | `CoOwnPortfolioAllocation.tsx:32-39`, `CoOwnFeaturedAsset.tsx:68`, `CoOwnMarketHighlightsCarousel.tsx:124` |
| CODE-6 | `coownAssetDetailRuntime.test.tsx` lacks mocks for `expo-secure-store`, `expo-network`, `react-native-mmkv`, `react-native-reanimated` → RN Flow `import typeof` parse crash in some import orders | test file vs `coownDossierSheetRegression.test.tsx:150-161` (has mocks) |
| CODE-7 | Media hero has no explicit a11y label/hint; related-rail image fallback is an unlabeled `View` | `RelatedAssetsRail.tsx:74` |
| CODE-8 | Bid/ask quote values expose `accessibilityRole="text"` but no "Bid price"/"Ask price" labels; sizes unlabeled | `AssetMarketSection.tsx:230,260` |
| CODE-9 | Ownership sub-queries (distributions, corporate actions) have no offline-specific state | `AssetOwnershipSection.tsx` |
| CODE-10 | Quote strip lacks a last-updated timestamp / freshness dot (competitor standard: Coinbase `time` field, Robinhood "15 min delayed" label) | `AssetMarketSection.tsx` |
| CODE-11 | Chart canvas has screen-reader summary but no equivalent data table fallback | `CoOwnCandleChart.tsx` |

---

## 3. Competitor matrix (September 2026)

Legend: ✅ strong · ◐ partial/secondary surface · ❌ absent · n/a not applicable. Based on DIRECT observation of product pages/help/filings plus SECONDARY reviews. No competitor exposed observable loading/empty/error/offline states — a ThryftVerse advantage to protect.

| Capability | ThryftVerse (now) | Masterworks | Rally | Arrived | Public Alts | Splint Invest | Republic | Robinhood | Coinbase Adv. |
|---|---|---|---|---|---|---|---|---|---|
| Hero media + identity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ◐ (chart-led) | ◐ |
| "What you own" legal-vehicle statement | ❌ (in guide only) | ✅ Series LLC | ✅ Series LLC | ✅ SPV/REIT | ✅ Reg A series | ✅ | ✅ per-security | n/a | n/a |
| Entity/SPV structure diagram | ❌ | ◐ prose | ◐ prose | ◐ | ◐ | ◐ | ◐ | n/a | n/a |
| Offering circular / prospectus link in-page | ◐ (doc chips in dossier) | ✅ per-asset Form 1-A | ✅ per-series | ✅ per-property | ✅ | ✅ | ✅ Form C | n/a | n/a |
| Fee waterfall (all layers) | ◐ (feeSchedule rows; no sourcing/markup/conflicts) | ◐ (in ADV, not page) | ❌ "no fees" claim + embedded markup (SECONDARY) | ✅ itemized | ✅ itemized in help | ✅ cost-to-return ratio | ✅ issuer+investor fees | ✅ | ✅ maker/taker |
| Conflicts-of-interest disclosure | ❌ | ✅ Form ADV | ◐ | ◐ | ◐ | ◐ | ◐ | ✅ Reg BI | ✅ |
| Risk summary near CTA | ◐ (sheet, one level deep) | ◐ (circular) | ◐ | ✅ Risk Factors doc | ✅ prominent | ✅ | ✅ | ✅ | ✅ |
| "Capital at risk" standardized warning | ❌ | ◐ | ◐ | ◐ | ✅ "not SIPC/FDIC, may go to zero" | ◐ | ✅ | ✅ | ✅ |
| Appropriateness check / cooling-off | ❌ | ✅ accredited-ish flow | ❌ | ❌ | ◐ | ◐ | ✅ Reg CF limits | ✅ | ✅ |
| Client-money safeguarding vs asset insurance split | ❌ | ◐ | ◐ | ◐ | ✅ | ◐ | ✅ escrow | ✅ | ✅ |
| Top-of-book (bid/ask/spread/sizes) | ✅ + state labels | n/a thin | ✅ order book | ◐ windows | ◐ | n/a | n/a | ✅ Gold L2 | ✅ L1/L2/L3 |
| Order book ladder + depth + tape | ✅ all three | ❌ | ✅ book | ◐ | ◐ | ❌ | n/a | ✅ Legend | ✅ |
| Real-time market-state label | ✅ 6 states | ❌ | ◐ | ◐ | ❌ | ❌ | ❌ | ✅ | ✅ status pages |
| Last-updated / freshness timestamp | ◐ (stale badge, no timestamp) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ delayed label | ✅ `time` field |
| Governance / holder voting UI | ❌ (backend exists) | ❌ manager sole discretion | ✅ buyout vote | ❌ manager | ❌ | ✅ majority-vote exit | ◐ | n/a | n/a |
| Distributions + calendar (record/ex/pay) | ◐ (data has record/ex/payable; UI partial) | ◐ | ◐ dividends | ✅ quarterly | ◐ | ✅ | ◐ | ✅ tracker | n/a |
| Proceeds waterfall on distribution | ❌ | ✅ (sale costs→20%→net) | ◐ | ✅ | ◐ | ✅ | ◐ | ✅ | n/a |
| Tax documents hub | ❌ | ✅ | ✅ | ✅ 1099/K-1 | ◐ | ◐ | ✅ K-1 help | ✅ | ✅ |
| Exit/liquidity explainer w/ scenarios | ◐ (lockup chip, buyout CTA) | ◐ | ◐ | ✅ 5–7yr + windows | ✅ illiquidity warning | ✅ defensive/balanced/ambitious | ❌ | ✅ | ✅ |
| Offline/stale/empty/partial states | ✅ best-in-class | ? | ? | ? | ? | ? | ? | ◐ | ✅ status |
| Loading/perf budget (virtualized book, UI-thread price) | ◐ (unverified) | ? | ? | ? | ? | ? | ? | ✅ | ✅ |
| Full a11y (44pt, live regions, reduced motion, dyn type) | ◐ strong but hero/quotes gaps | ? | ? | ? | ? | ? | ? | ✅ | ✅ |

### Notable 2026 market facts (verified against primary sources where possible)

- **Masterworks:** PPEX ATS termination notice filed 2026-06-17, effective ~2026-12-14 (SEC Form 1-U) — liquidity channel uncertainty is a live industry event; do not hard-depend on any venue promise. 1M+ members, 32 exits, $77M+ distributed (platform copy — treat as marketing).
- **Rally:** Live and shipping (July 2026 jersey IPO newsletter); Alt-partnership exit path announced; restructuring/"PIKA" rumors are SECONDARY and unverified. 111/467 exits, median 1.20x (SECONDARY).
- **Otis:** Dead as a brand — acquired by Public (Mar 2022), `withotis.com` → public.com. Alts live on inside Public.
- **Arrived:** Secondary market launched Nov 2025 with monthly trading windows (help center); Q1 2026 report: $3.7M+ dividends, 95.2% occupancy.
- **Yieldstreet → Willow Wealth** (Nov 2025 rebrand); offering pages show target return, term, payment schedule, tax form, fee tables.
- **Fractional.art/Tessera:** defunct since 2023 — the cautionary tale (novelty without regulatory path).
- **"Loyal" fractional cars/watches:** does not exist — `loyal.app` is an ad-tech company. Nearest living analogs: WatchFy (Solana, proof-of-reserves, 0.5%/2.5% fees), Timeless (MiCAR, in-app trading + majority-vote exit), Splint Invest (scenario-based exits), ARTEX (Liechtenstein MiFID II MTF).
- **Brokers 2026:** every major broker shipped an AI/agent layer (Robinhood agent+Legend, Coinbase Advisor+modular widgets, Public Agents, eToro Tori, IBKR Claude connector, Webull Vega). Public **sunset its social feed** (Mar 2026) in favor of AI research — relevant to ThryftVerse's social-commerce direction: community surface on financial assets needs deliberate design, not a feed bolt-on.

---

## 4. Evidence-backed findings → design implications

### F1. The "ownership sentence" needs a first-class surface
Every credible fractional platform states the legal wrapper in the first scroll: "You are buying shares of [SPV], which owns [asset]." ThryftVerse returns `legalVehicleType/Name/Jurisdiction` but never renders it. **Implication:** Overview tab gets a "What you own" card (plain statement + legal vehicle row + jurisdiction + governing law) linking to the rights sheet. Data exists; this is pure composition. *(Sources: Masterworks/Rally/Arrived/Public Alts DIRECT; Tokenizer.Estate, AltStreet SECONDARY.)*

### F2. Fee truth is the industry-wide weakness — exceeding it is cheap
Competitors bury sourcing markup and performance fees in offering circulars (Masterworks ~10–11% true-up + 1.5%/20%; Public Alts 0–10% true-up + 2.5%/side + up to 10% carry — all SECONDARY/ADV-sourced). ThryftVerse's `feeSchedule` is already structured. **Implication:** add markup/sourcing and "fees apply whether you gain or lose" language to `CoOwnFeeSchedule`, plus a conflicts row ("ThryftVerse and affiliates receive fees from this vehicle"). No competitor does this well — it is a differentiator that costs composition, not infrastructure.

### F3. Risk must be one tap shallower
FCA Consumer Duty (PRIN 2A.5) and the high-risk-promotions regime require prominent, specific, understood risk communication; FCA research found 94% of pre-sale disclosure documents failed readability benchmarks. ThryftVerse's risk content is honest but lives in a sheet. **Implication:** a two-line risk summary on Overview above the fold ("You could lose all the money you invest. Co-Own units are illiquid and not FSCS-protected.") with tap-through to the full disclosure; active-choice acknowledgment at first order. *(FCA Handbook PRIN 2A.5, COBS 4 Annex 1, decision-points research — all PRIMARY.)*

### F4. Governance is the biggest functional gap
Backend exposes votes, quorum, pass thresholds, deadlines (`CoOwnCorporateAction.quorumUnits`, `passThresholdPct`, `votingDeadline`; `GET/POST …/votes`). No UI. Rally's buyout vote and Splint's majority-vote exit are the market norm. **Implication:** an "Open decisions" panel in Ownership + a `CorporateActionVote` screen (ballot, quorum progress, deadline, per-unit effect).

### F5. Protect the state-coverage lead; add freshness signaling
Competitors show none of the honest states ThryftVerse already ships. The next increment: a "last updated HH:MM:SS" line + connection dot on the quote strip (Robinhood's "15 min delayed" and Coinbase's `time` field are the pattern), stale-grayed values when unreachable, Buy disabled offline. The backend already returns `connectionStatus`, `sourceAsOf`, `serverTimestamp`, `stalenessThresholdSeconds`. **Implication:** UI-only change on `AssetMarketSection`.

### F6. Proceeds/distributions need the waterfall + calendar dates
`CoOwnDistribution` already returns `recordDate`, `exDate`, `projectedPayableDate`, `perUnitGbpMinor`, `status`. Arrived and Vanguard pattern: record/ex/payable dates and a gross→costs→fees→net→per-unit waterfall. **Implication:** extend `CoOwnDistributionCalendar` with the three dates; distribution detail gets the waterfall; add realized-vs-unrealized split in the position hero.

### F7. Safeguarding ≠ insurance — say so explicitly
Plum/Trading 212 pattern: separate "your money" (client funds, FSCS/safeguarding) from "your asset" (custody insurance). ThryftVerse returns both (`safeguardingPartner`/`escrowPartner` vs `custodyInsured`/`custodyCoverageGbp`) but the dossier blends them. **Implication:** dossier gains a two-row protection block: *Asset protection* (custodian, insurer, policy ref, coverage, exclusions) and *Money protection* (safeguarding partner, escrow, FSCS statement or honest "not covered").

### F8. Platform-performance baseline for 2026
React Native 0.82+ runs New-Architecture-only; Expo SDK 55 (RN 0.83) and Hermes V1 are the 2026 baseline. FlashList v2 needs no size estimates. Reanimated 4 requires `react-native-worklets`; Shared Element Transitions remain experimental — do not ship them. `@gorhom/bottom-sheet` v5 is the stable sheet; `react-native-screens` FormSheet is the iOS-native future. Victory Native XL v42 / Skia is the chart standard. **Implication:** verify dependency versions, drive quote ticks via shared values (not per-tick `setState`), batch socket updates 50–100ms, and check the order book is virtualized with a stable `keyExtractor`.

---

## 5. Gap registry (consolidated)

Full machine-readable registry: `.flagship/gap-registry-coown-2026-09.json`. Summary:

| Priority | ID | Gap | Driver |
|---|---|---|---|
| P0 | G-01 | "What you own" / legal-vehicle card absent from Overview | F1; all competitors |
| P0 | G-02 | Asset prospectus sheet (issuer, vehicle, fee stack, conflicts, risk factors, offering status) | F1/F2; Reg A / FCA POP pattern |
| P0 | G-03 | Prominent "capital at risk" summary + active-choice acknowledgment | F3; FCA Consumer Duty |
| P0 | G-04 | Conflicts-of-interest + embedded-markup fee disclosure | F2 |
| P0 | G-05 | Asset insurance vs client-money safeguarding split | F7; FCA safeguarding regime (PS25/12) |
| P0 | G-06 | Governance vote surface (endpoints exist, no UI) | F4; CODE-2 |
| P1 | G-07 | Appropriateness assessment + first-investment cooling-off | F3; FCA restricted mass market |
| P1 | G-08 | Quote-strip freshness timestamp + connection dot | F5; CODE-10 |
| P1 | G-09 | Distribution calendar record/ex/payable + proceeds waterfall | F6 |
| P1 | G-10 | DRIP dead wiring on asset detail | CODE-1 |
| P1 | G-11 | Realized vs unrealized P&L split | F6; broker standard |
| P1 | G-12 | Media hero a11y labels + media error/retry state | CODE-7 |
| P1 | G-13 | Bid/ask/sizes a11y labels; chart data-table fallback | CODE-8, CODE-11 |
| P1 | G-14 | Ownership sub-query offline states | CODE-9 |
| P1 | G-15 | Socket-update performance: UI-thread quote strip, batched book updates, virtualized ladder | F8 |
| P1 | G-16 | Investor eligibility limits surfaced pre-trade | F3; Reg A/CF, FCA |
| P2 | G-17 | Exit/liquidity explainer (secondary/buyout/redemption/wind-up scenarios) | Splint pattern; F4 |
| P2 | G-18 | Tax documents hub (form types + availability) | Arrived/Republic pattern |
| P2 | G-19 | Co-Own readiness checklist (KYC, risk, education, wallet, tax) | Track E onboarding |
| P2 | G-20 | Post-trade milestone education (first distribution, first vote, first sale) | Track E |
| P2 | G-21 | Loss/liquidity scenario illustration; concentration warning | FCA decision-points |
| P2 | G-22 | Hardcoded colors/gradients in 3 coown components → theme tokens | CODE-5; Design.md |
| P2 | G-23 | `coownAssetDetailRuntime` native-dep mocks (test infra) | CODE-6 |
| P2 | G-24 | `tradingFeeRate` hardcoded; `premiumPct` always null | CODE-3, CODE-4 (backend) |
| P3 | G-25 | iOS-native FormSheet evaluation; shared-element hero (when SET stabilizes) | F8 |
| P3 | G-26 | Dark-pattern audit pass (scarcity, countdowns, defaults) | FCA sludge research note |

---

## 6. Recommended upgrade waves

Progressive refinement per the charter — no reconstruction. Each wave is independently shippable and testable. **Implementation requires approval per the brainstorming gate; this report proposes, it does not authorize.**

### Wave A — Trust composition (P0, UI-only, highest leverage)
1. "What you own" card on Overview: plain-language ownership statement, legal vehicle name/type/jurisdiction, governing law, link to rights sheet. *(G-01)*
2. Asset Prospectus sheet (new authored pattern): issuer identity + verification, vehicle structure, offering status vs market status, full fee stack, conflicts, top risk factors, document links (extends the existing dossier document chips). *(G-02, G-04)*
3. Two-row protection block in dossier: asset insurance vs money safeguarding. *(G-05)*
4. Prominent risk summary line on Overview + active-choice acknowledgment before first trade. *(G-03)*
- Files: `AssetOverviewSection`, `AssetDetailModals`, `CoOwnFeeSchedule`, `CoOwnRiskDisclosure`, `AssetDetailScreen`. No backend changes — all fields already returned.
- Anti-AI check: flat canvas, hairlines, type scale for hierarchy; no new cards beyond the surface budget; neutral palette only.

### Wave B — Governance (P0, contract exists)
5. "Open decisions" panel in Ownership (active corporate actions with vote affordance, quorum progress, deadline). *(G-06)*
6. `CorporateActionVote` screen: ballot, per-unit effect, quorum/pass-threshold display, deadline, confirmation receipt.
7. Wire buyout `premiumPct` (fix CODE-4 backend null or remove the field honestly).
- Files: `AssetOwnershipSection`, new `CorporateActionVoteScreen`, `navigation/types.ts`, `marketApi.ts` vote client.

### Wave C — Market truth + performance (P1)
8. Quote strip: `last updated HH:MM:SS` + connection dot (live/stale/degraded/closed colors already semantic), stale-grayed values, offline disables Buy. *(G-08)*
9. Socket batching: throttle order-book deltas to ~80ms; quote values via Reanimated shared values, not React state per tick. *(G-15)*
10. Order book: verify FlashList v2 + stable `keyExtractor` + memoized rows. *(G-15)*
11. Media hero: a11y label/hint, image error/retry state, `accessibilityIgnoresInvertColors` on photography. *(G-12)*
12. Bid/ask/sizes a11y labels; chart `accessibilityRole="adjustable"` already present — add collapsible data-table fallback. *(G-13)*

### Wave D — Proceeds & ownership depth (P1)
13. Distribution calendar: record/ex/payable dates; distribution detail waterfall (gross → costs → fees → net → per unit). *(G-09)*
14. Wire DRIP props through `AssetDetailScreen` → `AssetOwnershipSection`. *(G-10)*
15. Position hero: realized vs unrealized split; cost-basis note for DRIP. *(G-11)*
16. Ownership sub-queries: offline-aware states matching Market tab. *(G-14)*
17. Eligibility limits surfaced in first-trade guide + trade screen. *(G-16)*

### Wave E — Lifecycle & education (P2)
18. Appropriateness assessment + 24h cooling-off (gated on jurisdiction decision). *(G-07)*
19. Exit/liquidity explainer with dated scenarios (lockup → windows → buyout → wind-up). *(G-17)*
20. Tax documents hub (expected forms, availability dates, downloads). *(G-18)*
21. Readiness checklist + post-trade milestone education. *(G-19, G-20)*
22. Loss-scenario illustration + concentration warning. *(G-21)*

### Wave F — Hygiene & infra (P2, parallel)
23. Token compliance: replace hardcoded palettes/gradients in `CoOwnPortfolioAllocation`, `CoOwnFeaturedAsset`, `CoOwnMarketHighlightsCarousel`. *(G-22)*
24. Test infra: add `expo-secure-store`/`expo-network`/`react-native-mmkv`/`react-native-reanimated` mocks to `coownAssetDetailRuntime.test.tsx` (mirror the regression suite's mock block). *(G-23)*
25. Backend: per-asset `tradingFeeRate` from DB; fix `premiumPct` null. *(G-24)*

### Deferred (documented, not scheduled)
- iOS FormSheet migration (G-25), shared-element hero transitions (Reanimated SET still experimental).
- AI/analyst layer on the market tab — every competitor shipped one in 2026, but it conflicts with the anti-AI design policy unless scoped to *data explanation* (spread/depth plain-language summary), never generative UI or recommendations. Requires a separate product decision.
- Social/community on asset detail — Public's 2026 feed sunset suggests demand is weak; revisit only with a native-commerce angle (holder updates from issuer, not user chatter).

---

## 7. Architecture / API implications

- **No new endpoints needed for Waves A–C.** The asset-detail payload already returns legal vehicle, safeguarding, custody, fees, risk, market snapshot, audit events.
- **Wave B:** vote client calls existing `GET/POST /co-own/corporate-actions/:actionId/votes`; verify response includes per-user ballot state and post-vote tallies; may need a `myVote` field (small backend addition).
- **Wave D:** distributions endpoint already returns record/ex/payable dates and per-unit minor amounts; waterfall needs `grossAmount`, `costs`, `fees` fields — verify presence; if absent, backend addition scoped to the distribution detail payload.
- **Backend defects to fix regardless:** `tradingFeeRate` hardcode, `premiumPct` null, plus the previously documented missing routes if still absent (`/co-own/distributions` and corporate-actions routes were listed missing in the Sept ledger but archaeology shows them implemented at `coOwn.ts:1032,1391` — the earlier ledger entry is stale; verify before treating as open).
- **Performance contract:** order-book snapshot carries `snapshotSequence`, `eventSequence`, `serverTimestamp`, `stalenessThresholdSeconds`, `reconciliationState` — sufficient for the freshness UI; no contract change needed.

## 8. Accessibility & performance requirements (normative)

From Track D (primary sources: RN docs, Apple HIG, Material, WCAG 2.2, Reanimated/FlashList/Expo docs):

- Touch targets ≥44pt iOS / ≥48dp Android — enforced; dossier ribbon, tab rail, dock chips already comply; audit any new Wave A–E controls.
- `accessibilityRole`/`Label`/`Hint`/`State` on every new control; `expanded` state on disclosures; `tab` role preserved on rail.
- Live regions `polite` for price/connection changes; `assertive` only for errors.
- `maxFontSizeMultiplier` on all financial figures; verify largest Dynamic Type doesn't clip quote strip or dock.
- `useReducedMotion()` / `ReduceMotion.System` for every animation added; no SET yet.
- Screen-reader equivalence: chart gets a data-table fallback; order book levels announce side+price+size.
- Offline: stale-data-with-badge (not skeleton) when cache exists; Buy disabled offline; queued-order UX is deferred pending product decision.
- Perf budgets: socket flush ≤100ms; no per-tick React state on the quote strip; order book virtualized; hero `expo-image` with blurhash + `priority="high"`; cold-start and screen-load tracked in Sentry with >99.9% crash-free target.

## 9. Measurement & verification plan

Per AGENTS.md — evidence before assertions:

1. **Typecheck:** `npx tsc --noEmit` → 0 errors in touched files.
2. **Unit/regression:** extend `coownDossierSheetRegression.test.tsx` pattern for each wave; target: every new surface has render + state + a11y assertions.
3. **Full suite:** `npm test -- --run` — no new failures; fix CODE-6 mocks so `coownAssetDetailRuntime` is robust to import order.
4. **Device validation:** running product on iOS + Android; small phone, large phone, tablet; portrait + landscape; light + dark; largest Dynamic Type; Reduce Motion on; VoiceOver/TalkBack pass on new surfaces; airplane-mode pass on Market + Ownership tabs.
5. **Convergence gate:** two consecutive waves with zero new defects found by adversarial re-review before claiming "flagship" on any surface.
6. **UX acceptance per surface:** the ownership sentence is readable in the first viewport; every fee is reachable in ≤2 taps; every state has a label; every number has a basis label (Offering / Last trade / Appraisal).

## 10. Risks & unresolved uncertainties

| Risk/uncertainty | Handling |
|---|---|
| Legal/regulatory status of ThryftVerse's vehicle (FCA authorisation? Reg A/CF equivalent? POP requirement at £5m+?) | **Requires counsel.** This report recommends *patterns*; jurisdiction mapping is a legal decision that gates Wave E item 18 and the exact risk-summary wording. |
| Masterworks PPEX termination (Dec 2026) / Rally restructuring rumors | Industry liquidity channels are unstable — never promise a venue; the liquidity explainer (G-17) must describe our own market mechanics only. |
| All competitor findings are search-snippet based (no live page capture) | Pixel/behavior claims deferred to device validation; screen-order claims have moderate confidence and are labeled. |
| `premiumPct`/`tradingFeeRate` backend semantics | Confirm intended contract before UI work in Wave B/F. |
| Social-commerce vs financial-surface tension | Public's feed sunset suggests caution; any community feature on asset detail must not resemble a stock-twits bolt-on. |

## 11. Source ledger

**Primary (official docs/filings/product pages):**
- SEC: Reg A guidance — sec.gov/resources-small-businesses/small-business-compliance-guides/regulation-guidance-issuers; Form 1-A — sec.gov/files/form1a.pdf; Reg BI — sec.gov/resources-small-businesses/small-business-compliance-guides/regulation-best-interest
- Masterworks Form 1-U (PPEX termination) — sec.gov/Archives/edgar/data/1999710/000149315226032438/form1-u.htm; Form ADV 2A (2026-03-30) — cdn.masterworks.com/.../1032849.pdf; sale-mechanics — masterworks.com/academy/posts/what-happens-when-masterworks-sells-a-work
- FCA: PRIN 2A.5 — handbook.fca.org.uk/handbook/prin2a/prin2as5; COBS 4 Annex 1 — handbook.fca.org.uk/handbook/cobs4/cobs4s16; PS25/10 POP — fca.org.uk/publication/policy/ps25-10.pdf; fractional shares — fca.org.uk/firms/fractional-shares; crowdfunding portfolio letter — fca.org.uk/publication/correspondence/expectations-investment-based-crowdfunding-platforms-portfolio-letter.pdf; decision-points research — fca.org.uk/publication/research/decision-points-consumer-journeys.pdf; sludge/digital-design note (2025-07-31) — fca.org.uk/publication/research-notes/digital-design-financial-products-services.pdf; pre-sale disclosure review — fca.org.uk/publications/multi-firm-reviews/review-how-well-pre-sale-investment-disclosure-documents-work-consumers
- Rally: rallyrd.com/collections/*, /faq/, /trading/, /investors/
- Arrived: arrived.com/properties/*; help.arrived.com (fees 10263157, tax 4504571, secondary-market articles); arrived.com/blog/Arrived-Q1-2026-financial-performance
- Public Alts: public.com/alts/charizard; help.public.com articles 6575009/6575024/6574987/6574982; Public social-feed sunset — medium.com/the-public-blog/sunsetting-social-df6cd474b575
- Republic: republic.com/wagyufactorymiami, /learn/investors/commission, fees help article
- Willow/Yieldstreet: yieldstreet.com/offering/*; willowwealth.com/direct-investing
- Splint Invest: splintinvest.com asset pages + exit-process FAQ; Timeless: timeless.investments; WatchFy: watchfy.io/how-it-works; ARTEX: artexgm.com
- Sotheby's: sothebys.com lot pages + buyer's-premium help (Feb 2026 schedule); Christie's: christies.com lot pages + app
- Brokers: robinhood.com support (advanced charts, order types, Legend, market data); help.coinbase.com advanced-trade + docs.cdp.coinbase.com product book; webull.com help/faq + developer.webull.com; ibkrguides.com mobile guides + releasenotes; etoro.com 2026 app press release
- Plum money-protections — withplum.com/en-gb/legal/money-protections; Trading 212 — trading212.com/money-protection
- Platform: reactnative.dev/blog (0.82, 0.84), docs.expo.dev (new-architecture, image, network), expo.dev/changelog/sdk-55, shopify.engineering/flashlist-v2, docs.swmansion.com (reanimated 4, worklets, useReducedMotion, SET), npmjs.com (flash-list 2.3.2, victory-native 42, gorhom bottom-sheet 5.2.14, react-native-screens 5.0.0-alpha.1), reactnavigation.org SET docs, tanstack.com/query react-native guide, w3c.github.io/wcag/guidelines/22, w3.org/TR/wcag2mobile-22, developer.apple.com/design, support.google.com/accessibility/android/answer/7101858, docs.sentry.io/platforms/react-native

**Secondary (reviews/analysis, labeled as such in sections above):** modernalts.com/compare/masterworks-vs-rally; angelinvestorsnetwork.com reviews (Masterworks, Arrived); roistreet.com (Masterworks, Rally, Yieldstreet); alternativeassets.substack.com (Rally restructuring — unverified); lenderkit.com Reg A vs CF 2026; tokenizer.estate + altstreet.investments (SPV models); appscreenshotstudio.com (trust-first patterns); techcrunch.com (Public/Otis acquisition); coindesk.com (Tessera shutdown); arttactic.com fractional monitor Jul 2026; state-management comparisons (dev.to, agilesoftlabs, reactnative.xyz); Medium RN order-book perf write-up; vp0.com hero-animations; reactnativerelay.com error handling.

**Access window:** all sources accessed via live search, 8–15 Sep 2026 (report date 2026-09-11). Full-text `webfetch` was unavailable to research agents; several regulatory PDFs are cited from search snippets + known canonical URLs and should be opened before drafting legal-adjacent copy.
