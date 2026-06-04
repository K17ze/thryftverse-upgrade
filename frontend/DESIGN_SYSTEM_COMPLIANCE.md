# Phase 3 — Design System Compliance Report

**Date:** 2026-06-04
**Scope:** `frontend/src/screens/` (core user-facing screens)
**Method:** Static analysis via pattern matching

---

## Summary

| Category | Violations | Files Affected | Top Offenders |
|----------|-----------|----------------|---------------|
| Typography (hardcoded fontFamily/fontSize) | ~485 refs | 47 files | MyProfileScreen, UserProfileScreen, BalanceScreen, HomeScreen |
| Color (hardcoded hex/rgba) | ~192 refs | 28 files | CreatePosterScreen, HomeScreen, PosterViewerScreen, AuthLandingScreen |
| Spacing (hardcoded padding/margin) | ~1,105 refs | 103 files | GlobalSearchScreen, HomeScreen, MyProfileScreen, UserProfileScreen |
| Radius (hardcoded borderRadius) | ~486 refs | 103 files | HomeScreen, MyProfileScreen, SearchScreen, BalanceScreen |
| Card systems | 111 refs | 20 files | SellScreen, AccountSettingsScreen, EditListingScreen, CheckoutScreen |
| Headers | Mostly consistent | — | — |

**Note:** Raw numbers include legitimate cases (e.g., `rgba(0,0,0,0.45)` backdrops, poster canvas colors, animation values). The ranked findings below filter for user-visible violations only.

---

## 1. Typography Violations — HIGH IMPACT

**Issue:** Screens use `Typography.family.*` directly and hardcode `fontSize` instead of using the `Type` scale from `designTokens.ts`.

**Why it matters:** Breaks the type scale system. Text sizes will drift between screens, making the app feel unpolished. Any future type system update requires touching 47 files.

**Top offenders by file:**

| Rank | File | Est. Violations | Example |
|------|------|-----------------|---------|
| 1 | `MyProfileScreen.tsx` | 35 | `Typography.family.semibold`, hardcoded `fontSize: 15` |
| 2 | `UserProfileScreen.tsx` | 27 | `Typography.family.bold`, hardcoded `fontSize: 13` |
| 3 | `BalanceScreen.tsx` | 25 | `Typography.family.bold`, hardcoded `fontSize: 28` |
| 4 | `HomeScreen.tsx` | 25 | `Typography.family.medium`, hardcoded `fontSize: 12` |
| 5 | `OrderDetailScreen.tsx` | 23 | `Typography.family.semibold`, hardcoded `fontSize: 14` |

**Also affected:** CheckoutScreen, CreateLookScreen, ItemDetailScreen, MakeOfferScreen, WithdrawScreen, ManageListingScreen, SellScreen, LoginScreen, MyOrdersScreen.

**Fix approach:** Replace all `Typography.family.*` in screens with `Type.*.fontFamily` (if available) or standardize on `Type.headline/body/caption.size`. Replace hardcoded `fontSize` with `Type.*.size`. This is a medium-effort refactor requiring visual QA.

---

## 2. Color Violations — HIGH IMPACT

**Issue:** Hardcoded hex and rgb values in screen styles bypass the `Colors` theme system. In dark mode these will look wrong.

**Top offenders:**

| Rank | File | Violations | Examples |
|------|------|-----------|----------|
| 1 | `CreatePosterScreen.tsx` | 23 | `#fff`, `#000`, `rgb(255,255,255)`, canvas/editor colors |
| 2 | `HomeScreen.tsx` | 22 | `#fff`, `#00000050`, `rgba(255,255,255,0.1)` |
| 3 | `PosterViewerScreen.tsx` | 20 | `#fff`, `#000`, `rgba(0,0,0,0.5)` |
| 4 | `AuthLandingScreen.tsx` | 16 | `#090909`, `rgba(9,9,9,0.15)` |
| 5 | `EditListingScreen.tsx` | 12 | `#000`, `#fff`, `rgba(255,255,255,0.08)` |

**Acceptable exceptions:** Poster editor and canvas tools legitimately need hardcoded colors for creative tools. These should be noted as exclusions.

**Fix approach:** Replace screen-level hardcoded colors with semantic tokens (`Colors.textPrimary`, `Colors.background`, etc.). For overlay scrims, use `Colors.overlay` or add overlay tokens to `colors.ts`.

---

## 3. Card System Inconsistency — MEDIUM-HIGH IMPACT

**Issue:** Three different card/container systems coexist across screens:

