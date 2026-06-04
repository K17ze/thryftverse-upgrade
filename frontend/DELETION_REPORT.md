# Phase 1 — Deletion Report

**Generated:** 2026-06-04  
**Scope:** `frontend/src/` (TypeScript / React Native)  
**Total LOC:** ~63,039  
**Total Files:** ~290 (`.ts` + `.tsx`)

---

## Executive Summary

The codebase contains **massive redundancy** caused by successive redesigns without deprecation. There are:

- **2 typography systems** (89 files import the wrapper)
- **3 header systems** (15 use SettingsHeader, 6 use ScreenHeader, 20+ inline custom)
- **4 card systems** (AppCard unused, SettingsCard barely used, GlassCard deprecated, hundreds of inline)
- **39 imports of deprecated glass/glow components** across 30 files
- **221 references to deprecated `Colors.glassBg` / `Colors.glassBorder`** across 55 files
- **11 remaining `variant="glass"`** on AppInput across 4 files
- **At least 6 completely unused components**
- **2 trivial wrapper components** imported by 16 files each

**Estimated total LOC removable: ~4,800–6,200**

---

## 1. Unused Components (0 external imports)

| Component | LOC | File | Notes |
|-----------|-----|------|-------|
| `AppCard` | 98 | `components/ui/AppCard.tsx` | Zero imports. Created as "standardized card" but never adopted. `SettingsCard` and `GlassCard` won instead. |
| `PriceChart` | ~200 | `components/ui/PriceChart.tsx` | Zero imports. Likely from an abandoned portfolio/trading feature. |
| `ChatMessageList` | ~170 | `components/ChatMessageList.tsx` | Zero imports. ChatScreen uses its own `FlatList` directly. |
| `ChatMessageItem` | ~190 | `components/ChatMessageItem.tsx` | Only imported by `ChatMessageList` (which is dead). ChatScreen uses `MessageBubble` directly. |
| `MediaMessageBubble` | ~130 | `components/chat/MediaMessageBubble.tsx` | Zero imports. ChatScreen handles media inline. |
| `MentionHighlight` | ~45 | `components/chat/MentionHighlight.tsx` | Zero imports. |
| `NewMessagesSeparator` | ~45 | `components/chat/NewMessagesSeparator.tsx` | Zero imports. |
| `PulseDot` | ~40 | `components/chat/PulseDot.tsx` | Zero imports. |
| `TypingIndicator` | ~90 | `components/chat/TypingIndicator.tsx` | Zero imports. |

**Subtotal: ~1,008 LOC**

---

## 2. Nearly Unused Components (≤1 import)

| Component | LOC | Imports | File | Notes |
|-----------|-----|---------|------|-------|
| `Skeleton` | ~180 | 1 (BrowseScreen) | `components/ui/Skeleton.tsx` | Replaced by `SkeletonLoader` elsewhere. BrowseScreen can use `SkeletonLoader` instead. |
| `AmbientGradient` | 270 | 1 (AuthLandingScreen) | `components/ui/AmbientGradient.tsx` | Complex animated gradient. AuthLandingScreen can use a static background. |
| `ActivityBadge` | ~170 | 1 (ItemDetailScreen) | `components/ui/ActivityBadge.tsx` | Only used once. Can be inlined or merged into a simpler notification dot. |

**Subtotal: ~620 LOC**

---

## 3. Trivial Wrapper Components (16 imports each)

These are one-line wrappers around `Reanimated.Image` and `Reanimated.View` that add a `sharedTransitionTag` prop. They create abstraction overhead with zero value.

| Component | LOC | Imports | File | Replacement |
|-----------|-----|---------|------|-------------|
| `SharedTransitionImage` | 14 | 16 | `components/SharedTransitionImage.tsx` | Use `Reanimated.Image` directly with `sharedTransitionTag` prop |
| `SharedTransitionView` | 15 | 16 | `components/SharedTransitionView.tsx` | Use `Reanimated.View` directly with `sharedTransitionTag` prop |

**Subtotal: 29 LOC component + ~32 LOC import lines across 16 files**

---

## 4. Deprecated Compatibility Layers

These files exist only because other files import them. They add zero value and can be deleted once their consumers are updated.

