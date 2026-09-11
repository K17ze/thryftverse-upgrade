# Co-Own: next-depth upgrade research and validation report

**Assessment date:** 8 September 2026. **Scope:** existing Co-Own hub, asset detail, chart, market depth, ownership, portfolio, order ticket/confirmation/history, buyouts and governance, including their coupled backend contracts. **Mode:** read-only product/code review; this Markdown report is the only file created by this task.

## 1. Executive judgment

Your latest upgrades are real. The department now has substantially more considered composition and useful market information than the earlier implementation. The next improvement is **not another stock-app-looking layer**. It is making the existing financial meanings, market lifecycle and connected journeys consistent, then qualifying their native presentation.

**Does it perform like a mature equity/stock-detail experience? Not yet.** It has much of the information architecture: named prices, chart inspection, bid/ask depth, owned position, order entry and activity. However, important mechanics behind those surfaces remain contradictory. A sold-out offering can advertise secondary trading while its commands reject trading; chart labels can represent the wrong time span; an unresolved order can highlight an older order; portfolio value can use a different basis from the asset headline.

The correct target is **broker-grade clarity for fractional collectible ownership**, not pretending every collectible is a liquid public stock. Last trade, appraisal, reference price and executable proceeds are different facts. Showing them clearly is more valuable than adding indicators, ticker symbols or more statistics.

### What I would prioritize

1. Correct consequential money and order-state defects before another cosmetic wave.
2. Give lifecycle, valuation, reservations and execution history one authoritative definition each.
3. Finish the chart as a complete interaction, including accurate periods, sparse data, retry and accessibility.
4. Make a completed action reconcile every affected screen, including screens already mounted behind the ticket.
5. Refine contrast, density and hierarchy against actual native captures.

No percentage-readiness or “10/10” score is assigned. Passing the checks below does not establish native parity, production capacity, regulatory suitability or commercial competitiveness.

## 2. Evidence boundary and workspace

| Item | Evidence |
|---|---|
| Workspace / Git root | `C:/Users/User/Desktop/thryftverse-upgrade` |
| Remote | `https://github.com/K17ze/thryftverse-upgrade.git` |
| Branch | `feat/product-detail-contract-media-device-closure` |
| Starting HEAD | `f5708b552835184c0d472ecb824a50f3f93990ca` |
| Reviewed state | HEAD **plus current uncommitted user changes**, not merely the last commit |
| Instructions | Repository `AGENTS.md`, `Design.md`, flagship-autopilot; ui-ux-pro-max for chart/native accessibility guidance |
| Parallel review | Separate frontend, backend and official-source research reviews, followed by main-agent cross-checking |
| Native device | Standard Android SDK `adb devices` returned an empty device list |
| Local API | `http://localhost:4000/health` refused connection; no live Co-Own endpoints or financial mutations exercised |
| Existing image | `app-running.png` shows the launch/splash surface, not Co-Own; it is not asset-screen verification |
| Supplied visual references inspected | `overall reference.jpg`, `overall outlook.jpeg`, `extra reference for structuring llayout .jpeg`; useful for media/utility hierarchy, not proof of financial interaction parity |
| Research | Official public documentation accessed 8 September 2026; no authenticated competitor native walkthrough |

**Evidence labels:** **C** = confirmed from current source; **T** = a fresh local test/check; **D** = official documentation; **P** = proposed refinement or qualification requirement. Source-confirmed defects are not claimed as live production reproductions. Source line numbers refer to the reviewed working tree and may move after edits.

This report supersedes earlier broad findings **only for the Co-Own paths reviewed here**. It does not carry forward old repository-wide failure counts or claim all earlier gaps remain unchanged.

## 3. What your latest work has improved

These are changes worth preserving, not rewriting:

- Asset detail is divided into Overview, Market and Ownership sections with focused domain components.
- Editorial tabs, flat metrics and restrained transaction sections have a coherent direction consistent with `Design.md`.
- Chart inspection now supports horizontal dragging, haptics and a parent price readout.
- Chart candle/volume geometry has been corrected relative to the earlier inconsistent height calculation; do not carry that old clipping defect forward unchanged.
- Overview now exposes conditional statistics rather than requiring the user to hunt across tabs.
- Market includes explicit partial-fill wording and a longer execution preview.
- Ownership now gives position value, average cost and units stronger hierarchy.
- Instrument cards surface primary-allocation progress.
- Price ticks use restrained movement feedback and a reduced-motion path.
- Asset detail uses an **asset-scoped my-orders endpoint**, replacing the old approach of filtering a 200-item account-history window.
- Order history already supports cursor pagination; pagination is not simply “missing everywhere.”
- Quote construction now accepts the asset/backend fee rate rather than only a fixed local constant.
- `marketSnapshot.sourceAsOf` is now separate from response assembly time. Its remaining problem is semantics, not absence.
- Unknown-order lookup, reservations, settlement transactions, privacy projection tests and useful runtime tests exist. The next work must strengthen their integration rather than describe the department as a facade.

