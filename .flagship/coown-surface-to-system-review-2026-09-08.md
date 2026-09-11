# Co-Own — fresh surface-to-system upgrade research
Assessment: **8 September 2026**, latest dirty working tree at approximately 23:48–23:55 BST. Scope: current Co-Own implementations, including their connected subpages and backend. Deliverable: research report only.

## Verdict

The department has progressed beyond its earlier implementation. The strongest direction is already present: collectible media, a dominant named price, flat market information, segmented asset sections, explicit ownership, and real order infrastructure. Preserve that direction.

The next substantial improvement is **a coherent decision experience from discovery to ownership and recovery**. Several screens now look structurally more considered in source, but the same asset can still have conflicting market status, quote freshness, order state, or valuation provenance across surfaces. Connected subpages have less complete recovery and product depth than the asset page.

**Broker-quality interaction and production readiness remain unproven.** The fresh API compile check fails; migrated-schema mismatches remain in order commands; chart range parameters are sent but ignored by the backend. Native composition cannot be graded from TSX alone. No current Co-Own device capture was available.

This report does not assign an invented parity percentage. It separates current defects, observed improvements, design proposals, and qualification work. “Equity/stock listing quality” here means precise prices, understandable ownership, dependable commands and readable market information. It does not establish that a collectible is a public equity or has stock-market liquidity.

## Evidence and boundaries

| Item | Current evidence |
|---|---|
| Workspace / Git root | C:/Users/User/Desktop/thryftverse-upgrade |
| Remote | https://github.com/K17ze/thryftverse-upgrade.git |
| Branch / HEAD | feat/product-detail-contract-media-device-closure / f5708b552835184c0d472ecb824a50f3f93990ca |
| Reviewed version | HEAD plus current uncommitted changes, including your latest upgrades and the interrupted implementation pass |
| Instruction sources | AGENTS.md; relevant Design.md financial, dense-row, chart, control and native acceptance contracts |
| Frontend TypeScript | Passed |
| Focused frontend tests | **15 files / 243 tests passed**, fresh run at 23:48 BST |
| Backend TypeScript | **Failed:** src/routes/coOwn.ts(4083,23), TS1005, comma expected |
| Visual baseline gate | **Failed:** fixture and integration screenshot directories missing |
| Native device | Android SDK adb returned no attached devices |
| Default local API | localhost:4000/health timed out after four seconds; no live market or mutation validation |
| References viewed | User's overall reference.jpg and extra reference for structuring llayout .jpeg; useful hierarchy references, not current Co-Own captures |
| Review team | Independent source reviews of frontend, backend, and connected journeys; main-agent source cross-check and fresh public research |
| Source changes in this fresh review | None. Only this new report was created; earlier uncommitted implementation changes remain present |
| Not established | Signed-device layout, screen-reader behavior, frame times, live SQL outcomes, notification delivery, deployed schema, or competitor account walkthrough parity |

The compile failure is a literal backtick around `is_open` inside a TypeScript SQL template. It came from the interrupted implementation pass in this task; it should not be attributed to your later visual upgrades. Fixing that syntax error alone will not close the schema and behavior findings below. [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:4083)

**Labels:** C = source-confirmed finding; T = fresh test/check; P = proposed refinement; V = runtime/native qualification needed. A source-confirmed failure path is not a claim that it was reproduced in production. Negative repository searches identify missing evidence, not proof that no external service exists.

### Skills applied

Nine relevant skills informed the review: flagship-autopilot (fresh evidence and parallel review), ui-ux-pro-max (chart/native guidance), make-interfaces-feel-better (optical and interaction detail), accessibility (semantics, scaling, targets), click-path-audit (ordered state transitions), react-native-patterns (state ownership and mobile behavior), contract-first (consumer/provider agreement), production-audit (migration and operational evidence), and agent-self-evaluation (report quality check).

These changed the report's structure: each surface has observable composition and interaction goals, and each consequential UI promise has an owner-layer requirement. Browser-only CSS recommendations were not applied mechanically to React Native. Additional unrelated framework skills would not strengthen this review.

## 1. What is already upgraded — do not reopen these as untouched gaps

