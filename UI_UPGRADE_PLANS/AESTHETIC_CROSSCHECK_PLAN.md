# Aesthetic Elevation Cross-Check: OVERALL vs OTHER_SCREENS

> Cross-check of `OVERALL_AESTHETIC_ELEVATION.md` (design system source of truth) against `OTHER_SCREENS_UPGRADE_PLAN.md` (implementation plan).  
> **Date**: 2026-06-01  
> **Status**: Analysis complete. Gaps identified. Actionable plan below.

---

## 1. Executive Summary

The `OTHER_SCREENS_UPGRADE_PLAN.md` correctly captures the **adoption-first** strategy and the 4 core patterns (GlassCard swap, translucent buttons, AvatarRing, GlowSurface on CTAs). However, it **misses several design-system-level requirements** defined in `OVERALL_AESTHETIC_ELEVATION.md` that affect the "other screens" scope:

| Area | OVERALL Spec | OTHER_SCREENS Coverage | Gap |
|------|-------------|----------------------|-----|
| **Gradient tokens** | GOLD_GRADIENT, DARK_GRADIENT, GLASS_BG, GLASS_BORDER | Not mentioned | **Missing entirely** |
| **Glow elevation** | `glow` shadow token (brand color, 0.25 opacity, 16 radius) | Not mentioned | **Missing entirely** |
| **Typography scale** | `display` (32px), `body` (15px), `price` (20px), etc. | Not audited | **Scale mismatch** — `Type.body` is 14px, not 15px |
| **Typography rules** | Never `fontSize: 14` directly; never `fontFamily` in stylesheets | Not enforced | **Risk of drift** |
| **Light-mode glass** | GLASS_BG_LIGHT, GLASS_BORDER_L tokens | Not mentioned | **Missing entirely** |
| **GlassSearchPill** | Floating glass search input | Not in OTHER_SCREENS scope | **Missing — needed for GlobalSearch, Filter, Discovery** |
| **PremiumToggle** | Gold-track animated switch | Not in OTHER_SCREENS scope | **Missing — needed for PushNotifications, Settings, Postage** |
| **SettingsCell glass** | Glass variant for row containers | Partial — tinted icons exist, but container is solid | **Partial gap** |
| **AppInput glass** | Translucent input variant | Not in OTHER_SCREENS scope | **Missing — needed for Sell, EditProfile, Login** |

**Verdict**: OTHER_SCREENS is ~70% aligned. The 30% gap is **design-token completeness** (gradients, glow, light-mode glass) and **3 genuinely missing components** (GlassSearchPill, PremiumToggle, AppInput glass variant) that are needed by screens in the "other screens" list.

---

## 2. Verified Implementation State

### Already Built (Confirmed)
| Component | File | Status |
|-----------|------|--------|
| `AvatarRing` | `components/chat/AvatarRing.tsx` | **Built** — gold ring, unread glow, online dot |
| `PulseDot` | `components/chat/PulseDot.tsx` | **Built** — animated scale + opacity pulse |
| `GlassSurface` / `GlassCard` | `components/ui/GlassSurface.tsx` | **Built** — BlurView, tint, border, shadow |
| `GlassHeader` | `components/ui/GlassSurface.tsx` | **Built** — sticky nav header |
| `GlassBottomBar` | `components/ui/GlassSurface.tsx` | **Built** — floating bottom bar |
| `GlowSurface` / `GlowOrb` | `components/ui/GlowSurface.tsx` | **Built** — animated pulsing glow |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | **Built** — scale + haptic |
| `AppButton` (gold) | `components/ui/AppButton.tsx` | **Built** — primary/gold variant |
| `SkeletonLoader` | `components/SkeletonLoader.tsx` | **Built** — shimmer skeletons |
| `ScreenHeader` | `components/ui/ScreenHeader.tsx` | **Built** — reusable header |

### Still Using Solid Surfaces (Confirmed)
| Component / Screen | Current Surface | Required Surface |
|-------------------|-----------------|-----------------|
| `SettingsCard` | `Colors.surface` / `Colors.surfaceAlt` | `GlassCard` |
| `SettingsCell` (container) | `Colors.surface` | `GlassCard` or translucent |
| `SettingsCell` (Switch) | Native Switch (`trackColor: Colors.brand`) | `PremiumToggle` gold-track |
| `NotificationsScreen` cards | `Colors.surface` | `GlassCard` |
| `PostageScreen` | `SettingsCard` (solid) | `GlassCard` |
| `SellScreen` | `AppCard` imported | `GlassCard` + upload zone redesign |
| `BrowseScreen` | Audit needed | Likely `GlassCard` for listing cards |
| `MyOrdersScreen` | Audit needed | Likely `GlassCard` for order cards |