Most defects below predate the latest visual additions. Two additions deserve particular care: **“units at market” strengthens a valuation claim the current calculation does not support**, and the new scrub callback can retain an old candle object after same-range updates.

## 4. Fresh validation results

| Check | Result | What it establishes / does not establish |
|---|---|---|
| Frontend `npm run typecheck` | **Passed** | Type compatibility in installed workspace; not native layout or live behavior |
| Backend/API `npm run typecheck` | **Passed** | Current API compilation check; not migrated-database correctness |
| Frontend `npx vitest run --dir src coown` | **15 files, 243 tests passed** | Useful scoped regression coverage, mixed with structural/source-text assertions |
| API privacy projection tests | **20 passed** | Scoped projection behavior, run by backend reviewer |
| Matching property model, exact include with config disabled | **15 passed** | Independent in-memory matching model, not production SQL/lifecycle/reservations |
| Normal Vitest invocation for matching property test | **No tests discovered** | Current API Vitest configuration does not include that test file |
| `npm run check:golden-parity` | **Failed** | Missing `__screenshots__/fixture` and `__screenshots__/integration` baseline directories |
| Native device check | **No attached device** | Native visual acceptance remains pending |
| Default local API health | **Connection refused** | Live endpoint acceptance remains pending; does not prove a deployed API is unavailable |

The full repository test suite, full lint, clean install, signed native builds, load tests, deployment and provider settlement were **not rerun** for this bounded report.

One concrete test-quality problem: `coownP0UnknownResultLookup.test.ts` checks function existence, Promise shape and source strings, while the history screen still performs the incorrect latest-order fallback. `coownDetailFlagshipClosure.test.ts` asserts source structure around chart mounting that also permits the range trap below. Keep meaningful runtime coverage; replace these specific structural proxies with interaction tests.

## 5. Confirmed gap register — fix the behavior before decorating it

Priority is local to this report: **P0 = consequential financial/identity ambiguity; P1 = release or flagship blocker in an existing journey; P2 = important reliability/polish debt.** Priorities express engineering triage, not a claim that an incident has already occurred.

### A. Money, command identity and market lifecycle

| ID / priority | Current evidence and user consequence | Owner-layer upgrade | Acceptance |
|---|---|---|---|
| F01 **P0** | **C:** `TradeConfirmScreen.tsx:285` passes an unresolved idempotency key to history; `SyndicateOrderHistoryScreen.tsx:333` chooses `pool[0]`, then clears recovery params at `348`. An old successful order can appear to be the new unresolved result. | Persist and resolve the exact operation identity. Never infer acknowledgment from recency. Keep a distinct pending/unknown row until that operation is resolved. | Existing filled order + delayed new request: the old order is never highlighted as its result; relaunch/reconnect continues the exact lookup. |
| F02 **P0** | **C:** `BuyoutScreen.tsx:37,113,121,246` displays the user's currency symbol but submits the unconverted number as `offerPriceGbp`. A displayed $500 can become a £500 offer. | One canonical monetary-input contract through field, confirmation, accessible label and payload; either explicit GBP/settlement denomination or genuine reversible conversion. | GBP/USD/EUR preferences produce the economic amount shown before commitment, including decimal and rounding boundaries. |
| F03 **P1** | **C:** API `coOwn.ts:4039` sets `is_open = FALSE` when primary allocation sells out. Projection at `95` calls closed offering state `trading`, but preview/reserve/submit at `2723/2984/3372` reject `!is_open`. | Separate offering availability from secondary-market permission. Use one capability policy in read and command paths. | Buy final primary unit, then execute an eligible secondary sell/buy. Failed offering, exit and genuine halt remain blocked. |
| F04 **P1** | **C:** API `coOwn.ts:3648` explicitly calculates GFD/GTC90 expiry only for response/audit. Matching at `3703` filters order status, not a persisted deadline. | Persist expiry; exclude expired orders inside matching transactions; idempotently expire and release holds. | No fill at/after expiry; units/cash release exactly once; UI deadline, history and backend agree. |
| F05 **P1** | **C:** Wallet/API reservation predicates disagree. `index.ts:22105` and `coOwn.ts:577,3025` include active/placed holds without TTL; portfolio `index.ts:34075` excludes placed holds after the original preview TTL. Placing at `coOwn.ts:3665` does not extend it. | One effective-hold predicate: active/unexpired preview OR placed/live order. Global expiry/release ownership, not only cleanup during a later same-asset reservation. | Abandoned 60-second preview releases across assets; resting order remains reserved until fill/cancel/real expiry; no phantom available balance. |
| F06 **P1** | **C:** `AssetDetailScreen.tsx:627` values position at reference unit price; headline at `671` can use last trade. `AssetOwnershipSection.tsx:143` calls the reference result “at market”; `services/coOwnPortfolio.ts:142` repeats reference valuation. | Shared position-mark projection with basis, source and time. Do not confuse marked value with estimated sale proceeds. | Reference 10, last trade 14, bid 12, entry 8: detail and portfolio explain identical mark/P&L basis; sell estimate remains separate. |
| F07 **P1** | **C:** `SyndicateHubScreen.tsx:129,140,340,353` independently classifies zero-allocation assets and omits canonical market/offering status in its local projection. | Preserve and reuse lifecycle fields through hub, portfolio, detail and ticket instead of inferring status from allocation or historical activity. | Paused, failed, exited, fully allocated and quiet-open assets display consistent names and capabilities everywhere. |
| F08 **P1** | **C:** `AssetDetailDock.tsx:119` blocks non-issuer entry on book error; detail handler `AssetDetailScreen.tsx:714` and `TradeScreen.tsx:271` support primary allocation without secondary depth. | One primary/secondary capability selector. Only allow primary entry when authoritative offering eligibility is known; never bypass halts or reconciliation. | Valid primary allocation + secondary-book failure has the intended entry path; ineligible secondary execution remains blocked. |

