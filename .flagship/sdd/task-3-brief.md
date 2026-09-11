# Task 3 Brief — ListingMediaStudio re-authoring: per-thumbnail progress, chrome removal, edit-any-photo

## Context

You are upgrading the listing media staging rail of a React Native (Expo) marketplace app. Repo root: `C:\Users\User\Desktop\thryftverse-upgrade`. The product owner called the current surface "so many shitty not really needed elements… pure bot made". Audit evidence (all in `frontend/src/components/listing/ListingMediaStudio.tsx`, 847 lines):

- Cover overlays: `Preparing…` / `Uploading · 87%` text, green `checkmark-circle` badge, `Retry` / `Cancelled` labels stacked over the media (lines ~118–218, 448–472, 526–532).
- Thumbnails are bordered cards (`borderWidth: Stroke.standard`, `surfaceAlt` bg) with badge stacks.
- Only the COVER is editable (`canEditCover` gate, lines ~349–357); other photos are read-only.
- Empty state coaches: "Add your first photo" + "Up to X photos" (lines ~384–408).
- Action row: `Add more · 3/10` counter.
- Real byte progress EXISTS in the data (`UploadQueueItem.byteProgress`) but is rendered as text.

The flagship pattern (2026 research: Depop/Vinted/Instagram): per-thumbnail **circular progress ring** attached to the asset, fade to a checkmark on completion, retry affordance on failure, NO text percentages, NO badges, media-first thumbnails without borders. Background continuation is already real (queue is durable) — the UI must stop shouting about it.

## Requirements

### 1. UploadProgressOverlay → UploadProgressRing
Replace the text overlay with a circular determinate ring centered on the media:
- Ring: 28–32pt diameter, 2.5–3pt stroke, track `rgba(0,0,0,0.25)`, progress arc white (`colors.textInverse`), over a subtle `rgba(0,0,0,0.35)` scrim circle behind it for contrast on any photo.
- Implement with react-native-reanimated + react-native-svg — VERIFIED: `react-native-svg@15.15.4` IS in `frontend/package.json` (line 154). Use `Svg`/`Circle` with `strokeDasharray`/`strokeDashoffset` driven by a Reanimated shared value + `useAnimatedProps`.
- While `preparing` (no bytes yet): indeterminate — a small spinner (existing ActivityIndicator pattern is fine) or pulsing ring.
- On complete: ring fades out (200ms), NO check badge (the photo being visible IS the completion state).
- On failed: ring becomes a compact retry icon button (44pt target, refresh glyph, `colors.textInverse` on `rgba(0,0,0,0.45)` circle) — tappable, wired to existing `onRetryItem`.
- On cancelled: same as failed but with an X glyph that re-queues via the existing retry path if available, else just the retry icon. No "Cancelled" text.

### 2. Chrome removal
- Delete: `UploadedCheckBadge`, progress text, `Add more · 3/10` counter text (the Add more button stays, counter goes), empty-state coaching copy ("Add your first photo" / "Up to X photos") — empty state becomes a single centered quiet placeholder: one `image-outline` glyph 28pt `colors.textMuted` + "Add photos" label (use existing i18n keys if present, else add under `listing.media.*` — but see constraints).
- Thumbnails: remove border + card background. Media IS the card: `borderRadius: Radius.md`, no borderWidth, no backgroundColor. Selected/cover state (if any) communicated by nothing decorative — first position is the cover, that's enough.
- Remove `lockedNote` rendering if it's coaching text — check its usage; if hosts pass it, keep the prop but render it as a single muted caption line only when non-empty (do not break the host contract).

### 3. Edit any photo
- Generalize the cover-edit gate: any IMAGE item (not video, not failed/cancelled, manipulable URI) gets the edit affordance. Tap a thumbnail (or its edit glyph) → same `CreatorCropSheet` flow via the existing `onTransformItem` contract.
- Keep the prop interface of ListingMediaStudio UNCHANGED (hosts: SellScreen, EditListingScreen, AIPoweredListingScreen pass `onTransformItem` already). Internally track `cropTargetId: string | null` instead of assuming cover.
- The edit affordance on thumbnails: a small 28pt edit glyph bottom-right over the thumb with a `rgba(0,0,0,0.35)` scrim circle, 44pt hit target. Only when editable.
- Do NOT modify CreatorCropSheet.tsx (another agent owns it). Its props: `visible, imageUri, onClose, onCropComplete(newUri, width, height), focalPoint?, onFocalPointChange?` — keep calling it exactly as today.

### 4. Footers (separate files, same ownership)
- `frontend/src/components/sell/ListingPublishFooter.tsx`: DELETE the quality row (quality dot + "Listing quality 85% Excellent") entirely — the product owner rejected quality meters. Simplify stage copy: `uploading_media` → "Publishing…", `creating_listing` → "Publishing…", `attaching_media` → "Finishing…", `completed` → "Published", `failed_recoverable` → "Couldn't publish — Retry". Keep the retry button behavior identical.
- `frontend/src/components/listing/EditListingFooter.tsx`: same treatment: "Saving…", "Saving…", "Saved", "Couldn't save — Retry".
- If these strings are i18n keys, update the EN values surgically in `frontend/src/i18n/locales/en.json` (validate JSON). If hardcoded, hardcode the new English (match the file's existing pattern).

### 5. Constraints
- Do NOT touch: CreatorCropSheet.tsx, BottomSheetPicker.tsx, ShippingPickerSheet.tsx, BottomSheet.tsx, ThemeContext.tsx, SellScreen.tsx, EditListingScreen.tsx, AIPoweredListingScreen.tsx (other agents own them).
- You MAY touch: ListingMediaStudio.tsx, ListingPublishFooter.tsx, EditListingFooter.tsx, en.json (surgical), and NEW test files under frontend/src/__tests__/ if you add tests.
- No new dependencies. Check package.json before assuming any import.
- Keep all existing props and host contracts. The component must render identically for video items (native controls, poster) — only the overlay/badge treatment changes.
- Factor if the file exceeds ~600 lines after your changes: extract `UploadProgressRing` into `frontend/src/components/listing/UploadProgressRing.tsx`.
- Code style: match existing (no comments unless essential, no `any`, compact).

## Verification (from repo root)

```
cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd frontend; node ./node_modules/eslint/bin/eslint.js src/components/listing/ListingMediaStudio.tsx src/components/sell/ListingPublishFooter.tsx src/components/listing/EditListingFooter.tsx
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en.json','utf8')); console.log('json ok')"
cd frontend; node ./node_modules/vitest/vitest.mjs run --silent 2>&1 | tail -6
```
Baseline failures to ignore: groupChatInfoParity.test.tsx (6), pricingDisplayModes.test.ts (1), coownP0ForegroundRevalidation.test.ts (5, if present). Zero NEW failures allowed. If a test asserts on removed UI (e.g. quality row), UPDATE the test to assert the new truth — do not delete tests wholesale.

## Report

Full report → `.flagship/sdd/task-3-report.md`. Return: status, files changed, one-line test summary, concerns.
