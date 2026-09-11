# Seller Analytics Flagship Upgrade — Research Ledger

**Access date:** 2026-09-10
**Campaign:** Seller Hub Analytics Wave — Custom Date Ranges + UI/UX Elevation

---

## 1. Competitor Date Range Patterns (2026)

### eBay Seller Hub (Terapeak 2.0)
- **Presets:** 7d, 30d, 90d, 365d
- **Custom:** Yes — calendar picker, up to 365 days
- **UI:** Preset chips at top + custom mode opens calendar
- **Comparison:** Month-over-month or year-over-year
- **Source:** https://innovation.ebayinc.com/stories/new-improved-terapeak-research-2-0-in-ebay-seller-hub/ (Direct observation, eBay Inc)
- **Source:** https://www.ebay.co.uk/help/selling/selling-tools/seller-hub?id=4095 (Primary documentation)

### Stripe Dashboard
- **Presets:** Prior month, current MTD, last week, yesterday, custom
- **Custom:** Yes — two-date calendar, inclusive dates
- **UI:** Button showing active period → flyout with preset chips + calendar
- **Source:** https://docs.stripe.com/dashboard/search (Primary documentation)
- **Source:** https://docs.stripe.com/reports/scheduled-reports (Primary documentation)
- **Source:** https://www.setproduct.com/blog/date-picker-ui-design (Secondary analysis)

### Shopify Analytics
- **Presets:** 7d, 30d, 90d, 365d, this week/month/quarter/year, yesterday, today, BFCM
- **Custom:** Yes — fixed date range or rolling date range
- **UI:** Top-of-page dropdown/chip selector + comparison date range selector
- **Comparison:** Previous period / previous year / custom range — dashed overlay line on charts
- **Source:** https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/report-types/using-reports/time-ranges (Primary documentation)
- **Source:** https://changelog.shopify.com/posts/analytics-last-n-days-presets-now-includes-today-s-data (Primary documentation)
- **Source:** https://changelog.shopify.com/posts/improvements-to-selecting-date-ranges-within-shopify-reports (Primary documentation)

### Square Dashboard
- **Presets:** Last 30d (default), Last 7d, Last month, Last year
- **Custom:** Yes — "Custom" in top-right dropdown → calendar inputs → Apply
- **UI:** Dropdown at top-right, expanding reveals presets + Custom
- **Source:** https://squareup.com/help/us/en/article/5072-summaries-and-reports-from-the-online-dashboard (Primary documentation)
- **Source:** https://squareup.com/help/us/en/article/5381 (Primary documentation)

### Etsy Seller Stats
- **Presets:** Today, Yesterday, Last 7d, Last 30d, All time
- **Custom:** A/B tested — some accounts have it, some don't (2026)
- **Comparison:** Compare to previous period / last year
- **Source:** https://help.etsy.com/hc/en/articles/115015774268 (Primary documentation)
- **Source:** https://spyseller.com/questions/why-cant-i-set-a-custom-date-range-in-etsy-shop-stats-anymore (Community report)

### Depop / Vinted
- **Native analytics:** Very limited. Depop Shop Stats is historical only (UTC). Vinted has no full in-app seller analytics.
- **Custom:** Depop web allows CSV download with custom dates (up to 3 months). Vinted relies on third-party tools.
- **Source:** https://depophelp.zendesk.com/hc/en-gb/articles/360019016817 (Primary documentation)
- **Source:** https://blog.vinta.app/blog/vinted-seller-statistics-dashboard-guide (Secondary analysis)

### Flagship Mobile Analytics Apps
- **Instagram Insights:** 7/14/30/90d, Previous month; custom within past 90d; top-left dropdown → preset pills → tap start/end → Update
- **YouTube Studio mobile:** 24h/7/28/90/365d/Lifetime; NO custom on mobile (desktop only)
- **TikTok Analytics:** 7/28/60d; custom up to 60d; time pill buttons/dropdown
- **Source:** https://help.latest.instagram.com/1407497629635879/ (Primary documentation)
- **Source:** https://support.google.com/youtube/answer/9002587 (Primary documentation)
- **Source:** https://nealschaffer.com/tiktok-analytics/ (Secondary analysis)