1. **`GlassSurface` / `GlassCard`** — Deprecated glassmorphism. Still used in 20 files.
2. **`SettingsCard`** — Solid surface card for settings. Used in settings screens.
3. **Inline `View` cards** — Hundreds of one-off styled Views acting as cards.

**Files using deprecated `GlassCard` or `GlassSurface`:**
- `SellScreen.tsx` (17 refs) — Heaviest offender
- `AccountSettingsScreen.tsx` (13 refs)
- `EditListingScreen.tsx` (8 refs)
- `CheckoutScreen.tsx` (7 refs)
- `HelpSupportScreen.tsx` (7 refs)
- `MakeOfferScreen.tsx` (7 refs)
- `PaymentsScreen.tsx` (7 refs)
- `ChatScreen.tsx` (5 refs) — Offer/status cards
- `PersonalisationScreen.tsx` (5 refs)
- `PostageScreen.tsx` (5 refs)
- `SettingsScreen.tsx` (5 refs)

**Fix approach:** Replace `GlassCard` with `View` + `Colors.surface` + `Elevation.subtle`. Unify `SettingsCard` with a single `AppCard` component that accepts `variant="elevated" | "flat"`. This is high-effort due to visual QA needed.

---

## 4. Header Inconsistency — MEDIUM IMPACT

**Issue:** Most screens now use `ScreenHeader` consistently (38 matches across 19 files). However, some screens still have custom header implementations or missing header patterns.

**Good:** All settings screens migrated to `ScreenHeader` successfully.

**Remaining issues:**
- `TwoFactorSetupScreen.tsx` — Uses manual back button + title, no `ScreenHeader`
- Some screens use `ScreenHeader` with `onBack`, others with `navigation.goBack()` inline
- Right actions in headers use ad-hoc styling (e.g., `PushNotificationsScreen`, `PostageScreen`)

**Fix approach:** Add `ScreenHeader` to `TwoFactorSetupScreen`. Standardize right-action styling via a `headerAction` prop or shared `HeaderActionButton` component.

---

## 5. Spacing Violations — MEDIUM IMPACT

**Issue:** Hardcoded `padding` and `margin` values instead of `Space` tokens. Creates micro-inconsistencies in rhythm.

**Top offenders:**

| Rank | File | Hardcoded Padding | Hardcoded Margin |
|------|------|-------------------|------------------|
| 1 | `GlobalSearchScreen.tsx` | 32 | 15 |
| 2 | `HomeScreen.tsx` | 30 | 23 |
| 3 | `MyProfileScreen.tsx` | 30 | 32 |
| 4 | `UserProfileScreen.tsx` | 29 | 23 |
| 5 | `BalanceScreen.tsx` | 17 | 21 |

**Note:** Many hardcoded values are small adjustments (e.g., `gap: 6`, `marginTop: 2`) that are intentionally off-grid. The bigger issue is structural spacing (section padding, card padding) that should use tokens.

**Fix approach:** Focus on replacing structural spacing first: section padding, card padding, list item spacing. Leave micro-adjustments for later.

---

## 6. Radius Violations — LOW IMPACT

**Issue:** Hardcoded `borderRadius` values instead of `Radius` tokens.

**Top offenders:**

| Rank | File | Violations |
|------|------|-----------|
| 1 | `HomeScreen.tsx` | 36 |
| 2 | `MyProfileScreen.tsx` | 30 |
| 3 | `SearchScreen.tsx` | 18 |
| 4 | `BalanceScreen.tsx` | 15 |
| 5 | `UserProfileScreen.tsx` | 14 |

**Fix approach:** Replace `borderRadius: 12` with `Radius.lg`, `borderRadius: 999` with `Radius.full`, etc. Low visual impact but important for system integrity.

---

## Ranked by Impact

| Priority | Category | User Impact | Fix Effort |
|----------|----------|-------------|------------|
| 1 | Typography | High — text looks inconsistent across screens | Medium |
| 2 | Color (hardcoded) | High — dark mode breaks | Medium |
| 3 | Card systems | Medium-High — visual fragmentation | High |
| 4 | Header inconsistency | Medium — navigation feel varies | Low |
| 5 | Spacing | Medium — subtle rhythm issues | Medium |
| 6 | Radius | Low — mostly developer maintenance | Low |

---

## Exclusions (Legitimate Hardcoded Values)

These areas are allowed to use hardcoded values:
- **Poster editor / canvas tools** — Creative tools need arbitrary colors for stickers, backgrounds, drawing
- **Animation values** — `translateY: 760`, `opacity: 0.45`, etc.
- **Backdrop scrims** — `rgba(0,0,0,0.45)` is a standard overlay pattern
- **Shadow values** — `shadowColor: '#000'`, `shadowOpacity: 0.1`
