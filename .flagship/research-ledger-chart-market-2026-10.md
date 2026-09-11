# Research Ledger — Chart Switching + Order Book Container + Ladder/Depth/Tape Verification

**Date:** 2026-10
**Access date:** live web research via web_search

## R1 — Broker chart type switcher (mobile)

### Robinhood (Legend charts on mobile, 2025)
- Source: https://robinhood.com/us/en/support/articles/using-advanced-charts/
- Source: https://robinhood.com/us/en/newsroom/introducing-robinhood-legend-charts-on-mobile/
- Source: https://robinhood.com/us/en/support/articles/widgets-in-robinhood-legend/
- **Chart types offered:** Line, Candlestick, Area (Robinhood Legend widgets doc lists: area, candle, line).
- **Switcher UX:** "To switch the chart type, select the Chart icon, and then select Line or Candlesticks" (basic chart). Legend widgets expose area, candle, line as a chart-types icon in the top-right corner of the chart widget.
- **Observation:** The switcher is a small icon (chart-types icon) in the top-right of the chart, opening a small menu. It is NOT a prominent segmented control — it is a settings-style affordance. The default is candlestick for advanced, line for basic.
- **Why:** Active traders want candlesticks; casual users want line. The switcher is intentionally compact so it doesn't compete with the chart itself.

### Questrade Edge Mobile
- Source: https://corporatefx.questrade.com/learning/questrade-basics/questrade-edge-mobile/charting
- **Chart types offered:** Candlestick, Colored Bar, Line, Step, Mountain, Baseline, Hollow Candle, Scatterplot, Histogram, Heikin Ashi (10 types).
- **Switcher UX:** "Tap the chart type button near the top left above your chart" → opens a list.
- **Observation:** Top-left button above the chart opens a list picker. The chart type is a configuration, not a primary navigation control.

### TradingView Mobile
- Source: https://optimusfutures.com/blog/switch-chart-types-in-seconds-on-tradingview-mobile-tradingview-mobiletrading-tradingviewcharts/
- **Chart types offered:** Candlestick, Bar, Line, Area.
- **Switcher UX:** "Tap the slider icon at the bottom of your chart" → choose style.
- **Observation:** Bottom of chart, slider icon. Compact, settings-style.

### Velocity Trade / Trade Revolution (mobile)
- Source: https://help.za.velocitytrade.com/mobile-applications/phone/tablets/chart
- Source: https://guide.traderevolution.com/project/traderevolution-for-mobile/phones/chart.md
- **Chart types offered:** Line, Candle, Area (Velocity); Line, Candle, Heikin Ashi, Area (Trade Revolution).
- **Switcher UX:** "Chart style" setting in chart settings screen.
- **Observation:** Buried in settings, not a primary control.

### Conclusion — chart type switcher pattern
- **Universal pattern:** Chart type is a SETTINGS affordance, not a primary navigation control. It is a small icon (top-right or top-left) or a settings menu item, NOT a prominent segmented control beside the range tabs.
- **Common chart types:** Line, Candlestick, Area. Some pro apps add Bar, Heikin Ashi, Mountain/Baseline.
- **Default:** Candlestick for pro/active; Line for casual/basic.
- **For ThryftVerse:** Offer Line, Candlestick, Area (3 types — matches the flagship broker set). Switcher is a compact icon in the chart header (top-right), opening a small popover/menu. NOT a segmented control competing with range tabs.

## R2 — Order book container / chrome pattern

### IBKR Mobile
- Source: https://www.interactivebrokers.com/campus/trading-lessons/exploring-quote-details-android/
- Source: https://www.interactivebrokers.com/campus/trading-lessons/exploring-quote-details-iphone/
- **Pattern:** The order book (BookTrader / Level II) is a distinct TAB on the Quote Details screen, alongside Chart, Options, Tax Lots. It is NOT overlaid on the chart. It gets its own full-screen tab.
- **Container:** Full-screen tab, no card within a card. The book IS the surface.
- **Observation:** IBKR treats the book as a peer of the chart, not a subordinate. Both are top-level surfaces.

