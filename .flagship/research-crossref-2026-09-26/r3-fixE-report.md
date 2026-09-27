# R3 Fix E — a11y/state repair workstream report

**Status: DONE — all 3 fixes landed; tsc + eslint clean.**

## Files changed

### 1. `web/src/components/settings/SettingsSearch.tsx`
- Added a persistent `role="status" aria-live="polite" className="sr-only"` live region
  (sibling of the results block, always mounted so the announcement fires reliably)
  announcing the result state: `N settings match` (singular `1 setting matches`),
  or `No settings match "<query>"` for the empty case — mirroring the visible copy.
- `Enter` in the search input now `preventDefault`s and calls `onActivate(results[0])`
  (top-result activation, the standard search grammar), alongside the existing Escape-to-clear.
- Result rows were already real `<button type="button">`s via `SettingsRow` — no change needed there.

### 2. `web/src/components/seller/ListingManagementTable.tsx`
- `RowCheckbox` (~line 94): kept the 36px visual column (`w-9`) and `h-11` height, added
  `relative` + `after:absolute after:-inset-x-1 after:content-['']` — the codebase's
  established pad-out idiom — so the hit area is 44×44px with zero visual/spacing delta.
- Bulk-bar Pause/Resume button (~line 472) and Delete button (~line 500): kept `h-8`
  visible pill, added `relative` + `after:-inset-y-1.5` (32+12 = 44px hit height),
  matching FilterSheet's `h-8 … after:-inset-y-1.5` pattern. Horizontal width already
  exceeds 44px via `px-2.5` + label text.

### 3. `web/src/lib/feedPrefs.ts`
- Added `version: 1` + `migrate` to the `persist` options (the storage name already
  claimed `.v1`). Migrate follows the `inboxPrefs.ts` precedent: passes
  `hiddenListingIds` / `downweightedKeys` through only when they're arrays, defaults
  to `[]` otherwise, and casts to `FeedPrefsState` so actions merge from initial state.

`ListingManagementToolbar.tsx` and `listingManagementModel.ts` were read for context
(sort buttons are `px-2 py-1` text-meta — not in the flagged scope; no changes made).

## Verification
- `npx tsc --noEmit` in `web/` — clean (exit 0).
- `npx eslint` on all five owned files — clean (exit 0).

## Concerns / notes for parent
- The `::after` hit-area bleed on bulk buttons extends ±6px vertically into the
  surrounding `pb-2` header row — overlapping taps with adjacent rows can't occur
  since the bar sits on a hairline row of its own. The checkbox bleed extends ±4px
  horizontally; with `gap-3.5` row spacing there is no overlap with the thumbnail.
- `announcement` uses curly quotes to match the visible `&ldquo;`/`&rdquo;` copy.
- Sheet.tsx, FeedItemMenu.tsx, inbox/*, notifications/* untouched per scope.