### Missing Components (Confirmed)
| Component | Needed By | Priority |
|-----------|-----------|----------|
| `GlassSearchPill` | GlobalSearch, Filter, Discovery screens | **High** |
| `PremiumToggle` | PushNotifications, Settings, Postage, AccountSettings | **High** |
| `AppInput` glass variant | Sell, EditProfile, Login, AddBankAccount | **Medium** |

### Missing Design Tokens (Confirmed)
| Token | OVERALL Spec | Current State |
|-------|-------------|---------------|
| `GOLD_GRADIENT` | `linear-gradient(135deg, #C8A545, #D4AF37)` | **Missing** |
| `DARK_GRADIENT` | `linear-gradient(180deg, #0A0A0A, #121212)` | **Missing** |
| `GLASS_BG` | `rgba(255,255,255,0.025)` | **Missing** (hardcoded in GlassSurface styles) |
| `GLASS_BORDER` | `rgba(255,255,255,0.06)` | **Missing** (hardcoded in GlassSurface styles) |
| `Elevation.glow` | `color: brand, opacity: 0.25, radius: 16` | **Missing** |
| `Type.display` | 32px / 700 / -0.5px | **Missing** |
| `Type.body` | 15px / 500 | **14px / 400** — mismatch |

---

## 3. Cross-Check Detail: Screen-by-Screen

### Already Premium (Keep As-Is)
| Screen | Why | Aesthetic Compliance |
|--------|-----|---------------------|
| `AuthLandingScreen` | GlassCard, GlowSurface, AmbientGradient | Full |
| `HomeScreen` | BlurView, SharedTransitionView, masonry, SkeletonLoader | Full |
| `ItemDetailScreen` | Parallax, BlurView header, SharedTransitionView | Full |
| `CheckoutScreen` | ScreenHeader, FadeInDown, bottom sheets | Full |
| `ChatScreen` | ChatHeader BlurView, gold message bubbles | Full ("them" bubbles may need glass) |
| `MyProfileScreen` | Parallax cover, stats row, quick access grid | Full |

### Needs Work (Other Screens Plan Coverage)
| Screen | OTHER_SCREENS Action | Aesthetic Gap |
|--------|---------------------|---------------|
| `BrowseScreen` | Swap listing cards to GlassCard | Needs `GlassSearchPill` if search added |
| `MyOrdersScreen` | Swap order cards to GlassCard | None |
| `OrderDetailScreen` | Swap timeline cards to GlassCard | Gold tint on completed steps |
| `BalanceScreen` | Swap balance hero/metric cards to GlassCard | None |
| `BalanceHistoryScreen` | Swap transaction rows to GlassCard | None |
| `ClosetScreen` | Swap saved item / collection cards to GlassCard | None |
| `NotificationsScreen` | Swap notification rows to GlassCard, add PulseDot | Needs `AvatarRing` for actor avatars |
| `MyListingsScreen` | Swap listing grid cards to GlassCard | None |
| `ManageListingScreen` | Swap action sheet cards to GlassCard | None |
| `EditProfileScreen` | Swap form card to GlassCard, AvatarRing | Needs `AppInput` glass variant |
| `HelpSupportScreen` | Swap FAQ category cards to GlassCard | None |
| `PaymentsScreen` | Swap payment method cards to GlassCard | None |
| `AddBankAccountScreen` | Swap form card to GlassCard | Needs `AppInput` glass variant |
| `PostageScreen` | Swap shipping profile cards to GlassCard | Needs `PremiumToggle` for toggles |
| `ChangePasswordScreen` | Swap form card to GlassCard | Needs `AppInput` glass variant |
| `TwoFactorSetupScreen` | Swap QR/instruction cards to GlassCard | None |
| `FilterScreen` | Swap filter sections to GlassCard | Needs `GlassSearchPill` |
| `MakeOfferScreen` | Swap offer card and input wrapper to GlassCard | None |
| `ListingSuccessScreen` | Swap preview card to GlassCard | None |
| `ForgotPasswordScreen` | Swap form card to GlassCard | Needs `AppInput` glass variant |
| `LoginScreen` | Swap form card to GlassCard | Needs `AppInput` glass variant |
| `PushNotificationsScreen` | Swap category rows to GlassCard | Needs `PremiumToggle` for toggles |
| `CreateLookScreen` | Swap canvas card to GlassCard | None |
| `CreatePosterScreen` | Swap editor cards to GlassCard | None |
| `GlobalSearchScreen` | Swap recent search chips / result cards to GlassCard | Needs `GlassSearchPill` |
| `CategoryDetailScreen` | Swap category cards to GlassCard | None |
| `CollectionDetailScreen` | Swap collection cards to GlassCard | None |
| `GroupBotDirectoryScreen` | Swap group cards to GlassCard | None |
| `CreateGroupChatScreen` | Swap form cards to GlassCard | None |
| `PersonalisationScreen` | Swap quiz cards to GlassCard | None |
| `InviteFriendsScreen` | Swap invite cards to GlassCard | None |