### B. Chart truth, market data and propagation

| ID / priority | Current evidence and user consequence | Owner-layer upgrade | Acceptance |
|---|---|---|---|
| F09 **P1** | **C:** Price history `coOwn.ts:1129` and tax activity `routes/users.ts:1189,1205` read `coown_executions`; repository migrations/writers found by review define/write `coOwn_trades` instead (`coOwn.ts:533`). | Canonical settled-trade read model; verify fresh migrations rather than assume an external/manual relation exists. | Fresh migrated database + settled trade yields matching chart, tape and tax activity. This source mismatch still needs live reproduction. |
| F10 **P1** | **C:** History returns any cache rows immediately at `coOwn.ts:1088`; no repository cache writer was found. There is no freshness/missing-tail check. | Deterministic aggregation with cache watermark and current-bucket update; stable tie-break by trade identity and explicit timezone. | New execution changes the relevant cached bar; incomplete cache does not hide newer trades; rebuild matches canonical executions. |
| F11 **P1** | **C:** Overview range map `AssetOverviewSection.tsx:42` uses 48 hourly buckets for 1D and identical 52-week requests for 1Y/ALL. API `coOwn.ts:1059` limits occupied buckets without from/to boundaries. | Define elapsed-time windows jointly in contract/query/chart; ALL means available history with bounded rendering, not the same request as 1Y. | Sparse multi-month trades never appear as a one-day window; >52-week history is reachable; boundaries are deterministic. |
| F12 **P1** | **C:** Overview `AssetOverviewSection.tsx:292` only mounts the chart when data exists; range controls are inside the chart. Empty/error alternative has neither range controls nor retry. | Keep range controls outside the data-state branch; separate loading, empty and failed states. | Populated 1W → empty 1M → 1W works; failed 1Y can retry without leaving the page. |
| F13 **P1** | **C:** `AssetDetailScreen.tsx:467–495` treats >24-hour market-event age as stale transport and blocks secondary actions. API `coOwn.ts:5463` combines event/trade/order timestamps; elapsed time alone does not refresh the memo. | Separate observation/transport freshness, book revision, last execution and appraisal age. Age old facts honestly without treating an unchanged verified book as disconnected. | Fresh empty book + old trade; disconnected book + recent trade; threshold crossing while mounted all behave correctly. |
| F14 **P1** | **C:** Incoming resting-order delta at API `coOwn.ts:3945` contains only incoming remainder/count 1, while `useCoOwnOrderBookStream.ts:125` replaces the full price level. Independent envelope sequence also overwrites market sequence at `205`. | Emit full aggregated changed levels and use one book-replication sequence. Keep transport-envelope identity separate; persist execution sequence. | Two same-price orders sum correctly; partial fill/cancel/reconnect matches canonical snapshot without repeated false gaps. |
| F15 **P1** | **C:** `PortfolioScreen.tsx:105` owns local fetch state and no focus reload; query invalidation elsewhere cannot refresh it. Overview history at `89` and Market tape at `104` depend only on asset/range, not parent refresh or new fills. | Canonical query ownership for portfolio, candles and executions; focus/connectivity/mutation reconciliation with cleanup. | Buy/cancel then Back updates mounted portfolio; pull-refresh same tab updates tape/history; live book and tape converge. |
| F16 **P2** | **C:** Chart x positions use index (`CoOwnCandleChart.tsx:97`), so occupied buckets are equally spaced regardless of elapsed gaps. | Choose an honest time-axis policy; leave gaps or explicitly expose inactive spans. Do not invent trades or smooth a sparse market into apparent liquidity. | Trades an hour apart and a month apart do not imply identical elapsed time without an explicit observation-index label. |
| F17 **P2** | **C:** New scrub callback only informs parent when the index changes (`CoOwnCandleChart.tsx:127`). A same-index updated candle can leave the parent price readout behind the chart's OHLC. | Reconcile inspected candle by stable timestamp/identity plus revision; clear consistently on range/asset changes. | Same-range changed close and newly appended bars keep header and inspected point aligned. |
| F18 **P2** | **C:** Chart width is derived from screen width (`CoOwnCandleChart.tsx:73`) rather than measured container; minimum candle width is 2pt even if slot width falls below that. | Measure actual plot bounds; bound/aggregate dense data. **Visual consequence remains unverified**, not a claimed screenshot defect. | Narrow screen, landscape, larger gutters and dense history retain readable non-overlapping plot/axes with correct touch coordinates. |

