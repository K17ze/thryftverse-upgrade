# Task 3 Fix Report

Status: COMPLETE — all 6 findings fixed, verified in main workspace.

## Findings fixed

### Finding 1 — Thumbnail border/card background removed
`SortablePhotoStrip.tsx` `itemWrap`: removed `backgroundColor`, `borderWidth`, `borderColor`; changed `borderRadius` from `Radius.lg` to `Radius.md` to match the child image. Only one consumer (`ListingMediaStudio`) so no variant prop needed — direct change. `image` radius also changed to `Radius.md` for consistency.

### Finding 2 — Edit gate uses local `item.uri`
`ListingMediaStudio.tsx`:
- `canEditItem` now tests `item.uri` (the local source) instead of `getDisplayUri(item)`. Remote-only items correctly fail because their `item.uri` is `https://`.
- `handleEditItem` resolves the crop source from `item.uri` via `resolveCropSourceUri(item.uri)`.

### Finding 3 — Footer failure copy simplified
`ListingPublishFooter.tsx` and `EditListingFooter.tsx`: on `failed_recoverable`, the feedback Text now renders the simplified stage copy ("Couldn't publish — Retry" / "Couldn't save — Retry") as the primary text. The detailed `errorMsg` is kept as `accessibilityLabel` for screen-reader announcement only.

### Finding 4 — Progress ring accessibility
`UploadProgressRing.tsx`: added optional `statusLabel?: string` prop (default 'Uploading'). The non-retrying ring/spinner View now carries:
- `accessible`
- `accessibilityRole="progressbar"`
- `accessibilityLabel` (preparing → "Preparing", uploading → `statusLabel`)
- `accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}`

The retry Pressable already had `accessibilityRole="button"` + `accessibilityLabel` — verified.

### Finding 5 — Remove-icon contrast via `glyphStyle`
`AppIcon.tsx`: added optional `glyphStyle?: StyleProp<TextStyle>` prop applied to the inner `Ionicons` element. This lets text-shadow reach the glyph directly (the existing `style` prop targets the wrapper View). `ListingMediaStudio.tsx` remove icons now pass `glyphStyle={styles.mediaGlyph}` instead of `style={styles.mediaGlyph}`. Option (a) chosen — fixes all consumers honestly; `glyphStyle` is optional and defaults to undefined.

### Finding 10 — Haptic semantics
`ListingMediaStudio.tsx`: changed `haptic.warning()` to `haptic.error()` on failed uploads. `useHaptic` exposes `.error()` (verified in `useHaptic.ts`).

## Deferred (per brief — not fixed)
- `getPublishLabel` dead branch
- `EditListingFooter` `saveState` unused affordance
- Empty state "Take photo" second button
- Crop target race guard + temp-file cleanup on close

## Verification (main workspace)

```
tsc --noEmit -p tsconfig.json → 0 errors
eslint (6 touched files) → 0 errors, 76 warnings (pre-existing: i18next/no-literal-string, a11y-hint)
vitest run → 84 passed, 1 failed (groupChatInfoParity — baseline), 1746 passed, 6 failed (baseline), 2 skipped
```

Zero new test failures. Baseline unchanged.

## Files changed
- `frontend/src/components/SortablePhotoStrip.tsx`
- `frontend/src/components/listing/ListingMediaStudio.tsx`
- `frontend/src/components/listing/UploadProgressRing.tsx`
- `frontend/src/components/common/AppIcon.tsx`
- `frontend/src/components/listing/ListingPublishFooter.tsx`
- `frontend/src/components/listing/EditListingFooter.tsx`

## Concerns
None. All changes are additive or surgical. `glyphStyle` is optional and backward-compatible. `SortablePhotoStrip` has only one consumer so the direct chrome removal is safe.