| File | LOC | Consumers | Description |
|------|-----|-----------|-------------|
| `constants/typography.ts` | 98 | **89 files** | Re-exports `Type` and `Typography.family` from `theme/designTokens.ts`. Dead weight. |
| `components/ui/GlassSurface.tsx` | 108 | **30 files** (39 imports) | Was `BlurView`-based glassmorphism. Now a pass-through `View`. All consumers should use plain `View`. |
| `components/ui/GlowSurface.tsx` | 60 | **9 files** | Was animated gradient glow. Now a pass-through `View`. All consumers should unwrap children. |
| `components/ui/GlassIconButton.tsx` | 68 | **3 files** | Wraps `GlassSurface`. Should be replaced with `AnimatedPressable` + `View`. |
| `components/ui/GlassSearchPill.tsx` | 115 | **3 files** | Uses deprecated `Colors.glassBorder`. Should be replaced with `AppInput` or a standard search bar. |

**Subtotal: ~449 LOC in layers alone. Updating consumers removes another ~120 import lines.**

---

## 5. Duplicate / Competing Systems

### 5a. Typography (2 systems)

**Canonical:** `theme/designTokens.ts` exports `Type` and `Typography.family`.  
**Wrapper:** `constants/typography.ts` exports `Typography` (with `size`/`tracking`) and `TypeStyles` object.  
**Impact:** 89 files import the wrapper. The wrapper adds no real value — `Typography.family` is identical, `TypeStyles` is rarely used, `Typography.size` duplicates `Type`.

**Consolidation:** Delete `constants/typography.ts`. Update all 89 imports to pull from `theme/designTokens.ts` directly. `TypeStyles` can be deleted; any usage should use inline `Type` values.

**Estimated savings:** 98 LOC (wrapper) + ~200 LOC of redundant mapping logic across consumers.

### 5b. Headers (3 systems)

| System | Files | Notes |
|--------|-------|-------|
| `SettingsHeader` | 15 | Back button + centered title. Used by settings subpages. |
| `ScreenHeader` | 6 | Back button + centered title + right slot. Used by checkout/order flows. |
| Inline `header`/`backBtn`/`headerTitle` styles | 20+ | Every screen redefines the same 3 StyleSheet entries. Some still use `Colors.glassBg`. |

**Consolidation:** `SettingsHeader` and `ScreenHeader` are nearly identical. Merge into one component. Remove all inline duplicate styles from screens.

**Estimated savings:** ~600–800 LOC (20 screens × ~30–40 LOC of duplicate styles each) + ~120 LOC for merging the two components.

### 5c. Cards (4 systems)

| System | Usage | Notes |
|--------|-------|-------|
| `AppCard` | 0 | Dead. See §1. |
| `SettingsCard` | 3 | Used in Payments, Personalisation, Postage screens. Barely used. |
| `GlassCard` | 28+ files | Now a passthrough. Should be replaced with `View` + inline styles. |
| `CommonStyles.card` | Unknown | Exported from `designTokens.ts`. Check actual usage. |
| Inline card styles | Hundreds | Every screen defines its own card style object. |

**Consolidation:** Delete `AppCard`. Keep `SettingsCard` for now (3 usages). Replace all `GlassCard` with `View`. Do not try to unify all inline cards — that is redesign work.

**Estimated savings:** 98 LOC (AppCard) + ~80 LOC (GlassCard passthrough removal from consumers).

### 5d. Text Components (2 systems)

`components/ui/Text.tsx` exports 11 text components (`Caption`, `Body`, `Headline`, `Title1/2/3`, `Price`, `PriceCompact`, `PriceLarge`, `Meta`, etc.).  
**21 files import it.** However, most screens also use raw `<Text>` with inline `Type` values from `designTokens.ts`.

The component is not "unused," but it is **redundant** with the design token system. Every style it applies can be done with `Type` + `Typography.family` inline. It adds 367 LOC of abstraction for what is essentially a typed wrapper.

**Recommendation:** Keep for now. Deleting it is medium-risk due to 21 consumers. Mark as deprecated.

---

## 6. Dead Design Tokens

| Token | References | Files | Status |
|-------|------------|-------|--------|
| `Colors.glassBg` | ~110 | 55 | Deprecated. Maps to `Colors.surfaceAlt`. All refs should use `surfaceAlt` directly. |
| `Colors.glassBorder` | ~111 | 55 | Deprecated. Maps to `Colors.border`. All refs should use `border` directly. |
| `Glow` (export) | Unknown | Unknown | Exported from `colors.ts`. Check if any file imports `Glow` directly. |
| `Elevation.card` | Unknown | Unknown | May be unused now that glass shadows are removed. |
| `Elevation.floating` | Unknown | Unknown | May be unused. |
| `Elevation.modal` | Unknown | Unknown | May be unused. |
| `Elevation.glow` | Unknown | Unknown | Likely unused. |