### C. Connected subpage depth and control quality

| ID / priority | Current evidence and user consequence | Owner-layer upgrade | Acceptance |
|---|---|---|---|
| F19 **P1** | **C:** `CorporateActionDetailScreen.tsx:340,431` renders voting for governance actions and disables mainly on submission; vote-load errors are swallowed at `133`. | Backend-evidenced eligibility and action status; previous vote unknown differs from no vote. Show closed/unauthorized/error states with recovery. | Closed, cancelled, non-holder, record-date-ineligible, signed-out and tally-failed cases expose truthful controls. |
| F20 **P1** | **C:** `BuyoutScreen.tsx:70` converts holdings-fetch failure into `[]`, then zero ownership at `76`. | Preserve unavailable holdings as an error/partial state; do not calculate actionable remaining ownership from unknown data. | Failed holdings request never displays a verified zero or enables a falsely calculated buyout scope. |
| F21 **P2** | **C:** Cancellation differs: detail `AssetDetailScreen.tsx:383` reconciles holdings/book; history `SyndicateOrderHistoryScreen.tsx:283,297` confirms then changes its local row only. | Shared cancellation command and common invalidations; consistent confirmation and ambiguity handling. API success contract already says cancelled—do not misreport that assignment alone as fake success. | Fill-versus-cancel race shows authoritative outcome; holdings, available balance, depth and history agree after return/reconnect. |
| F22 **P2** | **C:** Order-book level selection is lost through education: detail stores pending side at `744`, then guide continuation at `756` omits the selected price. | Preserve full trade intent through first-use education and navigation. | Selected bid/ask level, side, quantity intent and order mode survive guide completion. |
| F23 **P2** | **C:** Reservation idempotency lookup at API `coOwn.ts:2943` precedes transactional serialization, with no equivalent claim/recheck after lock. | Claim/recheck key transactionally before replacement of holds. This is a concurrency risk identified in source, not a reproduced double spend. | Concurrent identical commands return one reservation identity; changed-payload key reuse conflicts; no unexpected 500 or displaced valid reservation. |
| F24 **P2** | **C:** Preview `coOwn.ts:2764` includes actor-owned resting orders; execution at `3705` excludes them. | Share counterparty/matching eligibility between preview and execution. | Self-only depth previews zero eligible fill; mixed depth quotes only eligible counterparties. |
| F25 **P2** | **C:** `TradeScreen.tsx:453` tracks `coown_order_placed` after reservation, before final commitment. | Name events for actual state transitions: previewed, reserved, submitted, acknowledged, filled, cancelled; preserve operation identity. | Abandoned confirmation never counts as an order placed; retries do not double-count authoritative outcomes. |
| F26 **P2** | **C:** `CoOwnPositionCard.tsx:190` supports mark provenance, but Portfolio does not supply it (`PortfolioScreen.tsx:267`). Adapter summary at `coOwnPortfolio.ts:199` omits optional metrics the screen defaults to zero at `120`. | Wire supported mark/source/age; model unavailable summaries as unavailable, not zero. Audit literal pending/settled fields against actual supported settlement behavior before exposing them. | Unknown daily/distribution/stale-mark metrics do not render as measured zero; position basis is inspectable. |
| F27 **P1** | **C:** Chart declares `accessibilityRole="adjustable"` at `CoOwnCandleChart.tsx:355` but no adjustment actions or selected-value state. | Increment/decrement point inspection with meaningful value/date announcement; provide a readable data alternative. | VoiceOver/TalkBack can select a range, inspect points and exit without touch dragging. |
| F28 **P1** | **C/T:** Dark financial tokens `colors.ts:71–72` use #1C5631/#5F1616 on #0A0A0A/#141414. Calculated contrast is only **2.29/1.52** on background and **2.13/1.41** on surface. Market change/status text uses those tokens. | Theme-specific financial text and meaningful-graphic colors; retain subdued backgrounds as separate roles. Chart `DIRECTION_COLORS` is another static palette to reconcile. | Normal financial text meets 4.5:1; essential graphical marks meet adopted 3:1 criterion; positive/negative meaning also has sign/wording. Verify composed native render. |
| F29 **P1** | **T/C:** Scoped tests pass while identity/range defects remain; matching-model test is outside normal Vitest include; native golden directories are absent. | Behavioral frontend tests plus migrated-DB integration tests and real native baselines; keep source scanners supplemental. | CI exercises each reproduced failure below, captures native states and fails on missing required evidence rather than treating it as parity. |

