# ThryftVerse Flagship Upgrade — Charts & Data Visualization

**Component deep-dive:** every chart, graph, stat card, metric row, analytics dashboard, and trend line in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §6 (truthful UI — no fabricated data) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### eBay (2026)
eBay's seller analytics dashboard shows: revenue over time (line chart with period selector), sales by category (donut chart), listing performance (bar chart of views/sales per listing), and conversion funnel. Charts are interactive — tap a data point for a tooltip. eBay's lesson: **seller analytics must show trends over time, not just flat KPI rows.**

### Instagram (2026)
Instagram's creator analytics shows: follower growth (line chart with gradient fill), engagement rate (sparkline in metric card), top content (ranked list with metrics), and audience demographics (donut chart). Sparklines in metric cards are the key pattern — a tiny inline trend line that shows direction without taking space. Instagram's lesson: **sparklines make metric cards informative — a number alone doesn't tell you if it's improving or declining.**

### Cross-cutting 2026 consensus
- **Line charts** for trends over time (revenue, views, followers).
- **Bar charts** for discrete periods (monthly sales, daily views).
- **Donut/pie charts** for category breakdowns.
- **Sparklines** in metric cards for inline trends.
- **Interactive tooltips** on tap/long-press for data point details.
- **Period selectors** (7d / 30d / 90d / 1y) as segmented control.
- **No fabricated data** — every chart must reflect real backend data (per AGENTS.md §6).
- **`victory-native` or `react-native-chart-kit`** for chart components.

---

## 2. Psychology & Principles

### Trend direction vs absolute value
A metric card showing "£1,234 revenue" tells the user the value but not the direction. The same card with a sparkline showing an upward trend tells the user "you're improving." The delta badge (+12.5%) helps, but the sparkline is more visceral — the user sees the shape of the trend, not just a number.

### The chart lie
A chart with fabricated or placeholder data is worse than no chart. The user makes decisions based on the chart ("my revenue is growing, I should list more") and if the data is fake, the decision is wrong. Per AGENTS.md §6: no fabricated success, no fake data. Every chart must reflect real backend data.

### Period comparison
Showing the current period alongside the previous period ("£1,234 this month vs £1,100 last month") is more informative than showing only the current period. The comparison answers "am I improving?" without requiring the user to remember the previous value.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Chart/data-viz components (5 files)

| File | Lines | Type | Quality |
|------|-------|------|---------|
| `components/coown/CoOwnPriceChart.tsx` | 733 | Line/sparkline with period selector, candle mode | ✅ Sophisticated, custom SVG |
| `components/coown/CoOwnCandleChart.tsx` | 424 | Candlestick with Skia, crosshair on long-press | ✅ Sophisticated, Skia |
| `components/trade/MetricGrid.tsx` | 94 | Grid of metric cards (2-4 columns) | ✅ |
| `components/commerce/detail/CommerceDetailMetricRow.tsx` | 144 | Compact label/value row | ✅ |
| `components/flagship/FlagshipMetricLine.tsx` | 152 | Flat label/value pair (ledger style) | ✅ |

### Inline chart/stat implementations

| Screen | Lines | Visualizations | Defects |
|--------|-------|----------------|---------|
| `CreatorAnalyticsDashboardScreen.tsx` | 1076 | MetricTile (2x2 grid), EngagementBarRow (progress bars), TimelineChart (View-based bar chart), TopContentRow (ranked list) | Basic View-based bars, no chart library |
| `SellerAnalyticsScreen.tsx` | 661 | Revenue hero, period selector, KPI flat rows, top listing cards, needs-attention rows | **NO CHARTS** — only flat rows |
| `WalletScreen.tsx` | — | Balance breakdown | No spending trends, no balance history |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **SellerAnalyticsScreen has NO charts** — only flat KPI rows and listing cards | `SellerAnalyticsScreen.tsx` | High |
| 2 | **No revenue over time chart** | SellerAnalyticsScreen | High |
| 3 | **No category breakdown chart** (donut/pie) | Both analytics screens | Medium |
| 4 | **No sparklines in metric cards** — only delta badges | CreatorAnalyticsScreen | Medium |
| 5 | **No interactive tooltips** on charts | CoOwnPriceChart, CoOwnCandleChart | Medium |
| 6 | **No chart library installed** — only raw SVG/Skia | package.json | Medium |
| 7 | **Inconsistent stat card styling** — 3 approaches (MetricGrid boxed, MetricTile inline, flat rows) | Multiple | Medium |
| 8 | **TimelineChart is basic View-based bars** — not a real chart | CreatorAnalyticsScreen:613-677 | Low |
| 9 | **No wallet spending trends** | WalletScreen | Low |
| 10 | **No period comparison** (current vs previous) | Both analytics screens | Medium |