| Earlier problem | Current position | Remaining qualification |
|---|---|---|
| Unknown order resolved by recency | Exact idempotency-key lookup and bounded polling now exist | Explicit retry/focus/relaunch recovery still incomplete |
| Buyout currency-symbol mismatch | Confirmation/input now explicitly use GBP | Per-unit versus total commitment remains unclear |
| Portfolio uses a different number from asset headline | Last settled price, otherwise reference, now drives marked value | Reference is internally labelled midpoint; freshness and lifecycle still drift |
| Primary sellout closes secondary market automatically | Auto-close assignment removed; explicit closure remains | Compile error and shared lifecycle policy still need closure |
| No stored order expiry | Migration 276 and new-order deadlines exist | Sweeper, reservations, history reason and realtime expiry propagation incomplete |
| Chart ranges disappear during empty/error | Chart remains mounted with range controls and retry | Server must honor dates; data-state copy still needs refinement |
| Chart scrub retains old callback/data | Refs and scrub reconciliation have been strengthened | Dense range readability and native gesture behavior unverified |
| Chart inaccessible beyond a label | Increment/decrement actions and textual OHLC exist | VoiceOver/TalkBack and non-color encoding still need acceptance |
| Portfolio stale after return | Focus revalidation exists | Overlapping refresh responses can still win out of order |
| Book selection lost through first-trade guide | Selected price now survives education handoff | End-to-end quote expiry/revalidation still needs exercising |
| Cancellation in history leaves shared projections stale | Shared Co-Own invalidation now exists | Detail cancellation has a different, weaker pending/unknown experience |
| Holdings fetch failure looks like zero ownership | Buyout/portfolio distinguish failures and partial results | Missing positions and incomplete totals must remain obvious |
| Governance lacks server eligibility checks | Backend checks action state and reconstructs record-date holdings | Frontend still offers votes when ineligible or closed |
| No component boundaries | Overview, Market, Ownership and Modals are separated | The detail orchestrator still owns many independent request state machines |
| Financial dark colors insufficient | Up/down tokens were changed to lighter dark-theme colors | Actual composed contrast and device rendering remain unverified |

Evidence: [SyndicateOrderHistoryScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/SyndicateOrderHistoryScreen.tsx:328), [AssetDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AssetDetailScreen.tsx:679), [coOwnPortfolio.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/services/coOwnPortfolio.ts:142), [CoOwnCandleChart.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnCandleChart.tsx:120), [AssetOverviewSection.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetOverviewSection.tsx:107), [276_coown_order_expiry.sql](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/db/migrations/276_coown_order_expiry.sql:1).

The earlier stack audit remains useful for its distinction between technical capability and demonstrated readiness; its historical failure counts are not current evidence. :codex-annotation{index="1"}

The earlier UI audit correctly emphasized connected behavior and native visual proof. Its numerical readiness scores and old defects are not carried forward as current measurements. :codex-annotation{index="2"}

## 2. Current research: what to borrow, and why

| Benchmark | Verified public behavior | Useful Co-Own translation |
|---|---|---|
| Rally | Custom bid/ask quantities and limits, explicit market/accepting-order states, partial fills, reserved cash, portfolio history; last-trade valuation does not guarantee executable price | Explain ownership and liquidity precisely; separate market permissions, available funds, marked value and sale estimate |
| Robinhood advanced charts | Chart inspection and order context support the transaction journey; advanced controls have specific scope and account/product constraints | Preserve asset/price/range context into order review; keep advanced chart tools subordinate to the decision |
| Trading 212 portfolio charts | Distinguishes current unrealised result from money-weighted return, with explicit cash-flow meanings; insufficient chart data does not hide account statistics | Keep current cost-versus-value truthful; introduce historical performance only with the required records and a named method |
| Coinbase Design System | Public chart components support scrubbing and contextual exploration; buttons expose loading and disabled states | Give charts stable geometry/readouts; retain button width/context through pending actions; one primary commitment |
| Apple accessibility and React Native | Larger text, semantic controls, state/value/action support are part of usability | Build adaptive financial rows and usable chart actions; verify on native assistive technology |
| TradingView | Time scales and whitespace data represent gaps explicitly | Decide and label elapsed-time versus trading-event spacing; never fabricate candles to fill inactivity |
| Nielsen Norman Group | Visibility of status and recognition reduce uncertainty and memory burden | Keep pending orders and the cause of disabled actions visible; preserve context through sheets and return navigation |
| TanStack Query | Native focus/connectivity integration requires explicit handling | One server-state owner for refresh, app resume, reconnection and mutation propagation |