---

## 2. Mobile Date Range Picker Best Practices (2026)

1. Default to "Last 30 days" — most common operational window
2. Expose presets as primary chips/pills — 7D, 30D, 90D, plus "Custom"
3. Use a bottom sheet for custom selection on mobile — don't cover whole screen
4. Two-step range selection — tap start, then end; highlight inclusive span
5. Show active range in header — e.g., "Mar 1 – Mar 31, 2026"
6. Apply/Cancel pattern — custom ranges require explicit Apply; presets apply instantly
7. Include comparison toggle — "Compare to previous period"
8. Respect data freshness — mark partial/in-progress days
9. Constrain range length — max 365 days for performance
10. Use local time for "today", UTC for historical aggregates
- **Source:** https://uxpatterns.dev/patterns/forms/date-range (Secondary analysis)
- **Source:** https://www.setproduct.com/blog/date-picker-ui-design (Secondary analysis)
- **Source:** https://uxpatternsguide.com/patterns/date-range-picker/ (Secondary analysis)

---

## 3. React Native Date Picker Libraries (2026)

| Library | Best for | Key features | Caveats |
|---------|----------|--------------|---------|
| @react-native-community/datetimepicker | Native single date entry | iOS/Android native wheels | No range selection — pair two pickers |
| react-native-ui-datepicker | Custom range picker | Single/range/multiple, 105k+ weekly | JS-based, needs styling |
| react-native-calendars (Wix) | Mature calendars | Calendar, CalendarList, Agenda | Bigger bundle; range needs custom logic |

**Decision:** Use the existing `AppDatePicker` primitive (already in codebase) for start/end selection inside a BottomSheet. No new dependency needed.

---

## 4. Analytics UX Psychology (2026)

### Information hierarchy
- One hero metric per screen; secondary numbers 2-3× smaller
- Working memory holds ~4-7 chunks; mobile should stay under that at first glance
- Avoid "density disjoint" — too many KPI cards force random scanning
- **Source:** https://gummble.com/blog/mobile-dashboard-design-examples (Secondary analysis, 2026)
- **Source:** https://spaceberry.studio/blog/dashboard-ui-four-best-practices-for-mobile-clarity (Secondary analysis)

### Chart readability
- Sparklines for glanceable trend; full charts for point-in-time exploration
- 5-7 bars is safe upper bound for mobile bar charts
- Touch targets ≥ 44-48px; tap-based tooltips not hover
- **Source:** https://querio.ai/articles/how-to-design-dashboards-for-mobile-users (Secondary analysis)
- **Source:** https://informavista.com/effective-mobile-chart-design-principles-practice/ (Secondary analysis)

### Comparison period UX
- Every KPI should be paired with a reference (prior period, target, benchmark)
- Percentage delta is default; offer toggle to absolute
- Use both arrow glyph AND color; never rely on color alone
- "Up is good" is not always true (e.g., lower return rate is positive)
- **Source:** https://microcharts.dev/docs/charts/delta (Secondary analysis)
- **Source:** https://docs.evidence.studio/components/delta (Primary documentation)

### Fashion marketplace metrics
- Relevant: revenue, conversion rate, sell-through rate, AOV, views, likes/saves, offers, time-to-first-like, seasonal velocity
- Views and likes are vanity unless tied to conversion
- Depop 2026 algorithm weights: click-through, likes-to-views, time-to-first-like, conversion, response time, review score, recency
- **Source:** https://www.underpriced.app/blog/depop-algorithm-seo-guide-2026 (Secondary analysis, 2026)
- **Source:** https://blog.vinta.app/blog/vinted-seller-statistics-dashboard-guide (Secondary analysis)

