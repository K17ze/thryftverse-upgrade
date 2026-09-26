# UI Report — Filter sheet chrome (wave 2)

## Scope

The filter sheet *container* — backdrop, grabber, detents, header, dock —
audited and lifted to the house sheet grammar (`components/BottomSheet.tsx`,
the engine behind FeedExplanationSheet / AnalyticsDateRangeSheet). Interior
controls were wave 1 and needed no changes.

## Critical defect found & fixed — dock was rendered offscreen

The sheet is a **full-height slab** (`height: window.height`, `bottom: 0`)
translated down ~0.5H at the resting detent — its bottom edge sits ~50% of
the screen *below* the fold. `styles.footer` was `position: absolute;
bottom: 0` **inside** that slab, so the Reset/Apply dock anchored to the
slab's bottom edge — parked under the visible area at both detents. The
"sticky footer" wave 1 described was effectively unreachable.

**Fix** (`FilterScreen.tsx`, `useFilterSheet.ts`): the dock moved out of the
transformed sheet into a `footerDock` wrapper pinned to the screen's bottom
edge, driven by a new `dockStyle` shared-value binding:

```ts
translateY_dock = max(0, translateY_sheet − snapHalf)
```

Pinned at both detents, rides down 1:1 on dismiss drags, and slides in with
the sheet's top edge on entry — one shared value, zero divergence.

## Chrome audit → changes

### Drag handle
Was 36×4 with `Radius.sm` (squared ends) on `borderSubtle` (≈invisible in
light mode). Now **36×5pt, `Radius.full`**, fill per house grammar
(`isDark ? colors.border : rgba(0,0,0,0.2)`), centred, hidden from screen
readers (`no-hide-descendants`), padding aligned to the house 10/8 rhythm.

### Backdrop
`overlayStyle` capped opacity at **0.6** and started fading from `snapFull`,
so at the resting detent the dim was ~0.33 × token ≈ 0.15–0.22 black — a
washed-out scrim. Now `interpolate(t, [snapHalf, height] → [1, 0], CLAMP)`:
full `colors.overlay` (0.44 light / 0.66 dark) at rest and expanded, fading
only as the sheet travels toward closed. Tap-to-dismiss unchanged.

### Detents & gesture math (`useFilterSheet.ts`)
- **Settles**: `withTiming(180)` default-easing → `withSpring(target,
  Motion.spring.sheet)` (damping 22 — over-damped, zero overshoot, no
  rubber-band). Upward clamp at `snapFull` retained.
- **onEnd** was janky: dismiss required translation>100 **AND** velocity>500
  (fast flicks <100pt bounced back), and a drag-down from the full detent
  always re-snapped to full. Now a velocity-aware cascade: flick up →
  expand; flick down → next detent down (full → half → dismiss); slow
  release → nearest detent, with dismiss past the midpoint between
  `snapHalf` and closed.
- **Nested-scroll arbitration** added — the house pattern the sheet lacked:
  `pan.requireExternalGestureToFail(Gesture.Native())` around the ScrollView
  + `activeOffsetY([-10,10])` / `failOffsetX([-15,15])`, so vertical scrolls
  own the gesture until the top edge, and horizontal responders (preset
  rail, brand search) are never pre-empted.
- **Entry**: 200ms default-ease → 280ms `Motion.easing.entrance` (ease-out);
  **exit**: 180ms → 280ms `Motion.easing.exit`; both collapse to 0ms under
  `reducedMotion` (REDUCED_SPRING for springs). Close callback now guarded
  by `finished` — a mid-dismiss re-grab no longer pops the route.

### Sheet material
`surface` (#F5F5F5 light — grey sheet) → **`surfaceElevated`** (house sheet
material); `Radius.xxl` (24) → **`Radius.xl`** (16, matching every
`system`-variant sheet); `Elevation.modal` with a *downward*-cast shadow
(mostly clipped) → `Elevation.floating` **negated upward** + hairline top
edge in `borderSubtle` — the exact `BottomSheet` chrome block. `width: w`
→ `left:0/right:0`.

