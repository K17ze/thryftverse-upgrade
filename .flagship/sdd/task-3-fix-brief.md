# Task 3 Fix Brief — address all review findings in one pass

Repo root: `C:\Users\User\Desktop\thryftverse-upgrade`. Fix these findings in the working tree (uncommitted changes from the prior implementer are present — build on them). Do NOT commit.

## Finding 1 (Important) — Thumbnail border/card background still visible
`frontend/src/components/SortablePhotoStrip.tsx` `itemWrap` style (~lines 224-231) still has `backgroundColor: colors.surfaceAlt`, `borderWidth: Stroke.standard`, `borderColor: colors.border`, `borderRadius: Radius.lg`. The listing media spec requires borderless, media-first thumbnails.
FIX: remove `backgroundColor`, `borderWidth`, `borderColor` from `itemWrap`; set `borderRadius: Radius.md` to match the child. Check SortablePhotoStrip's OTHER consumers first (grep `<SortablePhotoStrip`) — if another surface depends on the carded look, add an optional `variant?: 'plain' | 'card'` prop defaulting to `'card'` and pass `variant="plain"` from ListingMediaStudio. Choose the smallest change that doesn't regress other consumers; state what you chose.

## Finding 2 (Important) — Edit gate uses display URI
In `frontend/src/components/listing/ListingMediaStudio.tsx`:
- `canEditItem` must test `item.uri` (the local source), NOT `getDisplayUri(item)`. After upload, `publicUrl` is remote https and blocks editing; `item.uri` stays the local file.
- `handleEditItem` must resolve the crop source from `item.uri` via `resolveCropSourceUri(item.uri)`.
Remote-only items correctly fail the manipulability check because their `item.uri` is https.

## Finding 3 (Important) — Footer failure copy hidden
`ListingPublishFooter.tsx` line ~90 and `EditListingFooter.tsx` line ~107 render `errorMsg` instead of the simplified stage text on `failed_recoverable`. Fix: on `failed_recoverable`, show the simplified stage copy ("Couldn't publish — Retry" / "Couldn't save — Retry") as the feedback text; keep the detailed `errorMsg` available for screen-reader announcement (e.g. keep it as the accessibilityLabel of the feedback row) but do not render it as the primary text. Hosts keep passing errorMsg — the component decides presentation.

## Finding 4 (Important) — Progress ring accessibility
`frontend/src/components/listing/UploadProgressRing.tsx`: the ring/spinner have no accessibility semantics. Add to the ring container View: `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}`, and an `accessibilityLabel` reflecting status (preparing → "Preparing", uploading → "Uploading", failed/cancelled → the retryLabel). For the retry Pressable state, ensure the Pressable itself carries the label (it already does — verify) and the ring states announce via a `View` wrapper with `accessible` + `accessibilityLabel` when not retrying. Use plain English strings consistent with the file's existing hardcoded-English pattern (the component currently takes `retryLabel` as a prop — add an optional `statusLabel?: string` prop for the uploading/preparing announcement, default 'Uploading').

## Finding 5 (Important) — Remove-icon contrast on bright media
`frontend/src/components/common/AppIcon.tsx` applies `style` to the wrapper View, so `textShadow*` never reaches the glyph. Two options (pick ONE, note it):
(a) Add an optional `glyphStyle?: StyleProp<TextStyle>` prop to AppIcon that is applied to the inner Ionicons Text element, and pass the textShadow via it from ListingMediaStudio; OR
(b) In ListingMediaStudio, place the remove icon on the same dark scrim circle the edit button uses (a small `rgba(0,0,0,0.35)` circle behind the glyph).
Pick option (a) if it's a small change (preferred — fixes all consumers honestly); otherwise (b). Do not break existing AppIcon consumers: `glyphStyle` must be optional.

## Finding 10 (Minor) — haptic semantics
`frontend/src/components/listing/ListingMediaStudio.tsx` line ~210: `haptic.warning()` on failed uploads → change to `haptic.error()` if useHaptic exposes it (check frontend/src/hooks/useHaptic.ts first; if it has `.error()` use it, else keep `.warning()` and note it).

## Minors — park these (do NOT fix in this dispatch; record in your report as deferred):
- getPublishLabel dead branch
- EditListingFooter saveState unused affordance
- Empty state "Take photo" second button
- Crop target race guard + temp-file cleanup on close

## Verification (from repo root)
```
cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd frontend; node ./node_modules/eslint/bin/eslint.js src/components/listing/ListingMediaStudio.tsx src/components/listing/UploadProgressRing.tsx src/components/SortablePhotoStrip.tsx src/components/common/AppIcon.tsx
cd frontend; node ./node_modules/vitest/vitest.mjs run 2>&1 | Select-String "Test Files|Tests "
```
Baseline: 6 failures in groupChatInfoParity.test.tsx only. Zero NEW failures. If SortablePhotoStrip has a test asserting the border, update it.

## Constraints
- You MAY touch: SortablePhotoStrip.tsx, ListingMediaStudio.tsx, ListingPublishFooter.tsx, EditListingFooter.tsx, UploadProgressRing.tsx, AppIcon.tsx (additive prop only).
- Do NOT touch: CreatorCropSheet.tsx, BottomSheet*, ThemeContext.tsx, en.json, SellScreen.tsx, EditListingScreen.tsx, AIPhotoEnhancementScreen.tsx, profile components.
- No new deps. No `any`. Match existing style (compact, minimal comments).

Write the full report to .flagship/sdd/task-3-fix-report.md and return: status, files changed, one-line test summary, concerns.