Sources: [Rally trading](https://rallyrd.com/trading/), [Robinhood advanced charts](https://robinhood.com/us/en/support/articles/using-advanced-charts/), [Trading 212 portfolio charts](https://helpcentre.trading212.com/hc/en-us/articles/22435640547613-Portfolio-Charts), [Coinbase LineChart](https://cds.coinbase.com/components/charts/LineChart/), [Coinbase Button](https://cds.coinbase.com/components/inputs/Button/), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/), [React Native accessibility](https://reactnative.dev/docs/accessibility), [TradingView whitespace](https://tradingview.github.io/lightweight-charts/docs/next/api/interfaces/WhitespaceData), [NN/g heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [TanStack native guidance](https://tanstack.com/query/latest/docs/framework/react/react-native).

These are public documentation observations, not matched native screenshot studies. Coinbase's opened LineChart page documents a web component: its interaction principles transfer, not its DOM implementation. Rally's session and settlement rules are its own product rules; they should not be copied into ThryftVerse without an explicit business decision.

### The visual direction

**Collectible identity → named value → relevant market/ownership facts → one next decision.**

Keep imagery as the distinguishing feature from a generic brokerage. Keep financial values as the distinguishing feature from an ordinary listing. Use a shared neutral canvas and coherent type/row system; reserve containment for media, fields, selected modes, and commitment boundaries.

For the asset overview, the current source orders media, identity, issuer, tabs, provenance, and then chart. A stronger testable candidate is: **media → identity/price → tabs → price history → concise provenance → diligence**. This is a proposed composition, not a measured conclusion that the current chart is below the fold on every phone.

For a holder, surface position context earlier through a compact ownership summary or deliberate initial-tab policy. Do not silently change the selected tab during refresh or change the page structure unpredictably after data arrives.

## 3. Surface-level to deeper UI/UX upgrade register

Priority: **P1** blocks trust or a core existing journey; **P2** is substantial quality/refinement work; **P3** is later optimization. Proposed visual changes need native acceptance before adoption. Each row is a bounded upgrade to an existing implementation.

### A. Hub, search and watchlist

Owner evidence: [SyndicateHubScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/SyndicateHubScreen.tsx:215), [CoOwnInstrumentCard.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnInstrumentCard.tsx:64), [useStore.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/store/useStore.ts:1310).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U01 P2 P | Define a purposeful first viewport | Show heading/scope, at most one contextual portfolio module, and at least two meaningful assets or 4–6 compact rows on the chosen mode |
| U02 P2 P | Reduce repeated card metadata | Image + title + named price + one lifecycle/liquidity fact; put less urgent metadata on detail |
| U03 P2 C | Catalogue search/watchlist use only the first 120 fetched assets | Server search and cursor pagination; saved assets remain discoverable outside that subset |
| U04 P2 C | Price sorting uses reference price while display may use last trade | Sort on the displayed basis or explicitly call it reference-price sorting |
| U05 P1 C | Watch toggle commits local state before server acknowledgment; hydration service has no caller found | Pending/confirmed/failed watch states, reconciliation on login, account isolation, cross-device hydration |
| U06 P2 P/V | Media and watch controls need a stable optical contract | Category-sensitive crop, consistent selected icon, contrast over every image, independent watch tap without accidental asset navigation |
| U07 P2 P | Search/filter return continuity | Preserve query, active scope, sort and scroll position through detail/back; separate no results, no watched items and failed loading |

### B. Asset identity, navigation and first viewport

Owner evidence: [AssetDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AssetDetailScreen.tsx:860), [AssetDetailIdentity.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetDetailIdentity.tsx:90), [CoOwnSegmentNav.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/CoOwnSegmentNav.tsx:115).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U08 P2 P/V | Author the reading order around the user's decision | Compare current provenance-before-chart with chart-before-provenance at equal viewport widths; retain full story access |
| U09 P1 C | Identity relies on asset snapshot quotes while Market uses streaming quotes | Headline quote context, spread and ladder share a current source, or each clearly states its timestamp |
| U10 P1 C | Market/open language conflates lifecycle, stale data and connectivity | Separate “Market open”, “Offline — showing saved data”, “Orders paused”, and “Data unavailable” |
| U11 P2 P | Price basis is too easy to treat as execution price | Keep “Last trade”, “Reference”, “Appraisal” and executable buy/sell quote distinct; provide concise basis help |
| U12 P2 P/V | Tab changes share a long parent scroll container | Define per-tab scroll restoration and sticky behavior; selected section begins visibly without surprising jumps |
| U13 P2 C | Tab dots do not announce their meaning | Announce active orders or actual actionable distribution state; do not call every unsettled event “unclaimed” |
| U14 P2 P/V | Media→title→price geometry needs compact/large-text qualification | Preserve item silhouette; reflow long titles/prices and local reference values; dock never covers meaningful content |

### C. Chart, appraisal and market evidence

Owner evidence: [AssetOverviewSection.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetOverviewSection.tsx:47), [CoOwnCandleChart.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnCandleChart.tsx:109), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:1063).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U15 P1 C | Frontend date windows are ignored by the API | Chart label, returned date bounds and interval agree; reject reversed/invalid dates and report truncation |
| U16 P1 C | Chart cache bypasses canonical trades and freshness | New settled trade updates the proper candle; empty cache works; cache age/source are inspectable |
| U17 P2 C | Candle positions are index-based, not elapsed-time based | Choose event-time spacing with explicit labels or real elapsed-time gaps; no invented activity between trades |
| U18 P2 C/V | Minimum 2pt candle bodies can overlap when many candles fit in a narrow plot | Use an appropriate interval/aggregation or zoom viewport; inspect 1, 2, 52, 90 and 500-candle cases |
| U19 P2 P/V | Sparse and flat markets need deliberate art direction | Single trade stays a single observation; flat price gets sensible scale; zero/no volume remain distinguishable |
| U20 P2 C | Error/loading copy can still include “No settled trades for this range” | Failure means unavailable, loading means pending, and an empty successful response alone supports no-trade copy |
| U21 P2 P/V | Scrub needs full context and accessible equivalence | Date/time, OHLC, volume, direction and active range remain coherent; no live update steals inspection focus |
| U22 P2 P | Appraisal should support diligence, not imply tradable value | Named valuer, valuation date, source document and stale/unknown basis; clear distinction from last trade |