**Action:** Search-and-replace `Colors.glassBg` → `Colors.surfaceAlt` and `Colors.glassBorder` → `Colors.border` across all 55 files. Remove `glassBg` and `glassBorder` from the `ThemeColors` type in `colors.ts`.

**Estimated savings:** ~220 token references removed + 4 lines deleted from `colors.ts`. Not huge LOC savings but massive debt reduction.

---

## 7. Screens Importing Deprecated Systems

### `variant="glass"` on AppInput (11 instances, 4 files)
- `LoginScreen.tsx` (5)
- `SignUpScreen.tsx` (3)
- `MakeOfferScreen.tsx` (2)
- `components/trade/BidComposer.tsx` (1)

The `variant` prop on `AppInput` is already a no-op, but these props imply the old system still exists. Remove them.

### GlassSurface / GlassCard / GlowSurface imports (39 imports, 30 files)
Top offenders:
- `SellScreen.tsx` (8 `<GlassCard>` usages)
- `CreateAuctionScreen.tsx` (7 `<GlassCard>` usages)
- `ItemDetailScreen.tsx` (5 usages + `GlassIconButton` + `ActivityBadge`)
- `MakeOfferScreen.tsx` (4 usages)
- `CheckoutScreen.tsx` (3 usages)
- `CreateGroupChatScreen.tsx` (3 usages)
- `EditListingScreen.tsx` (3 usages)
- `AuthLandingScreen.tsx` (`AmbientGradient` + `GlowSurface`)

---

## 8. Legacy Compatibility Layers (Full List)

| Layer | File | LOC | Consumers | Risk to Remove |
|-------|------|-----|-----------|----------------|
| Typography wrapper | `constants/typography.ts` | 98 | 89 files | **Low** — just re-export from `designTokens.ts`. |
| GlassSurface passthrough | `components/ui/GlassSurface.tsx` | 108 | 30 files | **Low** — replace with `View`. |
| GlowSurface passthrough | `components/ui/GlowSurface.tsx` | 60 | 9 files | **Low** — unwrap children. |
| GlassIconButton | `components/ui/GlassIconButton.tsx` | 68 | 3 files | **Low** — replace with `AnimatedPressable` + `View`. |
| GlassSearchPill | `components/ui/GlassSearchPill.tsx` | 115 | 3 files | **Medium** — rename/replace with standard search input. |

---

## 9. Components That Can Be Merged

| Target | Into | Reason |
|--------|------|--------|
| `ScreenHeader` | `SettingsHeader` | Nearly identical API. `SettingsHeader` has a back button + centered title. `ScreenHeader` adds `rightAction` and `variant`. Merge APIs and keep one name (`ScreenHeader` is more generic). |
| `Skeleton` | `SkeletonLoader` | Both do the same thing. `SkeletonLoader` is used more widely. |
| `SharedTransitionImage` | `Reanimated.Image` | Trivial one-line wrapper. |
| `SharedTransitionView` | `Reanimated.View` | Trivial one-line wrapper. |

---

## 10. Components That Should Be Deleted

| Component | File | Reason |
|-----------|------|--------|
| `AppCard` | `components/ui/AppCard.tsx` | Zero usage. |
| `PriceChart` | `components/ui/PriceChart.tsx` | Zero usage. |
| `ChatMessageList` | `components/ChatMessageList.tsx` | Zero usage. |
| `ChatMessageItem` | `components/ChatMessageItem.tsx` | Only parent is `ChatMessageList` (dead). |
| `MediaMessageBubble` | `components/chat/MediaMessageBubble.tsx` | Zero usage. |
| `MentionHighlight` | `components/chat/MentionHighlight.tsx` | Zero usage. |
| `NewMessagesSeparator` | `components/chat/NewMessagesSeparator.tsx` | Zero usage. |
| `PulseDot` | `components/chat/PulseDot.tsx` | Zero usage. |
| `TypingIndicator` | `components/chat/TypingIndicator.tsx` | Zero usage. |
| `AmbientGradient` | `components/ui/AmbientGradient.tsx` | One usage (AuthLandingScreen). Can inline or replace with static. |
| `Skeleton` | `components/ui/Skeleton.tsx` | One usage (BrowseScreen). Replace with `SkeletonLoader`. |
| `SharedTransitionImage` | `components/SharedTransitionImage.tsx` | Trivial wrapper. |
| `SharedTransitionView` | `components/SharedTransitionView.tsx` | Trivial wrapper. |

