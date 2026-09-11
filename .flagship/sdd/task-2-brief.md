# Task 2 Brief — Sheet visibility system: make pop-up cards actually visible

## Context

Flagship UI campaign for a React Native (Expo) marketplace app at `C:\Users\User\Desktop\thryftverse-upgrade`. User complaint: "some of the pop up cards not really visible". Audit evidence:

- Dark mode: `colors.surface` #141414 vs `colors.background` #0A0A0A (~6% luminance apart); `surfaceAlt` #1C1C1C equally close.
- `BottomSheetPicker.tsx` multiplies `colors.overlay` by an extra `opacity: 0.6` → effective scrim ~36% black dark / ~24% light — too weak.
- `ShippingPickerSheet.tsx` uses `colors.background` as the panel — literally invisible against the page in dark mode.
- `PickerSheet` inside `AIPoweredListingScreen.tsx` uses `colors.background` too.
- Raw machine strings: `BottomSheetPicker.tsx` line ~116 `"Search..."` and line ~126 `"No results found"`.
- Handle colors use `colors.border` which is nearly invisible on `surfaceAlt`.

Design contract (Design.md v1.6 + 2026 research): modal sheets use an ELEVATED panel (`surfaceElevated` = #FFFFFF light / #242424 dark), scrim ~32–36% (Material 3) but our dark canvas needs ~0.55–0.65 for separation, visible 36×4pt drag handle, top radius 16 (Radius.xl), backdrop fades with the sheet.

## Your job — make every listing-flow sheet visibly distinct, consistent, and i18n-clean

### 1. Theme token (`frontend/src/theme/ThemeContext.tsx`)
- Read the current `overlay` color values. Update LIGHT `overlay` to `rgba(0,0,0,0.44)` and DARK to `rgba(0,0,0,0.66)` — enough to separate an elevated panel without washing the screen. Verify `surfaceElevated` exists in both LIGHT_COLORS and DARK_COLORS (audit says #FFFFFF / #242424 — confirm; if the key is missing add it to BOTH palettes following the existing token shape). Do not change any other token.

### 2. `frontend/src/components/BottomSheetPicker.tsx`
- Panel background: `colors.surfaceElevated` (not surfaceAlt).
- Scrim: animate to a solid `rgba(0,0,0,0.55)` light / `rgba(0,0,0,0.65)` dark — use `colors.overlay` but REMOVE any extra multiplication (the audit found `opacity: visible ? 0.6 : 0` double-dimming; make the animated target the full overlay color).
- Handle: 36×4, radius full, `colors.border` — keep, but verify it's visible on surfaceElevated (border #E5E5E5 on white is too faint in light mode → use `colors.textMuted` at 0.4 opacity or `colors.border` on dark; pick one grammar and note it).
- Replace hardcoded `"Search..."` and `"No results found"` with i18n: `t('common.search')` / `t('common.none')` if those keys exist in en.json, else add `searchPlaceholder` / `noResults` under the existing namespace this component's consumers use — check how BottomSheetPicker is consumed (grep for `<BottomSheetPicker`) and use the SAME translation namespace pattern as its consumers. Surgical en.json edit only.
- Top radius: Radius.xl (16) — match shared BottomSheet.

### 3. `frontend/src/components/sell/ShippingPickerSheet.tsx`
- Panel background → `colors.surfaceElevated`.
- Keep the native Modal + handle. Remove the redundant section labels IF they duplicate the field context ("Delivery." eyebrow + "Shipping method" + "Who pays" → keep exactly one label per group: the row content itself is the label; keep "Who pays" only if it disambiguates two stacked groups — use judgment, bias to removal per AGENTS.md label-everything disease).
- Raw strings must go through `t()` — check `frontend/src/i18n/locales/en.json` listing namespace for existing keys; add `listing.shipping.*` keys surgically if needed.

### 4. `frontend/src/components/BottomSheet.tsx`
- Audit only: confirm the handle bar (40×5 `colors.border`) is visible against `colors.surface` panels. If the sheet panel color is `colors.surface`, switch the sheet panel to `colors.surfaceElevated` so handle + content separate from the page. Keep all variant configs otherwise. This is the shared engine — be careful, run its consumers: grep for `<BottomSheet` usages and confirm none pass colors that assume surface.

### 5. Constraints
- Do NOT touch: CreatorCropSheet.tsx (another agent owns it), ListingMediaStudio.tsx, SellScreen.tsx, EditListingScreen.tsx, AIPoweredListingScreen.tsx.
- Do NOT add dependencies. No new libraries.
- en.json edits: surgical, validate JSON after each edit.
- No new comments beyond what's needed; match existing code style; no `any`.

## Verification (run from repo root)

```
cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd frontend; node ./node_modules/eslint/bin/eslint.js src/components/BottomSheetPicker.tsx src/components/sell/ShippingPickerSheet.tsx src/components/BottomSheet.tsx src/theme/ThemeContext.tsx
node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/en.json','utf8')); console.log('json ok')"
cd frontend; node ./node_modules/vitest/vitest.mjs run src/__tests__ --silent 2>&1 | tail -5
```
Baseline: 7 pre-existing test failures (groupChatInfoParity, pricingDisplayModes) + possible coownP0ForegroundRevalidation failures — ignore those files; you must add zero new failures.

## Report

Full report → `.flagship/sdd/task-2-report.md`. Return: status, files changed, one-line test summary, concerns.