The existing chart already has ranges, retry, adjusted geometry and accessible actions. The goal is completing their semantics and native behavior, not adding indicator menus to compensate for sparse trading. [Coinbase chart interaction](https://cds.coinbase.com/components/charts/LineChart/), [TradingView time gaps](https://tradingview.github.io/lightweight-charts/docs/next/api/interfaces/WhitespaceData).

### D. Market tab, depth and open orders

Owner evidence: [AssetMarketSection.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:146), [AssetDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AssetDetailScreen.tsx:395).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U23 P1 C | Statistics spread can remain snapshot-based beside a moving ladder | One top-of-book source for both, with a clear stale state |
| U24 P2 P/V | Depth has to read as comparable columns | Fixed price/quantity rails, explicit bid/ask headers, readable row selection, units versus cumulative depth clearly named |
| U25 P2 P | No bids, no asks, no book, paused market and offline are different decisions | Each state states what is known and offers only valid next actions |
| U26 P1 C | Detail cancellation removes its row before acknowledgment | Keep “Cancelling…” visible; retain filled quantity; reconcile a lost response before terminal removal |
| U27 P1 C | Reconciliation blocks cancellation only after tapping | Show the same restriction in disabled semantics and a nearby reason before interaction |
| U28 P2 C | Open-order failure lacks contextual retry | Retry only that section while preserving chart/asset information |
| U29 P2 P | Recent executions need decision-relevant depth | Side/price/quantity/time, pagination or bounded “view activity”, no counterparty identity leakage, stable relative timestamps |

### E. Order ticket, review, receipt and recovery

Owner evidence: [TradeScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/TradeScreen.tsx:420), [TradeConfirmScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/TradeConfirmScreen.tsx:285), [SyndicateOrderHistoryScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/SyndicateOrderHistoryScreen.tsx:328).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U30 P1 P/V | Ticket and review must expose the complete commitment | Side, units, per-unit limit/protection, estimated fill, unfilled remainder, fees, total debit/net proceeds and real duration |
| U31 P1 P/V | Price/quantity context must survive every intermediary | Preserve selected book price through guide, rights, funding/auth detours, review and back; revalidate before commitment |
| U32 P1 P/V | Expired quotes and partial fills need explicit decisions | Changed quote requires review; distinguish immediate fill, resting balance, rejection and unknown result |
| U33 P1 C | History's recovery banner says refresh, but refresh only reloads history | “Check result”, focus and pull-to-refresh invoke the same exact-key reconciliation command |
| U34 P1 P | Recovery should survive leaving/relaunching | Store unresolved operation identity and reconcile safely per authenticated user; no substitution with a recent order |
| U35 P2 C | Pagination error clears cursor/hasMore | Preserve rows, cursor and scroll; show a footer retry instead of false end-of-history |
| U36 P2 P | Receipts/history should explain one order across multiple fills | Executed and remaining quantity, average execution, fees, timestamps, terminal reason, and a route back to the exact asset |

### F. Ownership and portfolio

Owner evidence: [AssetOwnershipSection.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetOwnershipSection.tsx:140), [PortfolioScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/PortfolioScreen.tsx:76), [coOwnPortfolio.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/services/coOwnPortfolio.ts:142), [CoOwnPortfolioPerformanceChart.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnPortfolioPerformanceChart.tsx:28).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U37 P2 P/V | Put owned value and its meaning ahead of secondary statistics | One marked-value hero, concise cost/P&L context, then owned/reserved/sellable units; avoid equally weighted financial tiles |
| U38 P1 C | Reference fallback is tagged “mid” in portfolio model | Use a true reference basis and unknown freshness; never imply a calculated bid/ask midpoint |
| U39 P1 C | Portfolio sale estimate includes reserved units/expired bids in backend projection | Estimate only currently sellable quantity and valid bids; show partial liquidity and quote age |
| U40 P2 C | Focus and manual refresh can overlap | Latest-request ownership or shared query cache prevents an older result replacing a newer one |
| U41 P2 C/P | One asset-detail request per holding produces a fan-out | Prefer a portfolio projection with mark, state and available units; retain explicit partial totals during migration |
| U42 P2 P | Current cost-versus-value is honest but not historical performance | Keep that label; add history only from historical valuations and cash flows with a named return method |
| U43 P2 P/V | Position cards and actions need density and state discipline | Compare a compact row treatment, make Buy/Sell permission-aware, keep trade and account totals' denominations explicit |

Do not fabricate a portfolio line from current positions. The current comparison is intentionally honest. Financial-performance expansion is a deeper version of the existing portfolio capability, conditional on sufficient historical records. [Trading 212 performance definitions](https://helpcentre.trading212.com/hc/en-us/articles/22435640547613-Portfolio-Charts).

### G. Buyout and governance

Owner evidence: [BuyoutScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/BuyoutScreen.tsx:124), [CorporateActionDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/CorporateActionDetailScreen.tsx:126), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:5070).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U44 P1 C | Buyout confirmation omits clear per-unit/total distinction | £10 per unit × 100 units = £1,000 commitment; explicit target, expiry and settlement denomination before submit |
| U45 P1 C | Buyout creation retry has no durable operation identity | Lost response yields “Check offer”; retry/relaunch resolves the same offer |
| U46 P1 C | Frontend promises holder review/acceptance without a discovered consumer | Extend the existing buyout surface with actual offers, eligibility, accepted/remaining quantity, expiry and holder response |
| U47 P1 C | Backend partial acceptance changes status to one later accept requests reject | An offer remains accept-capable until filled/closed/expired; two holders can contribute sequentially |
| U48 P1 C | Voting form enabled despite server eligibility restrictions | Return eligibility, record-date power, opening/deadline and reason; closed/ineligible views retain read-only results |
| U49 P2 C | Vote fetch errors are swallowed and refresh skips tally | Independent error/retry, current user's recorded vote, refreshed tally and uncertain-submit reconciliation |

The relevant benchmark is a complete state transition and understandable ownership consequence, not importing derivatives-style trading controls into collective ownership. [Rally order-state guidance](https://rallyrd.com/trading/).

### H. Distributions, reinvestment and alerts

Owner evidence: [DistributionHistoryScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/DistributionHistoryScreen.tsx:77), [CoOwnPriceAlertsScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/CoOwnPriceAlertsScreen.tsx), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:790).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U50 P1 C | “Total received” sums all statuses within the first 100 rows | Settled net-receipt aggregate; pending/reversed shown separately; full history pagination |
| U51 P1 C | Alert CRUD exists; no evaluator/delivery consumer found | Trigger basis, crossing direction, deduplication, delivery outcome and triggered history backed by execution events |
| U52 P2 P/V | Alert form needs precise price semantics | Show denomination, last/reference trigger basis, target and current observed price; preserve input on failure |
| U53 P1 C | DRIP setting promises automatic reinvestment without an execution consumer found | Settled distribution → permitted purchase or explicit retained-cash outcome → receipt; one effect under replay |
| U54 P2 C | Zero-enrollment user cannot reach first enrollment through listed rows | Offer eligible holdings in the existing distribution flow; show permission/market restrictions |
| U55 P2 C | Enrollment-read failure becomes empty settings; pending is scalar | Preserve unknown versus off; per-asset pending/error, section retry and cross-screen consistency |

These consumer searches must be checked against any separately deployed service before declaring those capabilities absent in production. Within this repository, saving a preference does not demonstrate alert or reinvestment execution.

### I. Diligence, rights, issuance and support

Owner evidence: [AssetDetailModals.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetDetailModals.tsx:151), [AssetDueDiligenceScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AssetDueDiligenceScreen.tsx:455), [CreateSyndicateScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/CreateSyndicateScreen.tsx:77), [CoOwnIssueScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/CoOwnIssueScreen.tsx:65).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U56 P1 C | Rights modal invents “Rights v1” if version is missing | Render only actual version; preserve unpublished/unknown distinction |
| U57 P2 C | Evidence links have unhandled openURL failure | Opening/error/retry or copy-link fallback; retain asset/document context |
| U58 P2 P | Diligence should be a navigable evidence hierarchy | Rights, custody, appraisal, costs, risks and recourse as concise facts with source/date/document drilldown |
| U59 P2 C | Issuance-list fetch failure becomes empty; verification failure becomes email tier | Separate unavailable from empty/unverified, allow retry, preserve authored configuration and review state |
| U60 P2 C/P | Support is form→toast→back with generic cards and no retained case identity in UI | Compact asset/order context, inline validation, preserved draft and confirmed case reference; qualify keyboard/dock behavior |

Issuance is only partially traced in this review: listing/verification loading, stage structure and error projection were inspected. Full issuance/recourse settlement, support operations and ownership-document generation still require their own end-to-end acceptance. Do not infer their entire correctness from this surface review.

### J. Shared native quality and engineering

Owner evidence: [CoOwnSegmentNav.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/CoOwnSegmentNav.tsx:131), [CoOwnNumericText.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/ui/CoOwnNumericText.tsx), [AssetDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AssetDetailScreen.tsx:480).

| ID | Current gap / proposed depth | Required result |
|---|---|---|
| U61 P2 P/V | Financial typography needs one size/weight/alignment grammar | Tabular figures, stable decimal alignment, explicit signs, readable currency/1ZE unit labels; no digit-driven layout jumps |
| U62 P2 C/V | Many labels/prices cap text scaling or truncate | Adaptive two-line/stacked alternatives; critical totals, state and actions remain understandable at large text |
| U63 P2 P/V | Practical control targets and focus must be verified | 44pt iOS / appropriate Android target envelope; visual glyph can stay small; modal focus restores to its trigger |
| U64 P2 P/V | Direction cannot depend solely on red/green | Signed numbers, text and candle shape/state; measure composed contrast in both themes |
| U65 P2 P/V | Motion should preserve cause and effect | Interruptible tab movement, stable price/selection readout, reduced-motion behavior, no page-wide animation on refresh |
| U66 P2 C | Freshness computed with Date.now inside memo can stop aging without rerender | Bounded age clock plus foreground/reconnect invalidation; separate last-trade age from successful book observation time |
| U67 P2 P/V | Current geometry and performance have no accepted native matrix | Match loading/final geometry; measure useful content position, occlusion, frame pacing and memory under repeated chart/tab/trade loops |
| U68 P2 C/P | Large orchestrator mixes server queries, manual fetch state and stream data | Extract by owner responsibility: market observation, viewer position/orders, supporting records, command recovery; use the existing query system |

Accessibility recommendations map to native APIs and device behavior. WCAG's 24 CSS-pixel minimum is a web criterion and must not be substituted mechanically for native touch targets. [W3C target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [React Native accessibility](https://reactnative.dev/docs/accessibility), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/).

## 4. Backend depth required to make the screens dependable

These are supporting engineering packages for the UI register, not a separate feature wishlist. They refer to the repository-defined schema; a deployed database may differ and must be inspected before migration decisions.

| ID / priority | Current evidence | Required engineering and acceptance |
|---|---|---|
| B01 P1 T | coOwn.ts:4083 contains unescaped template-literal backticks | Restore compilation first; rerun API TypeScript before evaluating runtime behavior |
| B02 P0 C | coOwn.ts:3310 targets asset/key conflict; migration 200:31 defines asset/actor/key; route uses response_code but schema defines response_status | Align insert/select/update and original actor-scoped uniqueness. A fresh migrated DB must create/replay an order successfully |
| B03 P1 C | coOwn.ts:3324 replay lookup omits actor/hash; request fingerprint omits timeInForce at 380–395 | Isolate command identity by actor + asset + key; changed duration/body conflicts. Do not “fix” B02 by creating unsafe global key scope |
| B04 P1 C | Price history coOwn.ts:1133 queries coown_executions; settlement writes coOwn_trades:537 | Canonical settled-trade aggregation with stable time/id tie-breaking; snapshot and chart see the same trade |
| B05 P1 C | coOwn.ts:1067 ignores from/to; any cache row at 1092 returns without freshness checks | Validate date windows; use direct aggregation or a versioned cache with watermark/invalidation; prove new fills update active candles |
| B06 P1 C | Expiry cleanup only runs on later same-asset matching at 3693 | Scheduled transactional expiration plus consistent effective-reserve reads; quiet markets release funds/units without a new order |
| B07 P1 C | Placed reservation keeps 60-second preview expiry; index.ts:34080 filters it out after that | Active preview and placed order have different lifetimes; a resting GFD/GTC90 order remains reserved until its own terminal event |
| B08 P1 C | index.ts:34106 includes expired bids; estimate uses all units at 34095 | One executable-depth/available-holdings projection shared with order preview; expired liquidity disappears everywhere |
| B09 P1 C | Expiration removes orders without full touched-level/sequence propagation | Atomic event/outbox or snapshot invalidation; connected clients remove expired levels with coherent sequencing |
| B10 P1 C | Any exit closes detail at 5658, while command guard checks only selected statuses at 755 | One lifecycle/capability policy across list, detail, preview and commands; test cancelled/announced/executing/completed exits |
| B11 P1 C | Partial buyout acceptance sets accepted at 5070, while next acceptance requires open at 4889 | Preserve accept-capable partial state, quantities and reserve/settlement invariants; prove multi-holder completion |
| B12 P1 C | Alert/DRIP records have no execution consumer found | Identify existing external owner or implement idempotent event consumers with receipts, failure state and monitoring |
| B13 P2 C | Expiry stored as cancellation without reason; history reads persisted open status until cleanup | Explicit terminal reason/effective status; user cancellation and expiry are distinguishable |
| B14 P2 C/P | Portfolio assembles marks through per-holding detail calls and separate lifecycle derivation | Task-oriented portfolio projection with provenance, value completeness, sellable units and capabilities; bounded query count |
| B15 P1 V | SQL/template tests do not demonstrate migrated transactional behavior | Real PostgreSQL contract tests for concurrent matching, replay, expiry, reserved balances, permissions and emitted events |

Evidence: [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:3310), [200_coown_order_commands.sql](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/db/migrations/200_coown_order_commands.sql:15), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:1063), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:3693), [index.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/index.ts:34080), [coOwn.ts](C:/Users/User/Desktop/thryftverse-upgrade/backend/api/src/routes/coOwn.ts:5070).

