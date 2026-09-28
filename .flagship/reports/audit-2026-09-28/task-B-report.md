# Task B report — Seller auction inventory row (audit finding 09, P2)

Status: DONE
Date: 2026-09-28

## Spec finding

`SellerAuctionRow.tsx` combined title, state, optional brand, an internal divider,
primary value, local value, action text, leading status and bid count next to a
96pt image — a small dashboard that makes inventory scanning hard. Monetary lines
were clamped to one line (`numberOfLines={1}`).

## Changes

### `frontend/src/components/auction/SellerAuctionRow.tsx` (rewritten JSX + styles)

Three-zone composition replaces the dashboard:

1. **Identity** — title (`bodyStrong`, keeps the existing 2-line cap; title
   truncation is acceptable because it is not a financial value and the full
   title lives in the management destination) beside the state label
   (`resolveStatePresentation` output, `flexShrink` + `maxWidth 45%` + wrap so
   it never clips at large text).
2. **Commercial** — exactly one value: `valuePrefix` ("Starts "/"Current "/
   "Final " quiet label) + `formatAuctionIze` 1ZE amount in `priceList`,
   `flex: 1`, **no `numberOfLines`** — the exact figure wraps instead of
   ellipsizing. Beside it, the single next task (`presentation.actionLabel`
   + 16pt metadata chevron, bounded to `maxWidth 45%`, `textAlign: right`,
   wraps — "Review result" stays understandable at 200% text).
3. **Metadata** — one quiet wrapping line (`TypographyV2.meta`, `textMuted`,
   tabular-nums): `leadingLabel` first in `presentation.leadingColor` (the
   state-derived "most important fact" and the only colour signal), then
   ` · ` separators joining local-currency text (`priceText`, e.g. "£57.00"),
   brand, and the bid count ("12 bids") for non-sold states. Sold state keeps
   the count inside `leadingLabel` ("Sold · 7 bids") — same rule as before.
   No clamp.

- **Internal hairline removed** — the `gap` rhythm between the three zones
  carries the separation; the hairline was competition, not structure.
- **Media slot 96 → 80pt** (`ThumbSize.lg`, the canonical "large list row
  thumbnail" token — inside the audit's 72–80pt band). Live dot preserved.
- **Removed**: `rowHairline`, `rowLocal`, `rowLeadingRow`, `rowLeading`,
  `rowBidCount`, `rowValueCol`, `rowActionCol`, brand-as-own-line. Local
  currency, brand, leading status and bid count all live in the metadata line.
- **Preserved**: `buildAuctionAccessibilityLabel` contract, `onPress`,
  `CachedImage` usage, `AnimatedPressable` press/haptic/reduced-motion
  behaviour, `resolveStatePresentation` for all states
  (live/ending/scheduled/sold/unsold/pending/cancelled/ended).
- Density estimate: body ≈ 71–92pt at default text + 16pt row padding →
  ~90–110pt/row → roughly 5–6 useful rows per list viewport (target was ~4).

### `frontend/src/components/auction/sellerAuctionCentreViewModels.ts`

Not edited — `StatePresentation` already supplied everything needed
(`stateLabel/stateColor/leadingLabel/leadingColor/actionLabel/showLiveDot`).

### `frontend/src/__tests__/sellerAuctionRowDensity.test.tsx` (NEW)

vitest + react-test-renderer, matching `auctionDetailInfoRuntime.test.tsx`
style (boundary mocks for `ThemeContext`, `CachedImage`, `AnimatedPressable`;
real `resolveAuctionTiming`/`currency`/`auctionHomeLogic` logic). 6 tests:

- live row renders title + state + exactly one "Current X.XX 1ZE" value +
  "View bids" + folded metadata ("2h 14m left · £57.00 · Nike · 12 bids") +
  unchanged `buildAuctionAccessibilityLabel` + onPress
- long title + £1,234,567.89 price: exact `1ZE` string emitted in full, value
  node has no `numberOfLines`, fiat conversion unclamped, title capped at 2
- sold state: "Sold" + "View sale" + "Sold · 7 bids" + exact "Final … 1ZE"
- bid count exposed ("1 bid" singular case)
- scheduled state: "Scheduled" + "View schedule" + "Starts …" + countdown,
  no bid fragment for zero-bid inventory
- media slot inside the 72–80pt band

## Verification

- `npx vitest run src/__tests__/sellerAuctionRowDensity.test.tsx` — 6/6 pass.
- Grep `SellerAuctionRow` under `src/__tests__/` — no pre-existing suite
  references the row; nothing else to run.
- `npx tsc --noEmit` — zero errors in my files. Remaining repo errors are in
  other in-flight tasks' files (`CoOwnOrderBook.tsx` — Task A,
  `AIAgentIntegrationScreen.tsx` — Task D, `discoveryMediaStates.test.tsx` —
  Task E) and predate/parallel this work; left untouched per ownership rules.