---

## 4. Actionable Integration Plan

### Phase 0 — Foundation Tokens (Do First)
**Goal**: Close the design-token gaps so all downstream work uses the correct tokens.

1. **Add Gradient Tokens** to `constants/colors.ts` or new `theme/gradients.ts`:
   - `GOLD_GRADIENT` (135deg #C8A545 → #D4AF37)
   - `GOLD_GRADIENT_H` (90deg)
   - `DARK_GRADIENT` (180deg #0A0A0A → #121212)
   - `GLASS_BG` / `GLASS_BG_LIGHT`
   - `GLASS_BORDER` / `GLASS_BORDER_LIGHT`

2. **Add `Elevation.glow`** to `theme/designTokens.ts`:
   ```ts
   glow: {
     shadowColor: Colors.brand,
     shadowOffset: { width: 0, height: 0 },
     shadowOpacity: 0.25,
     shadowRadius: 16,
     elevation: 0, // glow is color-based, not height-based
   }
   ```

3. **Fix Typography Scale** in `theme/designTokens.ts`:
   - Add `Type.display` (32/38/700/-0.5)
   - Update `Type.body` to 15px / 500 (or create `Type.bodyEmphasis` at 15/600)
   - Update `Type.price` to 20px / 700 (currently 14/600)
   - Add `Type.priceLarge` (28/32/700/-0.5)
   - Audit all screens for raw `fontSize: 14` and replace with `Type.body`

4. **Light-Mode Glass Tokens** (if light mode is supported):
   - `GLASS_BG_LIGHT: 'rgba(0,0,0,0.03)'`
   - `GLASS_BORDER_LIGHT: 'rgba(0,0,0,0.08)'`

### Phase 1 — Missing Components (Blocker for Many Screens)
1. **`GlassSearchPill`** → `components/ui/GlassSearchPill.tsx`
   - Floating glassmorphism search input
   - Uses `GlassSurface` (intensity=25, tint="dark", borderRadius=999)
   - Focus state: borderColor → `Colors.brand` at 30% opacity
   - Used by: GlobalSearchScreen, FilterScreen, InboxScreen (optional)

2. **`PremiumToggle`** → `components/ui/PremiumToggle.tsx`
   - Custom animated toggle with gold track when active
   - Can wrap/expose same API as RN Switch for drop-in replacement
   - Used by: PushNotificationsScreen, SettingsCell (toggle variant), PostageScreen, AccountSettingsScreen

3. **`AppInput` glass variant** → enhance `components/ui/AppInput.tsx`
   - Add `variant: 'solid' | 'glass'` prop
   - Glass variant: translucent bg, hairline border, focus glow
   - Used by: SellScreen, EditProfileScreen, LoginScreen, AddBankAccountScreen, ChangePasswordScreen

### Phase 2 — Core Component Upgrades (Affects Multiple Screens)
1. **`SettingsCard` → GlassCard**
   - Swap all `backgroundColor: Colors.surface` to `GlassCard` wrapper
   - Keep existing border-radius and overflow behavior
   - This single change upgrades: PostageScreen, SettingsScreen, AccountSettingsScreen, HelpSupportScreen, etc.

2. **`SettingsCell` glass container + PremiumToggle integration**
   - Swap container `backgroundColor: Colors.surface` to translucent/glass
   - Replace native `<Switch>` with `<PremiumToggle>` when `variant='toggle'`
   - Keep tinted icon containers (already implemented as `iconColor ? ${iconColor}20`)

3. **`NotificationsScreen` upgrade**
   - Swap `notifCard` `backgroundColor: PANEL_BG` → `GlassCard`
   - Replace static `unreadDot` with `<PulseDot />`
   - Replace actor `CachedImage` avatar with `<AvatarRing size={32} ... />`

### Phase 3 — Screen-by-Screen GlassCard Sweep
Follow the OTHER_SCREENS_UPGRADE_PLAN.md screen list but apply these **enriched rules** per screen:

| Screen | Enriched Action (beyond OTHER_SCREENS plan) |
|--------|---------------------------------------------|
| `SellScreen` | Swap `AppCard` → `GlassCard`; redesign upload zone (dashed border + floating glass circles); use `AppInput` glass variant |
| `GlobalSearchScreen` | Add `GlassSearchPill`; swap result cards to `GlassCard` |
| `FilterScreen` | Add `GlassSearchPill` if search field exists; swap filter sections to `GlassCard` |
| `PushNotificationsScreen` | Swap category rows to `GlassCard`; replace all `<Switch>` with `<PremiumToggle>` |
| `EditProfileScreen` | Swap form card to `GlassCard`; use `AppInput` glass variant; AvatarRing on avatar picker |
| `LoginScreen` / `ForgotPasswordScreen` | Swap form card to `GlassCard`; use `AppInput` glass variant |
| `AddBankAccountScreen` / `ChangePasswordScreen` / `TwoFactorSetupScreen` | Swap form cards to `GlassCard`; use `AppInput` glass variant |
| `PostageScreen` | Swap `SettingsCard` → `GlassCard`; replace `<Switch>` with `<PremiumToggle>` |
| `NotificationsScreen` | Swap cards to `GlassCard`; `PulseDot` for unread; `AvatarRing` for actor avatars |
| `BrowseScreen` / `MyOrdersScreen` / etc. | Swap cards to `GlassCard` (standard pattern) |

### Phase 4 — Animation & Polish
1. **AvatarRing adoption** on all plain circular avatars:
   - `ItemDetailScreen` seller row
   - `MyProfileScreen` / `UserProfileScreen` profile avatar
   - `NotificationsScreen` actor avatars
   - `ChatScreen` (already has online ring in ChatHeader)

2. **GlowSurface on key CTAs** (Pattern 4 from OTHER_SCREENS):
   - `Publish` button on SellScreen
   - `Buy Now` / `Make Offer` on ItemDetailScreen
   - `Send Offer` on MakeOfferScreen
   - `Withdraw` on BalanceScreen

3. **Typography audit**:
   - Remove all raw `fontSize: 14` → use `Type.body`
   - Remove all raw `fontFamily` in stylesheets → use `Typography.family.*` or `Type.*.fontFamily`
   - Ensure headlines use negative letter-spacing

4. **No new `IS_LIGHT` constants**:
   - Verify no screen adds inline theme-check logic; use `ActiveTheme` / `Colors` tokens only

---

## 5. Success Criteria (Enriched)

Beyond the 8 criteria in OTHER_SCREENS_UPGRADE_PLAN.md, add:

9. **Gradient tokens** exist and are importable from theme
10. **`Elevation.glow`** token exists and is used on at least 3 CTAs
11. **`GlassSearchPill`** implemented and used on all search-heavy screens
12. **`PremiumToggle`** implemented and replaces all native Switch instances in settings/notifications
13. **`AppInput` glass variant** implemented and used on all form screens
14. **Typography scale** matches OVERALL spec (`display`, `body` at 15px, `price` at 20px, `priceLarge` at 28px)
15. **No raw `fontSize: 14`** anywhere in the "other screens" set
16. **Light-mode glass tokens** defined (even if not fully deployed yet)

---

## 6. Risk Notes

- **Token drift risk**: If gradients/glow tokens are not created first, screens will hardcode values and drift from the design system.
- **Typography breakage**: Changing `Type.body` from 14px to 15px may cause layout shifts in tightly constrained cards. Audit card heights after change.
- **PremiumToggle API**: Must expose identical props to RN Switch so `SettingsCell` can consume it without refactoring its toggle logic.
- **GlassSearchPill vs AppInput**: Consider whether to extend `AppInput` with a `pill`/`glass` prop vs. a separate component. Recommendation: separate component for clearer API.