### Proposed shared contracts

Use the repository's existing schema/generation approach; avoid parallel handwritten definitions.

| Contract | Meaning the UI needs | Consumers |
|---|---|---|
| Market capability | Offering state, market state, canBuy/canSell/canCancel, precise blocked reason | Hub, identity, dock, ticket, portfolio |
| Price observation | Amount/unit, basis, observedAt, tradeAt where applicable, quality/freshness, sequence | Headline, chart, spread, marked positions |
| Available position | Owned, reserved, settled/sellable units, mark, cost/P&L, liquidity estimate and scope | Ownership, portfolio, trade review |
| Command receipt | Operation identity, request fingerprint, pending/acknowledged/rejected/unknown presentation, order/offer reference | Submit, confirmation, history, app recovery |
| Action eligibility | Eligible actor, record-date power, opening/deadline, already-recorded choice and reason | Governance, buyout, distribution controls |
| Historical series | Requested/returned bounds, interval/timezone, source, gap semantics, pagination/truncation | Asset chart, future portfolio history |

Contract validation must cover null, empty, partial, error and alternate lifecycle paths. Idempotency needs both request identity and replay semantics, not merely a key-shaped field. [Stripe idempotent request contract](https://docs.stripe.com/api/idempotent_requests). App resume and network reconnection need native-specific integration with the existing query owner. [TanStack React Native guidance](https://tanstack.com/query/latest/docs/framework/react/react-native).

## 5. Implementation sequence: complete the department one surface at a time

| Wave | Product slice | Entry dependencies | Exit evidence |
|---|---|---|---|
| 0 | Runnable and trustworthy order/history foundation | B01–B03, schema review | API compile; fresh DB command create/replay/collision tests |
| 1 | Asset identity + Overview chart | B04–B05; price observation contract | Correct dates/data; equal-width first-viewport comparison; empty/error/large-text chart |
| 2 | Market tab + order ticket + cancellation | B06–B10; capability/position contract | Live depth agrees; partial fill/cancel/expiry/unknown outcomes reconciled on every surface |
| 3 | Ownership + portfolio | B08, B13–B14; completed mutation propagation | Named marks, accurate sellable units, partial totals, focus/refresh correctness |
| 4 | Buyout + governance | B11; command/eligibility contracts | Real holder review, multiple acceptances, correct review totals, ineligible/read-only states |
| 5 | Distributions + alerts + reinvestment | B12; settlement/event ownership | Settled totals, first enrollment, one trigger/reinvestment per event, visible failures |
| 6 | Hub/watchlist + diligence + issuance/support refinement | Saved-state hydration, catalogue queries, evidence/case contracts | Cross-device saved assets; recoverable links/forms; compact coherent subpage geometry |
| 7 | Native department acceptance | Earlier slices stable | Matched captures, assistive technology, compact/large text, theme, device performance and live journeys |

This ordering prevents polishing a quote or “received” total that the next backend correction must redefine. Within each wave, capture and critique one surface before spreading the pattern. You can work on independent contracts in parallel while keeping visual acceptance surface-specific.

## 6. Native acceptance matrix

Proposed engineering targets, **not measured competitor numbers**:

| Test | Acceptance |
|---|---|
| First useful viewport | On declared compact and standard phones, asset identity + named price + next decision are apparent; record chart/content Y-position |
| Thumbnail / squint | At 25% scale, media or meaningful financial content dominates; repeated gray containers do not |
| Surface budget | At most one dominant non-media panel above fold; containment has a selection/input/action/grouping reason |
| Dense rows | Aim for 4–6 useful rows where list comparison is the task; do not force this onto media-led detail |
| Large text | Prices, totals, selected section and primary action remain understandable/reachable; reflow before shrinking |
| Dark/light | Same geometry; normal text meets measured contrast targets; gain/loss is not color-only |
| Chart state matrix | 0/1/2/many trades, flat price, no volume, long gaps, failure, retry, new trade during scrub, rapid range switch |
| Market state matrix | Primary offering, no bid, no ask, empty book, paused, exited, stale snapshot, offline, reconnect gap |
| Command matrix | Quote changes, partial fill, duplicate submit, lost response, app background/relaunch, cancel-vs-fill race |
| Cross-surface truth | Trade/cancel/expiry changes order history, book, holdings, reserved funds, portfolio and detail coherently |
| Accessibility | VoiceOver/TalkBack: chart actions and values, tab attention, errors, disabled reasons, modal focus/return |
| Performance | Profile on a declared mid-range device; target smooth 60Hz interactions (~16.7ms frame budget), bounded memory, no request fan-out bursts |
| Loading continuity | Skeleton matches final geometry; refreshing does not blank useful data or displace selected rows |
| Recovery | Each visible retry reaches its promised operation; pending/unknown records remain identifiable |

Do not certify these from unit-test counts. Capture the actual development/release build, include realistic media and long values, and retain evidence of at least one critique/rework cycle. Full offline operation is not required for money mutations; truthful offline state and safe recovery are.

## 7. Research ledger and evidence limits

All sources below were accessed **8 September 2026**. Except where explicitly stated, the opened help/documentation page did not provide a reliable publication/update date; access date is not a release date. No future announcement is presented as shipped capability.

| Source / owner | Evidence class | What it supports |
|---|---|---|
| [Trading on Rally](https://rallyrd.com/trading/) — Rally | Primary product documentation; update date not displayed | Fractional-asset order, partial-fill, cash-lock and valuation semantics |
| [Advanced charts](https://robinhood.com/us/en/support/articles/using-advanced-charts/) — Robinhood | Primary product documentation; update date not established | Contextual chart/order interactions; product scope matters |
| [Portfolio Charts](https://helpcentre.trading212.com/hc/en-us/articles/22435640547613-Portfolio-Charts) — Trading 212 | Primary help; update date not established | Distinct performance methods and data-insufficient states |
| [LineChart](https://cds.coinbase.com/components/charts/LineChart/) — Coinbase | Primary public web-component documentation | Scrubbing, exploration and chart composition |
| [Button](https://cds.coinbase.com/components/inputs/Button/) — Coinbase | Primary design-system documentation | Loading, disabled and primary-action contracts |
| [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/) — Apple | Primary platform guidance | Larger text and inclusive interface design |
| [Accessibility](https://reactnative.dev/docs/accessibility) — React Native | Primary framework documentation | Roles, actions, values and state announcements |
| [Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — W3C | Standard explanation | Web target-size criterion and exceptions; not native pt equivalence |
| [WhitespaceData](https://tradingview.github.io/lightweight-charts/docs/next/api/interfaces/WhitespaceData) — TradingView | Primary next-version API documentation | Explicit missing-value time points; conceptual reference only |
| [Time-scale source](https://github.com/tradingview/lightweight-charts/blob/master/src/model/time-scale.ts) — TradingView | Public repository source, mutable master | Time-scale behavior is an engineering concern, not a cosmetic axis label |
| [10 usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) — NN/g | Primary UX framework | Status visibility, recognition and error recovery rationale |
| [Native integration](https://tanstack.com/query/latest/docs/framework/react/react-native) — TanStack | Primary framework documentation | App focus and connectivity integration |
| [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — Stripe | Primary API documentation | Replay-safe request identity and conflict semantics |

Search also surfaced community reports about confusing portfolio-return labels and chart gaps. Those were discovery signals only; no defect severity or shipped-competitor claim here depends on them. Protected competitor screens and authenticated mobile journeys were not accessed. Source coverage is targeted to existing Co-Own capabilities, not an exhaustive market survey.

## 8. Practical decision

The next visible push should be the **asset identity + chart + market state** slice, backed by repaired command/history foundations. The next depth push should be **ownership/portfolio consistency and the incomplete buyout/distribution/alert loops**. These changes will improve the department more than additional dashboard panels or advanced indicators.

The report contains **68 UI/UX refinements and 15 supporting backend/verification packages**. Some rows overlap by dependency deliberately: the frontend requirement and its backend owner must close together. They are not 83 independent bugs.

Fresh review complete. Product qualification remains pending; this report is not a release approval.

### Report self-check

This assesses the report, not product readiness: accuracy 4/5 (code and fresh checks, no live SQL); completeness 4/5 (broad department coverage, issuance/support only partially traced); clarity 4/5 (priorities and evidence labels, sizable register); actionability 4/5 (owners/sequence/acceptance, device work still required); conciseness 4/5 (compact rows, intentional frontend/backend dependency overlap). Mean 4.0/5.

Highest-value evidence to add: current native Co-Own captures and a migrated local/staging API run. A further issuance/recourse walkthrough would close the stated scope limitation. The report is actionable within those limits; it does not infer visual or production acceptance from static checks.

