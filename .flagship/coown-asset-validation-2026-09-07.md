# Co-Own / Asset Detail flagship validation

**Date:** 7 September 2026  
**Workspace:** `C:\Users\User\Desktop\thryftverse-upgrade`  
**Branch:** `feat/product-detail-contract-media-device-closure`  
**HEAD at validation start:** `6c00bbc6b62d6995dca5f1b84aa17561340ac7`  
**Scope:** Co-Own Hub, Asset Detail (Overview / Market / Ownership), due diligence, trade ticket, confirmation, order-book and price-history contracts.

## Decision

The gap-closing work is materially present. Co-Own now reads as a credible fractional-asset market surface: it distinguishes offering/reference/last-trade prices, shows OHLCV history, live depth, executions, open orders, holdings and P&L, and carries rights, risk and corporate-action context.

It is **not yet 1:1 with a public-equity detail page and is not release-approved**. The information architecture is stock-like; the instrument, venue, legal and operating model are different. Native visual proof and live staging evidence are still missing, and repository release gates are still red.

Status: `IMPLEMENTED — LIVE ENDPOINT VALIDATION PENDING` and `IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING`.

## What was upgraded in this validation wave

- **Source-backed freshness:** the asset endpoint now returns `marketSnapshot.sourceAsOf`, derived from the newest public market event, settled execution or active-book update. `asOf` remains response assembly time and is no longer used as proof that an old mark is live (`backend/api/src/routes/coOwn.ts:5344`). Timestamp formatting is explicitly UTC.
- **Authoritative economics:** the asset contract exposes `tradingFeeRate`; the overview, market rules, trade quote, reservation, confirmation and receipt all use the same backend-sourced rate (`backend/api/src/routes/coOwn.ts:5579`, `frontend/src/services/marketApi.ts:352`, `frontend/src/screens/TradeConfirmScreen.tsx:109`).
- **Primary offering execution:** the asset-detail dock no longer blocks a valid primary buy merely because secondary depth is empty. Selling is explicitly unavailable until allocation closes (`frontend/src/screens/AssetDetailScreen.tsx:740`). The trade ticket can use the backend offering price as an executable source while still rejecting development-fallback depth (`frontend/src/screens/TradeScreen.tsx:352`).
- **Failed-offering safety:** an offering that is closed before full allocation is now treated as paused, not as a buyable primary market (`frontend/src/components/coown/asset-detail/types.ts:25`).
- **Backend lifecycle alignment:** the API now projects a failed allocation as `paused` instead of `pre_market`, so other clients cannot mistake a closed offering for an executable one (`backend/api/src/routes/coOwn.ts:82`).
- **Truthful market states:** stale/degraded secondary data pauses trading, changes the depth indicator to a warning state and provides a refresh action (`frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:135`).
- **Chart fidelity:** requested ranges now fit the viewport instead of clipping long histories; range changes clear the previous series; tap/hold inspection is real, includes date/time plus OHLC and volume, and is exposed to assistive technology (`frontend/src/components/coown/CoOwnCandleChart.tsx:85`).
- **Trust/legal fail-closed:** absent custody, appraisal, insurance, provenance, buyer-protection and rights evidence is now rendered as unavailable or omitted rather than replaced by confident copy (`frontend/src/components/coown/asset-detail/AssetOverviewSection.tsx:300`, `frontend/src/components/coown/asset-detail/AssetOwnershipSection.tsx:1`, `frontend/src/screens/AssetDueDiligenceScreen.tsx:182`).

## Validation evidence

| Check | Result | Interpretation |
|---|---:|---|
| Frontend TypeScript | PASS | `tsc --noEmit` completes cleanly after the final changes. |
| Backend TypeScript | PASS | API contracts and route changes compile. |
| Backend build | PASS | `tsc -p tsconfig.json` completes cleanly. |
| Focused Co-Own suite | PASS | 6 files, 112 tests passed. |
| Full frontend suite | FAIL | 84 files passed, 1 file failed; 1,762 passed, 6 failed, 2 skipped. All six failures are the existing source-string `groupChatInfoParity` expectations for unrelated chat controls. |
| Backend targeted tests | BLOCKED | Privacy/realtime tests pass; `coownMatchingProperty.test.ts` uses Vitest globals under the configured Node test runner, and the integration test is skipped. Runner ownership must be corrected before this is a meaningful backend release gate. |
| Visual-gates report | FAIL | 49 P0, 15 P1 and 139 warnings remain in the repository-wide report. |
| Golden parity | FAIL | The 12 root golden PNGs are 70-byte 1×1 placeholders; fixture/integration captures are absent. The gate cannot prove native pixels. |
| Residue check | FAIL | Five errors remain for development demo-mode assignments in `galleriaApi.ts` (plus 135 warnings). |
| Expo Doctor | FAIL | 18/20 checks pass; app-config schema/security-field issues and Expo/RN patch-version mismatches remain. |
| Diff hygiene | PASS (CRLF-aware) | `git -c core.whitespace=cr-at-eol diff --check` is clean; ordinary Git output only reports the repository's LF/CRLF normalization warnings. |
| Live API | NOT RUN | No API listener was available on the expected local ports during this validation. |
| Native device/emulator | NOT RUN | No signed device walkthrough or screenshot matrix was available. |