## Concerns

- At 200% text the state label and action label are each bounded to ~45% of the
  body column; they wrap rather than clip but can stack 2–3 lines. Deliberate
  trade — guarantees the title and the exact value always keep ≥55%.
- Native screenshot pass still owed per audit acceptance (no device connected).
- Other tasks' tsc errors (listed above) must resolve before repo-wide
  `tsc --noEmit` goes green.

---

## Adversarial-review fixes (round 2)

### 1. IMPORTANT — divergent amount selection (fixed, single-sourced)

The row selected its headline amount with `currentBidGbp > 0` while
`resolvePriceText`/`buildAuctionAccessibilityLabel` select on `bidCount > 0`.
Divergent edges: `bidCount>0 && currentBidGbp<=0` printed the starting ask while
the screen reader announced "Current bid £0.00"; `bidCount===0 &&
currentBidGbp>0` printed the orphan bid labelled "Starts".

Fix: new exported `resolvePriceAmount(item)` in
`frontend/src/utils/auctionHomeLogic.ts` (returns `bidCount > 0 ?
currentBidGbp : startingBidGbp`). `resolvePriceText` now delegates to it, and
`SellerAuctionRow` calls the same resolver — headline, fiat metadata and
accessibility label are provably identical inputs. The `amount > 0` guard on
the 1ZE line was replaced with `Number.isFinite(amount)`: a zeroed current bid
now prints "0.00 1ZE" / "£0.00" / "Current bid £0.00" — all three agree —
instead of a "No value" headline contradicting the announced price.

### 2. MINOR — production `any` on money props (fixed)

`SellerAuctionRow` props: `formatFromFiat` is now
`ReturnType<typeof useFormattedPrice>['formatFromFiat']` — the exact hook
signature (`(fiatAmount, sourceCurrency?: SupportedCurrencyCode,
options?: FormatOptions) => string`, single-sourced so it cannot drift) — and
`fxRates` is `FxRates` from `utils/currency` (matches `useCurrencyContext`'s
return). Both are type-only additions; the sole caller
(`SellerAuctionCentreScreen`) passes unchanged.

### 3. MINOR — phantom "Read more" before measurement (fixed)

`frontend/src/components/auctiondetail/AuctionDescription.tsx`:
`overflows = lineCount == null || lineCount > 3` mounted a 44pt control on
first render and removed it when `onTextLayout` landed. Now
`lineCount != null && lineCount > 3` — the control exists only after a real
measurement proves overflow. The existing tests in
`commerceDetailRuntime.test.tsx` simulate `onTextLayout` before asserting, so
they remain valid and pass.

### Tests added for the divergent-amount edges

`sellerAuctionRowDensity.test.tsx` (+2, now 8): bidCount>0 with zeroed
currentBid prints "Current 0.00 1ZE" and announces "Current bid £0.00";
bidCount===0 with stray currentBidGbp prints "Starts …" on the starting ask
and announces "Starting bid £40.00" — the orphan figure never renders.

### Verification (round 2)

- `npx vitest run sellerAuctionRowDensity.test.tsx
  auctionDetailInfoRuntime.test.tsx commerceDetailRuntime.test.tsx` —
  33/33 pass (8 + 2 + 23).
- `npx tsc --noEmit` — zero errors in any file this task touched
  (`SellerAuctionRow.tsx`, `auctionHomeLogic.ts`, `AuctionDescription.tsx`,
  `sellerAuctionRowDensity.test.tsx`). Other tasks' in-flight errors
  unchanged and untouched.