### Important qualification on freshness

The new `sourceAsOf` field is a useful step. Do not replace it with `Date.now()` to make the UI green. A new unfilled order can be recent while the displayed last execution is old; cancelling the final order must still advance book revision even though no active-order timestamp remains. These are separate facts and need separate fields/labels, not another blanket freshness workaround.

## 6. Screen-by-screen refinement brief

The following are **P: proposed completion/refinement requirements**, not claims that every item is currently absent. They extend existing capabilities. Address the confirmed register first, then verify these acceptance details without adding unrelated product breadth.

### Hub / instrument list

1. Keep asset photography as identity; align one named unit price and one relevant lifecycle fact beside it.
2. Separate primary allocation progress from secondary liquidity; selling out is not synonymous with market closure.
3. Keep filters semantically consistent with detail lifecycle and show useful filtered-empty recovery.
4. Preserve scroll/filter state on Back; reconcile the visible price/holding after a trade.
5. Keep financial columns stable while titles wrap; use sign/words in addition to directional color.
6. Surface genuinely relevant owned/open-order state without adding another equal-weight dashboard panel.

### Asset Overview

7. First viewport should answer: what asset, what kind of ownership, which price, how recent, what action is available?
8. Avoid repeating the hero value as a second equally dominant transaction hero without a distinct meaning.
9. Keep range controls present through loading, no trades, request error and retry.
10. Show exactly what a range change measures; do not imply the fixed 24h statistic is the selected-range return.
11. Handle zero points, one point, flat price and sparse history intentionally; no synthetic candle or invented volume.
12. Keep current quote context separate from a historical scrubbed price; leaving inspection restores the current context predictably.
13. Make appraisal date, valuer and source reachable without letting them compete with the decision price.
14. Give documents a complete open/download/failure/expired-link state; preserve source/version information.
15. Keep unavailable statistics unavailable; show supported measurements, not a fixed dashboard inventory.

### Asset Market

16. Distinguish last execution, best bid, best ask, spread, quantity and current book observation.
17. Keep a one-sided or empty book useful; missing buyers are not an API error or a zero price.
18. Preserve level-to-ticket intent through education, modal transitions and Back.
19. Display requested, filled and remaining units together for partial orders; do not reduce them to a generic status pill.
20. Keep tape date/time/side/quantity legible and refreshed with executions, without flashing the whole list.
21. Give cancellation one interaction contract and a visible pending/unknown state.
22. Verify asset-scoped my-orders truncation behavior at its 50-item limit; show a complete-history continuation when needed.

### Ownership / portfolio