## Does it perform like an equity / stock listing?

**Interaction model: mostly yes.** The surface now has the core detail-page sequence a market user expects: instrument identity → dominant price semantics → change/volume/spread → historical chart → order book → executions → order entry → position/rights/risk context. That is a good fit for a fractional collectible market.

**Public-equity parity: no, and it should not claim to be.** Current gaps are:

| Equity-detail expectation | Co-Own status | Remaining gap |
|---|---|---|
| Last price versus reference/offer | Implemented | Need an explicit source/venue/session line in the UI. |
| 1D–MAX chart with point inspection | Partially implemented | Ranges and OHLC inspection exist; no visible price axis, date axis, drag/pan inspection or accessible tabular fallback. |
| Quote/depth/executions | Implemented | Must be proven with live staging data, reconnects and sequence-gap recovery. |
| Position, average cost and P&L | Implemented when backend rows exist | Add cache invalidation/re-fetch evidence after fills. |
| Standard order types | Partial | Current contract is market, protected market and limit. Stop, stop-limit and trailing-stop are not present; add only if the product actually needs them. |
| Issuer/security research | Partial | Dossier, rights, risk and corporate actions exist; no ticker/venue/session/timezone or standard issuer financial/news/analyst projection. Some of those are not applicable to a physical-asset SPV and should be explicitly labelled as such. |
| Trust, custody and legal terms | Fail-closed foundation | Live document URLs, legal classification and jurisdiction-specific disclosures still need staging and qualified review. |

For comparison, Robinhood documents detail pages with historical chart ranges, point inspection, positions/returns, stats, news, financials, earnings and related context ([Viewing stock details](https://robinhood.com/us/en/support/articles/viewing-stock-detail-pages/)); its chart guidance covers line/candlestick OHLC semantics, ranges and volume ([Using charts](https://robinhood.com/us/en/support/articles/using-charts/)); and its order model includes market, limit, stop, stop-limit and trailing-stop orders ([Order types](https://robinhood.com/us/en/support/articles/360001213963/)). Co-Own now matches the first market-detail layer, not the full public-security operating model.

## Remaining upgrades, ordered by release risk

### P0 — required before any “battle ready” claim

1. Run the API against a real staging database and record successful asset, price-history, order-book, preview, reserve, confirm/place, cancel and holdings flows. Exercise primary allocation, secondary fills, insufficient funds/units, duplicate idempotency keys, webhook replay, timeout/unknown outcome, reconciliation halt and reconnect/sequence-gap recovery.
2. Replace placeholder visual goldens with same-device captures. Make missing captures fail the gate, then review Co-Own at target widths, light/dark mode, loading/empty/error/offline/stale states and large text.
3. Fix the six chat parity assertions or formally remove the obsolete test contract, and split the backend Vitest/Node runner so backend checks cannot appear green while the principal Co-Own test is not executing.
4. Obtain qualified product/legal review of fractional ownership, 1ZE settlement, custody, protection, transferability, marketing language and UK launch obligations. A stock-like UI is not evidence of an equity or exchange licence.

### P1 — required for a convincing flagship market surface

1. Add an asset-scoped open-orders endpoint instead of filtering a 200-item account-history window; invalidate asset, holdings, order-book and history queries transactionally after a fill/cancel.
2. Add a versioned market-stat projection where applicable: open/high/low/previous close, 52-week range, volume and a clearly labelled source timestamp. Do not add P/E, dividend yield, market cap or NAV unless the backend can evidence those concepts for this instrument.
3. Finish chart ergonomics: visible scale/date cues, drag/hold inspection, sparse-trade marks, and an accessible OHLC/date/volume table fallback. Keep the chart’s current no-interpolation behaviour for sparse trades.
4. Publish venue/session/timezone/quote-source metadata, or explicitly label Co-Own as an issuer-run fractional market with no public-exchange session.
5. Align Expo dependencies/configuration with the SDK 57 patch line, without deleting security-related Android fields until they are assessed.

### P2 — refinement after live proof

- Native performance and screenshot matrix: first meaningful content, first media frame, memory through repeated chart/order-book journeys, Dynamic Type, screen-reader order and dark-mode geometry.
- Reduce remaining card-on-card utility composition and verify the Co-Own first viewport with thumbnail and squint tests.
- Remove stale comments and demo residue that mention competitor benchmarks as implementation claims.

## Final acceptance statement

The Co-Own department is now **structurally market-grade and materially closer to an equity-detail interaction model**, with the important false-truth surfaces removed. It is **not 100% compatible with public stock listings, not proven live, and not release-ready** until the P0 evidence and gates above are closed. The highest-return next work is staging proof, release-gate repair and chart/market metadata depth—not another broad feature wave.