### Progressive disclosure
- Three layers: Glance (2s, 3-7 KPIs), Detail (one tap), Configuration (filters, custom date)
- Summary first, details on tap; use bottom sheets
- **Source:** https://pixxen.com/blog/progressive-disclosure-saas/ (Secondary analysis)
- **Source:** https://www.d23.io/blog/mobile-friendly-embedded-dashboards-patterns (Secondary analysis)

### Trust and transparency
- Communicate freshness explicitly; users cannot tell if a number is current or stale
- Show status per tile: current, delayed, partial, incomplete
- Data provenance and last-updated time reduce disputes
- **Source:** https://thenewstack.io/can-you-trust-your-dashboard-the-critical-role-of-data-freshness/ (Secondary analysis)
- **Source:** https://www.basedash.com/blog/data-freshness-how-current-your-dashboard-data-really-is (Secondary analysis)

### Anti-AI design for analytics
- "AI slop": purple-blue gradients, 3-card grids, Inter/Roboto everywhere, glassmorphism, fake data, decorative badges
- Human-authored: clear visual thesis, fixed semantic tokens, product-specific copy, realistic states
- Avoid default component-library styling; make spacing, color, motion decisions intentional
- **Source:** https://github.com/JTech-CO/non-ai-design-skill-pack (Community resource)
- **Source:** https://pythoughts.com/@melkholy/posts/post-1779992445260 (Secondary analysis)

---

## 5. Codebase Audit Findings

### Current state
- **Period selector:** 3 fixed presets (7d, 30d, 90d) as iOS segmented control
- **Backend:** All 5 analytics endpoints validate `z.enum(['7d','30d','90d'])` only
- **API client:** `fetchSellerAnalytics` has dead `offsetDays` param backend doesn't accept
- **Chart:** Line mode has 3 P1 bugs (previous period not rendered, hardcoded 300px width, no touch interaction)
- **Insights:** `periodDays`/`periodLabel` hardcoded for 7d/30d/90d only
- **Category mix:** 2% floor can cause >100% sum
- **Copy:** Verbose AI-generated text in listing detail (reprice title, intent callouts)

### P1 issues blocking custom ranges
1. `useAnalyticsInsights.ts:87-88` — `periodDays`/`periodLabel` hardcoded
2. `commerceApi.ts` — no `startDate`/`endDate` parameter support
3. `backend/api/src/routes/sellers.ts` — all endpoints validate `z.enum(['7d','30d','90d'])` only
4. `AnalyticsTrajectoryChart.tsx` — line chart not responsive, no previous period line, no touch interaction
5. `commerceApi.ts:843-846` — dead `offsetDays` contract

### Design system
- `AppDatePicker` primitive already exists (wheel picker with expo/ui fallback)
- `BottomSheet` component exists with variants (system, form, inspector, transaction, immersive)
- Design tokens: `Space`, `Radius`, `Control`, `Elevation`, `TypographyV2`, `FontFamily`
- Chart primitives: `Sparkline`, `LineChart`, `AnalyticsTrajectoryChart` (Skia-based)

---

## 6. Design Decisions

### Custom date range interaction
- **Pattern:** Preset chips (7d, 30d, 90d) + "Custom" chip that opens a bottom sheet
- **Sheet:** Uses existing `BottomSheet` (system variant) with two `AppDatePicker` instances (start, end)
- **Validation:** Start ≤ end, max 365 days, no future dates, min 1 day
- **Apply/Cancel:** Custom requires explicit Apply; presets apply instantly
- **Comparison:** Previous period = equal length immediately before the selected range
- **Backend:** Accept `startDate`/`endDate` (ISO date strings) OR `period` enum; shared helper computes interval + previous window

### Chart fixes
- Make line chart responsive to container width using `onLayout`
- Render previous period as dashed line
- Add touch interaction to line mode (tap to inspect point)
- Fix Y-axis label clipping

### Copy cleanup
- Trim verbose reprice title and intent callouts
- Remove instructive product rail header
- Make all copy concise and marketplace-native

### Category mix fix
- Remove 2% floor; use true percentages that sum to 100%