23. Use one marked-value basis across the asset, portfolio total and position row.
24. Separate owned, reserved and available-to-sell units; pending quantities must come from actual lifecycle evidence.
25. Explain average cost and whether fees are included; realized and unrealized results must not be mixed.
26. Keep estimated sale proceeds distinct from mark, with available depth and timestamp; do not imply all units are immediately sellable.
27. When a subset of positions fails to load, label the subtotal as partial and offer targeted recovery.
28. Refresh on return from ticket/history/buyout and after background/network recovery.
29. Show distribution state as announced/pending/paid only from backend evidence; a declared distribution is not received money.
30. Make transferability, custody and rights details evidence-backed, dated and inspectable rather than decorative trust badges.

### Trade ticket / review / result / history

31. Keep one coherent draft: side, units, order type, price protection, duration and denomination.
32. Use authoritative preview economics at review; if fee rate changes between asset load and preview, explanatory percentage and charged fee must agree.
33. Treat primary allocation and eligible secondary counterparties consistently in preview and execution priority; do not rely on a locally sorted synthetic ask as execution proof.
34. Display total cost for buy and net proceeds for sell with fees visibly reconciled.
35. Define protection-price units and tick/step rules; validate decimals, whitespace, very large inputs and integer unit limits.
36. Preview expiry or reservation expiry should refresh economics and require review where values change, not silently commit a different order.
37. Preserve draft and operation identity when leaving/re-entering or losing connectivity.
38. Distinguish acknowledged order, resting remainder, partial fill, filled, cancelled, rejected, expired and unknown result.
39. Keep the exact result available after navigation; recent history is not a substitute for operation reconciliation.
40. Test empty-book resting-limit entry separately from instant execution; a valid first order should not require invented liquidity.
41. Persist meaningful receipt facts: submitted constraint, actual fills, fees, remaining amount and timestamps; do not overwrite them with today's reference price.
42. Coordinate cancel/fill races and retries with one authoritative order state, then refresh all affected projections.

### Buyouts / governance / supporting subpages

43. Make buyout input/confirmation denomination explicit and preserve holdings-load errors.
44. Qualify duplicate submission and network-unknown behavior of buyout creation; do not assume normal-order idempotency covers this separate command.
45. Explain the actual buyout model: per-holder tender acceptance versus collective vote versus completed asset exit. These cannot be interchangeable labels.
46. Show eligibility/record date/deadline, previous participation and closed state from backend evidence.
47. Distinguish proposal approval, accepted tender, settlement and distribution. No early “paid” or completed-ownership state.
48. Keep price-alert create/toggle/delete persistence and triggering basis aligned: last trade versus another supported metric; verify delivery and retry rather than only the settings row.
49. Qualify tax/document source consistency against the settled ledger, with empty year and generation failure states.

### Shared visual and accessibility refinement

50. Correct dark-mode numerical contrast before choosing more accent colors.
51. Measure chart bounds from its container and keep plot/axes/control alignment stable across states.
52. Keep transparent practical touch targets; accessibility does not require decorative 44pt circles around ordinary icons.
53. Verify largest supported text for value, percentage, timestamp, fee disclosure and dock actions together.
54. Make screen-reader announcements useful but restrained; live prices must not continually interrupt task input.
55. Keep reduced-motion behavior in quote ticks, tabs and sheets; no continuous market pulsing.
56. Preserve loading-to-final geometry and sticky-dock clearance; unknown/empty states should retain the same navigation/control anchors.

## 7. The data contracts that unlock consistent quality

These are **proposed semantic responsibilities**, not a demand for a large new API framework. Reuse the existing owners and extend only directly coupled contracts.

| Meaning | Required ownership / distinction | Consumers |
|---|---|---|
| Market capability | Offering state, secondary state, halt/reconciliation reason, buy/sell/cancel capability and observation time | Hub, detail, dock, ticket, command authorization |
| Price provenance | Reference price; appraisal with source/date; last execution with execution time; bid/ask with quantity and book revision | Hero, chart, statistics, position mark, ticket |
| Position | Owned/reserved/sellable, cost basis, marked value/basis/time, realized result, supported settlement state | Ownership, portfolio, ticket limits, wallet |
| Order | Operation key, order ID, exact submitted constraint, requested/filled/remaining units, execution economics, expiry, status/version | Confirm, history, open orders, receipt, reconciliation |
| History range | Window start/end, interval/timezone, canonical trade source, aggregation watermark and completeness | Chart, selected-period change, tape/export |

The parent/source-of-truth should make these distinctions once. Adding screen-local fallbacks will make the current disagreement harder to fix.

## 8. Recommended implementation waves

