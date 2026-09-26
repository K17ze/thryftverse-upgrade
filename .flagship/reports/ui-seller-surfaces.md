# UI Report — Seller surfaces flagship pass (analytics period control, trust strip, standards module)

Scope: three "bot-made" seller surfaces upgraded to the flat-canvas /
hairline-separator / typographic-hierarchy grammar already used by
`CreatorAnalyticsPeriodSelector` and `SellerOrdersModule`. Reference bar:
Depop/Vinted seller hubs. No new files, no new dependencies.

## Files changed

| File | Change |
|---|---|
| `frontend/src/screens/SellerAnalyticsScreen.tsx` | Grey-pill segmented control replaced with hairline tabs (preset tabs + Custom), active state = primary text + 2pt indicator bar. |
| `frontend/src/components/seller/analytics/analyticsStyles.ts` | `periodSegment*` styles replaced by `periodRow` / `periodTab` / `periodTabText` / `periodTabIndicator` (same tokens as creator analytics). Style-owner file for the screen — minimal co-owned edit. |
| `frontend/src/components/seller/SellerTrustStrip.tsx` | Icon+value chip row rewritten as a single flat typographic line. |
| `frontend/src/components/seller/SellerStandardsModule.tsx` | Five-metric accounting line + per-defect ledger rows condensed to one status line (level in header + closest gap). Appeal flow untouched. |
| `frontend/src/components/profile/SellerStandardsBadges.tsx` | Pill chrome (`brandSubtle` fill + `brandBorder` hairline) removed — earned marks now render as flat icon+label text. |
| `frontend/src/screens/SellerHubScreen.tsx` | **No edit needed** — no dead references; both modules still mounted with the same props. |

## 1. Segmented control → hairline tabs

**Verdict: replaced with the hairline-tab pattern.** The codebase already
owns this grammar (`CreatorAnalyticsPeriodSelector`), so matching it reads
more authored than inventing a bespoke iOS segment — and the flat tab
removes the one remaining grey container above the analytics fold.

- Presets `7d / 30d / 90d` + `Custom` render as flat tabs; active tab gets
  `textPrimary` text + a 2pt underline indicator (`periodTabIndicator`).
- `customTriggerRef` still wraps the Custom tab (the sheet anchors to it),
  `AnalyticsDateRangeSheet`, `isRangeSheetVisible`, `haptics.tap()`,
  `accessibilityRole/Label/Hint/State` and `hitSlop` all preserved verbatim.
- The active custom-range label (`customRangeLabel` + `formatCustomRangeLabel`)
  is unchanged.

## 2. Trust strip → one typographic line

Checked `SellerHubScreen.tsx` first: `trust` is consumed only by
`SellerTrustStrip` — nothing else renders rating/response/dispatch, so the
module is not a duplicate and was **kept, stripped to buyer-relevant facts**.

Now renders a single muted line: `★ 100% positive · 1 sale · Ships in ~1 day`.

- One semantic star glyph before the rating clause only (Depop convention);
  the chat/package icons and per-fact chips are gone — the icon+value stat
  row pattern is eliminated.
- **Response-rate clause removed.** A bare "0% response rate" is accounting,
  not reputation — and responsiveness is already actionable via
  `respond_offer` tasks in `SellerOrdersModule`. The backend field still
  flows through `SellerHubTrust`; it is simply not displayed here.
- `stale` degrades to a plain ` · May be out of date` suffix (never rendered
  alone); `awayActive` still withholds the dispatch promise; fail-closed
  null handling and the combined `accessibilityLabel` are preserved.

## 3. Standards module → level + one honest gap

Checked `SellerHubScreen.tsx` first: tier/defects/appeals are surfaced
nowhere else on the hub, so the module was **kept and condensed** rather
than deleted. The five-metric dump (`1 shipped · £193.80 sold · 1.0d ship ·
0.0% cancel · 0.0% returns`) and the per-defect ledger rows
(`X vs Y needed · Z to close`) are replaced by one status line:

- `metrics: null` → `No shipped orders in the last 90 days` (unchanged).
- `defects: []` → `All program criteria met` (unchanged).
- One defect → `19 more lifetime orders to Performer` /
  `Avg ship time 3.2d — 2.0d max for Performer`.
- Several defects → `3 gaps to Performer — closest: 19 more lifetime orders`
  (honest about multiplicity without the wall).

Mechanics:

- `DEFECT_METRIC_META` gained `direction` ('up' = more-is-better,
  'down' = less-is-better, per the backend's gap semantics in
  `routes/sellers.ts`) and `gapNoun` for the phrasing.
- `closestDefect` picks the smallest `|gap| / |threshold|` — display
  ordering only; pass/fail is never recomputed (all numbers verbatim).
- `nextTierLabel` = `Performer` while `standard` — defects only exist when
  qualification fails, so the target rung is always the next one up.
- Appeal flow fully intact: entry row, defect metric picker (still lists
  every defect when >1), grounds, details input, submit/cancel,
  submitted/error states, `onSubmitAppeal` contract, haptics.
- Dead styles removed: `metricsLine`, `clearLine`, `rowList`, `defectRow`,
  `defectInfo`, `defectLabel`, `defectNumbers` → single `statusLine`.

## 4. Standards badges → flat earned marks

`SellerStandardsBadges` is buyer-facing (`SellerInfoCard`) and self-facing
(`MyListingsScreen`); badges are fail-closed backend decisions, so they were
kept — but the `brandSubtle`-fill + `brandBorder`-hairline pill chrome was
the AI tell. Chips are now flat icon+label runs in `colors.brand`,
container gap widened to `Space.sm` to compensate for the lost padding.
`size`, `align`, `limit` props and the fail-closed path are unchanged.

## Verification

- `cd frontend && npx tsc --noEmit` — **0 errors in all touched files.**
  The run surfaces ~60 pre-existing TS2339 errors confined to
  `src/components/filters/*` (untracked `FilterOptionRow.tsx` + mid-refactor
  `filterStyles.ts` from concurrent in-flight work — outside this scope).
- `npx vitest run src/__tests__/sellerAnalyticsAndHubUpgrade.test.ts` —
  **47/47 pass** (asserts `Custom`, `PRESET_OPTIONS`, `customRangeLabel`,
  `formatCustomRangeLabel`, `AnalyticsDateRangeSheet` — all retained).
- `npx vitest run src/__tests__/visualRegressionPlan.test.ts` —
  **117 pass / 2 skip.**

## Residuals / notes for the parent agent

- **`analyticsStyles.ts` was edited** though not in the explicit own-list —
  it is the dedicated style owner for `SellerAnalyticsScreen`; the new tab
  styles needed a home. Flagging for transparency.
- `responseRatePct` remains in the `SellerHubTrust` contract but is no
  longer rendered anywhere in the app — harmless (fail-closed field), but
  worth noting if a future pass wants to surface it elsewhere.
- `SellerHubScreen.tsx` trust-strip comment ("quiet row under the money
  panel") remains accurate; no integration change was required.
- Pre-existing breakage (not mine): `src/components/filters/*` references
  style keys absent from `filterStyles.ts` — concurrent refactor in flight.