### Robinhood / Binance / typical mobile brokers
- Source: direct observation + https://medium.com/@hbnguyen/building-a-real-time-crypto-order-book-in-react-native-with-skia-websocket-b2a801413283
- **Pattern:** Order book is typically a panel BELOW the chart on the asset detail screen. It is a distinct visual surface — either a card with a border, or a clearly bounded region with its own header.
- **Container:** Most mobile brokers render the order book inside a bounded region (subtle border or distinct background) to separate it from the chart above. It is NOT flat on the same canvas as the chart — the visual separation aids scanability.

### Conclusion — order book container pattern
- **Universal pattern:** The order book is a DISTINCT visual surface, separated from the chart. It is either:
  - A full-screen tab (IBKR), or
  - A bounded panel below the chart (Robinhood, Binance, most mobile brokers).
- **NOT flat on the same canvas as the chart.** Visual separation (border, background, or both) is the norm because the book and the chart present different data types and the eye needs to separate them.
- **For ThryftVerse:** The user explicitly asked for the order book "inside a rectangle UI component like you setted up the chart module." This matches the flagship pattern. Wrap the order book (ladder/depth/tape) in a bounded card — but keep it flat-canvas internally (no nested cards). Use a hairline border + subtle surface fill, NOT a heavy shadow.

## R3 — Ladder / Depth / Tape verification

### What each view shows (from research)
- Source: https://chartmini.com/blog/how-to-read-level-2-order-book
- Source: https://teytrade.com/articles/tape-reading-vs-level-2/
- Source: https://altymo.com/blog/level-2-data/

| View | Data shown | Question answered | Best for |
|------|-----------|-------------------|----------|
| **Ladder (Level 2)** | Displayed limit orders at multiple price levels (bids/asks with size) | "Where is visible liquidity sitting right now?" | Entry/exit planning, seeing support/resistance walls, judging spread quality |
| **Depth chart** | Cumulative size visualization (area chart of cumulative bids vs asks) | "How much depth is on each side?" | Quick visual of buy/sell pressure imbalance, spotting thin vs thick book |
| **Time & Sales (Tape)** | Executed trades (time, price, size) | "What actually traded?" | Confirming executions, spotting aggressive buyers/sellers, tape reading |

### When to use each
- **Ladder:** Default for active trading. Shows the live order book — where resting orders sit. Best for placing limit orders at the right price.
- **Depth:** Visual summary of the ladder. Best for quick assessment of liquidity imbalance. Less precise than ladder but faster to read.
- **Tape:** Shows what ACTUALLY executed (vs ladder which shows intent). Best for confirming fills, spotting aggressive flow, tape reading.

### Verification decision
- **All three views are justified.** They answer different questions:
  - Ladder = "what's sitting?" (intent)
  - Depth = "how much on each side?" (visual summary)
  - Tape = "what traded?" (fact)
- **The segmented control (Ladder | Depth | Tape) is correct and matches flagship broker patterns.** IBKR, Robinhood, and Binance all offer these three views (or a subset) as switchable tabs within the order book panel.
- **Default should be Ladder** (most precise, most actionable). Current default is Ladder ✅.
- **Improvement:** The segmented control should be INSIDE the order book card (the new rectangle container), not floating above it. This makes the card a self-contained "Order Book" module with its own view switcher — matching the chart module pattern (chart has its own range switcher inside it).

## R4 — Design decision summary

### Chart module
1. Add chart-type switching: Line, Candlestick, Area (3 types).
2. Switcher is a compact icon in the chart header (top-right), NOT a segmented control.
3. Default remains Candlestick (pro default).
4. Line chart: close prices connected by a line, direction-colored.
5. Area chart: line chart + gradient fill below (coownUpSubtle for up periods).
6. Keep range controls (1D…ALL) as the primary control.
7. Chart stays flat on canvas (no card) — it is the dominant object.