---

## 4. Micro Improvements

### M1 — Add revenue over time line chart to SellerAnalyticsScreen
Use `victory-native` or custom SVG to render a line chart of daily/weekly revenue with a gradient fill below the line. Add period selector (7d/30d/90d/1y). Add tooltip on tap.

### M2 — Add sparklines to metric cards
Add a tiny inline line chart (60pt wide, 20pt tall) to each MetricTile showing the 7-day trend. Use brand color for positive trend, danger for negative.

### M3 — Add category breakdown donut chart
Render a donut chart showing sales by category (Clothing, Shoes, Accessories, etc.) with a legend. Tap a segment to filter.

### M4 — Add interactive tooltips to existing charts
Add tap/long-press handlers to CoOwnPriceChart and CoOwnCandleChart that show a tooltip with the data point's value and date.

### M5 — Install chart library
Add `victory-native` (or `react-native-chart-kit`) for consistent chart components across the app.

### M6 — Standardize stat card styling
Choose one approach (MetricGrid or flat rows) and use it consistently across SellerAnalytics, CreatorAnalytics, and Wallet.

### M7 — Add period comparison
Show "this period vs last period" comparison in the revenue hero: "£1,234 this month · +12.5% vs £1,100 last month."

---

## 5. Macro Improvements

### A1 — Chart component system
Create a unified chart family:
- `LineChart` — trends over time with gradient fill, period selector, tooltips
- `BarChart` — discrete periods (monthly, daily) with tap-to-filter
- `DonutChart` — category breakdowns with legend
- `Sparkline` — inline trend in metric cards
- `MetricCard` — value + delta + sparkline (unified)

### A2 — Analytics as a product surface
Analytics is not a debug screen — it's a product surface that sellers and creators use to make decisions. The architecture: real backend data → chart components → interactive dashboard with period selector, filtering, and drill-down. No fabricated data, no placeholder charts.

---

## 6. Flagship Acceptance Criteria

- **Revenue over time line chart** in SellerAnalyticsScreen
- **Sparklines in metric cards** (inline trend direction)
- **Category breakdown donut chart**
- **Interactive tooltips** on all charts (tap for data point details)
- **Period selector** (7d/30d/90d/1y) on all analytics
- **Period comparison** (current vs previous)
- **No fabricated data** — all charts reflect real backend data
- **Chart library** (victory-native or equivalent) for consistency
- **Standardized stat cards** across all analytics surfaces
- **Accessibility** — charts with `accessibilityLabel` summarizing the data

### Thumbnail test
At 25% scale, a chart must show: the chart shape (line, bars, donut), the axis labels, and the period selector. A metric card must show: the value, the delta badge, and the sparkline direction.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Revenue line chart | Medium | Seller analytics |
| P0 | M2 — Sparklines in cards | Medium | Metric context |
| P1 | M5 — Install chart library | Low | All charts |
| P1 | M3 — Category donut chart | Medium | Category insights |
| P1 | M4 — Interactive tooltips | Medium | Chart UX |
| P2 | M7 — Period comparison | Low | Trend context |
| P2 | M6 — Standardize stat cards | Low | Consistency |
| P3 | A1 — Full chart system | High | All analytics |
| P3 | A2 — Analytics as product surface | High | Seller/creator retention |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `chart.line.color` | colors.brand | Default |
| `chart.line.fillGradient` | brand at 20% → transparent | Below line |
| `chart.bar.color` | colors.brand | Default |
| `chart.bar.radius` | Radius.sm | Top corners |
| `chart.donut.thickness` | 16pt | Ring width |
| `chart.sparkline.width` | 60pt | Inline |
| `chart.sparkline.height` | 20pt | Inline |
| `chart.sparkline.strokeWidth` | 1.5pt | Thin |
| `chart.tooltip.background` | colors.surface | Elevated |
| `chart.tooltip.radius` | Radius.md | |
| `chart.tooltip.padding` | Space.sm | |
| `chart.periodSelector` | Segmented control (7d/30d/90d/1y) | Per Report #33 |
| `chart.axis.labelColor` | colors.textMuted | |
| `chart.axis.labelSize` | Type.caption | 12pt |
| `chart.grid.color` | colors.surfaceAlt | Hairline |
| `metricCard.delta.positive` | colors.success | Green |
| `metricCard.delta.negative` | colors.danger | Red |

---

*Generated 2026-08-18. Sources: production codebase audit, eBay seller analytics, Instagram creator analytics, victory-native docs.*
