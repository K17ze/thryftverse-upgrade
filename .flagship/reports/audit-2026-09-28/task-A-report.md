# Task A — Co-own financial readability (audit findings 10–14)

**Status:** DONE
**Files owned/changed:**
- `frontend/src/components/coown/CoOwnOrderBook.tsx`
- `frontend/src/components/coown/asset-detail/AssetMarketSection.tsx`
- `frontend/src/components/coown/asset-detail/AssetDetailIdentity.tsx`
- `frontend/src/components/coown/asset-detail/AssetDetailModals.tsx`
- `frontend/src/__tests__/coownFinancialReadability.test.tsx` (new, 15 tests)

**Verification:**
- `npx vitest run src/__tests__/coownFinancialReadability.test.tsx` — 15/15 pass
- `npx vitest run src/__tests__/coownAssetDetailRuntime.test.tsx src/__tests__/coownDistributionDepth.test.tsx` — 50/50 pass
- `npx tsc --noEmit` — clean (exit 0, no output)

---

## Finding 10 (P1) — responsive financial layout in `CoOwnOrderBook.tsx`

- Kept `PRICE_COL_WIDTH = 90` / `SIZE_COL_WIDTH = 80` as the rail-mode widths and added
  `RAIL_LAYOUT_MIN_WIDTH = PRICE_COL_WIDTH + SIZE_COL_WIDTH + 70` (240pt) — the minimum the
  three-column layout needs at 1× text.
- The component now measures its real width via `onLayout` on the container (covers both
  standalone and embedded card insets) and reads `fontScale` from `useWindowDimensions()`.
  Effective width = `measuredWidth (or windowWidth fallback) / max(fontScale, 1)`; below the
  threshold `stackedLayout` activates. Hooks run before the RFQ/halted early returns, and
  `onLayout` is attached in all three container renders so the frozen halted book stacks too.
- `BookLevelRow` gained a `stacked` prop (memoized, same a11y label/hint/onSelectLevel):
  exact price on its own line (`bodyStrong`, tabular-nums), `{size} units · {cumulative}
  total` on the line below (`meta`, tabular-nums). Depth-bar grammar preserved behind the
  text; `minHeight: 44` kept → target size unchanged; row grows instead of clipping.
- Rail-mode cells dropped `numberOfLines={2}` entirely — row height (`minHeight`, not fixed)
  grows so a value that still overflows the rails wraps instead of truncating. No
  abbreviation anywhere; executable quotes remain exact.
- Column header is mode-aware: rails show `Price · 1ZE | Units | Total units`; stacked shows
  a two-line `Price · 1ZE` / `Units · Total units` header matching the stacked row order.
- `AssetMarketSection` top-of-book: removed `numberOfLines={1}` from the Bid/Spread/Ask
  labels, values and size texts, and from the market-state/freshness meta texts — quotes now
  wrap rather than silently clip.

## Finding 11 (P2) — quote repetition + imbalance gauge

- **Division of labor decided:** the embedded book's `SpreadRow` is the canonical
  bid/spread/ask surface. `AssetMarketSection` now computes `canonicalBandVisible` (ladder
  tab + live book + market open + not error + not stale — the exact conditions under which
  `<CoOwnOrderBook>` renders). When true, the section strip carries only what the band does
  not: a quiet single line `N units at best bid · M units at best ask`. When the band is
  absent (depth/tape views, error/stale/sync states), the full bid/spread/ask quote row is
  kept — it is the only quote surface then, including muted last-known semantics.
- **Imbalance strip:** end labels now read `Bid 62%` / `38% Ask` (side named in text, so a
  monochrome screenshot explains the gauge), plus a muted scope caption
  `Share of resting units across visible depth` — accurate because `bidShare` is computed
  over the *visible* (sliced) levels, not all supplied levels. a11y label retained.

## Finding 12 (P1) — uncapped dominant price

