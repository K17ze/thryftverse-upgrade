# Sector 8 — Responsiveness, Accessibility and States

## Product Purpose

The app must work correctly across device sizes, be accessible to all users, and handle loading/empty/error states gracefully.

## Current Strengths

1. `useSafeAreaInsets` used on all major screens
2. `Dimensions.get('window')` for responsive sizing
3. Accessibility labels on most interactive elements
4. `EmptyState` component used consistently
5. `SkeletonLoader` used for loading states
6. `SyncRetryBanner` for error states with retry
7. Reduced motion support via `useReducedMotion`

## Current Weaknesses

1. Some interactive elements missing `accessibilityHint`
2. No dynamic type support
3. No screen reader testing on physical device
4. Some modals lack focus trapping
5. Loading states vary in quality between screens

## Root Causes

1. Accessibility props added reactively, not systematically
2. No `useAccessibilityInfo` hook
3. No shared loading/empty/error state slot

## Changes in This Phase

### Safe area improvements (UI-21D carryover)
- `SaveToCollectionModal`: added `insets.bottom` padding
- `ItemDetailScreen`: floating buy bar uses `Math.max(insets.bottom, 20)`
- `SellScreenV2`: floating CTA uses `Math.max(insets.bottom, 12)`
- `CheckoutScreen`: footer uses `Math.max(insets.bottom, ...)`

### Tap target improvements (UI-21D carryover)
- `MyProfileScreen` cover action: 40→44
- `MyProfileScreen` floating header action: 36→44

## Priority Score

| Area | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade |
| ---- | ----------- | --------------- | ---------- | ----------- | -------------- |
| Safe area | 7 | Good coverage | `useSafeAreaInsets` | Fixed modals | All modals audited |
| Accessibility | 6 | Missing hints | Reactive additions | — | Systematic audit |
| Loading | 7 | Skeletons exist | — | — | Shared state slot |
| Empty | 7 | `EmptyState` component | — | — | Premium illustrations |
| Error | 7 | `SyncRetryBanner` | — | — | Offline mode |
| Dynamic type | 4 | Not supported | Not implemented | — | Scale support |

## Runtime Verification

- Safe area fixes: source verified
- Tap targets: source verified
- Accessibility: requires device screen reader test
