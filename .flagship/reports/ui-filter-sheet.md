# UI Report — Filter & Sort bottom-sheet upgrade

## Scope

Explore/Discovery filter & sort UX: presentation (separate page → true bottom
sheet) and the control grammar inside the sheet (pill/chip controls →
hairline radio/checkbox rows and quiet grid cells).

## Root cause of the "separate page" feel

`FilterScreen` (`frontend/src/screens/FilterScreen.tsx`) already renders its
own sheet chrome — dim overlay, bottom-anchored sheet, drag handle, snap
points and pan-to-dismiss via `useFilterSheet` — and the **root stack**
registers it correctly as `presentation: 'transparentModal'`
(`AppNavigator.tsx:257`, `customSheetScreenOptions`).

The **Explore tab stack** registered the same screen as
`formSheet` (iOS) / `modal` (Android) (`ExploreStack.tsx`, old
`filterScreenOptions`). That produced a native sheet/page hosting the
screen's own sheet: double chrome, two competing drag gestures on iOS, and
an opaque separate page on Android. This is the exact failure mode the root
stack's `customSheetScreenOptions` comment warns about.

### Fix

- `frontend/src/navigation/tabStacks/ExploreStack.tsx` — `filterScreenOptions`
  now `{ presentation: 'transparentModal', headerShown: false, gestureEnabled: false }`,
  identical in effect to the root stack's registration. The screen's own
  sheet is the single presentation layer; iOS swipe-back no longer fights
  the sheet pan.

### Routes / linking preserved

- The `Filter` route remains registered in **both** stacks with identical
  params (`{ categoryId?, title?, subcategoryId? }`) — used by
  `UnifiedDiscoveryScreen.tsx:603`, `SearchScreen.tsx:318`,
  `CategoryDetailScreen.tsx:339/368`, and `BrowseFilterBar.tsx` (×4).
- `navigation/linking.ts` has no `Filter` deep link, so nothing externally
  linkable was removed or changed. No navigation-type changes were needed.

## Control upgrades (inside the sheet)

New shared primitive `frontend/src/components/filters/FilterOptionRow.tsx` —
one option grammar for the whole sheet, matching the house idiom already
established in `components/auction/FilterSheet.tsx`:

- **radio** rows: hairline-separated, label left, 18pt brand check on the
  selected row, semibold selected text; fixed check slot so labels never
  reflow on toggle.
- **checkbox** rows/cells: 22pt hairline checkbox square with brand check —
  the multi-select counterpart.
- 44pt min-height targets; `accessibilityRole` `'radio'`/`'checkbox'` with
  `selected`/`checked` states; labels/hints preserved or improved.

Per-section changes:

- `FilterSortSection.tsx` — horizontal `AppSegmentControl` pill scroll →
  vertical radio list. Collapsed header now echoes the active sort
  (`summary` prop on `FilterSection`).
- `FilterConditionSection.tsx` — same pill scroll → radio list (taxonomy
  conditions + "Any"); collapsed header echoes the chosen condition.
- `FilterBrandSection.tsx` — chip cloud → checkbox list; in-facet search,
  selected-first ordering, 8-row window and "See all N brands" retained
  (the link moved below the list, 44pt row).
- `FilterSizeSection.tsx` — chip cloud + separate "My sizes" rail → one
  two-column grid of quiet cells. Saved sizes merge into the grid (star
  marker, still selectable when absent from the snapshot); long-press
  save/remove and "Save as my sizes" (now a quiet text action, with an
  honest muted "Saved to your sizes" state) preserved.
- `FilterAdvancedSection.tsx` — preset chips → two-column quiet cells
  (radio semantics; selecting a preset writes min/max).
- `FilterPriceRange.tsx` — unchanged: already paired min/max hairline
  inputs (no custom slider exists in this surface or in deps).
- `FilterFooter.tsx` — Reset is now a chromeless text action; Apply stays
  the single contained primary button, sticky at the sheet bottom.
- `FilterLoadingState.tsx` — pill skeletons → row skeletons matching the
  settled layout.
- `filterStyles.ts` — added the option-list/row/cell grammar; removed the
  now-dead chip family (`chip*`, `sizeChip`, `mySize*`, `saveSizes*`,
  `hScroll`, `wrapContainer`, `loadingChip*`) and the previously dead
  `sustainable*` block.

Preserved untouched: filter state source-of-truth (`useFilterScreenState`
draft → `updateBrowseFilters` on Apply, `handleClear` reset, preset
application), result count hook, sync/preset chrome, header, and the
applied-filter indicators on trigger buttons (`activeSearchFilterCount` in
UnifiedDiscoveryScreen, `hasActiveFilters` in BrowseFilterBar). Masonry
grid/cards not touched.

## Verification

- `cd frontend && npx tsc --noEmit` — clean.
- `npx vitest run src/__tests__/browseFilterContexts.test.ts src/__tests__/e2eSmokePlan.test.ts` — 77/77 pass.
- `npx eslint src/components/filters/ src/navigation/tabStacks/ExploreStack.tsx` — 0 errors; warnings are the repo's standing i18n literal-string / a11y-hint profile (pre-existing pattern).

## Files changed

- `frontend/src/navigation/tabStacks/ExploreStack.tsx`
- `frontend/src/components/filters/FilterOptionRow.tsx` (new)
- `frontend/src/components/filters/FilterSection.tsx`
- `frontend/src/components/filters/FilterSortSection.tsx`
- `frontend/src/components/filters/FilterConditionSection.tsx`
- `frontend/src/components/filters/FilterBrandSection.tsx`
- `frontend/src/components/filters/FilterSizeSection.tsx`
- `frontend/src/components/filters/FilterAdvancedSection.tsx`
- `frontend/src/components/filters/FilterFooter.tsx`
- `frontend/src/components/filters/FilterLoadingState.tsx`
- `frontend/src/components/filters/filterStyles.ts`

`FilterScreen.tsx` needed no structural change — it was already a sheet;
the defect was the hosting presentation in the Explore stack.

## Notes / follow-ups

- No `@gorhom/bottom-sheet` or slider dependency exists; the codebase's own
  reanimated/gesture sheet (`useFilterSheet`) and `BottomSheet.tsx`
  primitive are the house infra — the route-based sheet already used it.
- `ExploreCollectionScreen.tsx` has no filter/sort entry point — nothing to
  change there; `UnifiedDiscoveryScreen.tsx`'s `onOpenFilters` already
  targets the (correct) root-stack `Filter` route.