- `AssetDetailIdentity.tsx`: removed `adjustsFontSizeToFit`, `minimumFontScale={0.7}`,
  `numberOfLines={1}` and `maxFontSizeMultiplier={1.3}` from the price; removed the
  `maxFontSizeMultiplier={1.4}`/`numberOfLines={1}` caps on the basis text and the context
  line. The existing `flexWrap` row + `flexShrink: 1` price lets the basis/pill reflow below
  the price at 200% text; the price value itself never shrinks.
- `AssetDetailModals.tsx`: removed `maxFontSizeMultiplier={1.3}` from all three sheet titles
  (Risk disclosure, Asset dossier, Asset prospectus) and gave the title style
  `flex: 1, flexShrink: 1, paddingRight: Space.sm` so a scaled title wraps inside the header
  without pushing the 44pt close target off-screen.

## Finding 13 (P2) — three-state 24h move

- `moveDirection` is now `up | down | unchanged`, computed sign-aware: the *displayed*
  magnitude `Math.abs(movePct24h).toFixed(1)` is checked — `'0.0'` → unchanged. So exact
  zero and any value rounding to zero (e.g. −0.04) render neutral; a tiny negative can never
  print `-0.0%` styled or announced as down.
- Unchanged state: `remove` (dash) Ionicons glyph, `colors.textSecondary` text/icon,
  `colors.surfaceAlt` pill background — all three neutral. Copy `0.0%` (no sign).
- a11y labels: `24 hour change up X percent` / `down X percent` / `unchanged at 0.0 percent`.
  Matches the already-correct three-state logic in the market stats strip.

## Finding 14 (P2) — trading rules → honest static summary

- Chose the static-summary path deliberately: `AssetMarketSection` receives no sheet-opener
  prop and owns no modal, so there is no honest destination to wire without editing unowned
  files. The full fee schedule/terms already live in the Asset dossier + prospectus sheets.
- **Backend policy verified before changing the claim:** `marketApi.ts` and
  `utils/tradeFlow.ts` show the protection mechanism is a *per-order price cap* —
  `protected_market` orders carry `maxPriceGbp`/`minPriceGbp` and "will not fill beyond the
  cap" (tradeFlow.ts:16–57). No market-wide circuit-breaker / halt-trigger concept exists in
  the contract (`marketStatus` only knows `paused`). "Circuit breaker" therefore names a
  mechanism the backend does not implement — copy corrected to the contract-backed claim:
  `Protected orders never fill beyond their price cap`.
- Removed `numberOfLines={1}` on both rule values (they wrap now) and switched
  `ruleCompactRow` to `alignItems: 'flex-start'` so wrapped values stay tidy. The misleading
  comment was rewritten to state this is a static reference block, not a disclosure.

---

## Test coverage (`coownFinancialReadability.test.tsx`)

15 tests across five describes:
- **Responsive layout:** rails at 375pt/1×; stacked at 375pt/2× fontScale; stacked via a real
  `onLayout` width change (200pt); seven-digit units + 6-digit prices render exact in stacked
  mode; `onSelectLevel` still fires `('bid', 10)` from the stacked row.
- **Imbalance gauge:** `Bid 71%`/`29% Ask` visible labels, `visible depth` scope caption,
  a11y label intact.