### Order book module
1. Wrap ladder/depth/tape in a bounded card (rectangle) — hairline border + subtle surface fill.
2. The segmented control (Ladder | Depth | Tape) moves INSIDE the card header.
3. Card has a title "Order Book" or just the segmented control as the header.
4. No nested cards inside — the card is the container, contents are flat.
5. This matches the user's request: "order book inside a rectangle UI component like you setted up the chart module."

### Anti-AI design compliance
- Chart type switcher is a settings icon, not a prominent control (matches flagship pattern).
- Order book card uses hairline border + subtle fill, NOT heavy shadow (flat canvas discipline).
- No card-within-card. The card is the boundary; contents are flat.
- Three chart types only (Line, Candlestick, Area) — restraint, not option paralysis.
- Segmented control stays flat (no pills) — consistent with existing design language.

---

## Implementation evidence — 2026-10-15

### Chart-type switching (CoOwnCandleChart.tsx)
- Added `export type CoOwnChartType = 'line' | 'candle' | 'area'`.
- Added `chartType?` and `onChartTypeChange?` props (backward compatible — switcher hidden when omitted).
- Line chart: Skia `Path` stroke from close prices, direction-colored (last vs first close).
- Area chart: same line + gradient fill (alpha 0.32 → 0.04) closed to the price baseline.
- Candlestick: wrapped existing rendering in `chartType === 'candle'` guard.
- Switcher: 20pt `options-outline` Ionicons icon, 44pt hit target, flat popover menu (hairline border, surface fill, no shadow).
- Menu closes on selection (with haptics.selection()) or tap-outside via transparent backdrop.
- Crosshair, volume band, price axis, date axis, last-price line all remain intact for all modes.
- Wired through: `AssetDetailScreen` (state) → `AssetOverviewSection` (props) → `CoOwnCandleChart`.

### Order book card (AssetMarketSection.tsx)
- Wrapped ladder/depth/tape in a single rectangle card: `Radius.md`, `borderSubtle` hairline, `surface` fill, `overflow: hidden`, no shadow.
- Card header: "Order Book" label (body 14 semibold) + Ladder/Depth/Tape segmented control (flat tabs, 2px brand underline for active).
- Hairline separator between header and content.
- Ladder view: top-of-book quote strip + `CoOwnOrderBook` (embedded, no nested card).
- Depth view: `CoOwnDepthChart` (cumulative depth from mapped bids/asks, compact mode).
- Tape view: execution tape rows (independent of order book state — executions are settled trades, not resting liquidity).
- Error/stale/synchronizing/empty states apply to ladder and depth only; tape always renders its own loading/error/empty states.
- Status row (depth status dot + alert button) stays above the card.
- 24h stats strip stays in the transaction surface (above the card).
- Open orders panel stays separate (not merged into the card).

### Barrel export
- Added `CoOwnDepthChart` and `CoOwnDepthChartProps`/`CoOwnDepthLevel` to `components/coown/index.ts`.
- Added `CoOwnChartType` to the `CoOwnCandleChart` type export.

### Verification
- `npx tsc --noEmit`: 0 errors in Co-Own files (5 pre-existing errors in unrelated files: useAssetDetailTradeState.ts, AssetDueDiligenceScreen.tsx, TradeScreen.tsx, mediaUploadMultipart.ts — all from Wave 9/10 work).
- `npm test -- --run`: 87 test files passed, 1 failed (pre-existing filterMatrixAgreement.test.ts from Wave 9/10). 1784 tests passed, 2 skipped. All 31 Co-Own asset-detail runtime tests pass.
- Updated 2 tape tests in `coownAssetDetailRuntime.test.tsx` to switch to the Tape tab before asserting tape content (the tape is now behind the segmented control, not always visible).
