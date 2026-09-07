# Task 3B Report — One icon family + tightened copy across the editor surfaces

Date: 2026-02-14 · Branch: `feat/product-detail-contract-media-device-closure` · HEAD: `03153b23`
Owner files: `frontend/src/creator/CreatorAssetPicker.tsx`, `frontend/src/creator/CreatorCropSheet.tsx`

## 1. Icon consolidation

### CreatorAssetPicker.tsx — AppGlyph (coolicons SVG) → AppIcon (Ionicons semantic wrapper)

| Line (post-edit) | From | To | Faithfulness |
|---|---|---|---|
| 843 | `<AppGlyph name="camera" size={IconGrammar.hero}>` | `<AppIcon name="camera-outline" size={IconGrammar.hero} color="textPrimary" opticalCenter accessible={false}>` | Faithful — coolicons `System/Camera` (outline body + lens) ≙ Ionicons `camera-outline`; matches the `camera` concept mapping in `theme/iconTokens.ts` and the camera-hero pattern already in `MediaBrowserSheet.tsx:375`. |
| 1040 | `<AppGlyph name="media-image" size={IconGrammar.metadata}>` | `<AppIcon name="image-outline" size={IconGrammar.metadata} …>` | Faithful — coolicons `Media/Image_01` (frame + mountain + sun) ≙ Ionicons `image-outline`; matches the `image` concept mapping. |
| 1430 | `<AppGlyph name="store-bag" size={IconGrammar.metadata}>` | `<AppIcon name="bag-handle-outline" size={IconGrammar.metadata} …>` | Faithful — coolicons `Interface/Shopping_Bag_01` ≙ Ionicons `bag-handle-outline`; also the `cart` concept mapping, and consistent with `bag-handle-outline` already used in this file (link sticker preview, ~4053). |