| Wave | Scope and dependencies | Exit evidence |
|---|---|---|
| **1. Consequential correctness** | F01–F05: exact unknown-result identity, currency contract, primary/secondary lifecycle, real order expiry, consistent holds. Frontend + API + migrations/worker where required. | Migrated-DB and navigation tests cover loss/retry/race/expiry; no older-order match or denomination mismatch. |
| **2. One financial read model** | F06–F15, F23–F26: mark provenance, settled-trade history, bounded ranges/cache, canonical freshness/sequence, shared preview eligibility and propagation. | Same asset/operation yields consistent price basis, depth, holdings, cash, history and lifecycle across all consumers. |
| **3. Complete subpage interactions** | F12, F17, F19–F22, F27: chart retry/inspection, governance, buyout partial states, cancellation and education intent. | Behavioral native/component journeys cover relevant empty/error/partial/unknown states without route-reset workarounds. |
| **4. Native authorship pass** | F18, F28: measured chart layout, theme roles, typography, dense rows, docks, media and accessibility; preserve existing hierarchy improvements. | Before/after iOS/Android captures and interaction walkthrough, including large text/dark/offline. |
| **5. Release qualification** | F29 plus concurrency, live staging, evidence-backed trust/documents, background/reconnect, lifecycle and order-state matrices. | Required suites actually run; staging outcomes recorded; native visual baselines are real; unresolved constraints are explicitly gated. |

Do not ship cosmetic “completion” between Wave 1 and Wave 2 while the same screen still misrepresents its financial data. Migrations and reservation/lifecycle changes need a compatibility and rollback plan before production rollout. Existing orders/holds require reconciliation, not just new-code behavior.

## 9. Minimum behavioral acceptance matrix

| Scenario | Required result |
|---|---|
| Older filled order exists; new submit response lost | Exact new key stays unresolved/processing; older order never stands in for it |
| Duplicate/concurrent reservation or submission | One logical result and one valid hold; changed payload with reused key conflicts |
| Buyout with non-GBP display preference | Input, review and backend economic amount agree |
| Last primary unit purchased | Primary closes appropriately; eligible secondary market still works |
| GFD/GTC90 boundary; fill races expiry | Expired order cannot match; release occurs once |
| Abandoned preview; later resting order | Preview hold expires; live-order hold persists beyond preview TTL |
| Self-only order book; two same-price counterparties | Preview excludes self; depth correctly aggregates counterparties |
| Cancel races fill or network loss | Authoritative outcome, accurate remaining/filled quantities, coherent cash/holdings |
| Quiet but freshly observed market | Old last trade is labelled old; no false transport-disconnected block |
| Recent trade but broken stream | Recent trade is not evidence of current book validity |
| Empty/nonempty/error chart ranges | Correct time boundaries; controls remain; retry works; no mislabeled fallback |
| Historical dataset exceeds a year | ALL reaches available history with bounded/aggregated rendering |
| Reference/appraisal/last trade/bid differ | Each value has an explicit basis; portfolio and detail use the same mark |
| Return to mounted portfolio after trade | Position, balances, order state and relevant histories reconcile |
| Closed governance/unknown previous vote | No active submit control claiming known eligibility; recovery is available |
| Two authenticated users / signed-out viewer | Orders, holdings, distributions and personal governance state remain appropriately scoped |
| Largest text / screen reader / reduced motion | Values and actions remain reachable; chart inspection has equivalent non-drag interaction |

For native visual acceptance, capture the same asset/state on a small and large phone, in light/dark, at default/large text. Include primary offering, populated secondary market, empty book, partial position, loading/error/offline and order-unknown states. Record first-useful-content Y position, visible useful rows, dominant non-media surface count, chart bounds, dock occlusion and loading/final shift. Perform thumbnail and squint review. No current measurements of these properties are claimed here.

## 10. Current research: what to transfer, and what not to copy

The following are **D: public official documentation**, accessed **8 September 2026**. Undated pages are not represented as newly published in September. Proposed Co-Own acceptance criteria are our engineering inference from these sources, not statements that competitors use our architecture or meet an unmeasured performance target.

