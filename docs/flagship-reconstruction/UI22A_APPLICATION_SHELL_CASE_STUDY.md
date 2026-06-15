# UI-22A — Application Shell Case Study

## 1. Entire Sector Map

| Screen family | Screens | Header type | Current state |
|--------------|---------|-------------|---------------|
| Tab roots | Home, Search, Sell, TradeHub, Inbox, Profile | None (tab bar only) | Functional; tab bar has spring animation |
| Pushed screens | ItemDetail, UserProfile, Settings, EditProfile, etc. | Custom per screen | Inconsistent: some use ScreenHeader, some inline, some plain Ionicons |
| Modal screens | CreatePoster, Checkout, TradeConfirm, etc. | Custom per screen | Inconsistent close button placement |
| Settings subpages | All settings routes | SettingsPage wrapper | Partially unified via SettingsPage, but still fragmented |

## 2. Current Architecture

- `AppNavigator.tsx` defines `pushScreenOptions`, `modalScreenOptions`, `transparentSheetScreenOptions`.
- `TabNavigator.tsx` provides bottom tab bar with spring animation.
- `ScreenHeader.tsx` exists but is not universally adopted.
- Some screens inline their own header with `View` + `Text` + `Ionicons`.
- Safe areas are handled inconsistently: some use `SafeAreaView`, some don't.

## 3. Reference-Derived Principles

- Every screen family must have predictable structure.
- Back actions must be 44x44 minimum.
- Titles must be consistently placed (centred for pushed, left for modal).
- Sticky actions must respect safe areas.
- Scroll should drive header elevation change.

## 4. Existing Weaknesses

| Weakness | Location | Impact |
|----------|----------|--------|
| Inconsistent back button style | EditProfileScreen (close icon), SettingsScreen (arrow-back), PaymentsScreen (arrow-back) | Users lose spatial consistency |
| Random title placement | Some centred, some left-aligned | Visual rhythm broken |
| Missing right action slot | Many screens leave empty space | Actions hidden in overflow |
| No scroll-aware headers | HomeScreen has it; others don't | Elevation feels random |
| Tab bar lacks contextual awareness | No badges on Sell/TradeHub | Missed notification cues |

## 5. Root Causes

1. No enforced `FlagshipScreen` wrapper.
2. `ScreenHeader` was created late; adoption is partial.
3. No design token enforcement in screen code.
4. Screens were built by different phases without shared architecture.

## 6. New Architecture

Create or refine:
- `FlagshipScreen` — universal screen wrapper with safe areas, scroll handling, and header integration.
- `FlagshipHeader` — unified header for pushed screens.
- `FlagshipModalHeader` — unified header for modal screens.
- `FlagshipStickyFooter` — safe-area-aware sticky action container.
- Update `TabNavigator` for consistent tab item sizing.
- Update `AppNavigator` to apply consistent screen options.

## 7. Screen-by-Screen Redesign

| Screen | Purpose | Before structural problem | Before visual problem | Reconstruction | Feature-depth improvement | Remaining gap |
|--------|---------|--------------------------|---------------------|---------------|-------------------------|---------------|
| Settings root | Settings hub | Inline header; inconsistent padding | Title style varies | FlagshipScreen + FlagshipHeader | Scroll-aware header, consistent padding | None |
| Edit Profile | Profile editor | Inline close button; floating inputs | Header is custom View | FlagshipScreen + FlagshipHeader | Unified header, keyboard-aware scroll | None |
| Payments | Payment centre | ScreenHeader used but right action missing | Still feels like settings list | FlagshipScreen + FlagshipHeader with action | Payment centre identity | None |
| Postage | Delivery centre | ScreenHeader used but custom save button | Save button styling is custom | FlagshipScreen + FlagshipHeader with done action | Modal-like done action | None |
| All pushed screens | Various | Custom headers | Visual inconsistency | Migrate to FlagshipScreen + FlagshipHeader | Predictable navigation | Gradual adoption |

## 8. Components Created/Changed

| Component | Action | Screens affected |
|-----------|--------|-----------------|
| `FlagshipScreen` | Created | All settings screens initially; all screens eventually |
| `FlagshipHeader` | Created | All pushed screens |
| `FlagshipModalHeader` | Created | All modal screens |
| `FlagshipStickyFooter` | Created | EditProfile, Checkout, Sell |
| `ScreenHeader` | Extended with `variant` support | Existing users |
| `TabNavigator` | Refined tab item sizing | All tab roots |

## 9. Feature Depth Improvements

- Consistent safe-area handling across all settings screens.
- Scroll-aware header elevation on all flagship screens.
- Predictable back navigation with haptic feedback.
- Sticky actions that respect keyboard and safe areas.

## 10. Backend/State Dependencies

None — purely frontend architecture.

## 11. Before/After Description

**Before**: Each screen invents its own header. Back buttons vary in size and style. Titles are sometimes centred, sometimes left. Safe areas are inconsistently applied. Sticky actions sometimes overlap system UI.

**After**: Every screen uses `FlagshipScreen` wrapper. Headers are predictable: 44x44 back button, centred title, optional right action. Scroll drives subtle elevation. Sticky actions sit above safe areas.

## 12. Remaining Gaps

- Messaging screens (Inbox, Chat) need UI-22C treatment before full shell adoption.
- HomeScreen and Profile screens need UI-22D/E treatment.
- Auth screens need UI-22A adoption.

## 13. Acceptance Result

- [x] Every settings screen uses shared screen architecture.
- [x] Back buttons are 44x44 with haptic feedback.
- [x] Titles are consistently placed.
- [x] Sticky actions respect safe areas.
- [x] Scroll drives header elevation.
- [ ] All non-settings screens migrated (deferred to respective UI-22 phases).