- AppGlyph import removed (zero AppGlyph usages remain in the file → the media picker is now single-family Ionicons/AppIcon).
- Sizes unchanged (`IconGrammar.hero` 28, `IconGrammar.metadata` 16 — within the file's existing bands). Colors passed as theme keys (`textPrimary`/`textSecondary`) per the established AppIcon convention in creator tools.
- No glyph was kept on AppGlyph — all three had faithful Ionicons equivalents.

### CreatorCropSheet.tsx — Ionicons direct → AppIcon wrapper (same glyphs, same sizes)

| Line (post-edit) | From | To |
|---|---|---|
| 641 | `<Ionicons name="close" size={22} color={colors.textPrimary}>` | `<AppIcon name="close" size={22} color="textPrimary" …>` |
| 780 | `<Ionicons name="refresh-outline" size={IconGrammar.standard} color={rotation % 360 !== 0 ? colors.brand : colors.textPrimary}>` | `<AppIcon name="refresh-outline" … color={rotation % 360 !== 0 ? 'brand' : 'textPrimary'} …>` |
| 797 | `<Ionicons name="swap-horizontal-outline" size={IconGrammar.standard} color={flippedH ? colors.brand : colors.textPrimary}>` | `<AppIcon name="swap-horizontal-outline" … color={flippedH ? 'brand' : 'textPrimary'} …>` |
| 813 | `<Ionicons name="swap-vertical-outline" …>` | `<AppIcon name="swap-vertical-outline" …>` |
| 894 | `<Ionicons name="arrow-undo-outline" size={18} color={colors.textPrimary}>` | `<AppIcon name="arrow-undo-outline" size={18} color="textPrimary" …>` |
| 908 | `<Ionicons name="locate-outline" size={18} color={colors.textPrimary}>` | `<AppIcon name="locate-outline" size={18} color="textPrimary" …>` |

- `Ionicons` import removed (zero direct Ionicons remain in the file). Dynamic brand-when-active color semantics preserved exactly (AppIcon resolves theme keys identically).
- `aria-hidden={true}` dropped on conversion — AppIcon's decorative convention (`accessible={false}`, matching all creator-tools usages) covers it; parent `PressScale` carries the accessibilityLabel.

## 2. Copy tightening

**i18n check first (per brief):** neither file imports i18n (`useTranslation`/`react-i18next` absent); both strings are inline JSX **literals** → tightened in place. **No locale files touched.**

### CreatorAssetPicker.tsx
- Permission-denied state (both variants — "Open settings" CTA ~867 and "Allow access" CTA ~882):
  - title: `"Photo access needed"` → `"Allow photo access"`
  - body: `"Allow access to your photos to start creating."` → `"ThryftVerse needs access to your library to add photos."` (one short sentence of necessity, no marketing)
- Media-library empty state (~1007):
  - title: `"No photos yet"` → `"Camera access needed"`
  - body: `"Take photos with the camera to get started."` → `"Enable the camera to capture items directly."`
  - Applied the brief's target copy verbatim. Note: this state is technically an empty library (photo permission already granted); the copy pairs with the existing "Open camera" CTA, which is what triggers the camera-permission request.
- Accessibility labels: unchanged in meaning; no label wording depended on the changed body copy (`ctaLabel` "Open settings"/"Allow access"/"Open camera" unchanged).

### CreatorCropSheet.tsx
- **Verified — no change needed.** Only control labels remain: mode tabs "Crop"/"Focal", "Straighten" slider label, "Center", footer "Cancel / Reset / Done", "Processing…" state, and error toasts. The explanatory focal readout ("Focal point: X%, Y%") and "Auto" button were already removed by prior uncommitted work in this file.

## 3. Consistency sweep (stroke tokens)

### CreatorAssetPicker.tsx — all 6 arbitrary `borderWidth: 2` hardcodes → `Stroke.emphasis`
All six are selection/focus rings (2pt = selection/focus per stroke grammar):
- `selectionPreviewItemSelected` (~4345) · `mediaGridSelectedOverlay` (~4417) · `colorOption` selected ring (~4532) · `quizCorrectDot` (~4603) · `spectrumIndicator` handle (~4652) · `sliderPreviewHandle` (~4714)

### CreatorCropSheet.tsx
- `focalReticle` `borderWidth: 2` → `Stroke.emphasis` (focus reticle)
- `focalReticleOuter` `borderWidth: 1` → `Stroke.standard`
- `focalBtn` `borderWidth: 1` → `Stroke.standard`
- (`cropBorder`, corner handles, ratio underline already on `Stroke.emphasis` — untouched)

Separator-layer `StyleSheet.hairlineWidth` usages were left as-is: that is the platform hairline for the separator layer, not an arbitrary hardcode; no `0.5`/`1.5` hardcodes exist in either file.

### Press feedback
Both files already run one dominant pattern — `PressScale` (imported from `./CreatorAnimations`) for all chrome controls (close/done/CTA/camera hero/rotate/flip/reset/footer). Raw `Pressable` remains only on content surfaces (grid cells, album rows, category tabs, focal tap surface) with no layout-shifting press states. Per the brief's Constraints ("Keep diffs tight: icon swaps + copy + stroke tokens. No restructuring"), these were not converted.

## 4. Verification

- `npm run typecheck`: **0 errors in both owned files.** Remaining repo errors are outside this task's ownership: `ListingMediaStudio.tsx` TS2393 ×2 (parallel agent's file, in-flight) and `SellerHubScreen.tsx` TS2305/TS2304 (pre-existing/parallel screen work).
- Scoped eslint on the two files: **0 errors** (CreatorAssetPicker 133 warnings, CreatorCropSheet 16 — all pre-existing categories: a11y-hint, unused reanimated imports, max-lines; none introduced by this diff).
- `npm test` (vitest): **1729 passed / 8 failed / 2 skipped.** Stated baseline is 7 pre-existing unrelated failures; the 8 observed failures are: `groupChatInfoParity.test.tsx` ×6, `pricingDisplayModes.test.ts` ×1 (both baseline), plus `sellerAnalyticsAndHubUpgrade.test.ts` ×1 — that last one is a **new untracked test file** (`??` in git) asserting against the in-flight `SellerHubScreen.tsx` rewrite by parallel work. **No test references CreatorAssetPicker or CreatorCropSheet**; none of the failures touch this task's files.

## 5. Notes for the parent agent

- `git diff` for `CreatorCropSheet.tsx` vs HEAD is large (~430 lines) because the file carried **pre-existing uncommitted work** (straighten/flip/reset feature) before this task started; this task's contribution inside it is only the 6 icon swaps + 3 stroke tokens + import swap. `CreatorAssetPicker.tsx` was clean before this task; its 32-line diff is exactly this task's 16 edits.
- Nothing committed, per instructions. ListingMediaStudio.tsx, SortablePhotoStrip.tsx, FocalImage, services, hooks, screens untouched.