| Publisher / source | Publication date verified | Supported comparison and transfer |
|---|---|---|
| [Rally — FAQ](https://rallyrd.com/faq/) | Undated | Documents last-trade-based market value, partial matching, trading states and buyout/exit progression. Transfer explicit price meaning and lifecycle; do not copy its jurisdiction, trading hours, fee policy or legal structure. |
| [Robinhood — Viewing stock details](https://robinhood.com/us/en/support/articles/viewing-stock-detail-pages/) | Undated | Connects instrument information with position metrics and history. Transfer the asset → price → position → action reading order, only using metrics Co-Own actually supports. |
| [Robinhood — Using charts](https://robinhood.com/us/en/support/articles/using-the-charts/) | Undated | Documents chart types, time spans and point inspection. Transfer accurate period semantics and inspectable historical values; candlestick presence alone is not parity. |
| [Robinhood — Cancel or replace an order](https://robinhood.com/us/en/support/articles/360001226826/) | Undated | Cancellation/replacement depends on actual order eligibility and state. Transfer authoritative transitions and race handling, not another market's rules. |
| [Trading 212 — Portfolio Charts](https://helpcentre.trading212.com/hc/en-us/articles/22435640547613-Portfolio-Charts) | Undated | Distinguishes unrealized investment result from cash-flow-aware portfolio performance. Transfer clear valuation/return definitions; this does not require adding a money-weighted-return feature now. |
| [TradingView — Advanced Charts accessibility](https://tradingview.com/charting-library-docs/latest/configuration/accessibility/) | Undated | Documents interaction/announcement support and limitations. Transfer explicit accessible chart behavior; desktop support does not prove native VoiceOver/TalkBack parity. |
| [TradingView — Lightweight Charts accessibility](https://tradingview.github.io/lightweight-charts/tutorials/a11y/intro) | Undated | Accessibility needs an application-owned layer beyond chart rendering. A renderer replacement alone will not fix F27. |
| [Apple — Charts, Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/charts) | No page date verified | Accurate labels, context and accessible descriptions matter. Transfer meaningful value/date/series descriptions and non-color distinctions. |
| [W3C — Error Prevention: Legal, Financial, Data](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html) | Updated 16 September 2025 | Supports review/correction, checking or reversibility for consequential submissions. Adopt reviewable order facts and editable drafts; this is not a native compliance certificate. |
| [TanStack Query — React Native](https://tanstack.com/query/latest/docs/framework/react/react-native) | Undated/latest docs | Documents app focus, connectivity and screen-focus integration. Transfer coherent refresh and subscription lifecycle; check the installed version before using newer options. |
| [TanStack Query — Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations) | Undated/latest docs | Mutation ownership and invalidation matter; per-call callbacks can be affected by unmount. Transfer durable reconciliation, not “HTTP success means trade filled.” |
| [Stripe — Advanced error handling](https://docs.stripe.com/error-low-level) | Undated | Network failures can leave outcomes indeterminate; idempotent operation identity supports safe recovery. Transfer that distributed-systems principle, not Stripe-specific retry windows into Co-Own. |

**Benchmark boundary:** Collectable's public login was retrievable, but its authenticated current trading UI was not verified. Do not infer operating status from an empty public root response, or substitute similarly named products. Earlier Kalshi/Polymarket research in this repository can inform order mechanics, but binary-event payout, probability and resolution concepts are not automatically appropriate for collectible ownership.

**Why these patterns matter:** explicit value provenance reduces interpretation errors; stable controls preserve user orientation during async changes; exact operation continuity prevents repetition under uncertainty; flat hierarchy makes consequential values easier to scan. These are design/engineering rationales, not measured conversion or cognitive-load results from this project.

## 11. What not to add as a substitute for depth

- Public-company ratios, analyst ratings or invented ticker metadata for an asset that has no such economics.
- Synthetic price history, implied liquidity, fabricated “live” movement or random sparkline data.
- Options, leverage, stop-loss, advanced indicators or market-news panels simply to resemble a brokerage.
- Binary-event probability/max-payout language borrowed from prediction markets.
- More equal-weight cards around the same asset, price and position facts.
- Stronger custody, protection, compliance or return claims without backend evidence and appropriate operational/legal review.
- New parallel screens or a wholesale chart-library migration before fixing history contracts and accessible interaction ownership.

Nothing in this review determines whether the actual Co-Own/1ZE legal or operating model is permitted for a target market. An equity-like UI is not evidence of regulatory approval or stock-like liquidity.

## 12. Handoff

**Research deliverable complete. Product upgrade not certified complete.** The department has meaningful visual and functional foundations, but the 29 confirmed findings above justify another focused full-stack depth pass. The 56 refinement requirements provide a broad acceptance brief without expanding into unrelated features.

Start with **exact order recovery, monetary denomination, market lifecycle, expiry and reservation truth**. Then align the chart/position/read models and finish native visual verification. That sequence will make the existing product feel more mature because it becomes more predictable and trustworthy—not merely more decorated.

No production source, tests, configuration or user changes were edited by this task. No commits, deployment or financial mutations were performed. **Native visual validation and live Co-Own endpoint validation remain pending.**