- **Strip vs band:** ladder view → strip shows only `150 units at best bid · 40 units at
  best ask`, exactly one `Spread` label total (the band's), and no repeated `formatCoOwnIze`
  quote; tape view → full quote row restored with `numberOfLines` absent.
- **Identity:** price has no `adjustsFontSizeToFit`/`minimumFontScale`/
  `maxFontSizeMultiplier`/`numberOfLines`; zero → unchanged glyph/color/label; −0.04 →
  unchanged (never `-0.0%`, never down); +1.5 → up; −2.5 → down.
- **Rules/titles:** contract-backed protection copy + `1ZE · 1% fee` render with no line
  clamp; source check that `AssetDetailModals.tsx` contains no `maxFontSizeMultiplier`.

Mock preamble mirrors the existing suites; `useWindowDimensions` is driven by a hoisted
mutable `rnDims` so fontScale/width vary per test. The `../components/coown` barrel is
mocked with the **real** `CoOwnOrderBook` (loaded via its own module path, bypassing the
Skia-pulling barrel) so `AssetMarketSection` renders the actual ladder.

## Concerns / notes for the orchestrator

- The strip demotion means best-bid/ask *prices* no longer show at the top of the market
  section while the ladder is visible — they live in the band (canonical per the audit).
  Units-at-top still show. This is the deliberate F11 trade-off; flag if the product wants
  prices retained at top too.
- The rules copy now reads "Protected orders never fill beyond their price cap" — this
  *does* change the "circuit breaker" wording because the contract (protected_market
  maxPriceGbp/minPriceGbp cap, remainder cancelled) proves a per-order cap, not a halt
  mechanism. If a real circuit-breaker policy exists server-side beyond what the frontend
  contract shows, the copy may need revisiting.
- The `stackedLayout` threshold (240 effective pt) means ~1.6× text on a 375pt phone flips
  to stacked. Reasonable per the audit; tune if design prefers later flip.
- No git state was changed; only the four owned sources + the new test file were touched.

---

## Fix pass — adversarial review (4 issues)

### 1. IMPORTANT — non-finite `movePct24h` admitted by `!= null` guard
`AssetDetailIdentity.tsx`: `NaN` previously rendered `-NaN%` styled/announced as *down* and
`Infinity` as `+Infinity%` *up* — fabricated direction on corrupt input. Now guarded with
`Number.isFinite(movePct24h)`: non-finite values render **no pill** (minimal truthful option —
an absent indicator rather than a lie). Decision on rounding symmetry documented in code and
tests: a displayed magnitude of `0.0` is *unchanged* in **both** directions — `+0.04` shows
`0.0%` unchanged, identical to `-0.04` (a `+0.0%` pill would imply visible motion).
New tests: `NaN`, `Infinity`, `-Infinity` (no pill, no `NaN`/`Infinity` text, no trend icon),
`+0.04` (unchanged), `-0.04` (pre-existing).

### 2. MINOR — `{units}u` abbreviation beside executable quotes
`AssetMarketSection.tsx` top-of-book strip: `150u` / `40u` → `150 units` / `40 units`.
The "u" marker violated the no-ambiguous-abbreviation rule; accessibility labels already said
"units" and are unchanged.

### 3. MINOR — `onLayout` measures border-box; unmeasured frame flashed rails
`CoOwnOrderBook.tsx`: the measured container width includes the container's own padding
(`Space.md×2` standalone, `0` embedded) plus each row's `paddingHorizontal` (`Space.xs×2`),
so the rails had less room than `measuredWidth` implied and the 240pt breakpoint engaged late.
Now `availableWidth = measuredWidth − innerChrome` once measured. Before the first layout
event the fallback subtracts a conservative parent-inset estimate (`Space.xl×2`) on top of
`innerChrome`, so a borderline first frame errs toward stacked instead of rendering rails for
one frame and reflowing. Documented inline.

### 4. MINOR — sheet-title check was a source grep
`coownFinancialReadability.test.tsx`: the `readFileSync` + `not.toContain('maxFontSizeMultiplier')`
assertion passed even if a cap returned under another prop name. Replaced with a render-based
assertion: `AssetDetailModals` is rendered at fontScale 2 (BottomSheet passthrough + stubbed
sheet bodies matching the runtime suite's mock conventions) and each of the three sheet
titles — "Risk disclosure", "Asset dossier", "Asset prospectus" — is located by its
`riskDisclosureSheetTitle` style signature and asserted to carry no `maxFontSizeMultiplier`,
`numberOfLines`, `adjustsFontSizeToFit`, `minimumFontScale`, and `allowFontScaling !== false`.

### Verification

- `npx vitest run src/__tests__/coownFinancialReadability.test.tsx` — **19/19 pass**
- `npx vitest run src/__tests__/coownAssetDetailRuntime.test.tsx src/__tests__/coownDistributionDepth.test.tsx` — **50/50 pass**
- `npx tsc --noEmit` — **clean**