### Header
Was three stacked chrome rows (title+Clear / status+pill / context pill) —
including a `Clear` button duplicating the dock's `Reset`. House idiom is
left-aligned title + actions in the dock, so:

- Sticky chrome is now **grabber + one row**: left-aligned
  `TypographyV2.sectionTitle` "Filter & Sort" (was the 20pt price role) +
  active-count badge + **transparent 44pt close** (`close` glyph, 22pt,
  textSecondary, hit-slop) — the "title + close" pattern.
- The status meta (`N matches` / honest search-context caption +
  `SyncStatusPill`), context identity row, presets block and sync banner
  moved **inside the ScrollView** — controls scroll under a sticky
  header/footer, per spec.

### Dock / scroll clearance
`scrollContent.paddingBottom` was 56 — under a ~100pt floating dock the last
section was obscured. Now `DockConstants.singleActionHeight` (104). Dock bg
`colors.background` → `surfaceElevated` (one material, separation = hairline
only). Footer padding now safe-area aware (`max(insets.bottom, Space.md)`)
instead of a platform hardcode.

### Gutter unification
Content gutter was split three ways — header 24, sections/options 32,
footer 20. Unified to `Space.md` (16) — the house sheet gutter
(`BottomSheet` contentWrap) — across header, status/context rows, presets,
sync banner, all section headers/option lists/inputs, dividers, dock.

## Consistency check — sibling sheets

- **FeedExplanationSheet** — on `BottomSheet` (grabber/backdrop/motion all
  house grammar); left-aligned `sectionTitle`, hairline reason rows. One
  noted divergence kept as-is (not in scope): the confidence block is a
  1pt-stroke box on an otherwise flat surface.
- **AnalyticsDateRangeSheet** — on `BottomSheet`, `variant="system"`.
  Divergence aligned: `Cancel` was a bordered/filled button → now a
  chromeless text action, matching the Reset-left/Apply-right grammar
  (one contained primary per dock). `createStyles` no longer takes the
  now-unused `colors`.
- **ExploreStack.tsx** — verified unchanged and correct:
  `transparentModal` + `headerShown: false` + `gestureEnabled: false`
  (single presentation layer; no competing native gestures).

## Untouched (per ownership)

`UnifiedDiscoveryScreen` trigger row, masonry/cards, filter state
(`useFilterScreenState`), result-count hook, preset logic, all interior
option controls from wave 1.

## Files changed

- `frontend/src/hooks/filters/useFilterSheet.ts` — rewritten motion/gesture
  core; new `scrollGesture` + `dockStyle` returns.
- `frontend/src/screens/FilterScreen.tsx` — sheet material, scroll-wrapped
  meta/presets/banner, docked footer, `accessibilityViewIsModal`.
- `frontend/src/components/filters/FilterSheetHeader.tsx` — slim header
  (grabber + title + badge + close X); `onClose` replaces `onClear` and the
  status/context props (now rendered by the screen inside the scroll).
- `frontend/src/components/filters/FilterFooter.tsx` — positioning handed to
  the dock wrapper; safe-area bottom padding.
- `frontend/src/components/filters/filterStyles.ts` — handle geometry,
  `closeBtn`, unified 16pt gutter, dock/footer split, scroll clearance;
  removed `clearBtn`/`clearText` (dead) and the `Platform` import.
- `frontend/src/components/seller/analytics/AnalyticsDateRangeSheet.tsx` —
  chromeless Cancel; dropped unused `colors`/`Stroke`.

## Verification

- `cd frontend && npx tsc --noEmit` — clean.
- `npx vitest run src/__tests__/browseFilterContexts.test.ts src/__tests__/e2eSmokePlan.test.ts` — 77/77 pass.
- `npx eslint` on touched files — 0 errors; warnings are the repo's standing
  i18n literal-string / a11y-hint profile (pre-existing pattern).

## Notes

- The dock intentionally does not participate in the sheet pan (it sits
  outside the `GestureDetector`); its surface is the two action buttons, so
  there is no dead drag area. Handle/header drags pan normally.
- iOS swipe-back stays disabled on the route (`gestureEnabled: false`); the
  close X, backdrop tap, pull-down and Android hardware back all dismiss.
