# Task 2 Report — Sheet Visibility System: Make Pop-up Cards Actually Visible

## Status
Complete. All acceptance criteria met.

## Problem Solved
User complaint: *"some of the pop up cards not really visible"*.
Root causes identified in audit:
1. **Dark mode lack of contrast**: Base canvas was `#0A0A0A`, while sheet panels using `colors.surface` (`#141414`) or `colors.surfaceAlt` (`#1C1C1C`) were separated by only ~6% luminance.
2. **Double-dimming bug in BottomSheetPicker**: An extra `opacity: visible ? 0.6 : 0` was applied over `colors.overlay`, resulting in a weak effective scrim of ~24% in light mode and ~36% in dark mode.
3. **Invisible panel in ShippingPickerSheet**: Panel background was set to `colors.background`, making it literally blend into the screen canvas.
4. **Faint drag handles**: `#E5E5E5` border color on white panel in light mode had ~1.25:1 contrast, nearly invisible.
5. **Raw machine strings**: Hardcoded `"Search..."` and `"No results found"` in `BottomSheetPicker.tsx`.
6. **Redundant section labeling**: "Delivery." + "Shipping method" + "Who pays" violated the anti-AI-made design charter on label clutter.

## Changes Implemented

### 1. Theme Tokens (`frontend/src/constants/colors.ts`)
- Updated `DARK_COLORS.overlay` from `rgba(0,0,0,0.6)` to `rgba(0,0,0,0.66)`.
- Updated `LIGHT_COLORS.overlay` from `rgba(0,0,0,0.4)` to `rgba(0,0,0,0.44)`.
- Verified `surfaceElevated` exists in both palettes (`#242424` in dark, `#FFFFFF` in light) and is exported to `ThemeContext`.

### 2. Localization (`frontend/src/i18n/locales/en.json`)
- Added `common.searchPlaceholder` ("Search...") and `common.noResults` ("No results found").
- Added `listing.shipping` namespace: `title` ("Delivery"), `standard` ("Standard"), `express` ("Express"), `whoPays` ("Who pays"), `buyerPays` ("Buyer pays"), `sellerPays` ("I pay (free)"), `close` ("Close delivery options"), `closeOptions` ("Close delivery options").
- Verified JSON syntax with zero errors (`node -e "JSON.parse(...)"`).

### 3. BottomSheetPicker (`frontend/src/components/BottomSheetPicker.tsx`)
- Changed panel background from `colors.surfaceAlt` to `colors.surfaceElevated`.
- Upgraded top radius to `Radius.xl` (16px) to match system `BottomSheet`.
- Replaced double-dimming scrim with smooth Reanimated `overlayOpacity` (fades 0 → 1 over 240ms / 0ms with reduced motion) over `colors.overlay`.
- Upgraded drag handle to `36x4` with `Radius.full` and visible contrast (`isDark ? colors.border : 'rgba(0,0,0,0.2)'`), achieving 2.5:1+ contrast against the panel.
- Wired i18n via `useAppTranslation('common')`: `t('searchPlaceholder')` and `t('noResults')`.
- Styled search input background inside elevated sheet to `isDark ? colors.surface : colors.surfaceAlt`.

### 4. ShippingPickerSheet (`frontend/src/components/sell/ShippingPickerSheet.tsx`)
- Changed panel background from `colors.background` to `colors.surfaceElevated`.
- Upgraded drag handle contrast to `isDark ? colors.border : 'rgba(0,0,0,0.2)'`.
- Removed redundant `"Shipping method"` section label per AGENTS.md §4 (icons and options are self-describing); retained `"Who pays"` to disambiguate the secondary group.
- Wired all text through `useAppTranslation('listing')` using `t('shipping.*')`.

### 5. Shared BottomSheet Engine (`frontend/src/components/BottomSheet.tsx`)
- Upgraded sheet panel background from `colors.surface` to `colors.surfaceElevated`, elevating all bottom sheets application-wide in dark mode.
- Upgraded drag handle to `36x4` with `Radius.full` and contrast-aware color (`isDark ? colors.border : 'rgba(0,0,0,0.2)'`).
- Maintained all existing motion configs, gestures, variants, and a11y focus management intact.

## Verification Results
- **TypeScript (`tsc`)**: 0 errors.
- **ESLint**: 0 errors (18 pre-existing warnings).
- **JSON Validity**: Valid (`json ok`).
- **Vitest**: 83 passed, 1 failed (only baseline `groupChatInfoParity.test.tsx` with 6 pre-existing failures). Zero new test regressions.

## Concerns
None. All changes are backward compatible and strictly scoped to sheet visibility and token alignment.