---

## 11. Broken / Fragile Props from Refactors

During the glassmorphism removal, some props were left behind that may break TypeScript or runtime:

| Prop | Files | Issue |
|------|-------|-------|
| `variant="glass"` | LoginScreen, SignUpScreen, MakeOfferScreen, BidComposer | Prop accepted but does nothing. Should be removed for clarity. |
| `intensity` | 30 files | Passed to `GlassSurface`/`GlassCard` which now ignores it. Harmless but confusing. |
| `tint` | 30 files | Same as above. |
| `contentStyle` | 30 files | `GlassSurface` still accepts this but wraps it in an extra `View`. May cause layout shifts. |
| `Colors.glassBg` | 55 files | Deprecated token. Works now but should be migrated. |
| `Colors.glassBorder` | 55 files | Deprecated token. Works now but should be migrated. |

---

## 12. Estimation Table

| Category | Items | Est. LOC Removable |
|----------|-------|-------------------|
| Unused components (0 imports) | 9 | ~1,008 |
| Nearly unused (1 import) | 3 | ~620 |
| Trivial wrappers | 2 | 29 + 32 import lines |
| Deprecated compatibility layers | 5 | ~449 |
| Duplicate typography system | 1 wrapper + consumer updates | ~298 |
| Duplicate inline header styles | 20 screens | ~600–800 |
| Deprecated color tokens | 55 files | ~220 refs cleaned |
| `variant="glass"` removal | 4 files | ~11 props |
| **Total (conservative)** | | **~3,200–3,500** |
| **Total (aggressive, incl. Text.tsx merge)** | | **~4,800–6,200** |

---

## 13. Chat Component Inventory

`ChatScreen.tsx` imports from `components/chat/`:
- `ChatHeader` ✅
- `ComposerInput` ✅
- `MessageBubble` ✅
- `MessageContextMenu` ✅
- `EmojiReactionsBar` ✅
- `ReplyQuote` ✅
- `ScrollToBottomFAB` ✅
- `LinkPreviewCard` ✅
- `SkeletonChatLoader` ✅
- `AttachmentPickerSheet` ✅

**NOT imported by ChatScreen (potentially dead):**
- `ChatCard` (only used by `OfferBubble`)
- `AvatarRing` (used by `ChatHeader`, `InboxScreen`, `ItemDetailScreen`, `NotificationsScreen`, `SettingsScreen` — **keep**)
- `MediaMessageBubble`
- `MentionHighlight`
- `NewMessagesSeparator`
- `PulseDot`
- `TypingIndicator`

**Root-level chat-related components (not in `components/chat/`):**
- `components/ChatMessageList.tsx` — **dead**
- `components/ChatMessageItem.tsx` — **dead**
- `components/MessageStatusIndicator.tsx` — used by `ChatMessageItem` and `MessageBubble`. If `ChatMessageItem` is deleted, check if `MessageBubble` still needs it. **Keep for now.**

---

## 14. Files Importing Both SettingsHeader AND Custom Inline Header Styles

Some screens import `SettingsHeader` but still define unused `header`/`backBtn`/`headerTitle` styles in their StyleSheet:

- `ReportScreen.tsx` — already cleaned in previous session, verify
- `TwoFactorSetupScreen.tsx` — already cleaned, verify
- `WriteReviewScreen.tsx` — still has custom header styles
- `WithdrawScreen.tsx` — still has custom header styles
- `UserProfileScreen.tsx` — floating header styles (different, may be legitimate)
- `MyProfileScreen.tsx` — floating header styles (legitimate)
- `ManageListingScreen.tsx` — floating header (legitimate)
- `LoginScreen.tsx` — custom header styles (legitimate for auth)
- `SignUpScreen.tsx` — custom header styles (legitimate for auth)
- `SellScreen.tsx` — custom header styles (legitimate)
- `OutfitBuilderScreen.tsx` — custom header styles (legitimate)
- `MyListingsScreen.tsx` — custom header styles (legitimate)

---

## 15. Settings Component Inventory

`components/settings/`:
- `PasswordStrengthBar.tsx` — check usage
- `PremiumToggle.tsx` — check usage
- `RadioButton.tsx` — check usage
- `SettingsCard.tsx` — 3 usages (keep)
- `SettingsHeader.tsx` — 15 usages (merge with ScreenHeader)

Need to check if `PasswordStrengthBar`, `PremiumToggle`, and `RadioButton` are actually used anywhere. They may be dead.
